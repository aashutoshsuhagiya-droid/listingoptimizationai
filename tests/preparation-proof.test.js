'use strict';

const assert = require('node:assert/strict');

const {
  PREPARATION_PROOF_TTL_SECONDS,
  PreparationProofError,
  createPreparationProof,
  requiredPreparationProofSecret,
  verifyPreparationProof
} = require('../api/_lib/preparation-proof');

const secret = Buffer.from('0123456789abcdef0123456789abcdef', 'utf8');
const cutout = Buffer.from('prepared-cutout-bytes');
const uid = 'firebase-user-123';
const now = Date.UTC(2026, 9, 16, 12, 0, 0);

const proof = createPreparationProof({ cutout, uid, secret, now });
const verified = verifyPreparationProof({ proof, cutout, uid, secret, now });
assert.equal(verified.expiresAt, Math.floor(now / 1000) + PREPARATION_PROOF_TTL_SECONDS);

assert.throws(
  () => verifyPreparationProof({ proof, cutout: Buffer.from('different-cutout'), uid, secret, now }),
  (error) => error instanceof PreparationProofError && error.code === 'INVALID_PREPARATION_PROOF'
);
assert.throws(
  () => verifyPreparationProof({ proof, cutout, uid: 'different-user', secret, now }),
  (error) => error instanceof PreparationProofError && error.code === 'INVALID_PREPARATION_PROOF'
);
assert.throws(
  () => verifyPreparationProof({
    proof,
    cutout,
    uid,
    secret,
    now: now + (PREPARATION_PROOF_TTL_SECONDS + 1) * 1000
  }),
  /invalid or expired/
);

const [payload, signature] = proof.split('.');
const tamperedPayload = `${payload.slice(0, -1)}${payload.endsWith('A') ? 'B' : 'A'}`;
const tamperedSignature = `${signature.slice(0, -1)}${signature.endsWith('A') ? 'B' : 'A'}`;
assert.throws(
  () => verifyPreparationProof({ proof: `${tamperedPayload}.${signature}`, cutout, uid, secret, now }),
  /invalid/
);
assert.throws(
  () => verifyPreparationProof({ proof: `${payload}.${tamperedSignature}`, cutout, uid, secret, now }),
  /invalid/
);
assert.throws(
  () => verifyPreparationProof({ proof: 'not-a-proof', cutout, uid, secret, now }),
  /invalid/
);
assert.throws(
  () => createPreparationProof({ cutout, uid, secret: 'short', now }),
  (error) => error instanceof PreparationProofError && error.code === 'PROOF_SERVICE_NOT_CONFIGURED'
);
assert.throws(
  () => requiredPreparationProofSecret({}),
  (error) => error instanceof PreparationProofError && error.code === 'PROOF_SERVICE_NOT_CONFIGURED'
);
assert.equal(
  requiredPreparationProofSecret({ PREPARATION_PROOF_SECRET: secret.toString('utf8') }).length,
  32
);

console.log('Preparation proof contract tests passed.');
