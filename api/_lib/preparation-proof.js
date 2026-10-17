'use strict';

const {
  createHash,
  createHmac,
  timingSafeEqual
} = require('crypto');

const PREPARATION_PROOF_TTL_SECONDS = 2 * 60 * 60;
const MAX_CLOCK_SKEW_SECONDS = 60;
const MINIMUM_SECRET_BYTES = 32;
const MAX_PROOF_LENGTH = 1024;

class PreparationProofError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PreparationProofError';
    this.code = code;
  }
}

function requiredPreparationProofSecret(environment = process.env) {
  const value = environment.PREPARATION_PROOF_SECRET;
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') < MINIMUM_SECRET_BYTES) {
    throw new PreparationProofError(
      'PROOF_SERVICE_NOT_CONFIGURED',
      `PREPARATION_PROOF_SECRET must contain at least ${MINIMUM_SECRET_BYTES} bytes.`
    );
  }
  return Buffer.from(value, 'utf8');
}

function requireBuffer(value) {
  if (!Buffer.isBuffer(value) || !value.length) {
    throw new PreparationProofError('INVALID_PROOF_INPUT', 'A non-empty cutout buffer is required.');
  }
  return value;
}

function requireUid(value) {
  if (typeof value !== 'string' || !value) {
    throw new PreparationProofError('INVALID_PROOF_INPUT', 'An authenticated user ID is required.');
  }
  return value;
}

function cutoutHash(buffer) {
  return createHash('sha256')
    .update('prepared-cutout-v1\0', 'utf8')
    .update(requireBuffer(buffer))
    .digest('base64url');
}

function uidHash(uid) {
  return createHash('sha256')
    .update('firebase-uid-v1\0', 'utf8')
    .update(requireUid(uid), 'utf8')
    .digest('base64url');
}

function hmac(payloadSegment, secret) {
  return createHmac('sha256', secret)
    .update('preparation-proof-v1.', 'utf8')
    .update(payloadSegment, 'ascii')
    .digest();
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.isBuffer(left) ? left : Buffer.from(String(left), 'utf8');
  const rightBuffer = Buffer.isBuffer(right) ? right : Buffer.from(String(right), 'utf8');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function decodeBase64Url(segment) {
  if (typeof segment !== 'string' || !segment || !/^[a-zA-Z0-9_-]+$/.test(segment)) {
    throw new PreparationProofError('INVALID_PREPARATION_PROOF', 'The preparation proof is invalid.');
  }
  const decoded = Buffer.from(segment, 'base64url');
  if (!decoded.length || decoded.toString('base64url') !== segment) {
    throw new PreparationProofError('INVALID_PREPARATION_PROOF', 'The preparation proof is invalid.');
  }
  return decoded;
}

function createPreparationProof({ cutout, uid, secret, now = Date.now() }) {
  const secretBuffer = Buffer.isBuffer(secret) ? secret : Buffer.from(String(secret || ''), 'utf8');
  if (secretBuffer.length < MINIMUM_SECRET_BYTES) {
    throw new PreparationProofError('PROOF_SERVICE_NOT_CONFIGURED', 'The preparation proof secret is invalid.');
  }
  const issuedAt = Math.floor(Number(now) / 1000);
  if (!Number.isSafeInteger(issuedAt) || issuedAt < 1) {
    throw new PreparationProofError('INVALID_PROOF_INPUT', 'The preparation proof time is invalid.');
  }
  const payload = {
    v: 1,
    cutoutHash: cutoutHash(cutout),
    uidHash: uidHash(uid),
    issuedAt,
    expiresAt: issuedAt + PREPARATION_PROOF_TTL_SECONDS
  };
  const payloadSegment = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${payloadSegment}.${hmac(payloadSegment, secretBuffer).toString('base64url')}`;
}

function verifyPreparationProof({ proof, cutout, uid, secret, now = Date.now() }) {
  if (typeof proof !== 'string' || !proof || proof.length > MAX_PROOF_LENGTH) {
    throw new PreparationProofError('INVALID_PREPARATION_PROOF', 'The preparation proof is invalid.');
  }
  const secretBuffer = Buffer.isBuffer(secret) ? secret : Buffer.from(String(secret || ''), 'utf8');
  if (secretBuffer.length < MINIMUM_SECRET_BYTES) {
    throw new PreparationProofError('PROOF_SERVICE_NOT_CONFIGURED', 'The preparation proof secret is invalid.');
  }

  const segments = proof.split('.');
  if (segments.length !== 2) {
    throw new PreparationProofError('INVALID_PREPARATION_PROOF', 'The preparation proof is invalid.');
  }
  const [payloadSegment, signatureSegment] = segments;
  const suppliedSignature = decodeBase64Url(signatureSegment);
  const expectedSignature = hmac(payloadSegment, secretBuffer);
  if (!safeEqual(suppliedSignature, expectedSignature)) {
    throw new PreparationProofError('INVALID_PREPARATION_PROOF', 'The preparation proof is invalid.');
  }

  let payload;
  try {
    payload = JSON.parse(decodeBase64Url(payloadSegment).toString('utf8'));
  } catch (error) {
    if (error instanceof PreparationProofError) throw error;
    throw new PreparationProofError('INVALID_PREPARATION_PROOF', 'The preparation proof is invalid.');
  }

  const currentTime = Math.floor(Number(now) / 1000);
  const validTimes = (
    Number.isSafeInteger(currentTime) &&
    Number.isSafeInteger(payload?.issuedAt) &&
    Number.isSafeInteger(payload?.expiresAt) &&
    payload.issuedAt <= currentTime + MAX_CLOCK_SKEW_SECONDS &&
    payload.expiresAt > currentTime &&
    payload.expiresAt - payload.issuedAt === PREPARATION_PROOF_TTL_SECONDS
  );
  if (!validTimes) {
    throw new PreparationProofError('INVALID_PREPARATION_PROOF', 'The preparation proof is invalid or expired.');
  }
  if (
    payload.v !== 1 ||
    !safeEqual(payload.cutoutHash || '', cutoutHash(cutout)) ||
    !safeEqual(payload.uidHash || '', uidHash(uid))
  ) {
    throw new PreparationProofError('INVALID_PREPARATION_PROOF', 'The preparation proof does not match this product or user.');
  }

  return { expiresAt: payload.expiresAt };
}

module.exports = {
  MAX_PROOF_LENGTH,
  PREPARATION_PROOF_TTL_SECONDS,
  PreparationProofError,
  createPreparationProof,
  requiredPreparationProofSecret,
  verifyPreparationProof
};
