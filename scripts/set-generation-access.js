'use strict';

const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function adminApp() {
  if (getApps().length) return getApps()[0];
  const projectId = requiredEnvironment('FIREBASE_PROJECT_ID');
  return initializeApp({
    credential: cert({
      projectId,
      clientEmail: requiredEnvironment('FIREBASE_CLIENT_EMAIL'),
      privateKey: requiredEnvironment('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n')
    }),
    projectId
  });
}

async function main() {
  const identifier = String(process.argv[2] || '').trim();
  const action = String(process.argv[3] || 'grant').trim().toLowerCase();
  if (!identifier || !['grant', 'revoke'].includes(action)) {
    throw new Error('Usage: npm run access:set -- <customer-email-or-uid> <grant|revoke>');
  }

  const auth = getAuth(adminApp());
  const user = identifier.includes('@')
    ? await auth.getUserByEmail(identifier)
    : await auth.getUser(identifier);
  const generationAccess = action === 'grant';
  await auth.setCustomUserClaims(user.uid, {
    ...(user.customClaims || {}),
    generationAccess
  });

  console.log(`${generationAccess ? 'Granted' : 'Revoked'} generation access for ${user.email || user.uid}.`);
  console.log('The customer must sign out and back in before the new access takes effect.');
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
