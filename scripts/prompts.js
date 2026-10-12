'use strict';

const sharedNegative = 'watermark, stock watermark, distorted packaging, unreadable labels, false certification badges, medical claims, prohibited products, marketplace logos, misleading product claims';

const prompt = (...lines) => lines.filter(Boolean).join('\n');

const images = [
  {
    id: 'hero/us-flag',
    filename: 'images/hero/us-flag.png',
    width: 1920,
    height: 1080,
    prompt: prompt(
      'Use case: stylized-concept',
      'Asset type: landing page hero image',
      'Primary request: a stylized United States flag with thirteen red and white stripes, a navy canton, and fifty small gold stars',
      'Style/medium: polished modern graphic artwork with subtle dimensional fabric texture',
      'Composition/framing: wide 16:9 flag filling the frame, clean silhouette, no cropping of the canton',
      'Lighting/mood: dramatic premium studio light, confident patriotic marketing mood',
      'Color palette: dark navy #171838 and #3c3b6e, flag red #b22234, white, gold #c8b100',
      'Constraints: no text, no people, no logos, no watermark'
    ),
    negative_prompt: sharedNegative,
    placeholder: { kind: 'flag', colors: ['#171838', '#b22234', '#ffffff', '#c8b100'] }
  }
];

const brands = [
  ['heinz', 'HEINZ', '#b22234'],
  ['dove', 'Dove', '#315b8a'],
  ['new-balance', 'new balance', '#c6262e'],
  ['oral-b', 'Oral-B', '#2369ad'],
  ['oxo', 'OXO', '#d8292f'],
  ['dyson', 'dyson', '#1e1e1e'],
  ['singer', 'SINGER', '#c51f2c'],
  ['hp', 'hp', '#1685c6'],
  ['huggies', 'Huggies', '#d6333d']
];

for (const [slug, label, accent] of brands) {
  images.push({
    id: `brands/${slug}`,
    filename: `images/brands/${slug}.png`,
    width: 400,
    height: 200,
    prompt: prompt(
      'Use case: logo-brand',
      'Asset type: trusted-brand wordmark tile',
      `Primary request: an original stylized typographic wordmark reading exactly "${label}"; use the name only and do not reproduce an official trademarked logo`,
      'Style/medium: minimal vector-like custom lettering, strong silhouette, refined spacing',
      'Composition/framing: centered wordmark with generous transparent padding',
      `Color palette: primary accent ${accent}, otherwise monochrome`,
      `Text (verbatim): "${label}"`,
      'Constraints: genuinely transparent background, one wordmark only, no symbol copied from an existing brand, no mockup, no watermark'
    ),
    negative_prompt: `${sharedNegative}, official logo recreation, packaging, background scene`,
    transparent: true,
    placeholder: { kind: 'wordmark', label, accent }
  });
}

const steps = [
  ['step1-asin', 'step1', 'Amazon product URL input workflow with a single URL field, a small product-found state, and one red analysis button'],
  ['step2-analysis', 'step2', 'AI analysis dashboard with an abstract review scan ring, competitor cards, keyword bars, and progress indicators'],
  ['step3-generate', 'step3', 'creative generation workspace showing three original generic product tiles, layout controls, and a generation progress state'],
  ['step4-upload', 'step4', 'publishing confirmation screen with an abstract marketplace destination card, green success state, and upload progress complete']
];

for (const [id, file, subject] of steps) {
  images.push({
    id: `how-it-works/${id}`,
    filename: `images/how-it-works/${file}.png`,
    width: 1200,
    height: 800,
    prompt: prompt(
      'Use case: ui-mockup',
      'Asset type: how-it-works product screenshot',
      `Primary request: ${subject}`,
      'Style/medium: realistic, production-ready SaaS interface mockup rather than concept art',
      'Composition/framing: clean browser window chrome, balanced dashboard hierarchy, legible controls, 3:2 landscape',
      'Lighting/mood: crisp interface lighting with restrained shadows',
      'Color palette: dark navy #171838, red #b22234, white, muted gray, small gold #c8b100 accents',
      'Constraints: generic placeholder UI copy only, no Amazon logo, no seller data, no personal information, no watermark'
    ),
    negative_prompt: `${sharedNegative}, real customer data, official Amazon interface, tiny dense text`,
    placeholder: { kind: 'ui', step: file }
  });
}

