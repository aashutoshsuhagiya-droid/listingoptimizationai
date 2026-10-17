'use strict';

const { randomUUID } = require('crypto');
const sharp = require('sharp');

const {
  ApiError,
  reserveProductPreparation,
  verifyFirebaseUser
} = require('./_lib/firebase-admin');
const { removeBackground } = require('./_lib/photoroom');
const {
  PreparationProofError,
  createPreparationProof,
  requiredPreparationProofSecret
} = require('./_lib/preparation-proof');

const MAX_REQUEST_BYTES = 1.8 * 1024 * 1024;
const MAX_IMAGE_BYTES = 1.25 * 1024 * 1024;
const MAX_CUTOUT_BYTES = 2.6 * 1024 * 1024;
const ACCEPTED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function respond(response, status, body) {
  response.setHeader('Cache-Control', 'no-store, max-age=0');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  return response.status(status).json(body);
}

function parseRequestBody(request) {
  if (!request.body) throw new ApiError(400, 'INVALID_REQUEST', 'A JSON request body is required.');
  if (typeof request.body === 'string') {
    try { return JSON.parse(request.body); }
    catch { throw new ApiError(400, 'INVALID_JSON', 'The request body is not valid JSON.'); }
  }
  if (Buffer.isBuffer(request.body)) {
    try { return JSON.parse(request.body.toString('utf8')); }
    catch { throw new ApiError(400, 'INVALID_JSON', 'The request body is not valid JSON.'); }
  }
  return request.body;
}

function preparationProofSecret() {
  try {
    return requiredPreparationProofSecret();
  } catch (error) {
    if (error instanceof PreparationProofError) {
      throw new ApiError(503, 'SERVICE_NOT_CONFIGURED', 'Product preparation proof signing is not configured.');
    }
    throw error;
  }
}

function decodeImage(dataUrl) {
  if (typeof dataUrl !== 'string') {
    throw new ApiError(400, 'INVALID_IMAGE', 'The primary product image is invalid.');
  }

  const match = /^data:(image\/(?:jpeg|png|webp));base64,([a-zA-Z0-9+/=\r\n]+)$/.exec(dataUrl);
  if (!match || !ACCEPTED_MIME_TYPES.has(match[1])) {
    throw new ApiError(400, 'INVALID_IMAGE', 'The primary product image must be a JPG, PNG, or WebP data URL.');
  }

  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) {
    throw new ApiError(413, 'IMAGE_TOO_LARGE', 'The optimized primary product image is too large.');
  }
  return { buffer, mimeType: match[1] };
}

async function inspectImage(buffer, declaredMimeType) {
  try {
    const source = sharp(buffer, {
      failOn: 'warning',
      limitInputPixels: 40_000_000
    });
    const metadata = await source.metadata();
    const expectedFormat = {
      'image/jpeg': 'jpeg',
      'image/png': 'png',
      'image/webp': 'webp'
    }[declaredMimeType];
    if (metadata.format !== expectedFormat || (metadata.pages || 1) !== 1) {
      throw new ApiError(400, 'INVALID_IMAGE', 'The primary product image format does not match its file type.');
    }
    if (!metadata.width || !metadata.height) throw new Error('Missing dimensions');
    if (metadata.width < 512 || metadata.height < 512) {
      throw new ApiError(400, 'IMAGE_TOO_SMALL', 'Use a product photo that is at least 512 × 512 pixels.');
    }
    let hasUsefulAlpha = false;
    if (metadata.hasAlpha) {
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
          const isTransparent = alpha < 248;
          if (isTransparent) transparentPixels += 1;
          if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
            edgePixels += 1;
            if (isTransparent) transparentEdgePixels += 1;
          }
        }
      }
      const pixels = width * height;
      hasUsefulAlpha = (
        transparentPixels >= Math.max(4, pixels * .005) &&
        transparentEdgePixels >= Math.max(2, edgePixels * .02)
      );
    }
    return {
      hasUsefulAlpha,
      width: metadata.width,
      height: metadata.height
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, 'INVALID_IMAGE', 'The primary product image could not be processed.');
  }
}

