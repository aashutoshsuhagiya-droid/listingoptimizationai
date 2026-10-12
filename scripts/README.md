# Image generation pipeline

The pipeline owns the 60 raster assets used by the landing page. It supports OpenAI DALL-E 3 as the primary provider, Stable Diffusion through Replicate as an optional fallback, and a deterministic offline renderer that requires no API credits.

The separate 11 feature and enterprise icons are deterministic SVGs in `assets/icons/`; they are intentionally not sent to an image model.

## Setup

Requirements: Node.js 18 or newer.

```powershell
npm install
Copy-Item .env.example .env
```

Set API credentials in `.env`—never commit that file. API calls can incur provider charges. If no API key is configured, `--all` automatically uses the offline renderer.

## Commands

```powershell
# Inspect every configured job without writing files or calling an API
node scripts/generate-images.js --dry-run

# Generate all missing assets; OpenAI, then Replicate, then offline fallback
node scripts/generate-images.js --all

# Generate one asset by its exact ID
node scripts/generate-images.js --id gallery/review-1

# Generate the complete deterministic local asset set without an API
node scripts/generate-images.js --all --fallback

# Continue an interrupted run; existing valid files are skipped
node scripts/generate-images.js --all --resume

# Intentionally replace existing targets
node scripts/generate-images.js --all --force

# Verify file presence, PNG format, exact dimensions, alpha requirements, and 500KB limit
node scripts/generate-images.js --validate
```

Provider selection can be explicit:

```powershell
node scripts/generate-images.js --all --provider openai
node scripts/generate-images.js --all --provider replicate
```

## Architecture

- `prompts.js` contains every image ID, canonical filename, dimensions, production prompt, negative prompt, and offline-render metadata.
- `generate-images.js` provides CLI selection, progress percentages, idempotent skipping, three-attempt retries, OpenAI/Replicate calls, graceful fallback, and validation.
- `utils/image-optimizer.js` resizes and palette-compresses PNGs with Sharp when installed. Offline fallback PNGs can still be validated and saved using only Node built-ins.
- `utils/placeholder-generator.js` creates brand-colored, composition-aware local assets. It uses Sharp when available and contains a zero-network PNG renderer for clean bootstrap runs.

## Output behavior

- Canonical paths are under `images/` and match the paths in `index.html`.
- `IMAGE_OUTPUT_DIR=./images` avoids duplicating the leading `images/` segment.
- Generated assets are resized to their exact configured dimensions.
- PNG palette compression iterates down until the configured `MAX_FILE_SIZE_KB` limit is met.
- Existing valid targets are never replaced unless `--force` is supplied.
- If an API fails after the configured retry count, the pipeline tries the next configured provider and finally the offline renderer.

## Transparency note

DALL-E 3 does not guarantee native transparent output. The committed offline wordmarks contain a true alpha channel. If live native-transparency generation is required, explicitly choose a model/provider that supports it and verify with `--validate`; the pipeline never silently changes models.

## Prompt safety

Prompts avoid unsupported product claims, certifications, prohibited products, customer data, and official marketplace interfaces. The nine brand tiles request original typographic treatments rather than copies of official trademarked logo artwork.
