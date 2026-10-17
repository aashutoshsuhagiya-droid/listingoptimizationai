'use strict';

const assert = require('node:assert/strict');
const sharp = require('sharp');

const {
  VariantImageError,
  decodeProviderVariant,
  inspectPreparedCutout,
  inspectProviderVariant
} = require('../api/_lib/variant-images');

async function transparentCutout(width = 1024, height = 1024) {
  const object = await sharp({
    create: {
      width: Math.max(16, Math.round(width * .55)),
      height: Math.max(16, Math.round(height * .72)),
      channels: 4,
      background: { r: 32, g: 64, b: 128, alpha: 1 }
    }
  }).png().toBuffer();
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{
      input: object,
      left: Math.floor((width - Math.max(16, Math.round(width * .55))) / 2),
      top: Math.floor((height - Math.max(16, Math.round(height * .72))) / 2)
    }])
    .webp({ lossless: true })
    .toBuffer();
}

(async () => {
  const prepared = await transparentCutout();
  assert.deepEqual(
    await inspectPreparedCutout(prepared, 'image/webp'),
    { width: 1024, height: 1024, format: 'webp' }
  );

  const opaquePrepared = await sharp({
    create: { width: 1024, height: 1024, channels: 3, background: '#123456' }
  }).webp().toBuffer();
  await assert.rejects(
    () => inspectPreparedCutout(opaquePrepared, 'image/webp'),
    (error) => error instanceof VariantImageError && error.code === 'INVALID_CUTOUT'
  );
  const tooSmall = await transparentCutout(256, 256);
  await assert.rejects(() => inspectPreparedCutout(tooSmall, 'image/webp'), /dimensions are invalid/);
  await assert.rejects(() => inspectPreparedCutout(prepared, 'image/png'), /format is invalid/);

  const providerImage = await sharp({
    create: { width: 1024, height: 1024, channels: 3, background: '#00ff00' }
  }).webp({ quality: 90 }).toBuffer();
  const decoded = decodeProviderVariant({ b64_json: providerImage.toString('base64') });
  assert.deepEqual(decoded, providerImage);
  assert.deepEqual(
    await inspectProviderVariant(decoded),
    { width: 1024, height: 1024, format: 'webp' }
  );

  assert.throws(() => decodeProviderVariant({ url: 'https://example.com/image.webp' }), /no valid variant payload/);
  assert.throws(() => decodeProviderVariant({ b64_json: '@@@' }), /no valid variant payload/);

  const wrongSize = await sharp({
    create: { width: 1024, height: 768, channels: 3, background: '#00ff00' }
  }).webp().toBuffer();
  await assert.rejects(() => inspectProviderVariant(wrongSize), /unexpected variant format or size/);
  const transparentOutput = await transparentCutout();
  await assert.rejects(() => inspectProviderVariant(transparentOutput), /non-opaque variant/);
  const pngOutput = await sharp(providerImage).png().toBuffer();
  await assert.rejects(() => inspectProviderVariant(pngOutput), /unexpected variant format or size/);

  console.log('Variant image contract tests passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
