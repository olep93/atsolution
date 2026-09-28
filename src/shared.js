export const MAX_PHOTOS = 40;
export const MAX_INPUT_BYTES = 20 * 1024 * 1024;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validJob(job) {
  if (!job.title.trim() || job.title.trim().length > 140) throw new Error('Skriv en tittel på inntil 140 tegn.');
  if (job.body.length > 20000) throw new Error('Jobbteksten kan være inntil 20 000 tegn.');
  if (job.photos.length > MAX_PHOTOS) throw new Error(`En jobb kan ha inntil ${MAX_PHOTOS} bilder.`);
  if (job.photos.some(p => p.caption.length > 500)) throw new Error('Bildetekster kan være inntil 500 tegn.');
  if (job.status === 'published' && !job.photos.length) throw new Error('Legg til minst ett bilde før du publiserer.');
  return job;
}

export function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

export function dateLabel(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const year = Number(value.slice(0, 4));
  if (year < 1900 || year > 2100) return '';
  const date = new Date(value + 'T12:00:00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return '';
  return new Intl.DateTimeFormat('nb-NO', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
}

export function publicHeaders(key) {
  const headers = { apikey: key };
  // Publishable keys are not JWTs. The gateway resolves them to the anon role.
  // Legacy anon JWTs also authenticate directly with the Storage service.
  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) {
    headers.Authorization = `Bearer ${key}`;
  }
  return headers;
}

export function readPassword(form) {
  const password = form.elements.password.value;
  if (password.length < 12) throw new Error('Bruk minst 12 tegn. En lang setning er lett å huske.');
  if (password !== form.elements.confirm.value) throw new Error('Passordene er ikke like.');
  return password;
}