const reviews = [
  ['review-1', 'Glow serum', 'a premium frosted skincare serum bottle with a simple abstract label', ['#e99d90', '#f4c8b7'], 'THE GLOW THEY NOTICE'],
  ['review-2', 'Clean care', 'a minimal white personal-care pump bottle', ['#b7d9c9', '#e1efe5'], 'CLINICALLY CLEAN'],
  ['review-3', 'Fuel pouch', 'a resealable nutrition powder pouch with a clean fictional label', ['#efe1cb', '#e6a568'], 'POWER YOUR MORNING'],
  ['review-4', 'Aqua tube', 'a pale blue skincare tube with a generic wave mark', ['#b8d9e8', '#dceff5'], 'FRESH ALL DAY'],
  ['review-5', 'Vive dropper', 'an amber glass cosmetic dropper with a fictional minimal label', ['#826889', '#b89dbd'], 'YOUR SKIN, RESET'],
  ['review-6', 'Nova box', 'a refined beige consumer-product carton with a simple geometric mark', ['#d5bd9e', '#efe2d1'], 'DESIGNED FOR REAL LIFE'],
  ['review-7', 'C plus bottle', 'a dark vitamin bottle with a bright yellow accent label and no health claims', ['#e7d760', '#f2eaa9'], 'BRIGHTER BY DESIGN'],
  ['review-8', 'Silk jar', 'a round rose cosmetic jar with a neutral fictional label', ['#dca9ad', '#f0d0d2'], 'SOFTNESS THAT LASTS']
];

for (const [id, label, subject, colors, headline] of reviews) {
  images.push({
    id: `gallery/${id}`,
    filename: `images/gallery/${id}.png`,
    width: 800,
    height: 600,
    prompt: prompt(
      'Use case: product-mockup',
      'Asset type: Amazon-style product listing example',
      `Primary request: ${subject}`,
      `Scene/backdrop: premium gradient studio backdrop blending ${colors[0]} and ${colors[1]}`,
      'Style/medium: photorealistic premium e-commerce product photography',
      'Composition/framing: product in the lower-right third with generous negative space for an HTML headline overlay',
      'Lighting/mood: softbox lighting, clean highlights, controlled natural shadow',
      'Materials/textures: realistic glass, plastic, paper, or foil appropriate to the packaging',
      'Constraints: no text in the image, no brand logo, no efficacy claim, no certification badge, no watermark'
    ),
    negative_prompt: `${sharedNegative}, text overlay, hands, people, duplicated product`,
    placeholder: { kind: 'product', label, headline, colors }
  });
}

images.push({
  id: 'aplus/hero',
  filename: 'images/aplus/hero.png',
  width: 1200,
  height: 800,
  prompt: prompt(
    'Use case: product-mockup',
    'Asset type: A+ content lifestyle module',
    'Primary request: three coordinated fictional wellness pouches in peach, olive, and violet colorways, with minimal labels named CALM, FOCUS, and SLEEP',
    'Scene/backdrop: elevated warm neutral studio set with soft stone plinths and a subtle botanical shadow',
    'Style/medium: photorealistic premium e-commerce lifestyle photography',
    'Composition/framing: wide editorial arrangement with the pouch trio grouped on the right and clean negative space on the left',
    'Lighting/mood: soft morning light, warm and calm',
    'Text (verbatim): "CALM", "FOCUS", "SLEEP"',
    'Constraints: render each pouch name once, no medical claims, no supplements visible, no people, no watermark'
  ),
  negative_prompt: sharedNegative,
  placeholder: { kind: 'aplus', colors: ['#dc9274', '#78805a', '#81719a'] }
});

