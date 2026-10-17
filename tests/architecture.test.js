'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const dashboard = read('dashboard.js');
const dashboardHtml = read('dashboard.html');
const generationApi = read('api/generate-infographic.js');
const variantApi = read('api/generate-variant.js');
const preparationApi = read('api/prepare-product.js');
const firebaseAdmin = read('api/_lib/firebase-admin.js');
const preparationProof = read('api/_lib/preparation-proof.js');
const variantImages = read('api/_lib/variant-images.js');
const firestoreRules = read('firestore.rules');

assert.match(generationApi, /client\.images\.generate\(/, 'Backgrounds must use image generation, not product editing.');
assert.doesNotMatch(generationApi, /body\?\.images|images\.edit|input_fidelity/, 'OpenAI must not receive customer product pixels.');
assert.doesNotMatch(generationApi, /releaseReservation/, 'Billable generation attempts must not be refunded from quota.');
assert.doesNotMatch(preparationApi, /releaseReservation/, 'Started image-processing attempts must count toward quota.');
assert.match(variantApi, /client\.images\.edit\(/, 'Opt-in variants must use the dedicated image-edit route.');
assert.doesNotMatch(variantApi, /input_fidelity/, 'The configured gpt-image-2 route must not send unsupported input_fidelity.');
assert.doesNotMatch(variantApi, /result\?\.url|fetch\(sourceUrl/, 'GPT image edits must use the expected base64 response without an unrestricted URL fallback.');
assert.match(variantApi, /reserveVariantGeneration/, 'Variant edits require their own cost quota.');
assert.match(preparationApi, /createPreparationProof/, 'Prepared cutouts must receive a signed proof.');
assert.match(variantApi, /verifyPreparationProof/, 'Variant edits must verify the prepared-cutout proof.');
assert.match(preparationProof, /createHmac\('sha256'/, 'Preparation proofs must use HMAC-SHA-256.');
assert.match(preparationProof, /timingSafeEqual/, 'Preparation proof signatures must use timing-safe comparison.');
assert.match(variantImages, /inspectPreparedCutout/, 'Variant inputs must be decoded and inspected.');
assert.match(variantImages, /inspectProviderVariant/, 'Variant provider outputs must be decoded and inspected.');
assert.ok(
  variantApi.indexOf('verifyPreparationProof({') < variantApi.indexOf('await reserveVariantGeneration(user.uid)'),
  'Preparation proof verification must happen before variant quota reservation.'
);
assert.ok(
  variantApi.indexOf('await reserveVariantGeneration(user.uid)') < variantApi.indexOf('await inspectPreparedCutout'),
  'Variant quota must be reserved before expensive Sharp decoding once the signed proof is valid.'
);
assert.match(firebaseAdmin, /REQUIRE_GENERATION_ENTITLEMENT !== 'false'/, 'Paid entitlement must fail closed unless explicitly disabled.');
assert.match(firebaseAdmin, /requiredPositiveInteger\(configuration\.globalMaximumEnvironment/, 'Global cost caps must be required configuration.');
assert.ok(
  preparationApi.indexOf('await reserveProductPreparation(user.uid)') < preparationApi.indexOf('await inspectImage'),
  'Preparation quota must be reserved before expensive Sharp decoding.'
);

const workflow = dashboard.slice(dashboard.indexOf('async function handleGeneration'));
const variantGenerationIndex = workflow.indexOf('await requestVariantGeneration');
const variantPreparationIndex = workflow.indexOf('requestProductPreparation(', variantGenerationIndex);
const variantApprovalIndex = workflow.indexOf('await requestVariantApproval', variantPreparationIndex);
assert.ok(
  workflow.indexOf('await requestCutoutApproval') < workflow.indexOf('await requestGeneration'),
  'The customer must approve the cutout before paid background generation.'
);
assert.ok(
  workflow.indexOf('await requestCutoutApproval') < workflow.indexOf('await requestVariantGeneration'),
  'The customer must approve the original cutout before a paid variant edit.'
);
assert.ok(
  variantGenerationIndex >= 0 &&
  variantGenerationIndex < variantPreparationIndex &&
  variantPreparationIndex < variantApprovalIndex,
  'Every variant must be isolated and explicitly reviewed after the generative edit.'
);
assert.match(dashboard, /state\.variantLayers\.set\(/, 'Approved variants must use a separate derived-layer cache.');
assert.match(dashboard, /JSON\.stringify\(\{ cutout, preparationProof, variantType, instruction \}\)/, 'Variant requests must send the signed preparation proof.');
assert.match(dashboard, /state\.rawVariantEdits\.set\(/, 'Paid raw variant edits must survive downstream preparation retries.');
assert.match(dashboard, /error\.code === 'INVALID_PREPARATION_PROOF'[\s\S]*?state\.preparedProduct = null/, 'Expired preparation proofs must clear the cached original for a clean retry.');
assert.doesNotMatch(dashboard, /state\.preparedProduct\s*=\s*layer/, 'A derived variant must never replace the approved original.');
assert.doesNotMatch(dashboard, /fitText\(|payload\.benefits\.slice/, 'Approved infographic copy must not be silently truncated or omitted.');
assert.match(dashboard, /if \(isMarketplaceMain\) \{\s*context\.drawImage\([\s\S]*?return;/, 'Marketplace Main must bypass artificial shadows.');
assert.match(dashboardHtml, /id="cutout-review"/, 'The product-cutout approval UI is required.');
assert.match(dashboardHtml, /name="outputMode"[\s\S]*?value="variant"/, 'The studio must expose a separate variant mode.');
assert.match(dashboardHtml, /name="variantType"[\s\S]*?value="color"[\s\S]*?value="size"[\s\S]*?value="shape"/, 'Color, size, and shape controls are required.');
assert.match(dashboardHtml, /id="variant-review"[\s\S]*?200% REVIEW/, 'Generated variants require a dedicated high-zoom review UI.');
assert.match(dashboardHtml, /id="open-variant-preview-btn"[\s\S]*?id="open-original-preview-btn"/, 'Variant review must expose full-size variant and original previews.');
for (const template of [
  'a-plus-claim-hero',
  'comparison-chart',
  'usage-timeline',
  'problem-solution',
  'detail-callouts',
  'performance-action',
  'feature-collage'
]) {
  assert.match(dashboardHtml, new RegExp(`name="templates" value="${template}"`), `${template} must be selectable.`);
}
assert.match(dashboardHtml, /id="problem-copy"[\s\S]*?id="solution-copy"[\s\S]*?id="problem-solution-ack"/, 'Problem / Solution requires substantiated customer copy.');
assert.match(dashboard, /templates\.includes\('feature-collage'\) && benefits\.length !== 3/, 'Feature Collage must require exactly three verified benefits.');
assert.match(dashboard, /'problem-solution': 'landscape'[\s\S]*?'feature-collage': 'landscape'/, 'Wide reference-gallery layouts must stay landscape.');
assert.match(firestoreRules, /match \/generationUsage\/\{document=\*\*\}[\s\S]*?allow read, write: if false;/, 'Browser access to quota documents must remain denied.');

console.log('Architecture contract tests passed.');
