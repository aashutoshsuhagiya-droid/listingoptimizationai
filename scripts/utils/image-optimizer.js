'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
let sharp;
try { sharp = require('sharp'); } catch { sharp = null; }

function readPngMetadata(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(signature) || buffer.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error('Sharp is not installed and the input is not a readable PNG');
  }
  const colorType = buffer[25];
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    format: 'png',
    hasAlpha: colorType === 4 || colorType === 6
  };
}

async function optimizeImage(input, outputPath, options) {
  const {
    width,
    height,
    maxFileSizeKB = 500,
    fit = 'cover',
    position = 'centre'
  } = options;

  const maxBytes = maxFileSizeKB * 1024;
  if (!sharp) {
    const buffer = Buffer.isBuffer(input) ? input : await fs.readFile(input);
    const metadata = readPngMetadata(buffer);
    if (metadata.width !== width || metadata.height !== height) {
      throw new Error(`Sharp is required to resize ${metadata.width}x${metadata.height} input to ${width}x${height}`);
    }
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    const tempPath = `${outputPath}.tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(tempPath, buffer);
    await fs.rm(outputPath, { force: true });
    await fs.rename(tempPath, outputPath);
    return { path: outputPath, bytes: buffer.length, width, height, withinLimit: buffer.length <= maxBytes };
  }

  const pipeline = sharp(input, { failOn: 'none', limitInputPixels: false })
    .rotate()
    .resize(width, height, {
      fit,
      position,
      withoutEnlargement: false,
      background: { r: 255, g: 255, b: 255, alpha: 0 }
    });

  let selected;
  const palettes = [256, 192, 128, 96, 64, 48, 32, 24, 16];
  for (const colours of palettes) {
    const candidate = await pipeline.clone().png({
      compressionLevel: 9,
      palette: true,
      colours,
      quality: Math.max(45, Math.round(100 - (256 - colours) * .16)),
      effort: 10,
      dither: colours >= 64 ? 1 : .6
    }).toBuffer();
    selected = candidate;
    if (candidate.length <= maxBytes) break;
  }

  if (!selected) throw new Error(`Unable to optimize ${outputPath}`);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const tempPath = `${outputPath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tempPath, selected);
  await fs.rm(outputPath, { force: true });
  await fs.rename(tempPath, outputPath);

  return {
    path: outputPath,
    bytes: selected.length,
    width,
    height,
    withinLimit: selected.length <= maxBytes
  };
}

async function inspectImage(filePath) {
  const stats = await fs.stat(filePath);
  const metadata = sharp ? await sharp(filePath).metadata() : readPngMetadata(await fs.readFile(filePath));
  return {
    filePath,
    bytes: stats.size,
    width: metadata.width,
    height: metadata.height,
    format: metadata.format,
    hasAlpha: Boolean(metadata.hasAlpha)
  };
}

module.exports = { optimizeImage, inspectImage };
