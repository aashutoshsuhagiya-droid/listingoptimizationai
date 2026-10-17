# Image inventory

All raster prompts and metadata are the source of truth in [`scripts/prompts.js`](scripts/prompts.js). The committed PNGs were produced by the pipeline's deterministic offline provider, so the site works without API credentials. Running the live pipeline replaces selected files only when `--force` is explicitly supplied.

## Inventory summary

| Group | IDs | Files | Dimensions | Current source |
| --- | --- | ---: | --- | --- |
| Hero | `hero/us-flag` | 1 | 1920×1080 | Offline pipeline |
| Stylized brand wordmarks | `brands/heinz` through `brands/huggies` | 9 | 400×200, transparent | Offline pipeline |
| How it works | `how-it-works/step1-asin` through `step4-upload` | 4 | 1200×800 | Offline pipeline |
| Review gallery | `gallery/review-1` through `review-8` | 8 | 800×800 | Offline pipeline |
| A+ content | `aplus/hero` | 1 | 1200×800 | Offline pipeline |
| Product variants | `variants/color-01` through `color-11` | 11 | 600×800 | Offline pipeline |
| User gallery | `user-gallery/user-01` through `user-20` | 20 | 800×800 | Offline pipeline |
| Testimonial thumbnails | `testimonials/thumb-01` through `thumb-06` | 6 | 640×360 | Offline pipeline |
| Feature icons | `assets/icons/feature-1.svg` through `feature-8.svg` | 8 | 48×48 viewBox | Hand-authored SVG |
| Enterprise icons | `assets/icons/enterprise-1.svg` through `enterprise-3.svg` | 3 | 48×48 viewBox | Hand-authored SVG |

This is 60 raster jobs plus 11 SVG icons (71 total assets). The source brief's “63 images” acceptance line conflicts with its own group counts; no unspecified assets were invented.

## Prompt families

- Hero: `stylized-concept`, exact flag structure and the navy/red/gold palette, with no text or people.
- Wordmarks: `logo-brand`, exact brand-name text but explicitly original lettering rather than official logo reproduction.
- Workflow UI: `ui-mockup`, generic product workflow only, no customer data or official Amazon interface.
- Product imagery: `product-mockup`, premium e-commerce lighting with negative space for HTML captions; no claims or in-image marketing text.
- Variant series: `product-mockup`, invariant bottle shape, camera, label position, lighting, crop, and shadow; only color changes.
- Testimonials: `stylized-concept`, anonymous presenter silhouettes rather than fabricated real customers.

Every exact final prompt, negative prompt, filename, dimension, color, label, and category is stored alongside its image ID in `scripts/prompts.js` for reproducible single-image regeneration.

## Validation

```powershell
node scripts/generate-images.js --validate
```

Validation requires every PNG to exist, match the configured dimensions and format, remain under 500KB, and retain alpha where required.
