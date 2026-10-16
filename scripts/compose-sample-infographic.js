'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function generateSample() {
  const prodPath = 'C:/Users/aashu/.gemini/antigravity-ide/brain/045c05b2-8e02-4656-bc73-553afbbd9381/sample_product_serum_1792170153447.jpg';
  const { data, info } = await sharp(prodPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const brightness = (r + g + b) / 3;
      const maxDiff = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));

      const distFromCenter = Math.abs(x - width / 2);
      if (distFromCenter > 200 && brightness > 215 && maxDiff < 18) {
        data[idx + 3] = 0;
      } else if (brightness > 240 && maxDiff < 10) {
        data[idx + 3] = 0;
      } else if (brightness > 225 && maxDiff < 12) {
        data[idx + 3] = Math.max(0, Math.min(255, Math.round((240 - brightness) / 15 * 255)));
      }
    }
  }

  // Trim transparent edges so the boundary matches the actual bottle geometry
  const trimmedProd = await sharp(data, { raw: { width, height, channels } })
    .trim()
    .resize({ height: 820, fit: 'inside' })
    .png()
    .toBuffer();

  const prodMeta = await sharp(trimmedProd).metadata();

  const bgPath = 'C:/Users/aashu/.gemini/antigravity-ide/brain/045c05b2-8e02-4656-bc73-553afbbd9381/sample_studio_bg_1792170203298.jpg';
  const widthCanvas = 2000;
  const heightCanvas = 2000;

  const resizedBg = await sharp(bgPath).resize(widthCanvas, heightCanvas, { fit: 'cover' }).toBuffer();

  // The top oval surface of the pedestal is centered at x: 1530, top line around y: 1090.
  // The bottom of the trimmed bottle should sit at y: 1105.
  const prodLeft = Math.round(1530 - prodMeta.width / 2);
  const prodTop = Math.round(1105 - prodMeta.height);

  // Soft natural contact shadow on the top of the stone pedestal
  const shadowSvg = `
    <svg width="${prodMeta.width + 120}" height="80" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="10" />
        </filter>
      </defs>
      <ellipse cx="${(prodMeta.width + 120) / 2}" cy="35" rx="${prodMeta.width * 0.42}" ry="14" fill="rgba(20, 18, 15, 0.75)" filter="url(#blur)" />
      <ellipse cx="${(prodMeta.width + 120) / 2}" cy="33" rx="${prodMeta.width * 0.28}" ry="8" fill="rgba(8, 6, 5, 0.9)" filter="url(#blur)" />
    </svg>
  `;
  const shadowBuf = Buffer.from(shadowSvg);

  const overlaySvg = `
    <svg width="${widthCanvas}" height="${heightCanvas}" viewBox="0 0 ${widthCanvas} ${heightCanvas}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="leftScrim" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#070815" stop-opacity="0.96"/>
          <stop offset="42%" stop-color="#070815" stop-opacity="0.88"/>
          <stop offset="64%" stop-color="#070815" stop-opacity="0.45"/>
          <stop offset="82%" stop-color="#070815" stop-opacity="0.0"/>
        </linearGradient>
        <filter id="cardShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000000" flood-opacity="0.35"/>
        </filter>
      </defs>

      <rect x="0" y="0" width="${widthCanvas * 0.72}" height="${heightCanvas}" fill="url(#leftScrim)" />

      <!-- Tag / Badge -->
      <g transform="translate(140, 220)">
        <rect width="260" height="52" rx="26" fill="#1464FF" />
        <text x="130" y="33" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, sans-serif" font-size="18" font-weight="800" fill="#ffffff" letter-spacing="2.5">FEATURE SPOTLIGHT</text>
      </g>

      <!-- Category overline -->
      <text x="140" y="340" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, sans-serif" font-size="22" font-weight="700" fill="#93A2FF" letter-spacing="3">SKINCARE ESSENTIALS</text>

      <!-- Main Headline (Wrapped 2 lines) -->
      <text x="140" y="450" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, sans-serif" font-size="80" font-weight="900" fill="#ffffff" letter-spacing="-1.5">
        TRIPLE-ACTION GLOW
      </text>
      <text x="140" y="545" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, sans-serif" font-size="80" font-weight="900" fill="#ffffff" letter-spacing="-1.5">
        &amp; DEEP HYDRATION
      </text>

      <!-- Subheadline -->
      <text x="140" y="640" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, sans-serif" font-size="27" font-weight="400" fill="rgba(255, 255, 255, 0.82)" letter-spacing="0.2">
        Formulated with 20% Pure L-Ascorbic Acid &amp; Micro Hyaluronic Acid.
      </text>
      <text x="140" y="685" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, sans-serif" font-size="27" font-weight="400" fill="rgba(255, 255, 255, 0.82)" letter-spacing="0.2">
        Clinically proven visible radiance and skin barrier restoration in 14 days.
      </text>

      <!-- Benefit Callout Cards / Pills -->
      <g transform="translate(140, 1160)" filter="url(#cardShadow)">
        <rect width="740" height="94" rx="47" fill="rgba(255, 255, 255, 0.12)" stroke="rgba(255, 255, 255, 0.28)" stroke-width="2" />
        <circle cx="52" cy="47" r="24" fill="#22C55E" />
        <text x="52" y="56" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif" font-size="24" font-weight="900" fill="#ffffff">✓</text>
        <text x="100" y="56" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, sans-serif" font-size="28" font-weight="700" fill="#ffffff">Clinically Proven 48-Hour Moisture Lock</text>
      </g>

      <g transform="translate(140, 1295)" filter="url(#cardShadow)">
        <rect width="740" height="94" rx="47" fill="rgba(255, 255, 255, 0.12)" stroke="rgba(255, 255, 255, 0.28)" stroke-width="2" />
        <circle cx="52" cy="47" r="24" fill="#22C55E" />
        <text x="52" y="56" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif" font-size="24" font-weight="900" fill="#ffffff">✓</text>
        <text x="100" y="56" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, sans-serif" font-size="28" font-weight="700" fill="#ffffff">Ultra-Lightweight &amp; Zero Greasy Residue</text>
      </g>

      <g transform="translate(140, 1430)" filter="url(#cardShadow)">
        <rect width="740" height="94" rx="47" fill="rgba(255, 255, 255, 0.12)" stroke="rgba(255, 255, 255, 0.28)" stroke-width="2" />
        <circle cx="52" cy="47" r="24" fill="#22C55E" />
        <text x="52" y="56" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif" font-size="24" font-weight="900" fill="#ffffff">✓</text>
        <text x="100" y="56" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, sans-serif" font-size="28" font-weight="700" fill="#ffffff">Dermatologist Tested · 100% Fragrance Free</text>
      </g>

      <!-- Bottom Trust Line -->
      <g transform="translate(140, 1660)">
        <text x="0" y="40" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, sans-serif" font-size="22" font-weight="700" fill="#8E92AB" letter-spacing="1.5">AMAZON TOP RATED · PREMIUM CRUELTY-FREE FORMULA</text>
      </g>
    </svg>
  `;

  const finalJpg = await sharp(resizedBg)
    .composite([
      { input: shadowBuf, left: prodLeft - 60, top: 1090 },
      { input: trimmedProd, left: prodLeft, top: prodTop },
      { input: Buffer.from(overlaySvg), left: 0, top: 0 }
    ])
    .jpeg({ quality: 96, mozjpeg: true })
    .toBuffer();

  const out1 = path.join(__dirname, '..', 'generated-product-infographic.jpg');
  const out2 = 'C:/Users/aashu/.gemini/antigravity-ide/brain/045c05b2-8e02-4656-bc73-553afbbd9381/generated-product-infographic.jpg';
  fs.writeFileSync(out1, finalJpg);
  fs.writeFileSync(out2, finalJpg);
  console.log('Sample infographic generated with perfect grounding!');
}

generateSample().catch(console.error);
