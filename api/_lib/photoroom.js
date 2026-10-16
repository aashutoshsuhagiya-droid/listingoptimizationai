'use strict';

const { ApiError } = require('./firebase-admin');

const DEFAULT_SEGMENT_URL = 'https://sdk.photoroom.com/v1/segment';
const MAX_PROVIDER_RESPONSE_BYTES = 25 * 1024 * 1024;

function configuredEndpoint() {
  const raw = process.env.PHOTOROOM_SEGMENT_URL || DEFAULT_SEGMENT_URL;
  let endpoint;
  try {
    endpoint = new URL(raw);
  } catch {
    throw new ApiError(503, 'CUTOUT_SERVICE_NOT_CONFIGURED', 'Product cutout service URL is invalid.');
  }
  if (endpoint.protocol !== 'https:') {
    throw new ApiError(503, 'CUTOUT_SERVICE_NOT_CONFIGURED', 'Product cutout service must use HTTPS.');
  }
  return endpoint.toString();
}

function providerFailure(status) {
  if (status === 400 || status === 415 || status === 422) {
    return new ApiError(400, 'CUTOUT_REJECTED', 'The product photo could not be separated from its background. Try a clearer front-facing image.');
  }
  if (status === 429) {
    return new ApiError(429, 'CUTOUT_RATE_LIMITED', 'The product cutout service is busy. Please wait and try again.');
  }
  if ([401, 402, 403].includes(status)) {
    return new ApiError(503, 'CUTOUT_SERVICE_NOT_CONFIGURED', 'Product cutout service credentials or billing are not configured.');
  }
  return new ApiError(502, 'CUTOUT_FAILED', 'The product cutout service did not complete the image.');
}

async function readLimitedResponse(response, maximumBytes) {
  if (!response.body?.getReader) {
    const fallback = Buffer.from(await response.arrayBuffer());
    if (fallback.length > maximumBytes) {
      throw new ApiError(502, 'CUTOUT_RESPONSE_TOO_LARGE', 'The product cutout response was unexpectedly large.');
    }
    return fallback;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel();
      throw new ApiError(502, 'CUTOUT_RESPONSE_TOO_LARGE', 'The product cutout response was unexpectedly large.');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
}

async function removeBackground({ buffer, mimeType, filename = 'product.jpg' }) {
  const apiKey = process.env.PHOTOROOM_API_KEY;
  if (!apiKey) {
    throw new ApiError(503, 'CUTOUT_SERVICE_NOT_CONFIGURED', 'Product cutout service is not configured.');
  }

  const form = new FormData();
  const fieldName = process.env.PHOTOROOM_FILE_FIELD || 'image_file';
  form.append(fieldName, new Blob([buffer], { type: mimeType }), filename);

  let providerResponse;
  try {
    providerResponse = await fetch(configuredEndpoint(), {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        Accept: 'image/png,image/webp'
      },
      body: form,
      signal: AbortSignal.timeout(65_000)
    });
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new ApiError(504, 'CUTOUT_TIMEOUT', 'Product cutout preparation timed out. Please try again.');
    }
    throw new ApiError(502, 'CUTOUT_FAILED', 'The product cutout service could not be reached.');
  }

  if (!providerResponse.ok) throw providerFailure(providerResponse.status);

  const declaredLength = Number(providerResponse.headers.get('content-length') || 0);
  if (declaredLength > MAX_PROVIDER_RESPONSE_BYTES) {
    throw new ApiError(502, 'CUTOUT_RESPONSE_TOO_LARGE', 'The product cutout response was unexpectedly large.');
  }

  let result;
  try {
    result = await readLimitedResponse(providerResponse, MAX_PROVIDER_RESPONSE_BYTES);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, 'CUTOUT_FAILED', 'The product cutout response could not be downloaded.');
  }
  if (!result.length || result.length > MAX_PROVIDER_RESPONSE_BYTES) {
    throw new ApiError(502, 'CUTOUT_INVALID_RESPONSE', 'The product cutout service returned an invalid image.');
  }
  return result;
}

module.exports = {
  removeBackground
};
