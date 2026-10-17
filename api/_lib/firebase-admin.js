'use strict';

const { createHash } = require('crypto');
const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { FieldValue, getFirestore, Timestamp } = require('firebase-admin/firestore');

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) {
    throw new ApiError(503, 'SERVICE_NOT_CONFIGURED', `Missing server configuration: ${name}`);
  }
  return value;
}

function getAdminApp() {
  if (getApps().length) return getApps()[0];

  const projectId = requiredEnvironment('FIREBASE_PROJECT_ID');
  const clientEmail = requiredEnvironment('FIREBASE_CLIENT_EMAIL');
  const privateKey = requiredEnvironment('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n');

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    projectId
  });
}

async function verifyFirebaseUser(request) {
  const header = request.headers.authorization || request.headers.Authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) throw new ApiError(401, 'AUTH_REQUIRED', 'Sign in before generating images.');

  let decodedToken;
  try {
    const app = getAdminApp();
    decodedToken = await getAuth(app).verifyIdToken(match[1], true);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const invalidTokenCodes = new Set([
      'auth/argument-error',
      'auth/id-token-expired',
      'auth/id-token-revoked',
      'auth/invalid-id-token',
      'auth/user-disabled',
      'auth/user-not-found'
    ]);
    if (invalidTokenCodes.has(error?.code)) {
      throw new ApiError(401, 'INVALID_AUTH_TOKEN', 'Your session expired. Sign in again.');
    }
    throw new ApiError(503, 'AUTH_SERVICE_UNAVAILABLE', 'Authentication could not be verified right now. Please try again.');
  }

  if (process.env.REQUIRE_VERIFIED_EMAIL !== 'false' && decodedToken.email_verified !== true) {
    throw new ApiError(403, 'EMAIL_VERIFICATION_REQUIRED', 'Verify your email address before using paid image tools.');
  }
  if (
    process.env.REQUIRE_GENERATION_ENTITLEMENT !== 'false' &&
    decodedToken.generationAccess !== true &&
    decodedToken.admin !== true
  ) {
    throw new ApiError(403, 'GENERATION_ACCESS_REQUIRED', 'Your account does not have image-generation access yet.');
  }

  return decodedToken;
}

function clampInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function requiredPositiveInteger(name, maximum) {
  const raw = requiredEnvironment(name);
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || String(parsed) !== String(raw).trim()) {
    throw new ApiError(503, 'SERVICE_NOT_CONFIGURED', `Server configuration must be a positive integer: ${name}`);
  }
  return Math.min(maximum, parsed);
}

function dailyUsageReference(uid) {
  const date = new Date().toISOString().slice(0, 10);
  const uidHash = createHash('sha256').update(String(uid)).digest('hex').slice(0, 48);
  return getFirestore(getAdminApp()).collection('generationUsage').doc(`${uidHash}_${date}`);
}

function globalUsageReference() {
  const date = new Date().toISOString().slice(0, 10);
  return getFirestore(getAdminApp()).collection('generationUsage').doc(`_global_${date}`);
}

const USAGE_TYPES = {
  generation: {
    countField: 'count',
    lastRequestField: 'lastRequestAt',
    maximumEnvironment: 'MAX_DAILY_GENERATIONS',
    maximumFallback: 6,
    globalMaximumEnvironment: 'MAX_DAILY_GLOBAL_GENERATIONS',
    cooldownEnvironment: 'GENERATION_COOLDOWN_SECONDS',
    cooldownFallback: 5,
    limitCode: 'DAILY_LIMIT_REACHED',
    rateCode: 'RATE_LIMITED',
    label: 'generation'
  },
  preparation: {
    countField: 'preparationCount',
    lastRequestField: 'lastPreparationAt',
    maximumEnvironment: 'MAX_DAILY_PRODUCT_PREPARATIONS',
    maximumFallback: 10,
    globalMaximumEnvironment: 'MAX_DAILY_GLOBAL_PRODUCT_PREPARATIONS',
    cooldownEnvironment: 'PRODUCT_PREPARATION_COOLDOWN_SECONDS',
    cooldownFallback: 3,
    limitCode: 'DAILY_PREPARATION_LIMIT_REACHED',
    rateCode: 'PREPARATION_RATE_LIMITED',
    label: 'product preparation'
  },
  variant: {
    countField: 'variantCount',
    lastRequestField: 'lastVariantAt',
    maximumEnvironment: 'MAX_DAILY_VARIANT_GENERATIONS',
    maximumFallback: 8,
    globalMaximumEnvironment: 'MAX_DAILY_GLOBAL_VARIANT_GENERATIONS',
    cooldownEnvironment: 'VARIANT_GENERATION_COOLDOWN_SECONDS',
    cooldownFallback: 5,
    limitCode: 'DAILY_VARIANT_LIMIT_REACHED',
    rateCode: 'VARIANT_RATE_LIMITED',
    label: 'variant generation'
  }
};

async function reserveUsage(uid, type) {
  const configuration = USAGE_TYPES[type];
  if (!configuration) throw new Error(`Unsupported usage type: ${type}`);

  const maximum = clampInteger(
    process.env[configuration.maximumEnvironment],
    configuration.maximumFallback,
    1,
    500
  );
  const cooldownSeconds = clampInteger(
    process.env[configuration.cooldownEnvironment],
    configuration.cooldownFallback,
    0,
    300
  );
  const globalMaximum = requiredPositiveInteger(configuration.globalMaximumEnvironment, 1_000_000);
  const reference = dailyUsageReference(uid);
  const globalReference = globalUsageReference();
  const database = reference.firestore;

  await database.runTransaction(async (transaction) => {
    const [snapshot, globalSnapshot] = await Promise.all([
      transaction.get(reference),
      transaction.get(globalReference)
    ]);
    const data = snapshot.exists ? snapshot.data() : {};
    const currentCount = Number(data[configuration.countField] || 0);
    const lastRequest = data[configuration.lastRequestField]?.toMillis?.() || 0;
    const elapsed = Date.now() - lastRequest;

    if (currentCount >= maximum) {
      throw new ApiError(
        429,
        configuration.limitCode,
        `Daily ${configuration.label} limit reached (${maximum}).`
      );
    }
    const globalCount = Number(globalSnapshot?.data()?.[configuration.countField] || 0);
    if (globalCount >= globalMaximum) {
      throw new ApiError(
        429,
        'GLOBAL_DAILY_LIMIT_REACHED',
        'The image service has reached its daily capacity. Please try again tomorrow.'
      );
    }
    if (cooldownSeconds && lastRequest && elapsed < cooldownSeconds * 1000) {
      throw new ApiError(
        429,
        configuration.rateCode,
        `Wait ${Math.ceil((cooldownSeconds * 1000 - elapsed) / 1000)} seconds before trying again.`
      );
    }

    transaction.set(reference, {
      uid,
      date: new Date().toISOString().slice(0, 10),
      [configuration.countField]: currentCount + 1,
      [configuration.lastRequestField]: Timestamp.now(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    transaction.set(globalReference, {
      date: new Date().toISOString().slice(0, 10),
      [configuration.countField]: globalCount + 1,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  });

  return { maximum, type };
}

function reserveGeneration(uid) {
  return reserveUsage(uid, 'generation');
}

function reserveProductPreparation(uid) {
  return reserveUsage(uid, 'preparation');
}

function reserveVariantGeneration(uid) {
  return reserveUsage(uid, 'variant');
}

module.exports = {
  ApiError,
  reserveGeneration,
  reserveProductPreparation,
  reserveVariantGeneration,
  verifyFirebaseUser
};
