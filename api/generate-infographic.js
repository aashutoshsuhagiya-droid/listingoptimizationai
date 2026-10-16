'use strict';

const { randomUUID } = require('crypto');
const OpenAI = require('openai');

const {
  ApiError,
  reserveGeneration,
  verifyFirebaseUser
} = require('./_lib/firebase-admin');
const {
  backgroundSizeFor,
  buildBackgroundPrompt,
  validateCreativeBrief
} = require('./_lib/prompt');

const MAX_REQUEST_BYTES = 96 * 1024;
const MAX_BACKGROUND_BYTES = 2_750_000;

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

async function imagePayload(result) {
  if (result?.b64_json) {
    if (Buffer.byteLength(result.b64_json, 'base64') > MAX_BACKGROUND_BYTES) {
      throw new ApiError(502, 'BACKGROUND_TOO_LARGE', 'The generated background was too large to deliver safely. Please retry.');
    }
    return result.b64_json;
  }
  if (result?.url) {
    let sourceUrl;
    try { sourceUrl = new URL(result.url); }
    catch { throw new Error('Generated background URL was invalid.'); }
    if (sourceUrl.protocol !== 'https:') throw new Error('Generated background URL was not secure.');

    const providerResponse = await fetch(sourceUrl, { signal: AbortSignal.timeout(25_000) });
    if (!providerResponse.ok) {
      throw new Error(`Generated background download failed (${providerResponse.status})`);
    }
    const declaredLength = Number(providerResponse.headers.get('content-length') || 0);
    if (declaredLength > MAX_BACKGROUND_BYTES) {
      throw new ApiError(502, 'BACKGROUND_TOO_LARGE', 'The generated background was too large to deliver safely. Please retry.');
    }

    const reader = providerResponse.body?.getReader?.();
    if (!reader) {
      const fallback = Buffer.from(await providerResponse.arrayBuffer());
      if (fallback.length > MAX_BACKGROUND_BYTES) {
        throw new ApiError(502, 'BACKGROUND_TOO_LARGE', 'The generated background was too large to deliver safely. Please retry.');
      }
      return fallback.toString('base64');
    }

    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BACKGROUND_BYTES) {
        await reader.cancel();
        throw new ApiError(502, 'BACKGROUND_TOO_LARGE', 'The generated background was too large to deliver safely. Please retry.');
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, total).toString('base64');
  }
  throw new Error('Image provider returned no background payload.');
}

function providerError(error) {
  if (error?.status === 429) {
    return new ApiError(429, 'PROVIDER_RATE_LIMITED', 'The background service is busy. Please wait and try again.');
  }
  if (error?.status === 400 || error?.status === 422) {
    return new ApiError(400, 'GENERATION_REJECTED', 'The background service could not generate this creative direction. Review the product brief and try again.');
  }
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
    return new ApiError(504, 'GENERATION_TIMEOUT', 'Background generation timed out. Please try again.');
  }
  return new ApiError(502, 'GENERATION_FAILED', 'The background service did not complete the creative. Please try again.');
}

function outputCompression() {
  const parsed = Number.parseInt(process.env.OPENAI_OUTPUT_COMPRESSION, 10);
  if (!Number.isFinite(parsed)) return 90;
  return Math.max(75, Math.min(95, parsed));
}

function outputFormat() {
  return process.env.OPENAI_OUTPUT_FORMAT === 'jpeg' ? 'jpeg' : 'webp';
}

module.exports = async function generateInfographic(request, response) {
  const requestId = randomUUID();

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return respond(response, 405, { error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED', requestId });
  }

  try {
    const contentLength = Number(request.headers['content-length'] || 0);
    if (contentLength > MAX_REQUEST_BYTES) {
      throw new ApiError(413, 'REQUEST_TOO_LARGE', 'The creative brief is unexpectedly large.');
    }
    const contentType = String(request.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (contentType && contentType !== 'application/json') {
      throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use an application/json request body.');
    }

    const user = await verifyFirebaseUser(request);
    if (!process.env.OPENAI_API_KEY) {
      throw new ApiError(503, 'SERVICE_NOT_CONFIGURED', 'Background generation is not configured.');
    }

    const body = parseRequestBody(request);
    let brief;
    try {
      brief = validateCreativeBrief(body);
    } catch (error) {
      throw new ApiError(400, 'INVALID_BRIEF', error?.message || 'The creative brief is invalid.');
    }
    if (brief.template === 'marketplace-main') {
      throw new ApiError(400, 'BACKGROUND_NOT_REQUIRED', 'Marketplace Main is composed locally without an AI background.');
    }

    await reserveGeneration(user.uid);

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      maxRetries: 0,
      timeout: 240_000
    });
    const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';
    const quality = ['low', 'medium', 'high', 'auto'].includes(process.env.OPENAI_IMAGE_QUALITY)
      ? process.env.OPENAI_IMAGE_QUALITY
      : 'high';
    const size = backgroundSizeFor(brief.canvasFormat, brief.template);
    const format = outputFormat();

    let generation;
    try {
      generation = await client.images.generate({
        model,
        prompt: buildBackgroundPrompt(brief),
        n: 1,
        size,
        quality,
        output_format: format,
        output_compression: outputCompression()
      });
    } catch (error) {
      throw providerError(error);
    }

    let encoded;
    try {
      encoded = await imagePayload(generation.data?.[0]);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw providerError(error);
    }
    return respond(response, 200, {
      background: `data:image/${format};base64,${encoded}`,
      template: brief.template,
      model,
      size,
      requestId
    });
  } catch (error) {
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
