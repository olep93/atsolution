import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { imageDimensions } from '../src/image-dimensions.js';

test('reads real JPEG dimensions without decoding pixels', async () => {
  assert.deepEqual(imageDimensions(await readFile(new URL('../public/logo.jpg', import.meta.url))), { width: 409, height: 104 });
});
test('detects oversized PNG dimensions before allocation and rejects malformed data', () => {
  const png = new Uint8Array(24); png.set([137,80,78,71,13,10,26,10]);
  const view = new DataView(png.buffer); view.setUint32(16, 100000); view.setUint32(20, 100000);
  assert.deepEqual(imageDimensions(png), { width: 100000, height: 100000 });
  assert.throws(() => imageDimensions(new Uint8Array([255,216,255,192,255,255])), /ikke leses/);
});
