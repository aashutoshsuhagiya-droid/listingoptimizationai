'use strict';

const assert = require('node:assert/strict');

const {
  backgroundSizeFor,
  buildBackgroundPrompt,
  validateCreativeBrief
} = require('../api/_lib/prompt');

const brief = validateCreativeBrief({
  template: 'feature-spotlight',
  visualStyle: 'premium',
  canvasFormat: 'landscape',
  productName: 'Example Product',
  category: 'Skin care',
  audience: 'Busy adults',
  marketplace: 'Amazon',
  benefits: ['Lightweight daily hydration', 'Non-greasy finish'],
  brandColor: '#123456'
});

assert.equal(backgroundSizeFor('square', 'feature-spotlight'), '2048x2048');
assert.equal(backgroundSizeFor('landscape', 'feature-spotlight'), '2048x1360');
assert.equal(backgroundSizeFor('portrait', 'feature-spotlight'), '1360x2048');
assert.equal(backgroundSizeFor('landscape', 'marketplace-main'), '2048x2048');

const prompt = buildBackgroundPrompt(brief);
assert.match(prompt, /environment only/i);
assert.match(prompt, /empty product placement zone/i);
assert.match(prompt, /Do not render.*customer product/i);
assert.match(prompt, /render no words/i);
assert.doesNotMatch(prompt, /image edit from the supplied/i);

assert.throws(() => validateCreativeBrief(null), /JSON object/);
assert.throws(
  () => validateCreativeBrief({ ...brief, template: 'unsupported' }),
  /Unsupported creative template/
);

console.log('Prompt contract tests passed.');