const variantColors = [
  ['coral red', '#b95d60'], ['orange', '#cf8b63'], ['yellow', '#d5b65f'], ['olive green', '#748d68'],
  ['teal', '#598b93'], ['blue', '#63759b'], ['purple', '#79678f'], ['dark gray', '#414353'],
  ['beige', '#b8a487'], ['light gray', '#a9aca9'], ['cream', '#d4cfbf']
];

variantColors.forEach(([colorName, color], index) => {
  const number = String(index + 1).padStart(2, '0');
  images.push({
    id: `variants/color-${number}`,
    filename: `images/variants/color-${number}.png`,
    width: 600,
    height: 800,
    prompt: prompt(
      'Use case: product-mockup',
      'Asset type: coordinated product variant photograph',
      `Primary request: the same cylindrical pump bottle design in ${colorName} (${color})`,
      'Scene/backdrop: seamless warm-white studio sweep',
      'Style/medium: photorealistic catalog product photography',
      'Composition/framing: single bottle centered, straight-on three-quarter angle, identical scale and camera position across the series',
      'Lighting/mood: consistent large softbox from upper left, subtle contact shadow',
      'Materials/textures: matte coated bottle, satin pump, tiny blank cream label panel',
      'Constraints: preserve the exact same bottle shape, angle, crop, shadow, and label placement across every color; no text, no logo, no watermark'
    ),
    negative_prompt: `${sharedNegative}, multiple bottles, changed camera angle, changed bottle shape, props, hands`,
    placeholder: { kind: 'variant', colorName, color, index }
  });
});

const userGallery = [
  ['supplement-bottle', 'a neutral amber supplement bottle with capsules beside it', 'supplements', ['#e6c8a5', '#40352b'], 'MORNING MADE BETTER'],
  ['hydration-serum', 'a frosted hydration serum bottle with water droplets', 'skincare', ['#b8d6d0', '#f8fbfb'], 'DEEP HYDRATION'],
  ['calm-drops', 'a glass cosmetic dropper on a lavender plinth', 'skincare', ['#d9c9df', '#694f7b'], 'CALM IN EVERY DROP'],
  ['resistance-band', 'a rolled fabric resistance band and carry pouch', 'fitness', ['#c7d1da', '#253b54'], 'BUILT TO GO FURTHER'],
  ['cleaning-spray', 'a refillable household cleaning spray bottle', 'household', ['#ddd285', '#f9f9f2'], 'CLEANER. BRIGHTER.'],
  ['face-cream', 'a rich face cream jar with a small applicator', 'skincare', ['#dda7a0', '#9a3f48'], 'FEEL THE DIFFERENCE'],
  ['plant-protein', 'a plant protein powder pouch with a leaf-shaped abstract mark', 'supplements', ['#baceaa', '#4f6f3a'], 'PLANT-BASED POWER'],
  ['sleep-mask', 'a soft fabric sleep mask on folded linen', 'fitness', ['#9ca3c8', '#ece9e0'], 'SLEEP DEEPER'],
  ['kitchen-tool', 'a compact black handheld kitchen tool', 'household', ['#d8c4a8', '#363331'], 'SMALL TOOL. BIG RESULTS.'],
  ['coffee-pouch', 'a premium roasted coffee pouch with beans', 'food and beverage', ['#e3b16d', '#5f3e29'], 'FUEL YOUR FOCUS'],
  ['mineral-water', 'a clear reusable water bottle with condensation', 'food and beverage', ['#b9dce3', '#f8fbfc'], 'PURE FROM THE SOURCE'],
  ['glow-mask', 'a folded facial sheet mask package and serum bead', 'skincare', ['#e8bbb1', '#6e463d'], 'GLOW ON YOUR TERMS'],
  ['drawer-organizer', 'a modular drawer organizer shown neatly arranged', 'household', ['#d0d0ca', '#33363a'], 'THE DAILY ESSENTIAL'],
  ['baby-blanket', 'a folded organic cotton baby blanket with a simple paper band', 'baby', ['#e3ced4', '#faf7f2'], 'SOFTNESS THAT LASTS'],
  ['travel-container', 'a compact leakproof food container with locking lid', 'household', ['#bcc8b6', '#455b49'], 'READY FOR ANYTHING'],
  ['breakfast-granola', 'a resealable granola pouch with a small serving bowl', 'food and beverage', ['#ead780', '#fff8df'], 'BRIGHTER MORNINGS'],
  ['yoga-block', 'a textured cork yoga block and cotton strap', 'fitness', ['#c6ab8b', '#5d4432'], 'STRONG BY NATURE'],
  ['baby-bottle', 'a minimal baby feeding bottle with protective cap', 'baby', ['#c6d5e8', '#48647e'], 'A BETTER BASIC'],
  ['clay-cleanser', 'a matte skincare cleanser tube with a clay smear', 'skincare', ['#d0bfd8', '#fafafa'], 'RESET YOUR ROUTINE'],
  ['shaker-bottle', 'a modern fitness shaker bottle with carry loop', 'fitness', ['#d9b5a4', '#9b4f40'], 'MADE FOR MOMENTUM']
];

