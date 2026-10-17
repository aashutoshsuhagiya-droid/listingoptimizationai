'use strict';

const sharp = require('sharp');

const MAX_PREPARED_EDGE = 1800;
const MIN_PREPARED_EDGE = 32;
const MIN_PREPARED_LONG_EDGE = 512;
const EXPECTED_OUTPUT_EDGE = 1024;
const MAX_VARIANT_BYTES = 2_750_000;

class VariantImageError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'VariantImageError';
    this.code = code;
  }
}

async function hasUsefulAlpha(source) {
  const probe = await source
    .clone()
    .rotate()
    .resize({ width: 128, height: 128, fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = probe.info;
  let transparentPixels = 0;
  let transparentEdgePixels = 0;
  let edgePixels = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = probe.data[(y * width + x) * channels + channels - 1];
      const transparent = alpha < 248;
      if (transparent) transparentPixels += 1;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        edgePixels += 1;
        if (transparent) transparentEdgePixels += 1;
      }
    }
  }

  const pixels = width * height;
  return (
    transparentPixels >= Math.max(4, pixels * .005) &&
    transparentEdgePixels >= Math.max(2, edgePixels * .02)
  );
}

async function inspectPreparedCutout(buffer, mimeType) {
  try {
    const source = sharp(buffer, {
      failOn: 'warning',
      limitInputPixels: MAX_PREPARED_EDGE * MAX_PREPARED_EDGE
    });
    const metadata = await source.metadata();
    const expectedFormat = {
      'image/png': 'png',
      'image/webp': 'webp'
    }[mimeType];
    if (!expectedFormat || metadata.format !== expectedFormat || (metadata.pages || 1) !== 1) {
      throw new VariantImageError('INVALID_CUTOUT', 'The prepared cutout format is invalid.');
    }
    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width < MIN_PREPARED_EDGE ||
      metadata.height < MIN_PREPARED_EDGE ||
      Math.max(metadata.width, metadata.height) < MIN_PREPARED_LONG_EDGE ||
      metadata.width > MAX_PREPARED_EDGE ||
      metadata.height > MAX_PREPARED_EDGE
    ) {
      throw new VariantImageError('INVALID_CUTOUT', 'The prepared cutout dimensions are invalid.');
    }
    if (!metadata.hasAlpha || !(await hasUsefulAlpha(source))) {
      throw new VariantImageError('INVALID_CUTOUT', 'The prepared cutout must contain a useful transparent background.');
    }
    return { width: metadata.width, height: metadata.height, format: metadata.format };
  } catch (error) {
    if (error instanceof VariantImageError) throw error;
    throw new VariantImageError('INVALID_CUTOUT', 'The prepared cutout could not be decoded safely.');
  }
}

function decodeProviderVariant(result) {
  const encoded = result?.b64_json;
  const maximumEncodedLength = Math.ceil(MAX_VARIANT_BYTES / 3) * 4 + 4;
  if (
    typeof encoded !== 'string' ||
    !encoded ||
    encoded.length > maximumEncodedLength ||
    !/^[a-zA-Z0-9+/]+={0,2}$/.test(encoded)
  ) {
    throw new VariantImageError('VARIANT_INVALID_RESPONSE', 'The image provider returned no valid variant payload.');
  }
  const buffer = Buffer.from(encoded, 'base64');
  const suppliedCanonical = encoded.replace(/=+$/, '');
  const decodedCanonical = buffer.toString('base64').replace(/=+$/, '');
  if (!buffer.length || suppliedCanonical !== decodedCanonical) {
    throw new VariantImageError('VARIANT_INVALID_RESPONSE', 'The image provider returned an invalid variant payload.');
  }
  if (buffer.length > MAX_VARIANT_BYTES) {
    throw new VariantImageError('VARIANT_TOO_LARGE', 'The generated variant was too large to deliver safely.');
  }
  return buffer;
}

async function inspectProviderVariant(buffer) {
  try {
    const source = sharp(buffer, {
      failOn: 'warning',
      limitInputPixels: EXPECTED_OUTPUT_EDGE * EXPECTED_OUTPUT_EDGE
    });
    const metadata = await source.metadata();
    if (
      metadata.format !== 'webp' ||
      (metadata.pages || 1) !== 1 ||
      metadata.width !== EXPECTED_OUTPUT_EDGE ||
      metadata.height !== EXPECTED_OUTPUT_EDGE
    ) {
      throw new VariantImageError(
        'VARIANT_INVALID_RESPONSE',
        'The image provider returned an unexpected variant format or size.'
      );
    }
    const statistics = await source.stats();
    if (!statistics.isOpaque) {
      throw new VariantImageError('VARIANT_INVALID_RESPONSE', 'The image provider returned a non-opaque variant.');
    }
    return { width: metadata.width, height: metadata.height, format: metadata.format };
  } catch (error) {
    if (error instanceof VariantImageError) throw error;
    throw new VariantImageError('VARIANT_INVALID_RESPONSE', 'The image provider returned an invalid variant image.');
  }
}

module.exports = {
  EXPECTED_OUTPUT_EDGE,
  MAX_VARIANT_BYTES,
  VariantImageError,
  decodeProviderVariant,
  inspectPreparedCutout,
  inspectProviderVariant
};
