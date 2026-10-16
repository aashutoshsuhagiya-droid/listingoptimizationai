'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const dashboard = read('dashboard.js');
const dashboardHtml = read('dashboard.html');
const generationApi = read('api/generate-infographic.js');
const preparationApi = read('api/prepare-product.js');
const firebaseAdmin = read('api/_lib/firebase-admin.js');
const firestoreRules = read('firestore.rules');

assert.match(generationApi, /client\.images\.generate\(/, 'Backgrounds must use image generation, not product editing.');
assert.doesNotMatch(generationApi, /body\?\.images|images\.edit|input_fidelity/, 'OpenAI must not receive customer product pixels.');
assert.doesNotMatch(generationApi, /releaseReservation/, 'Billable generation attempts must not be refunded from quota.');
assert.doesNotMatch(preparationApi, /releaseReservation/, 'Started image-processing attempts must count toward quota.');
assert.match(firebaseAdmin, /REQUIRE_GENERATION_ENTITLEMENT !== 'false'/, 'Paid entitlement must fail closed unless explicitly disabled.');
assert.match(firebaseAdmin, /requiredPositiveInteger\(configuration\.globalMaximumEnvironment/, 'Global cost caps must be required configuration.');
assert.ok(
  preparationApi.indexOf('await reserveProductPreparation(user.uid)') < preparationApi.indexOf('await inspectImage'),
  'Preparation quota must be reserved before expensive Sharp decoding.'
);

const workflow = dashboard.slice(dashboard.indexOf('async function handleGeneration'));
assert.ok(
  workflow.indexOf('await requestCutoutApproval') < workflow.indexOf('await requestGeneration'),
  'The customer must approve the cutout before paid background generation.'
);
assert.doesNotMatch(dashboard, /fitText\(|payload\.benefits\.slice/, 'Approved infographic copy must not be silently truncated or omitted.');
assert.match(dashboard, /if \(isMarketplaceMain\) \{\s*context\.drawImage\([\s\S]*?return;/, 'Marketplace Main must bypass artificial shadows.');
assert.match(dashboardHtml, /id="cutout-review"/, 'The product-cutout approval UI is required.');
assert.match(firestoreRules, /match \/generationUsage\/\{document=\*\*\}[\s\S]*?allow read, write: if false;/, 'Browser access to quota documents must remain denied.');

console.log('Architecture contract tests passed.');
