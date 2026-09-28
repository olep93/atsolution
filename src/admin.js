import { createClient } from '@supabase/supabase-js';
import config from '/assets/config.js';
import { node, dateLabel, validJob, readPassword, MAX_PHOTOS } from './shared.js';
import { prepareImage } from './images.js';

const $ = selector => document.querySelector(selector);
const panels = ['unavailable', 'login-panel', 'recovery-panel', 'password-panel', 'jobs-panel', 'editor-panel'];
let client, current, dirty = false, busy = false, firstAccess = false, verifiedAdmin = false;
let objectURLs = [];
let jobOffset = 0;
let passwordFlow = new URLSearchParams(location.search).get('set-password') === '1' || location.hash.includes('type=recovery') || location.hash.includes('type=invite');
const tokenError = new URLSearchParams(location.hash.slice(1)).has('error');

function status(message = '', error = false) {
  $('#status').textContent = message;
  $('#status').classList.toggle('is-error', error);
}
function panel(name) {
  panels.forEach(id => { $('#' + id).hidden = id !== name; });
  $('#logout').hidden = !verifiedAdmin;
  const heading = $('#' + name).querySelector('h1');
  if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
}
function errorText(error) {
  if (error?.code === 'PT409' || error?.code === '23505') return 'Jobben er endret i en annen fane. Teksten din er fortsatt her. Kopier endringene dine før du åpner jobben på nytt.';
  if (error?.code === 'invalid_credentials') return 'E-post eller passord er feil. Prøv igjen, eller velg «Glemt passord?». ';
  if (error?.status === 429 || error?.code?.includes('rate_limit')) return 'For mange forsøk på kort tid. Vent litt før du prøver igjen.';
  if (error?.code === 'weak_password') return 'Velg et lengre passord som ikke har vært brukt andre steder.';
  if (error?.code === '42501' || error?.status === 401 || error?.status === 403) return 'Tilgangen kunne ikke bekreftes. Logg inn igjen. Ulagrede endringer er fortsatt i skjemaet.';
  if (error instanceof TypeError || error?.name === 'AuthRetryableFetchError') return 'Kunne ikke koble til. Sjekk internettforbindelsen og prøv igjen.';
  if (error instanceof Error && !error.code && !error.status) return error.message;
  return 'Handlingen kunne ikke fullføres. Prøv igjen. Hvis feilen fortsetter, må oppsettet kontrolleres.';
}
async function run(action) {
  if (busy) return;
  busy = true;
  const controls = [...document.querySelectorAll('button, input, textarea')].filter(el => !el.disabled);
  controls.forEach(el => { el.disabled = true; });
  document.body.setAttribute('aria-busy', 'true');
  try { await action(); } catch (error) { status(errorText(error), true); }
  finally {
    busy = false;
    controls.forEach(el => { el.disabled = false; });
    document.body.removeAttribute('aria-busy');
    syncPhotoControls();
  }
}
function check(result) { if (result.error) throw result.error; return result.data; }
function canLeave() { return !busy && (!dirty || window.confirm('Du har ulagrede endringer. Vil du forlate jobben uten å lagre?')); }
function releaseImages() { objectURLs.forEach(url => URL.revokeObjectURL(url)); objectURLs = []; }

