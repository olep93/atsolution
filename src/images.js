import { MAX_INPUT_BYTES } from './shared.js';
import { imageDimensions } from './image-dimensions.js';

export async function prepareImage(file) {
  if (file.size > MAX_INPUT_BYTES) throw new Error(`${file.name}: Bildet er større enn 20 MB.`);
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error(`${file.name}: Velg et JPG-, PNG- eller WebP-bilde. HEIC må eksporteres som JPG først.`);
  const dimensions = imageDimensions(new Uint8Array(await file.arrayBuffer()));
  if (!dimensions.width || !dimensions.height || dimensions.width * dimensions.height > 80000000) throw new Error(`${file.name}: Bildet har for høy oppløsning.`);
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 80000000) throw new Error(`${file.name}: Bildet har for høy oppløsning.`);
    const scale = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .86));
    if (!blob || blob.size > 8 * 1024 * 1024) throw new Error(`${file.name}: Bildet kunne ikke klargjøres. Prøv et mindre bilde.`);
    return { blob, width: canvas.width, height: canvas.height };
  } finally { bitmap.close(); }
}