userGallery.forEach(([slug, subject, category, colors, headline], index) => {
  const number = String(index + 1).padStart(2, '0');
  images.push({
    id: `user-gallery/user-${number}`,
    filename: `images/user-gallery/user-${number}.png`,
    width: 800,
    height: 800,
    prompt: prompt(
      'Use case: product-mockup',
      'Asset type: square Amazon listing portfolio example',
      `Primary request: ${subject}`,
      `Scene/backdrop: clean studio set using ${colors[0]} with subtle ${colors[1]} accents`,
      `Subject category: ${category}`,
      'Style/medium: photorealistic professional e-commerce listing photography',
      'Composition/framing: square crop, single clear hero product, balanced negative space for an HTML caption',
      'Lighting/mood: soft commercial studio lighting with realistic material texture',
      'Constraints: no text in the image, no logo, no unsupported claim, no certification badge, no watermark'
    ),
    negative_prompt: `${sharedNegative}, text overlay, crowded scene, people, duplicated product`,
    placeholder: { kind: 'user-gallery', slug, category, colors, headline, index }
  });
});

const testimonialColors = [
  ['#7d6c61', '#bba593'], ['#5d7480', '#9cb9bd'], ['#7b6478', '#c5a6b8'],
  ['#736d55', '#bcb383'], ['#5b596f', '#9c99b6'], ['#705e5a', '#b79587']
];

testimonialColors.forEach((colors, index) => {
  const number = String(index + 1).padStart(2, '0');
  images.push({
    id: `testimonials/thumb-${number}`,
    filename: `images/testimonials/thumb-${number}.png`,
    width: 640,
    height: 360,
    prompt: prompt(
      'Use case: stylized-concept',
      'Asset type: customer video testimonial thumbnail placeholder',
      'Primary request: a friendly professional presenter silhouette seated in a tasteful home-office video-call setting',
      `Scene/backdrop: soft abstract gradient from ${colors[0]} to ${colors[1]} with subtle depth`,
      'Style/medium: polished editorial 3D silhouette, intentionally anonymous rather than a real person',
      'Composition/framing: 16:9 medium shot with the silhouette centered and uncluttered edges',
      'Lighting/mood: warm, trustworthy, natural window-light feel',
      'Constraints: no identifiable real person, no text, no logos, no YouTube trademark, no watermark'
    ),
    negative_prompt: `${sharedNegative}, photorealistic identifiable face, text, logo`,
    placeholder: { kind: 'testimonial', colors, index }
  });
});

const ids = new Set();
const filenames = new Set();
for (const image of images) {
  if (ids.has(image.id)) throw new Error(`Duplicate image id: ${image.id}`);
  if (filenames.has(image.filename)) throw new Error(`Duplicate filename: ${image.filename}`);
  ids.add(image.id);
  filenames.add(image.filename);
}

module.exports = { images };
