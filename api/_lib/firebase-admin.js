'use strict';

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

  try {
    const app = getAdminApp();
    return await getAuth(app).verifyIdToken(match[1], true);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(401, 'INVALID_AUTH_TOKEN', 'Your session expired. Sign in again.');
  }
}

function clampInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function dailyUsageReference(uid) {
  const date = new Date().toISOString().slice(0, 10);
  const safeUid = String(uid).replace(/[^a-zA-Z0-9_-]/g, '');
  return getFirestore(getAdminApp()).collection('generationUsage').doc(`${safeUid}_${date}`);
}

async function reserveGeneration(uid) {
  const maximum = clampInteger(process.env.MAX_DAILY_GENERATIONS, 6, 1, 500);
  const cooldownSeconds = clampInteger(process.env.GENERATION_COOLDOWN_SECONDS, 5, 0, 300);
  const reference = dailyUsageReference(uid);
  const database = reference.firestore;

  await database.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const data = snapshot.exists ? snapshot.data() : {};
    const currentCount = Number(data.count || 0);
    const lastRequest = data.lastRequestAt?.toMillis?.() || 0;
    const elapsed = Date.now() - lastRequest;

    if (currentCount >= maximum) {
      throw new ApiError(429, 'DAILY_LIMIT_REACHED', `Daily generation limit reached (${maximum}).`);
    }
    if (cooldownSeconds && lastRequest && elapsed < cooldownSeconds * 1000) {
      throw new ApiError(429, 'RATE_LIMITED', `Wait ${Math.ceil((cooldownSeconds * 1000 - elapsed) / 1000)} seconds before generating again.`);
    }

    transaction.set(reference, {
      uid,
      date: new Date().toISOString().slice(0, 10),
      count: currentCount + 1,
      lastRequestAt: Timestamp.now(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  });

  return { reference, maximum };
}

async function releaseGeneration(reservation) {
  if (!reservation?.reference) return;
  try {
    await reservation.reference.update({
      count: FieldValue.increment(-1),
      updatedAt: FieldValue.serverTimestamp()
    });
  } catch {
    // Quota reconciliation must never hide the original provider error.
  }
}

module.exports = {
  ApiError,
  releaseGeneration,
  reserveGeneration,
  verifyFirebaseUser
};
