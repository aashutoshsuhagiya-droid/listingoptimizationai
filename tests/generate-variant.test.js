'use strict';

const assert = require('assert');
const path = require('path');

const root = path.resolve(__dirname, '..');
const firebasePath = require.resolve(path.join(root, 'api/_lib/firebase-admin.js'));
const proofPath = require.resolve(path.join(root, 'api/_lib/preparation-proof.js'));
const imagesPath = require.resolve(path.join(root, 'api/_lib/variant-images.js'));
const openAiPath = require.resolve('openai');
const handlerPath = require.resolve(path.join(root, 'api/generate-variant.js'));

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

class PreparationProofError extends Error {}
class VariantImageError extends Error {}

const calls = {
  edit: [],
  proof: [],
  reserve: [],
  verify: []
};

let proofFailure = null;

function installMock(modulePath, exports) {
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports
  };
}

class OpenAIMock {
  constructor(configuration) {
    this.configuration = configuration;
    this.images = {
      edit: async (payload) => {
        calls.edit.push(payload);
        return { data: [{ b64_json: Buffer.from('provider-image').toString('base64') }] };
      }
    };
  }

  static async toFile(buffer, filename, options) {
    return { buffer, filename, type: options.type };
  }
}

installMock(firebasePath, {
  ApiError,
  reserveVariantGeneration: async (uid) => calls.reserve.push(uid),
  verifyFirebaseUser: async (request) => {
    calls.verify.push(request.headers.authorization);
    return { uid: 'user-123' };
  }
});
installMock(proofPath, {
  PreparationProofError,
  requiredPreparationProofSecret: () => Buffer.alloc(32, 7),
  verifyPreparationProof: (input) => {
    calls.proof.push(input);
    if (proofFailure) throw proofFailure;
  }
});
installMock(imagesPath, {
  VariantImageError,
  decodeProviderVariant: () => Buffer.from('validated-variant'),
  inspectPreparedCutout: async () => ({ width: 800, height: 800, format: 'png' }),
  inspectProviderVariant: async () => ({ width: 1024, height: 1024, format: 'webp' })
});
installMock(openAiPath, OpenAIMock);
delete require.cache[handlerPath];

const generateVariant = require(handlerPath);

function request(overrides = {}) {
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from('contract-test')
  ]);
  return {
    method: 'POST',
    headers: {
      authorization: 'Bearer test-token',
      'content-type': 'application/json'
    },
    body: {
      cutout: `data:image/png;base64,${png.toString('base64')}`,
      preparationProof: 'signed-proof',
      variantType: 'color',
      instruction: 'Change only the bottle body to navy blue.'
    },
    ...overrides
  };
}

function response() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(status) { this.statusCode = status; return this; },
    json(body) { this.body = body; return this; }
  };
}

async function withoutExpectedErrorLog(action) {
  const original = console.error;
  console.error = () => {};
  try {
    return await action();
  } finally {
    console.error = original;
  }
}

(async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  delete process.env.OPENAI_IMAGE_MODEL;

  const methodResponse = response();
  await generateVariant(request({ method: 'GET' }), methodResponse);
  assert.strictEqual(methodResponse.statusCode, 405);
  assert.strictEqual(methodResponse.headers.Allow, 'POST');
  assert.strictEqual(calls.verify.length, 0, 'Wrong methods must stop before authentication.');

  const mediaResponse = response();
  await withoutExpectedErrorLog(() => (
    generateVariant(request({ headers: { 'content-type': 'text/plain' } }), mediaResponse)
  ));
  assert.strictEqual(mediaResponse.statusCode, 415);
  assert.strictEqual(calls.verify.length, 0, 'Wrong media types must stop before authentication.');

  const largeResponse = response();
  await withoutExpectedErrorLog(() => (
    generateVariant(request({ headers: { 'content-length': String(4 * 1024 * 1024) } }), largeResponse)
  ));
  assert.strictEqual(largeResponse.statusCode, 413);
  assert.strictEqual(calls.verify.length, 0, 'Oversized requests must stop before authentication.');

  const successResponse = response();
  await generateVariant(request(), successResponse);
  assert.strictEqual(successResponse.statusCode, 200);
  assert.strictEqual(successResponse.headers['Cache-Control'], 'no-store, max-age=0');
  assert.strictEqual(successResponse.headers['X-Content-Type-Options'], 'nosniff');
  assert.strictEqual(successResponse.body.variantType, 'color');
  assert.strictEqual(successResponse.body.model, 'gpt-image-2');
  assert.strictEqual(successResponse.body.size, '1024x1024');
  assert.strictEqual(successResponse.body.backgroundColor, '#00FF00');
  assert.strictEqual(successResponse.body.requiresChromaKey, true);
  assert.strictEqual(
    successResponse.body.variant,
    `data:image/webp;base64,${Buffer.from('validated-variant').toString('base64')}`
  );
  assert.deepStrictEqual(calls.reserve, ['user-123']);
  assert.strictEqual(calls.proof.length, 1);
  assert.strictEqual(calls.proof[0].uid, 'user-123');
  assert.strictEqual(calls.edit.length, 1);
  assert.strictEqual(calls.edit[0].model, 'gpt-image-2');
  assert.strictEqual(calls.edit[0].size, '1024x1024');
  assert.strictEqual(calls.edit[0].quality, 'high');
  assert.strictEqual(calls.edit[0].output_format, 'webp');
  assert.doesNotMatch(JSON.stringify(calls.edit[0]), /input_fidelity/);

  proofFailure = new PreparationProofError('invalid proof');
  const proofResponse = response();
  await withoutExpectedErrorLog(() => generateVariant(request(), proofResponse));
  assert.strictEqual(proofResponse.statusCode, 403);
  assert.strictEqual(proofResponse.body.code, 'INVALID_PREPARATION_PROOF');
  assert.deepStrictEqual(calls.reserve, ['user-123'], 'Invalid proofs must not consume variant quota.');
  assert.strictEqual(calls.edit.length, 1, 'Invalid proofs must not reach the image provider.');

  console.log('Variant endpoint contract tests passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
