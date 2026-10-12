#!/usr/bin/env node
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { images } = require('./prompts');
const { optimizeImage, inspectImage } = require('./utils/image-optimizer');
const { createPlaceholderBuffer } = require('./utils/placeholder-generator');

const projectRoot = path.resolve(__dirname, '..');
try {
  require('dotenv').config({ path: path.join(projectRoot, '.env'), quiet: true });
} catch {
  // Dry-run, validation, and fallback generation intentionally work before npm install.
}

function parseArgs(argv) {
  const options = {
    all: false,
    id: null,
    dryRun: false,
    fallback: false,
    validate: false,
    force: false,
    resume: false,
    provider: process.env.IMAGE_PROVIDER || 'auto'
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--all') options.all = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--fallback') options.fallback = true;
    else if (arg === '--validate') options.validate = true;
    else if (arg === '--force') options.force = true;
    else if (arg === '--resume') options.resume = true;
    else if (arg === '--id') options.id = argv[++i];
    else if (arg.startsWith('--id=')) options.id = arg.slice(5);
    else if (arg === '--provider') options.provider = argv[++i];
    else if (arg.startsWith('--provider=')) options.provider = arg.slice(11);
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function printHelp() {
  console.log(`
Listing Optimization AI image pipeline

Usage:
  node scripts/generate-images.js --all
  node scripts/generate-images.js --id hero/us-flag
  node scripts/generate-images.js --dry-run
  node scripts/generate-images.js --all --fallback
  node scripts/generate-images.js --validate

Options:
  --all                 Generate every configured raster asset
  --id <id>             Generate one exact ID from scripts/prompts.js
  --provider <name>     auto, openai, or replicate
  --fallback            Force deterministic offline placeholders
  --resume              Continue a partial run (existing valid files are skipped)
  --force               Regenerate and replace existing target files
  --dry-run             Print the selected jobs without writing files or calling APIs
  --validate            Validate all expected files, dimensions, format, and size
`);
}

function resolveOutputPath(image) {
  const configured = process.env.IMAGE_OUTPUT_DIR;
  if (!configured) return path.join(projectRoot, image.filename);
  const base = path.resolve(projectRoot, configured);
  const relative = image.filename.replace(/^images[\\/]/, '');
  return path.join(base, relative);
}

function closestOpenAISize(image, model) {
  const ratio = image.width / image.height;
  if (model === 'dall-e-3') {
    if (ratio > 1.2) return '1792x1024';
    if (ratio < .83) return '1024x1792';
    return '1024x1024';
  }
  if (ratio > 1.2) return '1536x1024';
  if (ratio < .83) return '1024x1536';
  return '1024x1024';
}

function withAvoidance(image) {
  return image.negative_prompt
    ? `${image.prompt}\nAvoid: ${image.negative_prompt}.`
    : image.prompt;
}

async function fetchBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Image download failed (${response.status})`);
  return Buffer.from(await response.arrayBuffer());
}

async function generateWithOpenAI(image) {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set');
  let OpenAI;
  try { OpenAI = require('openai'); } catch { throw new Error('The openai package is not installed; run npm install'); }
  const model = process.env.OPENAI_IMAGE_MODEL || 'dall-e-3';
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const quality = process.env.IMAGE_QUALITY || 'high';
  const request = {
    model,
    prompt: withAvoidance(image),
    n: 1,
    size: closestOpenAISize(image, model)
  };

  if (model === 'dall-e-3') {
    request.quality = quality === 'low' ? 'standard' : 'hd';
    request.response_format = 'b64_json';
  } else {
    request.quality = ['low', 'medium', 'high', 'auto'].includes(quality) ? quality : 'high';
    request.output_format = 'png';
    if (image.transparent && model === 'gpt-image-1.5') request.background = 'transparent';
  }

  const response = await client.images.generate(request);
  const result = response.data?.[0];
  if (result?.b64_json) return Buffer.from(result.b64_json, 'base64');
  if (result?.url) return fetchBuffer(result.url);
  throw new Error('OpenAI returned no image payload');
}

function aspectRatioName(width, height) {
  const ratio = width / height;
  if (ratio > 1.55) return '16:9';
  if (ratio > 1.2) return '3:2';
  if (ratio < .72) return '2:3';
  if (ratio < .9) return '3:4';
  return '1:1';
}

function extractReplicateUrl(output) {
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) return extractReplicateUrl(output[0]);
  if (output && typeof output === 'object') return output.url || output.href || null;
  return null;
}

async function generateWithReplicate(image) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error('REPLICATE_API_TOKEN is not set');
  const model = process.env.REPLICATE_MODEL || 'stability-ai/sdxl';
  const endpoint = `https://api.replicate.com/v1/models/${model}/predictions`;
  const headers = {
    Authorization: `Token ${token}`,
    'Content-Type': 'application/json',
    Prefer: 'wait=60'
  };
  const width = Math.min(1536, Math.max(512, Math.round(image.width / 64) * 64));
  const height = Math.min(1536, Math.max(512, Math.round(image.height / 64) * 64));
  const input = model.toLowerCase().includes('sdxl')
    ? {
        prompt: withAvoidance(image),
        negative_prompt: image.negative_prompt,
        width,
        height,
        num_outputs: 1,
        apply_watermark: false
      }
    : {
        prompt: withAvoidance(image),
        negative_prompt: image.negative_prompt,
        aspect_ratio: aspectRatioName(image.width, image.height),
        num_outputs: 1,
        output_format: 'png'
      };
  const createResponse = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ input })
  });
  if (!createResponse.ok) throw new Error(`Replicate create failed (${createResponse.status}): ${await createResponse.text()}`);
  let prediction = await createResponse.json();

  for (let poll = 0; poll < 60 && !['succeeded', 'failed', 'canceled'].includes(prediction.status); poll += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const pollResponse = await fetch(prediction.urls.get, { headers: { Authorization: `Token ${token}` } });
    if (!pollResponse.ok) throw new Error(`Replicate polling failed (${pollResponse.status})`);
    prediction = await pollResponse.json();
  }

  if (prediction.status !== 'succeeded') throw new Error(`Replicate prediction ${prediction.status || 'timed out'}: ${prediction.error || 'unknown error'}`);
  const url = extractReplicateUrl(prediction.output);
  if (!url) throw new Error('Replicate returned no image URL');
  return fetchBuffer(url);
}

