'use strict';

const { randomUUID } = require('crypto');
const OpenAI = require('openai');
const { toFile } = require('openai');
const sharp = require('sharp');

const {
  ApiError,
  releaseGeneration,
  reserveGeneration,
  verifyFirebaseUser
} = require('./_lib/firebase-admin');
const {
  buildImageEditPrompt,
  outputSizeFor,
  validateCreativeBrief
} = require('./_lib/prompt');

const MAX_REQUEST_BYTES = 3.8 * 1024 * 1024;
const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 900 * 1024;
const MAX_COMBINED_IMAGE_BYTES = 2.5 * 1024 * 1024;
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

function decodeImage(dataUrl, index) {
  if (typeof dataUrl !== 'string') {
    throw new ApiError(400, 'INVALID_IMAGE', `Product image ${index + 1} is invalid.`);
  }

  const match = /^data:(image\/(?:jpeg|png|webp));base64,([a-zA-Z0-9+/=\r\n]+)$/.exec(dataUrl);
  if (!match || !ACCEPTED_MIME_TYPES.has(match[1])) {
    throw new ApiError(400, 'INVALID_IMAGE', `Product image ${index + 1} must be a JPG, PNG, or WebP data URL.`);
  }

  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) {
    throw new ApiError(413, 'IMAGE_TOO_LARGE', `Product image ${index + 1} is too large after optimization.`);
  }
  return buffer;
}

async function normalizeImage(buffer, index) {
  try {
    const pipeline = sharp(buffer, {
      failOn: 'warning',
      limitInputPixels: 40_000_000
    });
    const metadata = await pipeline.metadata();
    if (!metadata.width || !metadata.height) throw new Error('Missing image dimensions');
    if (metadata.width < 256 || metadata.height < 256) {
      throw new ApiError(400, 'IMAGE_TOO_SMALL', `Product image ${index + 1} must be at least 256 × 256 pixels.`);
    }

    return await pipeline
      .rotate()
      .flatten({ background: '#ffffff' })
      .resize({
        width: 1536,
        height: 1536,
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: 90, chromaSubsampling: '4:4:4' })
      .toBuffer();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, 'INVALID_IMAGE', `Product image ${index + 1} could not be processed.`);
  }
}

async function imagePayload(result) {
  if (result?.b64_json) return result.b64_json;
  if (result?.url) {
    const response = await fetch(result.url);
    if (!response.ok) throw new Error(`Generated image download failed (${response.status})`);
    return Buffer.from(await response.arrayBuffer()).toString('base64');
  }
  throw new Error('Image provider returned no image payload.');
}

function providerError(error) {
  if (error?.status === 429) {
    return new ApiError(429, 'PROVIDER_RATE_LIMITED', 'The image service is busy. Please wait a moment and try again.');
  }
  if (error?.status === 400 || error?.status === 422) {
    return new ApiError(400, 'GENERATION_REJECTED', 'The image service could not generate this request. Check the uploaded image and product brief.');
  }
  return new ApiError(502, 'GENERATION_FAILED', 'The image service did not complete the creative. Please try again.');
}

module.exports = async function generateInfographic(request, response) {
  const requestId = randomUUID();
  let reservation;

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return respond(response, 405, { error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED', requestId });
  }

  try {
    const contentLength = Number(request.headers['content-length'] || 0);
    if (contentLength > MAX_REQUEST_BYTES) {
      throw new ApiError(413, 'REQUEST_TOO_LARGE', 'Upload fewer or smaller product images.');
    }
    const contentType = String(request.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (contentType && contentType !== 'application/json') {
      throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use an application/json request body.');
    }

    if (!process.env.OPENAI_API_KEY) {
      throw new ApiError(503, 'SERVICE_NOT_CONFIGURED', 'Image generation is not configured.');
    }

    const user = await verifyFirebaseUser(request);
    const body = parseRequestBody(request);
    let brief;
    try {
      brief = validateCreativeBrief(body);
    } catch (error) {
      throw new ApiError(400, 'INVALID_BRIEF', error?.message || 'The creative brief is invalid.');
    }

    if (!Array.isArray(body.images) || body.images.length < 1 || body.images.length > MAX_IMAGES) {
      throw new ApiError(400, 'INVALID_IMAGES', `Upload between 1 and ${MAX_IMAGES} product images.`);
    }

    const decoded = body.images.map(decodeImage);
    const totalBytes = decoded.reduce((sum, buffer) => sum + buffer.length, 0);
    if (totalBytes > MAX_COMBINED_IMAGE_BYTES) {
      throw new ApiError(413, 'REQUEST_TOO_LARGE', 'The combined product images are too large.');
    }

    reservation = await reserveGeneration(user.uid);

    const normalized = await Promise.all(decoded.map(normalizeImage));
    const uploads = await Promise.all(normalized.map((buffer, index) => (
      toFile(buffer, `product-reference-${index + 1}.jpg`, { type: 'image/jpeg' })
    )));

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      maxRetries: 1,
      timeout: 110_000
    });
    const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';
    const quality = ['low', 'medium', 'high', 'auto'].includes(process.env.OPENAI_IMAGE_QUALITY)
      ? process.env.OPENAI_IMAGE_QUALITY
      : 'high';

    let generation;
    try {
      generation = await client.images.edit({
        model,
        image: uploads.length === 1 ? uploads[0] : uploads,
        prompt: buildImageEditPrompt(brief, uploads.length),
        n: 1,
        size: outputSizeFor(brief.canvasFormat, brief.template),
        quality,
        output_format: 'jpeg',
        output_compression: 86
      });
    } catch (error) {
      throw providerError(error);
    }

    const encoded = await imagePayload(generation.data?.[0]);
    return respond(response, 200, {
      image: `data:image/jpeg;base64,${encoded}`,
      template: brief.template,
      model,
      requestId
    });
  } catch (error) {
    if (reservation) await releaseGeneration(reservation);
    const safeError = error instanceof ApiError
      ? error
      : new ApiError(500, 'INTERNAL_ERROR', 'The generation request could not be completed.');

    console.error('generate-infographic failed', {
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