async function authorized() {
  const user = check(await client.auth.getUser())?.user;
  if (!user || !check(await client.rpc('is_gallery_admin'))) {
    await client.auth.signOut({ scope: 'local' });
    throw new Error('Denne kontoen har ikke tilgang til administrasjonen.');
  }
  verifiedAdmin = true;
}
async function loadJobs(append = false) {
  const offset = append ? jobOffset : 0;
  const jobs = check(await client.from('jobs').select('id,title,job_date,status,archived,version,updated_at,photos').eq('archived', $('#show-archived').checked).order('updated_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + 49));
  const list = $('#job-list');
  if (!append) list.replaceChildren();
  $('#more-jobs')?.remove();
  jobOffset = offset + jobs.length;
  if (!jobs.length) list.append(node('p', 'list-empty', $('#show-archived').checked ? 'Ingen arkiverte jobber.' : 'Her kommer jobbene dine. Velg «Ny jobb» for å komme i gang.'));
  for (const job of jobs) {
    const row = node('article', 'admin-job-row');
    const copy = node('div');
    copy.append(node('p', 'eyebrow', job.archived ? 'Arkivert' : job.status === 'published' ? 'Publisert' : 'Kladd'));
    copy.append(node('h2', '', job.title));
    copy.append(node('p', 'field-help', [dateLabel(job.job_date), `${job.photos.length} bilder`].filter(Boolean).join(' · ')));
    const button = node('button', 'button button-secondary', job.archived ? 'Gjenopprett som kladd' : 'Rediger');
    button.type = 'button';
    button.addEventListener('click', () => run(async () => {
      status();
      if (job.archived) { check(await client.rpc('archive_job', { p_id: job.id, p_expected_version: job.version, p_archived: false })); await loadJobs(); status('Jobben er gjenopprettet som kladd.'); }
      else await editJob(check(await client.from('jobs').select('*').eq('id', job.id).single()));
    }));
    row.append(copy, button); list.append(row);
  }
  if (jobs.length === 50) {
    const more = node('button', 'button button-secondary', 'Vis flere jobber'); more.id = 'more-jobs'; more.type = 'button';
    more.addEventListener('click', () => run(() => loadJobs(true))); list.append(more);
  }
  if (!append) panel('jobs-panel');
}
function syncPhotoControls() {
  document.querySelectorAll('[data-move]').forEach(button => {
    const index = Number(button.dataset.index);
    button.disabled = busy || (button.dataset.move === '-1' ? index === 0 : index === current?.photos.length - 1);
  });
}
function renderPhotos() {
  const list = $('#photo-list'); list.replaceChildren();
  if (!current.photos.length) list.append(node('p', 'list-empty', 'Ingen bilder lagt til ennå.'));
  current.photos.forEach((photo, index) => {
    const item = node('article', 'editor-photo');
    const image = node('img'); image.alt = `Bilde ${index + 1}`; image.src = photo.preview || ''; image.width = photo.width; image.height = photo.height;
    const fields = node('div', 'photo-fields');
    fields.append(node('p', 'eyebrow', index === 0 ? '1 · Forsidebilde' : `Bilde ${index + 1}`));
    const label = node('label', '', 'Bildetekst'); label.htmlFor = 'caption-' + photo.id;
    const caption = node('textarea'); caption.id = label.htmlFor; caption.maxLength = 500; caption.rows = 2; caption.value = photo.caption; caption.placeholder = 'Hva viser bildet?';
    caption.addEventListener('input', () => { photo.caption = caption.value; dirty = true; });
    const actions = node('div', 'photo-actions');
    for (const [text, delta] of [['Flytt opp', -1], ['Flytt ned', 1]]) {
      const button = node('button', 'plain-button', text); button.type = 'button'; button.dataset.move = String(delta); button.dataset.index = String(index); button.setAttribute('aria-label', `${text}, bilde ${index + 1}`);
      button.addEventListener('click', () => { const target = index + delta; if (busy || target < 0 || target >= current.photos.length) return; [current.photos[index], current.photos[target]] = [current.photos[target], current.photos[index]]; dirty = true; renderPhotos(); $('#caption-' + photo.id).focus(); });
      actions.append(button);
    }
    const remove = node('button', 'plain-button', 'Fjern bilde'); remove.type = 'button'; remove.setAttribute('aria-label', `Fjern bilde ${index + 1}`);
    remove.addEventListener('click', () => { if (busy || !confirm('Fjerne dette bildet fra jobben? Endringen gjelder når du lagrer.')) return; current.photos.splice(index, 1); dirty = true; renderPhotos(); });
    actions.append(remove); fields.append(label, caption, actions); item.append(image, fields); list.append(item);
  });
  syncPhotoControls();
}
async function editJob(job) {
  releaseImages();
  current = job ? structuredClone(job) : { id: crypto.randomUUID(), version: 0, title: '', body: '', job_date: '', status: 'draft', photos: [] };
  if (current.photos.length) {
    const urls = check(await client.storage.from('job-images').createSignedUrls(current.photos.map(p => p.path), 3600));
    current.photos.forEach(photo => { photo.preview = urls.find(u => u.path === photo.path)?.signedUrl; });
  }
  $('#job-title').value = current.title; $('#job-body').value = current.body; $('#job-date').value = current.job_date || '';
  dirty = false; renderPhotos(); updateEditor(); panel('editor-panel'); window.scrollTo(0, 0);
}
function updateEditor() {
  const published = current.status === 'published';
  $('#editor-title').textContent = current.version ? 'Rediger jobb.' : 'Ny jobb.';
  $('#job-state').textContent = published ? 'Publisert' : 'Kladd';
  $('#publish-job').textContent = published ? 'Lagre endringer' : 'Publiser jobb';
  $('#save-draft').textContent = published ? 'Gjør til kladd' : 'Lagre kladd';
  $('#save-note').textContent = published ? 'Lagrede endringer blir synlige i galleriet.' : 'Kladden er bare synlig for deg.';
  $('#archive-job').hidden = !current.version;
  $('#view-job').hidden = !published;
  $('#view-job').href = '/galleri/jobb/?id=' + current.id;
}

$('#job-form').addEventListener('input', () => { dirty = true; });
window.addEventListener('beforeunload', event => { if (dirty || busy) { event.preventDefault(); event.returnValue = ''; } });
document.querySelectorAll('a[href]').forEach(link => link.addEventListener('click', event => { if (link.target !== '_blank' && !canLeave()) event.preventDefault(); }));
document.querySelectorAll('[data-show-password]').forEach(toggle => toggle.addEventListener('change', () => { toggle.dataset.showPassword.split(',').forEach(id => { document.getElementById(id).type = toggle.checked ? 'text' : 'password'; }); }));
document.querySelectorAll('[data-auth-mode]').forEach(button => button.addEventListener('click', () => {
  firstAccess = button.dataset.authMode === 'first'; status();
  $('#recovery-title').textContent = firstAccess ? 'Opprett ditt passord.' : 'Glemt passord?';
  $('#recovery-help').textContent = firstAccess ? 'Få en sikker lenke på e-post, og velg deretter ditt eget passord. Tilgang må være opprettet for deg på forhånd.' : 'Vi sender en lenke til e-postadressen som er registrert for administrasjonen.';
  $('#recovery-email').value = $('#email').value;
  panel(button.dataset.authMode === 'login' ? 'login-panel' : 'recovery-panel');
}));
$('#login-form').addEventListener('submit', event => { event.preventDefault(); run(async () => {
  status('Logger inn …'); check(await client.auth.signInWithPassword({ email: $('#email').value.trim(), password: $('#password').value }));
  await authorized(); $('#password').value = ''; await loadJobs(); status();
}); });
$('#recovery-form').addEventListener('submit', event => { event.preventDefault(); run(async () => {
  const email = $('#recovery-email').value.trim(); const redirectTo = location.origin + '/admin/?set-password=1';
  status('Sender lenke …');
  const result = firstAccess ? await client.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: redirectTo } }) : await client.auth.resetPasswordForEmail(email, { redirectTo });
  // Avoid exposing whether a particular address has an account.
  if (result.error && !['user_not_found', 'signup_disabled', 'otp_disabled'].includes(result.error.code)) throw result.error;
  status('Hvis adressen har tilgang, får du snart en e-post. Sjekk også søppelpost. Åpne den nyeste lenken for å velge passord.');
}); });
$('#new-password-form').addEventListener('submit', event => { event.preventDefault(); run(async () => {
  const password = readPassword(event.target); status('Lagrer passord …'); await authorized();
  check(await client.auth.updateUser({ password }));
  check(await client.auth.signOut({ scope: 'others' }));
  event.target.reset(); passwordFlow = false; history.replaceState(null, '', '/admin/'); await loadJobs(); status('Passordet er lagret.');
}); });
$('#change-password').addEventListener('click', () => { status(); panel('password-panel'); });
$('#logout').addEventListener('click', () => { if (!canLeave()) return; run(async () => {
  check(await client.auth.signOut({ scope: 'local' })); verifiedAdmin = false; dirty = false; current = undefined; releaseImages(); panel('login-panel'); status('Du er logget ut.');
}); });
$('#new-job').addEventListener('click', () => run(async () => { status(); await editJob(); }));
$('#show-archived').addEventListener('change', () => run(loadJobs));
$('#back-to-jobs').addEventListener('click', () => { if (!canLeave()) return; run(async () => { await loadJobs(); dirty = false; releaseImages(); status(); }); });
$('#photo-files').addEventListener('change', event => {
  const files = [...event.target.files]; event.target.value = '';
  run(async () => {
    if (current.photos.length + files.length > MAX_PHOTOS) throw new Error(`Du kan ha inntil ${MAX_PHOTOS} bilder per jobb. Velg færre bilder.`);
    const errors = [];
    for (let index = 0; index < files.length; index++) {
      status(`Klargjør bilde ${index + 1} av ${files.length} …`);
      try {
        const prepared = await prepareImage(files[index]);
        const id = crypto.randomUUID(); const preview = URL.createObjectURL(prepared.blob); objectURLs.push(preview);
        current.photos.push({ id, path: `${current.id}/${id}.jpg`, caption: '', ...prepared, preview, uploaded: false }); dirty = true;
      } catch (error) { errors.push(errorText(error)); }
    }
    renderPhotos(); status(errors.length ? errors.join(' ') : 'Bildene er klare. Legg til bildetekster og lagre jobben.', errors.length > 0);
  });
});
$('#job-form').addEventListener('submit', event => {
  event.preventDefault();
  const intent = event.submitter?.value || current.status;
  if (current.status === 'published' && intent === 'draft' && !confirm('Gjøre jobben til en kladd? Den blir skjult fra det offentlige galleriet.')) return;
  run(async () => {
    const job = validJob({ ...current, title: $('#job-title').value, body: $('#job-body').value, job_date: $('#job-date').value || null, status: intent });
    const uploads = current.photos.filter(p => p.blob && !p.uploaded);
    for (let index = 0; index < uploads.length; index++) {
      status(`Laster opp bilde ${index + 1} av ${uploads.length}. Hold siden åpen …`);
      const photo = uploads[index];
      const result = await client.storage.from('job-images').upload(photo.path, photo.blob, { contentType: 'image/jpeg', upsert: false, cacheControl: '0' });
      if (result.error) {
        // A request may have succeeded even if its response was lost. Verify
        // the immutable UUID path before retrying the atomic job save.
        const existing = await client.storage.from('job-images').info(photo.path);
        if (existing.error) throw result.error;
      }
      photo.uploaded = true;
    }
    status('Lagrer jobben …');
    const photos = current.photos.map(({ id, path, caption, width, height }) => ({ id, path, caption, width, height }));
    const saved = check(await client.rpc('save_job', { p_id: job.id, p_expected_version: job.version, p_title: job.title, p_body: job.body, p_job_date: job.job_date, p_status: job.status, p_photos: photos }).single());
    Object.assign(current, saved, { photos: current.photos }); dirty = false; updateEditor();
    status(current.status === 'published' ? 'Jobben er lagret og publisert i galleriet.' : 'Kladden er lagret. Bare du kan se den.');
    $('#status').focus();
  });
});
$('#archive-job').addEventListener('click', () => {
  if (!canLeave() || !confirm('Arkivere jobben? Den skjules fra galleriet, og kan gjenopprettes senere.')) return;
  run(async () => { check(await client.rpc('archive_job', { p_id: current.id, p_expected_version: current.version, p_archived: true })); dirty = false; await loadJobs(); releaseImages(); status('Jobben er arkivert.'); });
});

if (!config.enabled) panel('unavailable');
else {
  client = createClient(config.url, config.key, { auth: { storage: window.sessionStorage, persistSession: true, detectSessionInUrl: true, autoRefreshToken: true } });
  client.auth.onAuthStateChange(event => { if (event === 'PASSWORD_RECOVERY') passwordFlow = true; });
  run(async () => {
    try {
      const session = check(await client.auth.getSession())?.session;
      history.replaceState(null, '', '/admin/');
      if (session) { await authorized(); if (passwordFlow) panel('password-panel'); else await loadJobs(); }
      else { panel('login-panel'); if (tokenError || passwordFlow) status('Lenken er utløpt eller allerede brukt. Be om en ny lenke med «Første gang?» eller «Glemt passord?».', true); }
    } catch (error) { panel('login-panel'); throw error; }
  });
}