async function retry(label, operation, attempts) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      console.warn(`    ${label} attempt ${attempt}/${attempts} failed: ${error.message}`);
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
  throw lastError;
}

async function generateSource(image, options, attempts) {
  if (options.fallback) return { buffer: await createPlaceholderBuffer(image), provider: 'placeholder' };

  const provider = options.provider.toLowerCase();
  const providers = provider === 'auto'
    ? [process.env.OPENAI_API_KEY && 'openai', process.env.REPLICATE_API_TOKEN && 'replicate'].filter(Boolean)
    : [provider];

  for (const candidate of providers) {
    try {
      if (candidate === 'openai') {
        return { buffer: await retry('OpenAI', () => generateWithOpenAI(image), attempts), provider: 'openai' };
      }
      if (candidate === 'replicate') {
        return { buffer: await retry('Replicate', () => generateWithReplicate(image), attempts), provider: 'replicate' };
      }
      throw new Error(`Unsupported provider: ${candidate}`);
    } catch (error) {
      console.warn(`    ${candidate} unavailable for ${image.id}: ${error.message}`);
    }
  }

  if (providers.length === 0) console.warn('    No API key found; using the offline placeholder renderer.');
  else console.warn('    API generation failed; using the offline placeholder renderer.');
  return { buffer: await createPlaceholderBuffer(image), provider: 'placeholder' };
}

async function isExistingValid(image, outputPath, maxBytes) {
  try {
    const info = await inspectImage(outputPath);
    return info.width === image.width
      && info.height === image.height
      && info.format === 'png'
      && info.bytes <= maxBytes;
  } catch {
    return false;
  }
}

