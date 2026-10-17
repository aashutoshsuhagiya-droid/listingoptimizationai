'use strict';

const assert = require('node:assert/strict');

const {
  CHROMA_KEY_COLOR,
  MAX_VARIANT_INSTRUCTION_LENGTH,
  buildVariantPrompt,
  sanitizeVariantInstruction,
  validateVariantRequest
} = require('../api/_lib/variant-prompt');

const sanitized = sanitizeVariantInstruction('  make\nthis\tdeep blue\u0000  ');
assert.equal(sanitized, 'make this deep blue');

const request = validateVariantRequest({
  variantType: ' COLOR ',
  instruction: 'Change the bottle body to Pantone 294 C blue.'
});
assert.deepEqual(request, {
  variantType: 'color',
  instruction: 'Change the bottle body to Pantone 294 C blue.'
});

const colorPrompt = buildVariantPrompt(request);
assert.match(colorPrompt, /exact existing logo, brand marks, label/i);
assert.match(colorPrompt, /change only/i);
assert.match(colorPrompt, /perfectly flat, opaque, uniformly flood-filled/i);
assert.match(colorPrompt, new RegExp(CHROMA_KEY_COLOR));
assert.match(colorPrompt, /RGB 0, 255, 0/);
assert.match(colorPrompt, /no gradient, texture, lighting variation, shadow/i);
assert.match(colorPrompt, /User-supplied change data: \{"variantType":"color"/);
assert.doesNotMatch(colorPrompt, /make\nthis/);

const sizePrompt = buildVariantPrompt({
  variantType: 'size',
  instruction: 'Create the 500 mL size with a taller body.'
});
assert.match(sizePrompt, /physical dimensions/i);
assert.match(sizePrompt, /cap, closure, label, and container/i);
assert.match(sizePrompt, /preserve.*typography.*spelling/i);

const shapePrompt = buildVariantPrompt({
  variantType: 'shape',
  instruction: 'Use a rounded-square container profile.'
});
assert.match(shapePrompt, /outer geometry/i);
assert.match(shapePrompt, /without rewriting, warping, or redesigning/i);

assert.throws(() => validateVariantRequest(null), /JSON object/);
assert.throws(
  () => validateVariantRequest({ variantType: 'material', instruction: 'Use glass.' }),
  /color, size, or shape/
);
assert.throws(
  () => validateVariantRequest({ variantType: 'color', instruction: '   ' }),
  /instruction is required/
);
assert.throws(
  () => sanitizeVariantInstruction('x'.repeat(MAX_VARIANT_INSTRUCTION_LENGTH + 1)),
  /characters or fewer/
);

console.log('Variant prompt contract tests passed.');
