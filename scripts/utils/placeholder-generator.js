'use strict';

const zlib = require('node:zlib');
let sharp;
try { sharp = require('sharp'); } catch { sharp = null; }

const escapeXml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

function baseSvg(width, height, body, background = '#f5f4f0') {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${background}"/>
          <stop offset="1" stop-color="#ffffff" stop-opacity=".72"/>
        </linearGradient>
        <linearGradient id="glass" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#d9d9d9"/>
          <stop offset=".5" stop-color="#ffffff"/>
          <stop offset="1" stop-color="#bfc0c5"/>
        </linearGradient>
        <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="${Math.max(6, Math.round(height * .025))}" stdDeviation="${Math.max(7, Math.round(width * .018))}" flood-color="#12132f" flood-opacity=".22"/>
        </filter>
      </defs>
      ${body}
    </svg>`;
}

function flagSvg(image) {
  const { width: w, height: h } = image;
  const stripe = h / 13;
  let stripes = `<rect width="${w}" height="${h}" fill="#fff"/>`;
  for (let i = 0; i < 13; i += 2) stripes += `<rect y="${i * stripe}" width="${w}" height="${stripe + 1}" fill="#b22234"/>`;
  const cantonW = w * .4;
  const cantonH = stripe * 7;
  let stars = '';
  for (let row = 0; row < 9; row++) {
    const count = row % 2 === 0 ? 6 : 5;
    const offset = row % 2 === 0 ? .085 : .17;
    for (let col = 0; col < count; col++) {
      const cx = cantonW * (offset + col * .165);
      const cy = cantonH * (.1 + row * .1);
      stars += `<circle cx="${cx}" cy="${cy}" r="${Math.max(3, w * .0036)}" fill="#c8b100"/>`;
    }
  }
  return baseSvg(w, h, `
    <g filter="url(#shadow)"><rect x="${w * .025}" y="${h * .04}" width="${w * .95}" height="${h * .92}" rx="${w * .025}" fill="#fff"/></g>
    <g transform="translate(${w * .025} ${h * .04}) scale(.95 .92)" clip-path="inset(0 round ${w * .025}px)">${stripes}<rect width="${cantonW}" height="${cantonH}" fill="#3c3b6e"/>${stars}</g>
    <rect x="0" y="0" width="${w}" height="${h}" fill="none" stroke="#171838" stroke-opacity=".12" stroke-width="${Math.max(2, w * .003)}"/>
  `, '#171838');
}

function wordmarkSvg(image) {
  const { width: w, height: h, placeholder } = image;
  const label = escapeXml(placeholder.label);
  const size = Math.min(h * .36, (w * .78) / Math.max(2.5, label.length * .52));
  const serif = ['Dove', 'Huggies'].includes(placeholder.label);
  return baseSvg(w, h, `
    <rect width="${w}" height="${h}" fill="none"/>
    <text x="${w / 2}" y="${h / 2 + size * .34}" text-anchor="middle" font-family="${serif ? 'Georgia, serif' : 'Arial, Helvetica, sans-serif'}" font-size="${size}" font-weight="${serif ? 600 : 800}" font-style="${serif ? 'italic' : 'normal'}" letter-spacing="${serif ? 0 : -size * .025}" fill="${placeholder.accent}">${label}</text>
  `, 'none');
}

function uiSvg(image) {
  const { width: w, height: h, placeholder } = image;
  const pad = w * .06;
  const chromeH = h * .085;
  const contentX = pad + w * .14;
  const contentW = w - contentX - pad;
  let content = '';
  if (placeholder.step === 'step1') {
    content = `
      <rect x="${contentX + contentW * .08}" y="${h * .31}" width="${contentW * .84}" height="${h * .12}" rx="14" fill="#fff" opacity=".96"/>
      <rect x="${contentX + contentW * .12}" y="${h * .35}" width="${contentW * .52}" height="${h * .025}" rx="8" fill="#c8cad5"/>
      <rect x="${contentX + contentW * .68}" y="${h * .333}" width="${contentW * .19}" height="${h * .074}" rx="10" fill="#b22234"/>
      <circle cx="${contentX + contentW * .17}" cy="${h * .55}" r="${h * .035}" fill="#4da476"/><rect x="${contentX + contentW * .23}" y="${h * .525}" width="${contentW * .38}" height="${h * .018}" rx="6" fill="#555873"/><rect x="${contentX + contentW * .23}" y="${h * .565}" width="${contentW * .25}" height="${h * .013}" rx="6" fill="#777a91"/>`;
  } else if (placeholder.step === 'step2') {
    content = `
      <circle cx="${contentX + contentW * .22}" cy="${h * .43}" r="${h * .115}" fill="none" stroke="#36385d" stroke-width="24"/><path d="M ${contentX + contentW * .22} ${h * .315} A ${h * .115} ${h * .115} 0 1 1 ${contentX + contentW * .12} ${h * .49}" fill="none" stroke="#b22234" stroke-width="24" stroke-linecap="round"/>
      ${[0, 1, 2, 3].map((i) => `<rect x="${contentX + contentW * .46}" y="${h * (.28 + i * .105)}" width="${contentW * (.4 - i * .045)}" height="${h * .025}" rx="8" fill="${i === 1 ? '#c8b100' : '#6b6e89'}"/><rect x="${contentX + contentW * .46}" y="${h * (.32 + i * .105)}" width="${contentW * .24}" height="${h * .012}" rx="5" fill="#444766"/>`).join('')}`;
  } else if (placeholder.step === 'step3') {
    content = [0, 1, 2].map((i) => {
      const x = contentX + contentW * (.08 + i * .3);
      const colors = ['#e08b50', '#5e91b3', '#638a6f'];
      return `<rect x="${x}" y="${h * .25}" width="${contentW * .23}" height="${h * .42}" rx="16" fill="${colors[i]}"/><ellipse cx="${x + contentW * .115}" cy="${h * .595}" rx="${contentW * .075}" ry="${h * .018}" fill="#11132c" opacity=".18"/><rect x="${x + contentW * .08}" y="${h * .35}" width="${contentW * .07}" height="${h * .19}" rx="10" fill="url(#glass)" filter="url(#shadow)"/>`;
    }).join('');
  } else {
    content = `
      <circle cx="${contentX + contentW * .5}" cy="${h * .38}" r="${h * .105}" fill="#2f9363"/><path d="M ${contentX + contentW * .45} ${h * .38} l ${contentW * .04} ${h * .04} l ${contentW * .08} -${h * .085}" fill="none" stroke="#fff" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="${contentX + contentW * .24}" y="${h * .58}" width="${contentW * .52}" height="${h * .075}" rx="14" fill="#b22234"/><rect x="${contentX + contentW * .33}" y="${h * .685}" width="${contentW * .34}" height="${h * .018}" rx="7" fill="#646781"/>`;
  }
  return baseSvg(w, h, `
    <rect width="${w}" height="${h}" fill="#11122d"/>
    <rect x="${pad}" y="${h * .055}" width="${w - pad * 2}" height="${h * .86}" rx="20" fill="#f4f4f7" filter="url(#shadow)"/>
    <rect x="${pad}" y="${h * .055}" width="${w - pad * 2}" height="${chromeH}" rx="20" fill="#fff"/>
    <circle cx="${pad + 28}" cy="${h * .055 + chromeH / 2}" r="7" fill="#e36a61"/><circle cx="${pad + 52}" cy="${h * .055 + chromeH / 2}" r="7" fill="#e8b84a"/><circle cx="${pad + 76}" cy="${h * .055 + chromeH / 2}" r="7" fill="#56af6c"/>
    <rect x="${pad}" y="${h * .055 + chromeH}" width="${w * .14}" height="${h * .775}" fill="#20213f"/><rect x="${pad + w * .025}" y="${h * .2}" width="${w * .09}" height="${h * .045}" rx="8" fill="#b22234"/>
    <rect x="${contentX}" y="${h * .18}" width="${contentW}" height="${h * .63}" rx="16" fill="#e9e9ef"/>${content}
  `, '#171838');
}

function productShape(w, h, color, index = 0) {
  const cx = w * .67;
  const bottom = h * .84;
  const shadow = `<ellipse cx="${cx}" cy="${bottom + h * .025}" rx="${w * .13}" ry="${h * .028}" fill="#171838" opacity=".16"/>`;
  if (index % 4 === 1) return `${shadow}<rect x="${cx - w * .105}" y="${h * .36}" width="${w * .21}" height="${h * .42}" rx="${w * .04}" fill="${color}" filter="url(#shadow)"/><rect x="${cx - w * .08}" y="${h * .47}" width="${w * .16}" height="${h * .14}" rx="8" fill="#fff" opacity=".83"/>`;
  if (index % 4 === 2) return `${shadow}<path d="M ${cx - w * .13} ${h * .29} H ${cx + w * .13} L ${cx + w * .15} ${h * .79} H ${cx - w * .15} Z" fill="${color}" filter="url(#shadow)"/><rect x="${cx - w * .095}" y="${h * .46}" width="${w * .19}" height="${h * .12}" rx="8" fill="#fff" opacity=".85"/>`;
  if (index % 4 === 3) return `${shadow}<rect x="${cx - w * .14}" y="${h * .53}" width="${w * .28}" height="${h * .23}" rx="${w * .065}" fill="${color}" filter="url(#shadow)"/><rect x="${cx - w * .145}" y="${h * .49}" width="${w * .29}" height="${h * .07}" rx="${w * .025}" fill="#f0f0f2"/>`;
  return `${shadow}<rect x="${cx - w * .09}" y="${h * .32}" width="${w * .18}" height="${h * .46}" rx="${w * .055}" fill="${color}" filter="url(#shadow)"/><rect x="${cx - w * .045}" y="${h * .24}" width="${w * .09}" height="${h * .11}" rx="8" fill="#282a37"/><rect x="${cx - w * .065}" y="${h * .47}" width="${w * .13}" height="${h * .13}" rx="8" fill="#fff" opacity=".88"/>`;
}

function productSvg(image) {
  const { width: w, height: h, placeholder } = image;
  const colors = placeholder.colors || ['#d9b5a4', '#9b4f40'];
  return baseSvg(w, h, `
    <linearGradient id="productBg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${colors[0]}"/><stop offset="1" stop-color="${colors[1]}"/></linearGradient>
    <rect width="${w}" height="${h}" fill="url(#productBg)"/>
    <circle cx="${w * .18}" cy="${h * .2}" r="${w * .16}" fill="#fff" opacity=".13"/><circle cx="${w * .31}" cy="${h * .82}" r="${w * .22}" fill="#fff" opacity=".09"/>
    ${productShape(w, h, '#f4f0eb', placeholder.index || 0)}
  `, colors[0]);
}

function variantSvg(image) {
  const { width: w, height: h, placeholder } = image;
  const cx = w / 2;
  return baseSvg(w, h, `
    <rect width="${w}" height="${h}" fill="#f6f4ef"/>
    <ellipse cx="${cx}" cy="${h * .82}" rx="${w * .18}" ry="${h * .032}" fill="#171838" opacity=".14"/>
    <rect x="${cx - w * .13}" y="${h * .265}" width="${w * .26}" height="${h * .52}" rx="${w * .065}" fill="${placeholder.color}" filter="url(#shadow)"/>
    <rect x="${cx - w * .075}" y="${h * .17}" width="${w * .15}" height="${h * .12}" rx="${w * .025}" fill="#262733"/>
    <rect x="${cx - w * .09}" y="${h * .46}" width="${w * .18}" height="${h * .15}" rx="12" fill="#f7f1e7" opacity=".94"/>
    <circle cx="${cx}" cy="${h * .535}" r="${w * .018}" fill="#c8b100"/>
  `, '#f6f4ef');
}

function aplusSvg(image) {
  const { width: w, height: h, placeholder } = image;
  const bodies = placeholder.colors.map((color, index) => {
    const x = w * (.54 + index * .145);
    const y = h * (.27 + Math.abs(index - 1) * .05);
    return `<path d="M ${x} ${y} h ${w * .13} l ${w * .018} ${h * .48} h -${w * .166} z" fill="${color}" filter="url(#shadow)"/><rect x="${x + w * .02}" y="${y + h * .17}" width="${w * .09}" height="${h * .12}" rx="10" fill="#f7f3e9" opacity=".9"/>`;
  }).join('');
  return baseSvg(w, h, `
    <rect width="${w}" height="${h}" fill="#eee8de"/>
    <circle cx="${w * .18}" cy="${h * .22}" r="${w * .13}" fill="#d7b19b" opacity=".34"/><path d="M0 ${h * .75} Q ${w * .3} ${h * .62} ${w * .56} ${h * .77} T ${w} ${h * .7} V ${h} H0Z" fill="#d9d1c2"/>
    <rect x="${w * .08}" y="${h * .22}" width="${w * .3}" height="${h * .035}" rx="10" fill="#514a42" opacity=".82"/><rect x="${w * .08}" y="${h * .29}" width="${w * .23}" height="${h * .018}" rx="8" fill="#8e857b"/><rect x="${w * .08}" y="${h * .34}" width="${w * .27}" height="${h * .018}" rx="8" fill="#8e857b"/>
    ${bodies}
  `, '#eee8de');
}

function testimonialSvg(image) {
  const { width: w, height: h, placeholder } = image;
  const [a, b] = placeholder.colors;
  return baseSvg(w, h, `
    <linearGradient id="testimonialBg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
    <rect width="${w}" height="${h}" fill="url(#testimonialBg)"/>
    <rect x="${w * .08}" y="${h * .1}" width="${w * .84}" height="${h * .78}" rx="${w * .035}" fill="#fff" opacity=".12"/>
    <circle cx="${w * .5}" cy="${h * .39}" r="${h * .16}" fill="#f2e8dd" opacity=".9"/><path d="M ${w * .29} ${h * .91} Q ${w * .32} ${h * .58} ${w * .5} ${h * .58} T ${w * .71} ${h * .91} Z" fill="#22243d" opacity=".9"/>
    <circle cx="${w * .5}" cy="${h * .5}" r="${h * .065}" fill="#b22234"/><path d="M ${w * .485} ${h * .465} L ${w * .485} ${h * .535} L ${w * .535} ${h * .5} Z" fill="#fff"/>
  `, a);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function encodePng(width, height, pixels) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (stride + 1);
    raw[row] = 0;
    Buffer.from(pixels.buffer, pixels.byteOffset + y * stride, stride).copy(raw, row + 1);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

const HEX = /^#?([0-9a-f]{6})$/i;
function rgba(value, alpha = 255) {
  const match = HEX.exec(value || '#000000');
  if (!match) return [0, 0, 0, alpha];
  const number = Number.parseInt(match[1], 16);
  return [(number >> 16) & 255, (number >> 8) & 255, number & 255, alpha];
}

function createCanvas(width, height, transparent = false) {
  const pixels = new Uint8Array(width * height * 4);
  if (!transparent) {
    for (let index = 0; index < pixels.length; index += 4) {
      pixels[index] = 245; pixels[index + 1] = 244; pixels[index + 2] = 240; pixels[index + 3] = 255;
    }
  }
  return { width, height, pixels };
}

function setPixel(canvas, x, y, color) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
  const offset = (y * canvas.width + x) * 4;
  const alpha = color[3] / 255;
  const inverse = 1 - alpha;
  canvas.pixels[offset] = Math.round(color[0] * alpha + canvas.pixels[offset] * inverse);
  canvas.pixels[offset + 1] = Math.round(color[1] * alpha + canvas.pixels[offset + 1] * inverse);
  canvas.pixels[offset + 2] = Math.round(color[2] * alpha + canvas.pixels[offset + 2] * inverse);
  canvas.pixels[offset + 3] = Math.round((alpha + (canvas.pixels[offset + 3] / 255) * inverse) * 255);
}

function fillRect(canvas, x, y, width, height, color) {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(canvas.width, Math.ceil(x + width));
  const y1 = Math.min(canvas.height, Math.ceil(y + height));
  for (let py = y0; py < y1; py += 1) for (let px = x0; px < x1; px += 1) setPixel(canvas, px, py, color);
}

function fillGradient(canvas, first, second) {
  const a = rgba(first), b = rgba(second);
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const t = (x / Math.max(1, canvas.width - 1) + y / Math.max(1, canvas.height - 1)) / 2;
      const offset = (y * canvas.width + x) * 4;
      canvas.pixels[offset] = Math.round(a[0] + (b[0] - a[0]) * t);
      canvas.pixels[offset + 1] = Math.round(a[1] + (b[1] - a[1]) * t);
      canvas.pixels[offset + 2] = Math.round(a[2] + (b[2] - a[2]) * t);
      canvas.pixels[offset + 3] = 255;
    }
  }
}

function fillCircle(canvas, cx, cy, radius, color) {
  const r2 = radius * radius;
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y += 1) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x += 1) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) setPixel(canvas, x, y, color);
    }
  }
}

function line(canvas, x0, y0, x1, y1, color, thickness = 1) {
  const dx = x1 - x0, dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  for (let step = 0; step <= steps; step += 1) {
    const x = x0 + dx * (step / Math.max(1, steps));
    const y = y0 + dy * (step / Math.max(1, steps));
    fillCircle(canvas, x, y, thickness / 2, color);
  }
}

const FONT = {
  A:['01110','10001','10001','11111','10001','10001','10001'],B:['11110','10001','10001','11110','10001','10001','11110'],C:['01111','10000','10000','10000','10000','10000','01111'],D:['11110','10001','10001','10001','10001','10001','11110'],E:['11111','10000','10000','11110','10000','10000','11111'],F:['11111','10000','10000','11110','10000','10000','10000'],G:['01111','10000','10000','10111','10001','10001','01111'],H:['10001','10001','10001','11111','10001','10001','10001'],I:['11111','00100','00100','00100','00100','00100','11111'],J:['00111','00010','00010','00010','10010','10010','01100'],K:['10001','10010','10100','11000','10100','10010','10001'],L:['10000','10000','10000','10000','10000','10000','11111'],M:['10001','11011','10101','10101','10001','10001','10001'],N:['10001','11001','10101','10011','10001','10001','10001'],O:['01110','10001','10001','10001','10001','10001','01110'],P:['11110','10001','10001','11110','10000','10000','10000'],Q:['01110','10001','10001','10001','10101','10010','01101'],R:['11110','10001','10001','11110','10100','10010','10001'],S:['01111','10000','10000','01110','00001','00001','11110'],T:['11111','00100','00100','00100','00100','00100','00100'],U:['10001','10001','10001','10001','10001','10001','01110'],V:['10001','10001','10001','10001','10001','01010','00100'],W:['10001','10001','10001','10101','10101','11011','10001'],X:['10001','10001','01010','00100','01010','10001','10001'],Y:['10001','10001','01010','00100','00100','00100','00100'],Z:['11111','00001','00010','00100','01000','10000','11111'],
  ' ':['00000','00000','00000','00000','00000','00000','00000'],'-':['00000','00000','00000','11111','00000','00000','00000']
};

function drawText(canvas, text, cx, cy, scale, color) {
  const value = String(text).toUpperCase();
  const glyphWidth = 6 * scale;
  let x = cx - (value.length * glyphWidth - scale) / 2;
  const y = cy - 3.5 * scale;
  for (const char of value) {
    const glyph = FONT[char] || FONT[' '];
    glyph.forEach((row, rowIndex) => [...row].forEach((cell, colIndex) => {
      if (cell === '1') fillRect(canvas, x + colIndex * scale, y + rowIndex * scale, scale, scale, color);
    }));
    x += glyphWidth;
  }
}

function drawProduct(canvas, color, index = 0) {
  const { width: w, height: h } = canvas;
  const cx = w * .67;
  fillCircle(canvas, cx, h * .85, w * .14, rgba('#171838', 30));
  if (index % 4 === 2) {
    fillRect(canvas, cx - w * .14, h * .3, w * .28, h * .48, color);
    fillRect(canvas, cx - w * .09, h * .47, w * .18, h * .12, rgba('#ffffff', 220));
  } else if (index % 4 === 3) {
    fillRect(canvas, cx - w * .15, h * .54, w * .3, h * .22, color);
    fillRect(canvas, cx - w * .15, h * .49, w * .3, h * .07, rgba('#eeeeee'));
  } else {
    fillRect(canvas, cx - w * .09, h * .32, w * .18, h * .46, color);
    fillRect(canvas, cx - w * .045, h * .23, w * .09, h * .1, rgba('#262733'));
    fillRect(canvas, cx - w * .065, h * .48, w * .13, h * .12, rgba('#ffffff', 225));
  }
}

function createRasterPlaceholder(image) {
  const kind = image.placeholder?.kind || 'product';
  const transparent = kind === 'wordmark';
  const canvas = createCanvas(image.width, image.height, transparent);
  const { width: w, height: h } = canvas;
  const data = image.placeholder || {};

  if (kind === 'flag') {
    fillRect(canvas, 0, 0, w, h, rgba('#ffffff'));
    const stripe = h / 13;
    for (let row = 0; row < 13; row += 2) fillRect(canvas, 0, row * stripe, w, stripe + 1, rgba('#b22234'));
    fillRect(canvas, 0, 0, w * .4, stripe * 7, rgba('#3c3b6e'));
    for (let row = 0; row < 9; row += 1) {
      const count = row % 2 === 0 ? 6 : 5;
      for (let col = 0; col < count; col += 1) fillCircle(canvas, w * .4 * ((row % 2 ? .17 : .085) + col * .165), stripe * 7 * (.1 + row * .1), Math.max(3, w * .004), rgba('#c8b100'));
    }
  } else if (kind === 'wordmark') {
    const scale = Math.max(3, Math.min(Math.floor(h / 12), Math.floor(w / Math.max(12, data.label.length * 7))));
    drawText(canvas, data.label, w / 2, h / 2, scale, rgba(data.accent));
  } else if (kind === 'ui') {
    fillRect(canvas, 0, 0, w, h, rgba('#171838'));
    fillRect(canvas, w * .06, h * .06, w * .88, h * .86, rgba('#f2f2f5'));
    fillRect(canvas, w * .06, h * .06, w * .88, h * .09, rgba('#ffffff'));
    fillCircle(canvas, w * .085, h * .105, 7, rgba('#e36a61')); fillCircle(canvas, w * .105, h * .105, 7, rgba('#e8b84a')); fillCircle(canvas, w * .125, h * .105, 7, rgba('#56af6c'));
    fillRect(canvas, w * .06, h * .15, w * .14, h * .77, rgba('#20213f'));
    fillRect(canvas, w * .085, h * .22, w * .09, h * .05, rgba('#b22234'));
    if (data.step === 'step2') {
      fillCircle(canvas, w * .42, h * .44, h * .13, rgba('#b22234')); fillCircle(canvas, w * .42, h * .44, h * .09, rgba('#f2f2f5'));
      for (let i = 0; i < 4; i += 1) fillRect(canvas, w * .57, h * (.29 + i * .1), w * (.3 - i * .035), h * .025, rgba(i === 1 ? '#c8b100' : '#6b6e89'));
    } else if (data.step === 'step3') {
      ['#e08b50','#5e91b3','#638a6f'].forEach((color, i) => { fillRect(canvas, w * (.28 + i * .21), h * .27, w * .16, h * .46, rgba(color)); fillRect(canvas, w * (.33 + i * .21), h * .42, w * .06, h * .19, rgba('#f7f7f7')); });
    } else if (data.step === 'step4') {
      fillCircle(canvas, w * .58, h * .42, h * .12, rgba('#2f9363')); line(canvas, w * .53, h * .42, w * .57, h * .47, rgba('#ffffff'), 14); line(canvas, w * .57, h * .47, w * .65, h * .34, rgba('#ffffff'), 14); fillRect(canvas, w * .4, h * .64, w * .36, h * .08, rgba('#b22234'));
    } else {
      fillRect(canvas, w * .3, h * .33, w * .56, h * .12, rgba('#ffffff')); fillRect(canvas, w * .34, h * .37, w * .32, h * .025, rgba('#c5c6cf')); fillRect(canvas, w * .7, h * .35, w * .12, h * .07, rgba('#b22234')); fillCircle(canvas, w * .38, h * .59, h * .045, rgba('#2f9363'));
    }
  } else if (kind === 'variant') {
    fillGradient(canvas, '#f7f4ef', '#ffffff');
    const cx = w / 2; fillCircle(canvas, cx, h * .82, w * .18, rgba('#171838', 28)); fillRect(canvas, cx - w * .13, h * .27, w * .26, h * .52, rgba(data.color)); fillRect(canvas, cx - w * .075, h * .17, w * .15, h * .12, rgba('#262733')); fillRect(canvas, cx - w * .09, h * .47, w * .18, h * .15, rgba('#f7f1e7')); fillCircle(canvas, cx, h * .545, w * .018, rgba('#c8b100'));
  } else if (kind === 'aplus') {
    fillGradient(canvas, '#eee8de', '#d9d1c2');
    data.colors.forEach((color, i) => { const x = w * (.55 + i * .145); fillRect(canvas, x, h * (.28 + Math.abs(i - 1) * .05), w * .12, h * .48, rgba(color)); fillRect(canvas, x + w * .02, h * .47, w * .08, h * .12, rgba('#f7f3e9', 230)); });
    fillRect(canvas, w * .08, h * .25, w * .3, h * .035, rgba('#514a42')); fillRect(canvas, w * .08, h * .33, w * .24, h * .018, rgba('#8e857b')); fillRect(canvas, w * .08, h * .38, w * .28, h * .018, rgba('#8e857b'));
  } else if (kind === 'testimonial') {
    fillGradient(canvas, data.colors[0], data.colors[1]);
    fillRect(canvas, w * .08, h * .1, w * .84, h * .8, rgba('#ffffff', 28)); fillCircle(canvas, w * .5, h * .39, h * .16, rgba('#f2e8dd', 235)); fillCircle(canvas, w * .5, h * .83, w * .23, rgba('#22243d', 235)); fillCircle(canvas, w * .5, h * .5, h * .068, rgba('#b22234')); line(canvas, w * .485, h * .465, w * .485, h * .535, rgba('#ffffff'), 5); line(canvas, w * .485, h * .465, w * .535, h * .5, rgba('#ffffff'), 5); line(canvas, w * .535, h * .5, w * .485, h * .535, rgba('#ffffff'), 5);
  } else {
    const colors = data.colors || ['#d9b5a4', '#9b4f40']; fillGradient(canvas, colors[0], colors[1]); fillCircle(canvas, w * .18, h * .2, w * .16, rgba('#ffffff', 30)); fillCircle(canvas, w * .3, h * .82, w * .21, rgba('#ffffff', 20)); drawProduct(canvas, rgba('#f4f0eb'), data.index || 0);
  }
  return encodePng(w, h, canvas.pixels);
}

async function createPlaceholderBuffer(image) {
  if (!sharp) return createRasterPlaceholder(image);
  const kind = image.placeholder?.kind || 'product';
  let svg;
  if (kind === 'flag') svg = flagSvg(image);
  else if (kind === 'wordmark') svg = wordmarkSvg(image);
  else if (kind === 'ui') svg = uiSvg(image);
  else if (kind === 'variant') svg = variantSvg(image);
  else if (kind === 'aplus') svg = aplusSvg(image);
  else if (kind === 'testimonial') svg = testimonialSvg(image);
  else svg = productSvg(image);

  return sharp(Buffer.from(svg), { density: 144 })
    .resize(image.width, image.height, { fit: 'fill' })
    .png({ compressionLevel: 9, palette: true, colours: 256, effort: 8 })
    .toBuffer();
}

module.exports = { createPlaceholderBuffer };
