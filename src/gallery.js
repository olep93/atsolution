import config from '/assets/config.js';
import { node, dateLabel, publicHeaders, UUID } from './shared.js';

const PAGE_SIZE = 24;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const root = document.querySelector('[data-gallery]');
const detail = document.body.classList.contains('page-job');
const pictures = new Set();
let pageActive = true;
let imageQueue = [];
let imageRequests = 0;

async function request(path, kind = 'json', controller = new AbortController()) {
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(config.url + path, {
      headers: { ...publicHeaders(config.key), Accept: kind === 'image' ? 'image/jpeg' : 'application/json' },
      signal: controller.signal,
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
    });
    if (!response.ok) throw new Error('Forespørselen kunne ikke fullføres.');
    if (kind !== 'image') return await response.json();
    if (response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'image/jpeg'
      || Number(response.headers.get('content-length')) > MAX_IMAGE_BYTES) {
      throw new Error('Ugyldig bilde.');
    }
    const blob = await response.blob();
    if (blob.size < 3 || blob.size > MAX_IMAGE_BYTES) throw new Error('Ugyldig bilde.');
    const bytes = new Uint8Array(await blob.slice(0, 3).arrayBuffer());
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw new Error('Ugyldig bilde.');
    return blob;
  } finally {
    clearTimeout(timeout);
  }
}

function imagePath(photo) {
  const parts = typeof photo.path === 'string' ? photo.path.split('/') : [];
  if (parts.length !== 2 || !UUID.test(parts[0]) || !parts[1].endsWith('.jpg')
    || !UUID.test(parts[1].slice(0, -4))) throw new Error('Ugyldig bildesti.');
  // This route performs RLS on every download (storage.object.get_authenticated).
  return '/storage/v1/object/authenticated/job-images/' + parts.map(encodeURIComponent).join('/') + '?cacheNonce=' + crypto.randomUUID();
}

function releasePicture(picture) {
  picture.img.onload = null;
  picture.img.onerror = null;
  picture.img.removeAttribute('src');
  picture.img.hidden = true;
  if (picture.url) URL.revokeObjectURL(picture.url);
  picture.url = null;
}

function imageFailed(picture) {
  releasePicture(picture);
  picture.state = 'error';
  picture.frame.setAttribute('aria-busy', 'false');
  picture.status.textContent = 'Bildet kunne ikke lastes.';
  picture.status.hidden = false;
  picture.retry.hidden = false;
  picture.retry.disabled = false;
}

async function loadPicture(picture) {
  const attempt = ++picture.attempt;
  picture.state = 'loading';
  picture.frame.setAttribute('aria-busy', 'true');
  picture.status.textContent = 'Laster bilde …';
  picture.status.hidden = false;
  picture.retry.disabled = true;
  picture.controller = new AbortController();
  const current = () => pageActive && picture.attempt === attempt && picture.frame.isConnected;
  try {
    const blob = await request(imagePath(picture.photo), 'image', picture.controller);
    if (!current()) return;
    picture.url = URL.createObjectURL(blob);
    picture.img.onload = () => {
      if (!current()) return;
      picture.state = 'ready';
      picture.frame.setAttribute('aria-busy', 'false');
      picture.status.hidden = true;
      const restoreFocus = document.activeElement === picture.retry;
      picture.retry.hidden = true;
      if (restoreFocus) picture.frame.focus({ preventScroll: true });
    };
    picture.img.onerror = () => { if (current()) imageFailed(picture); };
    picture.img.hidden = false;
    picture.img.src = picture.url;
  } catch {
    if (current()) imageFailed(picture);
  } finally {
    if (picture.attempt === attempt) picture.controller = null;
  }
}

function drainImages() {
  while (pageActive && imageRequests < 4 && imageQueue.length) {
    const picture = imageQueue.shift();
    imageRequests++;
    loadPicture(picture).finally(() => { imageRequests--; drainImages(); });
  }
}

function queuePicture(picture) {
  if (!pageActive || !['idle', 'error'].includes(picture.state)) return;
  picture.state = 'queued';
  observer?.unobserve(picture.frame);
  imageQueue.push(picture);
  drainImages();
}

const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (entry.isIntersecting) queuePicture(entry.target.picture);
  }
}, { rootMargin: '400px 0px' }) : null;

