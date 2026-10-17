'use strict';

const assert = require('node:assert/strict');

const {
  backgroundSizeFor,
  buildBackgroundPrompt,
  validateCreativeBrief
} = require('../api/_lib/prompt');

const briefInput = {
  template: 'feature-spotlight',
  visualStyle: 'premium',
  canvasFormat: 'landscape',
  productName: 'Example Product',
  category: 'Skin care',
  audience: 'Busy adults',
  marketplace: 'Amazon',
  benefits: ['Lightweight daily hydration', 'Non-greasy finish'],
  brandColor: '#123456'
};
const brief = validateCreativeBrief(briefInput);

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

const aPlusPrompt = buildBackgroundPrompt(validateCreativeBrief({
  ...briefInput,
  template: 'a-plus-claim-hero'
}));
assert.match(aPlusPrompt, /empty, clean product placement zone/i);
assert.match(aPlusPrompt, /visually quiet and low-detail/i);
assert.match(aPlusPrompt, /deterministic headline and verified-claim overlays/i);

const comparisonPrompt = buildBackgroundPrompt(validateCreativeBrief({
  ...briefInput,
  template: 'comparison-chart'
}));
assert.match(comparisonPrompt, /upper-right.*product placement zone/i);
assert.match(comparisonPrompt, /visually quiet, uniform, and low-detail/i);
assert.match(comparisonPrompt, /Do not generate any text.*icons.*tables.*competitor products/i);
assert.match(comparisonPrompt, /environment only/i);

const timelinePrompt = buildBackgroundPrompt(validateCreativeBrief({
  ...briefInput,
  template: 'usage-timeline'
}));
assert.match(timelinePrompt, /empty product placement zone/i);
assert.match(timelinePrompt, /visually quiet, uniform, and low-detail/i);
assert.match(timelinePrompt, /Do not generate any text.*icons.*tables.*competitor products.*timeline graphics.*additional products/i);

const problemSolutionBrief = validateCreativeBrief({
  ...briefInput,
  template: 'problem-solution',
  canvasFormat: 'portrait'
});
const problemSolutionPrompt = buildBackgroundPrompt(problemSolutionBrief);
assert.equal(problemSolutionBrief.canvasFormat, 'landscape');
assert.match(problemSolutionPrompt, /split-mood.*left-to-right problem-to-solution/i);
assert.match(problemSolutionPrompt, /top-left and top-right.*deterministic labels/i);
assert.match(problemSolutionPrompt, /central-lower 48 percent.*empty product placement zone/i);
assert.match(problemSolutionPrompt, /without a hard divider, border, words, symbols, or generated labels/i);

const detailCalloutsPrompt = buildBackgroundPrompt(validateCreativeBrief({
  ...briefInput,
  template: 'detail-callouts'
}));
assert.match(detailCalloutsPrompt, /central 46 percent.*empty.*product placement zone/i);
assert.match(detailCalloutsPrompt, /leftmost and rightmost 22 percent.*callout lanes/i);
assert.match(detailCalloutsPrompt, /Do not render markers.*leader lines.*icons.*product fragments.*magnified details/i);

const performanceActionPrompt = buildBackgroundPrompt(validateCreativeBrief({
  ...briefInput,
  template: 'performance-action'
}));
assert.match(performanceActionPrompt, /dynamic.*action or lifestyle environment.*upper-right and middle-right/i);
assert.match(performanceActionPrompt, /Do not render any category product.*category-related prop/i);
assert.match(performanceActionPrompt, /category products and category-related props are forbidden everywhere/i);
assert.doesNotMatch(performanceActionPrompt, /environmental props are allowed/i);
assert.match(performanceActionPrompt, /left-lower 44 percent.*empty product placement zone/i);
assert.match(performanceActionPrompt, /upper-left visually quiet.*deterministic copy/i);
assert.match(performanceActionPrompt, /lower-right 42 percent quiet.*verified-benefit cards/i);

const featureCollageBrief = validateCreativeBrief({
  ...briefInput,
  template: 'feature-collage',
  canvasFormat: 'square',
  benefits: [...briefInput.benefits, 'Verified third benefit']
});
const featureCollagePrompt = buildBackgroundPrompt(featureCollageBrief);
assert.equal(featureCollageBrief.canvasFormat, 'landscape');
assert.match(featureCollagePrompt, /cohesive three-panel-style.*one unified scene/i);
assert.match(featureCollagePrompt, /large leftmost 52 percent.*empty.*product placement zone/i);
assert.match(featureCollagePrompt, /right side as three distinct quiet, low-detail feature panels/i);
assert.match(featureCollagePrompt, /Do not render panel borders.*text.*icons.*products/i);
assert.match(featureCollagePrompt, /three right-side feature panels object-free/i);

for (const templatePrompt of [
  problemSolutionPrompt,
  detailCalloutsPrompt,
  performanceActionPrompt,
  featureCollagePrompt
]) {
  assert.match(templatePrompt, /environment only/i);
  assert.match(templatePrompt, /Do not render.*customer product/i);
  assert.match(templatePrompt, /Render no words, letters, numbers, logos, icons/i);
}

for (const [template, templatePrompt] of [
  ['a-plus-claim-hero', aPlusPrompt],
  ['comparison-chart', comparisonPrompt],
  ['usage-timeline', timelinePrompt]
]) {
  assert.equal(backgroundSizeFor('landscape', template), '2048x1360');
  assert.match(templatePrompt, /environment only/i);
  assert.match(templatePrompt, /Do not render.*customer product/i);
}
assert.equal(backgroundSizeFor('square', 'a-plus-claim-hero'), '2048x1360');
assert.equal(backgroundSizeFor('portrait', 'comparison-chart'), '2048x1360');
assert.equal(backgroundSizeFor('square', 'problem-solution'), '2048x1360');
assert.equal(backgroundSizeFor('portrait', 'problem-solution'), '2048x1360');
assert.equal(backgroundSizeFor('square', 'feature-collage'), '2048x1360');
assert.equal(backgroundSizeFor('portrait', 'feature-collage'), '2048x1360');

assert.throws(() => validateCreativeBrief(null), /JSON object/);
assert.throws(
  () => validateCreativeBrief({ ...brief, template: 'unsupported' }),
  /Unsupported creative template/
);
assert.throws(
  () => validateCreativeBrief({ ...briefInput, template: 'feature-collage' }),
  /exactly three verified benefits/
);

console.log('Prompt contract tests passed.');
