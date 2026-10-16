'use strict';

const fs = require('fs');
const path = require('path');

const ASSETS = [
  { url: 'https://listingoptimization.ai/group5/build%20for%20real%20customers%20reviews%20.png', dest: 'images/reviews-feature.png' },
  { url: 'https://listingoptimization.ai/aplus-modules.png', dest: 'images/aplus/hero.png' },
  { url: 'https://listingoptimization.ai/group3/hourssavedperlisting.png', dest: 'images/stats-hours.png' },
  { url: 'https://listingoptimization.ai/group3/USD%20saved%20per%20year%20for%20large%20brands.png', dest: 'images/stats-usd.png' },
  { url: 'https://listingoptimization.ai/group3/Increase%20in%20conversion%20rate.png', dest: 'images/stats-cvr.png' },
  { url: 'https://listingoptimization.ai/group4/enteraspian.png', dest: 'images/how-it-works/step1.png' },
  { url: 'https://listingoptimization.ai/group4/ai%20analysis.png', dest: 'images/how-it-works/step2.png' },
  { url: 'https://listingoptimization.ai/group4/generative%20creative.png', dest: 'images/how-it-works/step3.png' },
  { url: 'https://listingoptimization.ai/Frame%202147226435.png', dest: 'images/how-it-works/step4.png' }
];

async function sync() {
  for (const item of ASSETS) {
    try {
      const res = await fetch(item.url);
      if (!res.ok) {
        console.error('Failed', item.url, res.status);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const target = path.join(__dirname, '..', item.dest);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, buf);
      console.log('Saved', item.dest, '(' + buf.length + ' bytes)');
    } catch (err) {
      console.error('Error fetching', item.url, err.message);
    }
  }
}

sync();