function picture(photo, label, eager = false) {
  const frame = node('div', 'job-image');
  frame.tabIndex = -1;
  const img = node('img');
  img.alt = photo.caption || '';
  img.width = photo.width;
  img.height = photo.height;
  img.decoding = 'async';
  img.hidden = true;
  const status = node('p', 'job-image-status', 'Laster bilde …');
  status.setAttribute('role', 'status');
  const retry = node('button', 'button job-image-retry', 'Prøv bildet igjen');
  retry.type = 'button';
  retry.setAttribute('aria-label', `Prøv å laste ${label} på nytt`);
  retry.hidden = true;
  const record = { frame, img, status, retry, photo, eager, state: 'idle', attempt: 0, controller: null, url: null };
  frame.picture = record;
  frame.append(img, status);
  retry.addEventListener('click', () => queuePicture(record));
  pictures.add(record);
  if (eager || !observer) queuePicture(record);
  else observer.observe(frame);
  return { frame, retry };
}

window.addEventListener('pagehide', () => {
  pageActive = false;
  observer?.disconnect();
  imageQueue = [];
  for (const picture of pictures) {
    picture.attempt++;
    picture.controller?.abort();
    picture.controller = null;
    releasePicture(picture);
    picture.state = 'idle';
    picture.frame.setAttribute('aria-busy', 'false');
    picture.status.textContent = 'Laster bilde …';
    picture.status.hidden = false;
    picture.retry.hidden = true;
  }
});
window.addEventListener('pageshow', event => {
  if (!event.persisted) return;
  pageActive = true;
  for (const picture of pictures) {
    if (picture.eager || !observer) queuePicture(picture);
    else observer.observe(picture.frame);
  }
});

function jobCard(job, eager) {
  const card = node('article', 'job-card');
  const link = node('a', 'job-card-link');
  link.href = `/galleri/jobb/?id=${encodeURIComponent(job.id)}`;
  let retry;
  if (job.photos[0]) {
    const image = picture(job.photos[0], `bildet fra ${job.title}`, eager);
    link.append(image.frame);
    retry = image.retry;
  }
  const copy = node('div', 'job-card-copy');
  const date = dateLabel(job.job_date);
  if (date) copy.append(node('p', 'eyebrow', date));
  copy.append(node('h2', '', job.title));
  if (job.body) copy.append(node('p', 'job-excerpt', job.body.length > 180 ? job.body.slice(0, 180).trimEnd() + '…' : job.body));
  copy.append(node('span', 'text-link', 'Se jobben'));
  link.append(copy);
  card.append(link);
  if (retry) card.append(retry);
  return { card, link };
}

function jobsPath(cursor) {
  const query = new URLSearchParams({
    select: 'id,title,body,job_date,created_at,photos',
    status: 'eq.published', archived: 'eq.false',
    order: 'job_date.desc.nullslast,created_at.desc,id.desc', limit: String(PAGE_SIZE),
  });
  // Keyset pagination keeps deletions or new jobs ahead of the cursor from skipping older jobs.
  if (cursor) {
    const older = `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`;
    if (cursor.job_date) {
      query.set('or', `(job_date.lt.${cursor.job_date},job_date.is.null,and(job_date.eq.${cursor.job_date},or(${older})))`);
    } else {
      query.set('job_date', 'is.null');
      query.set('or', `(${older})`);
    }
  }
  return '/rest/v1/jobs?' + query;
}