async function normalizeForSegmentation(buffer) {
  try {
    return await sharp(buffer, {
      failOn: 'warning',
      limitInputPixels: 40_000_000
    })
      .rotate()
      .flatten({ background: '#ffffff' })
      .resize({
        width: 1800,
        height: 1800,
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
      .toBuffer();
  } catch {
    throw new ApiError(400, 'INVALID_IMAGE', 'The primary product image could not be normalized.');
  }
}

async function encodeCutout(input, quality, lossless = false) {
  return sharp(input, {
    failOn: 'warning',
    limitInputPixels: 40_000_000
  })
    .rotate()
    .ensureAlpha()
    .trim({ threshold: 8 })
    .extend({
      top: 4,
      bottom: 4,
      left: 4,
      right: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .resize({
      width: 1800,
      height: 1800,
      fit: 'inside',
      withoutEnlargement: true
    })
    .webp(lossless
      ? { lossless: true, effort: 4 }
      : {
          quality,
          alphaQuality: 100,
          effort: 4,
          smartSubsample: false
        })
    .toBuffer({ resolveWithObject: true });
}

async function optimizeCutout(buffer) {
  try {
    const statistics = await sharp(buffer, {
      failOn: 'warning',
      limitInputPixels: 40_000_000
    }).stats();
    if (statistics.isOpaque) {
      throw new ApiError(502, 'CUTOUT_INVALID_RESPONSE', 'The product cutout did not contain a transparent background.');
    }

    let result = await encodeCutout(buffer, 100, true);
    if (result.data.length > MAX_CUTOUT_BYTES) result = await encodeCutout(buffer, 96);
    if (result.data.length > MAX_CUTOUT_BYTES) result = await encodeCutout(buffer, 90);

    if (
      !result.info.width ||
      !result.info.height ||
      result.info.width < 32 ||
      result.info.height < 32 ||
      Math.max(result.info.width, result.info.height) < 512
    ) {
      throw new ApiError(400, 'CUTOUT_TOO_SMALL', 'The isolated product is too small for a sharp 2000px creative. Use a closer, higher-resolution photo.');
    }
    if (result.data.length > MAX_CUTOUT_BYTES) {
      throw new ApiError(413, 'CUTOUT_TOO_LARGE', 'The prepared product cutout is too large. Try a simpler source photo.');
    }
    return result;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, 'CUTOUT_INVALID_RESPONSE', 'The prepared product cutout could not be normalized.');
  }
}

module.exports = async function prepareProduct(request, response) {
  const requestId = randomUUID();

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return respond(response, 405, { error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED', requestId });
  }

  try {
    const contentLength = Number(request.headers['content-length'] || 0);
    if (contentLength > MAX_REQUEST_BYTES) {
      throw new ApiError(413, 'REQUEST_TOO_LARGE', 'Upload a smaller primary product image.');
    }
    const contentType = String(request.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (contentType && contentType !== 'application/json') {
      throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use an application/json request body.');
    }

    const user = await verifyFirebaseUser(request);
    const proofSecret = preparationProofSecret();
    const body = parseRequestBody(request);
    const decoded = decodeImage(body?.image);
    await reserveProductPreparation(user.uid);
    const inspection = await inspectImage(decoded.buffer, decoded.mimeType);

    let transparentSource = decoded.buffer;
    let cutoutProvider = 'uploaded-alpha';

    if (!inspection.hasUsefulAlpha) {
      const normalized = await normalizeForSegmentation(decoded.buffer);
      transparentSource = await removeBackground({
        buffer: normalized,
        mimeType: 'image/jpeg',
        filename: 'primary-product.jpg'
      });
      cutoutProvider = 'photoroom';
    }

    const cutout = await optimizeCutout(transparentSource);
    const preparationProof = createPreparationProof({
      cutout: cutout.data,
      uid: user.uid,
      secret: proofSecret
    });
    return respond(response, 200, {
      cutout: `data:image/webp;base64,${cutout.data.toString('base64')}`,
      preparationProof,
      width: cutout.info.width,
      height: cutout.info.height,
      provider: cutoutProvider,
      requestId
    });
  } catch (error) {
    const safeError = error instanceof ApiError
      ? error
      : new ApiError(500, 'INTERNAL_ERROR', 'The product image could not be prepared.');

    console.error('prepare-product failed', {
      requestId,
      code: safeError.code,
      status: safeError.status,
      message: error?.message
    });

    return respond(response, safeError.status, {
      error: safeError.message,
      code: safeError.code,
      requestId
    });
  }
};
