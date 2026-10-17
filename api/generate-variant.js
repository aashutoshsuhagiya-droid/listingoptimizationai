'use strict';

const { randomUUID } = require('crypto');
const OpenAI = require('openai');

const {
  ApiError,
  reserveVariantGeneration,
  verifyFirebaseUser
} = require('./_lib/firebase-admin');
const {
  CHROMA_KEY_COLOR,
  buildVariantPrompt,
  validateVariantRequest
} = require('./_lib/variant-prompt');
const {
  PreparationProofError,
  requiredPreparationProofSecret,
  verifyPreparationProof
} = require('./_lib/preparation-proof');
const {
  VariantImageError,
  decodeProviderVariant,
  inspectPreparedCutout,
  inspectProviderVariant
} = require('./_lib/variant-images');

const MAX_REQUEST_BYTES = 3.75 * 1024 * 1024;
const MAX_CUTOUT_BYTES = 2.6 * 1024 * 1024;
const OPENAI_TIMEOUT_MS = 240_000;
const OUTPUT_FORMAT = 'webp';
const OUTPUT_SIZE = '1024x1024';
const ACCEPTED_CUTOUT_TYPES = new Map([
  ['image/png', 'png'],
  ['image/webp', 'webp']
]);

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
      throw new ApiError(503, 'SERVICE_NOT_CONFIGURED', 'Product preparation proof verification is not configured.');
    }
    throw error;
  }
}

function decodeCutout(dataUrl) {
  if (typeof dataUrl !== 'string') {
    throw new ApiError(400, 'INVALID_CUTOUT', 'A prepared product cutout is required.');
  }

  const match = /^data:(image\/(?:png|webp));base64,([a-zA-Z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match || !ACCEPTED_CUTOUT_TYPES.has(match[1]) || match[2].length % 4 !== 0) {
    throw new ApiError(400, 'INVALID_CUTOUT', 'The prepared product cutout must be a PNG or WebP data URL.');
  }

  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length) {
    throw new ApiError(400, 'INVALID_CUTOUT', 'The prepared product cutout is empty.');
  }
  if (buffer.length > MAX_CUTOUT_BYTES) {
    throw new ApiError(413, 'CUTOUT_TOO_LARGE', 'The prepared product cutout is too large.');
  }
  const isPng = buffer.length >= 8 && buffer.subarray(0, 8).equals(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  );
  const isWebp = buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP';
  if (
    (match[1] === 'image/png' && !isPng) ||
    (match[1] === 'image/webp' && !isWebp)
  ) {
    throw new ApiError(400, 'INVALID_CUTOUT', 'The prepared product cutout does not match its declared image format.');
  }

  return {
    buffer,
    extension: ACCEPTED_CUTOUT_TYPES.get(match[1]),
    mimeType: match[1]
  };
}

function providerError(error) {
  if (error instanceof ApiError) return error;
  if (error?.status === 429) {
    return new ApiError(429, 'PROVIDER_RATE_LIMITED', 'The variant service is busy. Please wait and try again.');
  }
  if (error?.status === 400 || error?.status === 422) {
    return new ApiError(400, 'VARIANT_REJECTED', 'The variant service could not apply that controlled edit. Review the instruction and try again.');
  }
  if (
    error?.name === 'TimeoutError' ||
    error?.name === 'AbortError' ||
    error?.name === 'APIConnectionTimeoutError'
  ) {
    return new ApiError(504, 'VARIANT_TIMEOUT', 'Variant generation timed out. Please try again.');
  }
  return new ApiError(502, 'VARIANT_GENERATION_FAILED', 'The variant service did not complete the edit. Please try again.');
}

module.exports = async function generateVariant(request, response) {
  const requestId = randomUUID();

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return respond(response, 405, { error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED', requestId });
  }

  try {
    const contentLength = Number(request.headers['content-length'] || 0);
    if (contentLength > MAX_REQUEST_BYTES) {
      throw new ApiError(413, 'REQUEST_TOO_LARGE', 'The variant request is too large.');
    }
    const contentType = String(request.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (contentType && contentType !== 'application/json') {
      throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use an application/json request body.');
    }

    const user = await verifyFirebaseUser(request);
    if (!process.env.OPENAI_API_KEY) {
      throw new ApiError(503, 'SERVICE_NOT_CONFIGURED', 'Variant generation is not configured.');
    }
    const proofSecret = preparationProofSecret();

    const body = parseRequestBody(request);
    let variantRequest;
    try {
      variantRequest = validateVariantRequest(body);
    } catch (error) {
      throw new ApiError(400, 'INVALID_VARIANT_REQUEST', error?.message || 'The variant request is invalid.');
    }
    const cutout = decodeCutout(body.cutout);
    try {
      verifyPreparationProof({
        proof: body.preparationProof,
        cutout: cutout.buffer,
        uid: user.uid,
        secret: proofSecret
      });
    } catch (error) {
      if (error instanceof PreparationProofError) {
        throw new ApiError(
          403,
          'INVALID_PREPARATION_PROOF',
          'Prepare and approve this product again before generating a variant.'
        );
      }
      throw error;
    }
    await reserveVariantGeneration(user.uid);
    try {
      await inspectPreparedCutout(cutout.buffer, cutout.mimeType);
    } catch (error) {
      if (error instanceof VariantImageError) {
        throw new ApiError(400, 'INVALID_CUTOUT', error.message);
      }
      throw error;
    }
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      maxRetries: 0,
      timeout: OPENAI_TIMEOUT_MS
    });
    const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';
    const upload = await OpenAI.toFile(
      cutout.buffer,
      `prepared-product.${cutout.extension}`,
      { type: cutout.mimeType }
    );

    let generation;
    try {
      generation = await client.images.edit({
        model,
        image: upload,
        prompt: buildVariantPrompt(variantRequest),
        n: 1,
        size: OUTPUT_SIZE,
        quality: 'high',
        output_format: OUTPUT_FORMAT,
        output_compression: 90
      });
    } catch (error) {
      throw providerError(error);
    }

    let variantBuffer;
    try {
      variantBuffer = decodeProviderVariant(generation.data?.[0]);
      await inspectProviderVariant(variantBuffer);
    } catch (error) {
      if (error instanceof VariantImageError) {
        const code = error.code === 'VARIANT_TOO_LARGE' ? 'VARIANT_TOO_LARGE' : 'VARIANT_INVALID_RESPONSE';
        throw new ApiError(502, code, `${error.message} Please retry.`);
      }
      throw providerError(error);
    }

    return respond(response, 200, {
      variant: `data:image/${OUTPUT_FORMAT};base64,${variantBuffer.toString('base64')}`,
      variantType: variantRequest.variantType,
      model,
      size: OUTPUT_SIZE,
      backgroundColor: CHROMA_KEY_COLOR,
      requiresChromaKey: true,
      requestId
    });
  } catch (error) {
    const safeError = error instanceof ApiError
      ? error
      : new ApiError(500, 'INTERNAL_ERROR', 'The variant request could not be completed.');

    console.error('generate-variant failed', {
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
