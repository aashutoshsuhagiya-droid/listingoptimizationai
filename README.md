# Listing Optimization AI

A responsive SaaS marketing site plus an authenticated product-infographic studio.

## Customer creative studio

Authenticated customers can use `dashboard.html` to:

- upload one to three raw product photographs;
- select the strongest primary angle and turn it into a transparent, product-locked cutout;
- inspect and approve that cutout before paid background generation begins;
- enter verified product benefits and exact infographic copy;
- choose Feature, Benefit, Lifestyle, or Marketplace Main concepts;
- generate product-free 2K scenes through a server-only image API;
- composite the non-generatively-redrawn product cutout, natural shadows, and exact typography in the browser; and
- review and download 2000px JPG creatives.

OpenAI and PhotoRoom keys are never sent to the browser. Firebase Admin requires a verified user and, unless explicitly disabled for setup, a paid custom-claim entitlement; Firestore enforces required per-user and global cutout/generation limits. Uploaded images are resized before transport, and image bytes are returned without being permanently stored by this codebase. OpenAI receives the creative brief but not the customer product photo.

See [`GENERATION_SETUP.md`](GENERATION_SETUP.md) before deploying the generator.

## Run locally

Use Node.js 22. Open `index.html` directly, or serve the folder with any static server:

```powershell
npx serve .
```

The public pages remain static. The customer generator requires the included Node serverless endpoint, so deploy the full project to Vercel and configure the environment variables in [`GENERATION_SETUP.md`](GENERATION_SETUP.md). A static-only host can display the site but cannot run generation.

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
