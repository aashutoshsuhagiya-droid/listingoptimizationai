# Listing Optimization AI

A production-ready, responsive SaaS marketing page built with semantic HTML, CSS, and vanilla JavaScript.

## Run locally

Open `index.html` directly, or serve the folder with any static server:

```powershell
npx serve .
```

The static site has no runtime dependency and can be deployed directly to Vercel, Netlify, GitHub Pages, or any static host. Node dependencies are only needed when regenerating marketing images through the optional pipeline.

## Image pipeline

The page now consumes 60 local PNG assets and 11 custom SVG icons instead of CSS-only product mockups. A complete API/offline generation workflow is included:

```powershell
# Works immediately without API keys
node scripts/generate-images.js --all --fallback

# Validate dimensions, format, alpha, and file size
node scripts/generate-images.js --validate
```

For live OpenAI or Replicate generation, run `npm install`, copy `.env.example` to `.env`, and add credentials locally. See [`scripts/README.md`](scripts/README.md) and [`IMAGES.md`](IMAGES.md).

## Included

- Complete 20-part marketing experience from the supplied brief
- Responsive desktop, tablet, and mobile layouts
- Variant studio tabs, monthly/yearly pricing, testimonial carousel, video interaction, and mobile menu
- Custom local logo, generated 50-star US hero flag, and 11 outlined SVG icons
- Six linked customer video testimonials with local thumbnail previews
- Fifteen-marketplace selector and a 15-question accessible FAQ accordion
- Idempotent image CLI with dry run, single-ID generation, retries, resume, validation, and offline fallback
- Accessible landmarks, labels, reduced-motion handling, and semantic content