async function validateAssets(selected = images) {
  const maxKB = Number(process.env.MAX_FILE_SIZE_KB || 500);
  let failures = 0;
  let totalBytes = 0;
  for (const image of selected) {
    const outputPath = resolveOutputPath(image);
    try {
      const info = await inspectImage(outputPath);
      totalBytes += info.bytes;
      const issues = [];
      if (info.width !== image.width || info.height !== image.height) issues.push(`${info.width}x${info.height}, expected ${image.width}x${image.height}`);
      if (info.format !== 'png') issues.push(`format ${info.format}, expected png`);
      if (info.bytes > maxKB * 1024) issues.push(`${Math.round(info.bytes / 1024)}KB, limit ${maxKB}KB`);
      if (image.transparent && !info.hasAlpha) issues.push('missing alpha channel');
      if (issues.length) {
        failures += 1;
        console.error(`FAIL ${image.id}: ${issues.join('; ')}`);
      } else {
        console.log(`OK   ${image.id} (${Math.round(info.bytes / 1024)}KB)`);
      }
    } catch (error) {
      failures += 1;
      console.error(`MISS ${image.id}: ${error.code === 'ENOENT' ? 'file not found' : error.message}`);
    }
  }
  console.log(`\nValidated ${selected.length} assets: ${selected.length - failures} passed, ${failures} failed, ${Math.round(totalBytes / 1024)}KB total.`);
  if (failures) process.exitCode = 1;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return printHelp();
  if (!['auto', 'openai', 'replicate'].includes(options.provider)) throw new Error('Provider must be auto, openai, or replicate');

  let selected;
  if (options.id) {
    const match = images.find((image) => image.id === options.id);
    if (!match) throw new Error(`Unknown image id: ${options.id}`);
    selected = [match];
  } else {
    selected = images;
  }

  if (options.validate) return validateAssets(selected);
  if (!options.all && !options.id && !options.dryRun) {
    printHelp();
    throw new Error('Choose --all, --id, --dry-run, or --validate');
  }

  if (options.dryRun) {
    console.log(`Dry run: ${selected.length} image job${selected.length === 1 ? '' : 's'} selected. No files will be written.`);
    selected.forEach((image, index) => console.log(`[${index + 1}/${selected.length}] ${image.id} -> ${image.filename} (${image.width}x${image.height})`));
    return;
  }

  const maxKB = Number(process.env.MAX_FILE_SIZE_KB || 500);
  const attempts = Math.max(1, Number(process.env.IMAGE_RETRY_ATTEMPTS || 3));
  const maxBytes = maxKB * 1024;
  let generated = 0;
  let skipped = 0;
  const providersUsed = new Set();

  for (let index = 0; index < selected.length; index += 1) {
    const image = selected[index];
    const percent = String(Math.round(((index + 1) / selected.length) * 100)).padStart(3, ' ');
    const outputPath = resolveOutputPath(image);
    const relativePath = path.relative(projectRoot, outputPath);
    const validExisting = await isExistingValid(image, outputPath, maxBytes);
    if (validExisting && !options.force) {
      skipped += 1;
      console.log(`[${index + 1}/${selected.length}] ${percent}% Skipping ${image.id} (exists)`);
      continue;
    }

    console.log(`[${index + 1}/${selected.length}] ${percent}% Generating ${image.id}...`);
    const source = await generateSource(image, options, attempts);
    const result = await optimizeImage(source.buffer, outputPath, {
      width: image.width,
      height: image.height,
      maxFileSizeKB: maxKB,
      fit: image.placeholder?.kind === 'wordmark' ? 'contain' : 'cover'
    });
    if (!result.withinLimit) throw new Error(`${relativePath} is ${Math.round(result.bytes / 1024)}KB after optimization; limit is ${maxKB}KB`);
    providersUsed.add(source.provider);
    generated += 1;
    console.log(`    Saved ${relativePath} (${Math.round(result.bytes / 1024)}KB, ${source.provider})`);
  }

  console.log(`\nComplete: ${generated} generated, ${skipped} skipped, ${selected.length} total.`);
  if (providersUsed.size) console.log(`Providers used: ${[...providersUsed].join(', ')}.`);
}

main().catch((error) => {
  console.error(`\nImage pipeline failed: ${error.message}`);
  process.exitCode = 1;
});