function showJobs() {
  const grid = node('div', 'job-grid');
  const controls = node('div', 'gallery-controls');
  const status = node('p', 'gallery-status');
  status.setAttribute('role', 'status');
  status.tabIndex = -1;
  const error = node('p', 'gallery-error');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  const more = node('button', 'button', 'Vis flere jobber');
  more.type = 'button';
  more.hidden = true;
  const retry = node('button', 'button gallery-retry', 'Prøv igjen');
  retry.type = 'button';
  retry.hidden = true;
  controls.append(status, error, more, retry);
  root.replaceChildren(grid, controls);
  const seen = new Set();
  let cursor = null;
  let loading = false;
  let hasMore = true;

  async function nextPage(userAction = false) {
    if (loading || !hasMore) return;
    loading = true;
    more.disabled = true;
    retry.disabled = true;
    error.hidden = true;
    status.textContent = seen.size ? 'Laster flere jobber …' : 'Laster jobber …';
    root.setAttribute('aria-busy', 'true');
    try {
      const jobs = await request(jobsPath(cursor));
      if (!Array.isArray(jobs)) throw new Error('Ugyldig svar.');
      let firstNewLink;
      for (const job of jobs) {
        if (seen.has(job.id)) continue;
        const item = jobCard(job, seen.size === 0);
        firstNewLink ||= item.link;
        grid.append(item.card);
        seen.add(job.id);
      }
      if (jobs.length) cursor = jobs[jobs.length - 1];
      hasMore = jobs.length === PAGE_SIZE;
      more.hidden = !hasMore;
      retry.hidden = true;
      status.textContent = seen.size
        ? `${seen.size} jobber vist.${hasMore ? '' : ' Alle jobber er vist.'}`
        : 'Det er ingen publiserte jobber ennå.';
      if (userAction) (firstNewLink || status).focus();
    } catch {
      status.textContent = '';
      error.textContent = seen.size
        ? 'Flere jobber kunne ikke lastes. Jobbene som allerede er lastet, vises fortsatt.'
        : 'Galleriet kunne ikke lastes akkurat nå.';
      error.hidden = false;
      more.hidden = true;
      retry.hidden = false;
      if (userAction) retry.focus();
    } finally {
      loading = false;
      more.disabled = false;
      retry.disabled = false;
      root.setAttribute('aria-busy', 'false');
    }
  }
  more.addEventListener('click', () => nextPage(true));
  retry.addEventListener('click', () => nextPage(true));
  nextPage();
}

async function showJob() {
  const id = new URLSearchParams(location.search).get('id');
  const heading = document.querySelector('h1');
  const date = document.querySelector('[data-job-date]');
  const status = node('p', 'gallery-status', 'Laster jobb …');
  status.setAttribute('role', 'status');
  root.replaceChildren(status);
  root.setAttribute('aria-busy', 'true');
  let unavailable = !UUID.test(id || '');
  try {
    if (unavailable) throw new Error('Jobben finnes ikke.');
    const [job] = await request(`/rest/v1/jobs?select=id,title,body,job_date,photos&id=eq.${encodeURIComponent(id)}&status=eq.published&archived=eq.false&limit=1`);
    if (!job) { unavailable = true; throw new Error('Jobben finnes ikke.'); }
    document.title = `${job.title} | AT Solutions`;
    heading.textContent = job.title;
    if (date) date.textContent = dateLabel(job.job_date);
    const content = node('div', 'job-content');
    if (job.body) content.append(node('p', 'job-body', job.body));
    const photos = node('div', 'job-photos');
    job.photos.forEach((photo, i) => {
      const figure = node('figure');
      const image = picture(photo, `bilde ${i + 1} fra ${job.title}`, i === 0);
      figure.append(image.frame, image.retry);
      if (photo.caption) figure.append(node('figcaption', '', photo.caption));
      photos.append(figure);
    });
    content.append(photos);
    root.replaceChildren(content);
  } catch {
    heading.textContent = unavailable ? 'Jobben er ikke tilgjengelig.' : 'Jobben kunne ikke lastes.';
    if (date) date.textContent = '';
    const error = node('p', 'gallery-error', unavailable
      ? 'Jobben kan være fjernet eller ikke publisert.'
      : 'Vi kunne ikke hente jobben akkurat nå. Prøv igjen om litt.');
    error.setAttribute('role', 'alert');
    const controls = node('div', 'gallery-controls');
    if (!unavailable) {
      const retry = node('button', 'button gallery-retry', 'Prøv igjen');
      retry.type = 'button';
      retry.addEventListener('click', () => showJob());
      controls.append(retry);
    }
    const back = node('a', 'text-link', 'Tilbake til galleriet');
    back.href = '/galleri/';
    controls.append(back);
    root.replaceChildren(error, controls);
  } finally {
    root.setAttribute('aria-busy', 'false');
  }
}

if (config.enabled && root) {
  if (detail) showJob();
  else showJobs();
} else if (detail && root) {
  document.querySelector('h1').textContent = 'Jobben er ikke tilgjengelig.';
  root.replaceChildren(node('p', 'gallery-notice', 'Gå tilbake til galleriet for å se publiserte jobber.'));
}
