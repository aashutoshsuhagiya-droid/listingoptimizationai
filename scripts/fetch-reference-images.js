'use strict';

const fs = require('fs');
const path = require('path');

async function downloadAll() {
  for (let i = 1; i <= 8; i++) {
    const num = String(i).padStart(2, '0');
    const url = 'https://listingoptimization.ai/product-images/image-' + num + '.png';
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.error('Failed ' + url + ': ' + res.status);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const target = path.join(__dirname, '..', 'images', 'gallery', 'review-' + i + '.png');
      fs.writeFileSync(target, buf);
      console.log('Saved ' + target + ' (' + buf.length + ' bytes)');
    } catch (err) {
      console.error('Error fetching ' + url, err);
    }
  }
}

downloadAll();
