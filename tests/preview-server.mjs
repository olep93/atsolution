// Local-only UI fixture. Never included in public/ or a Vercel deployment.
// Backend security is covered separately against PostgreSQL and real Supabase.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const port = 4174, root = resolve('public'), jobs = new Map(), images = new Map();
const user = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'preview@example.invalid', aud: 'authenticated', role: 'authenticated', email_confirmed_at: new Date().toISOString(), app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
let failSave = false;
const token = [Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'), Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now()/1000)+3600, role: 'authenticated' })).toString('base64url'), 'local-fixture-only'].join('.');
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.jpg':'image/jpeg', '.svg':'image/svg+xml', '.woff2':'font/woff2' };
createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`), path = url.pathname;
  const bytes = Buffer.concat(await Array.fromAsync(req));
  let body = {}; try { body = JSON.parse(bytes.toString()); } catch {}
  const json = (data, code = 200) => { res.writeHead(code, { 'Content-Type':'application/json', 'Cache-Control':'no-store' }); res.end(JSON.stringify(data)); };
  if (path === '/__test/fail-next-save' && req.method === 'POST') { failSave = true; return json({ ok: true }); }
  if (path === '/assets/config.js') { res.writeHead(200,{'Content-Type':'text/javascript'}); return res.end(`export default ${JSON.stringify({ enabled:true, url:`http://127.0.0.1:${port}`, key:'sb_publishable_local_test_only' })}`); }
  if (path === '/auth/v1/token') return json({ access_token:token, refresh_token:'local-fixture', expires_in:3600, token_type:'bearer', user });
  if (path === '/auth/v1/user') return json(user);
  if (path.startsWith('/auth/v1/')) return json({});
  if (path === '/rest/v1/rpc/is_gallery_admin') return json(true);
  if (path === '/rest/v1/rpc/save_job') {
    if (failSave) { failSave = false; return json({ code:'test_failure', message:'Simulated failed save' }, 503); }
    const existing = jobs.get(body.p_id);
    if ((existing?.version || 0) !== body.p_expected_version) return json({ code:'PT409', message:'Version conflict' },409);
    const job = { id:body.p_id, title:body.p_title, body:body.p_body, job_date:body.p_job_date, status:body.p_status, photos:body.p_photos, archived:false, version:body.p_expected_version+1, created_at:existing?.created_at || new Date().toISOString(), updated_at:new Date().toISOString() };
    jobs.set(job.id, job); return json(job);
  }
  if (path === '/rest/v1/rpc/archive_job') { const job = jobs.get(body.p_id); Object.assign(job,{archived:body.p_archived,status:'draft',version:job.version+1}); return json(job); }
  if (path === '/rest/v1/jobs') {
    let items = [...jobs.values()];
    if (url.searchParams.has('id')) items = items.filter(j => j.id === url.searchParams.get('id').slice(3));
    if (url.searchParams.has('archived')) items = items.filter(j => j.archived === (url.searchParams.get('archived') === 'eq.true'));
    if (url.searchParams.has('status')) items = items.filter(j => j.status === url.searchParams.get('status').slice(3));
    return json(req.headers.accept?.includes('vnd.pgrst.object') ? items[0] : items);
  }
  if (path === '/storage/v1/object/sign/job-images') return json(body.paths.map(path => ({ path, signedURL:'/object/sign/job-images/'+path+'?token=fixture' })));
  if (path.startsWith('/storage/v1/object/')) {
    const object = path.split('/job-images/')[1];
    if (req.method === 'POST') {
      // storage-js wraps a browser Blob in multipart/form-data.
      const start = bytes.indexOf(Buffer.from([255,216,255]));
      const end = bytes.lastIndexOf(Buffer.from([255,217]));
      images.set(object, start >= 0 && end > start ? bytes.subarray(start,end+2) : bytes);
      return json({ Key:'job-images/'+object, Id:'fixture' });
    }
    const data = images.get(object) || await readFile('public/logo.jpg'); res.writeHead(200,{'Content-Type':'image/jpeg'});return res.end(data);
  }
  try {
    const file = resolve(root, '.' + (path.endsWith('/') ? path+'index.html' : path));
    if (!file.startsWith(root+'/')) return json({},403);
    let content = await readFile(file);
    if (extname(file) === '.html') content = content.toString().replace('<body', '<body').replace(/(<body[^>]*>)/, '$1<div style="background:#ffda86;padding:8px;text-align:center">LOKAL FUNKSJONSTEST · ingen e-post sendes</div>');
    res.writeHead(200,{'Content-Type':mime[extname(file)] || 'application/octet-stream'});res.end(content);
  } catch { json({},404); }
}).listen(port,'127.0.0.1',()=>console.log(`Local UI fixture: http://127.0.0.1:${port}/admin/`));
