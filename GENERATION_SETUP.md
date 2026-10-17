# Production ecommerce infographic and variant setup

The customer studio uses a hybrid workflow. Standard infographics retain the photographed product without generative redrawing; the optional variant tool makes a controlled generative edit only after the customer approves the cutout:

1. A Firebase-authenticated customer uploads one to three product photos and selects the primary angle.
2. The browser resizes the primary photo before transmission.
3. `/api/prepare-product` verifies the Firebase ID token and Firestore quota, then returns the cutout with a short-lived signed preparation proof bound to that user and those exact image bytes.
4. A transparent upload is normalized directly; an opaque upload is sent to PhotoRoom for background removal.
5. `/api/generate-infographic` sends only the sanitized creative brief to OpenAI and requests a product-free 2K scene.
6. The customer reviews the cutout before any paid background request begins.
7. The browser composites the original transparent product, a controlled shadow, and approved copy on a 2000px Canvas.
8. Marketplace Main skips OpenAI entirely and places the original cutout on shadow-free pure white.
9. When the customer explicitly requests a product variant, `/api/generate-variant` verifies the preparation proof, decodes the bound cutout, and sends it with one sanitized color, size, or shape instruction to OpenAI.
10. The variant endpoint returns an opaque 1024px WebP on `#00FF00` chroma green; the browser compresses it to the preparation limit, PhotoRoom isolates the edited product, and the customer must pass a separate 200% review before composition.

This separation is deliberate. PhotoRoom isolates the photographed product without generatively redrawing it, OpenAI normally creates only the environment, and deterministic code owns product placement, typography, claims, and final export. Variant editing is an explicit exception: it is generative and must never replace the approved original cutout without customer confirmation.

## Why this does not fine-tune the image model

This application does not claim to train or fine-tune `gpt-image-2`. Fine-tuning would not guarantee exact labels, verified claims, typography, or SKU geometry, and it would require a licensed, consistently annotated variant dataset plus a separate evaluation program. The production-safe approach here is controlled edit prompting, strict Color/Size/Shape allowlisting, real-SKU review, and deterministic browser composition. If catalog data is collected later, use it first to evaluate and recommend templates; keep manufactured-variant photography as the source of truth.

## 1. Install dependencies

```powershell
cd "<path-to-your-cloned-project>"
npm.cmd install
npm.cmd run check
```

Use Node.js 22. Vercel installs the same dependencies during deployment. Commit the generated `package-lock.json` so deployment uses the reviewed dependency tree.

## 2. Configure PhotoRoom

Create a PhotoRoom Image API key from the official PhotoRoom API site:

https://www.photoroom.com/api

Store the key only in Vercel as `PHOTOROOM_API_KEY`. The default adapter uses the official segmentation endpoint. It receives the selected opaque primary product photo and, in opt-in variant mode, the chroma-backed image returned by OpenAI so the edited product can be isolated. If PhotoRoom changes the endpoint or multipart field for your account, override `PHOTOROOM_SEGMENT_URL` or `PHOTOROOM_FILE_FIELD` without changing browser code.

A genuinely transparent PNG/WebP bypasses PhotoRoom and is normalized locally by the server.

## 3. Configure OpenAI

Create an API key at:

https://platform.openai.com/api-keys

Image generation guidance:

https://platform.openai.com/docs/guides/image-generation

Background generation requests `gpt-image-2`, high quality, WebP delivery, and a model size near 2K. That route receives category, audience, style, brand color, and verified benefits, but not the product photo or PhotoRoom cutout.

`POST /api/generate-variant` is a separate, authenticated opt-in route. It requires `Authorization: Bearer <Firebase ID token>` and `Content-Type: application/json`. The body contains the exact approved `cutout` data URL and `preparationProof` returned together by `/api/prepare-product`, `variantType` (`color`, `size`, or `shape`), and an `instruction` of at most 300 sanitized characters:

```json
{
  "cutout": "data:image/webp;base64,...",
  "preparationProof": "<opaque proof returned by /api/prepare-product>",
  "variantType": "color",
  "instruction": "Change only the bottle body to navy blue."
}
```

The proof expires after two hours and is bound by HMAC-SHA-256 to a hash of the exact cutout bytes and a hash of the authenticated Firebase UID. A proof from another user, an altered/re-encoded cutout, an expired proof, or a missing proof is rejected before variant quota is reserved. The proof is not a substitute for the customer's visual approval; it proves server preparation and ownership binding, not product fidelity.

It submits one high-quality 1024×1024 `images.edit` request and returns `variant`, `variantType`, `model`, `size`, `backgroundColor`, `requiresChromaKey`, and `requestId`. The response is intentionally opaque with a flat `#00FF00` background because this model path does not request native transparency. The browser then sends the compressed result through the authenticated preparation route; do not publish the raw chroma output.

The variant request deliberately omits `input_fidelity`; current bundled OpenAI guidance does not define that option for the configured `gpt-image-2` edit path. The prompt strongly locks the logo, label, packaging artwork, spelling, and all attributes outside the selected edit, but a generative model cannot guarantee pixel-exact branding. Always show the result at useful zoom, compare it with the approved cutout, and require explicit approval or rejection before use.

API generation is paid usage. Never place either provider key in `firebase.js`, `dashboard.js`, HTML, GitHub, or any browser-visible file.

Each newly created variant normally consumes one variant-generation quota unit and one product-preparation quota unit because the OpenAI edit must be isolated by PhotoRoom. The browser keeps a successful raw edit in memory if downstream isolation fails, so an in-session retry does not buy the same OpenAI edit again; refreshing the page clears that temporary cache.

## 4. Configure Firebase Admin

The public Firebase configuration in `firebase.js` is not a server credential. The API additionally needs a Firebase service account:

1. Open Firebase Console.
2. Select `listing-optimization-ai`.
3. Open **Project settings → Service accounts**.
4. Choose **Generate new private key**.
5. Save the downloaded JSON outside this repository, copy only its required values into Vercel, then remove the local download when it is no longer needed.

Enable **Cloud Firestore** in Native mode. Deploy the included locked rules with `npx.cmd firebase-tools deploy --only firestore:rules`; browser clients must never read or modify `generationUsage`. Firebase Admin bypasses these rules and keeps separate per-user and global counters for product preparation, AI background generation, and AI variant editing.

In **Authentication → Settings → Authorized domains**, add the production Vercel domain, every custom domain, and the local domain used for testing. Email/password accounts must verify their email before paid tools work. Entitlement fails closed unless `REQUIRE_GENERATION_ENTITLEMENT=false` is explicitly set. For production, grant `generationAccess: true` only to active customers through the billing backend or the included manual provisioning command below. After a claim changes, the customer must sign out and back in to refresh the ID token.

With the three Firebase Admin variables loaded into your local shell, manually grant or revoke an initial customer:

```powershell
npm.cmd run access:set -- customer@example.com grant
npm.cmd run access:set -- customer@example.com revoke
```

## 5. Add Vercel environment variables

In **Vercel → Project → Settings → Environment Variables**, add:

| Name | Recommended value |
| --- | --- |
| `PHOTOROOM_API_KEY` | Your server-side PhotoRoom key |
| `PHOTOROOM_SEGMENT_URL` | `https://sdk.photoroom.com/v1/segment` |
| `PHOTOROOM_FILE_FIELD` | `image_file` |
| `OPENAI_API_KEY` | Your server-side OpenAI key |
| `OPENAI_IMAGE_MODEL` | `gpt-image-2` |
| `OPENAI_IMAGE_QUALITY` | `high` |
| `OPENAI_OUTPUT_FORMAT` | `webp` |
| `OPENAI_OUTPUT_COMPRESSION` | `90` |
| `FIREBASE_PROJECT_ID` | `listing-optimization-ai` |
| `FIREBASE_CLIENT_EMAIL` | `client_email` from the service-account JSON |
| `FIREBASE_PRIVATE_KEY` | Full `private_key` from the JSON |
| `PREPARATION_PROOF_SECRET` | Dedicated random secret of at least 32 bytes; do not reuse a provider or Firebase key |
| `REQUIRE_VERIFIED_EMAIL` | `true` |
| `REQUIRE_GENERATION_ENTITLEMENT` | `true` in production; omission also fails closed; use `false` only during controlled setup testing |
| `MAX_DAILY_GENERATIONS` | `6` or your chosen per-user background limit |
| `GENERATION_COOLDOWN_SECONDS` | `5` |
| `MAX_DAILY_GLOBAL_GENERATIONS` | Hard daily project cap, for example `100` |
| `MAX_DAILY_PRODUCT_PREPARATIONS` | `10` |
| `PRODUCT_PREPARATION_COOLDOWN_SECONDS` | `3` |
| `MAX_DAILY_GLOBAL_PRODUCT_PREPARATIONS` | Hard daily project cap, for example `200` |
| `MAX_DAILY_VARIANT_GENERATIONS` | `8` or your chosen per-user variant-edit limit |
| `VARIANT_GENERATION_COOLDOWN_SECONDS` | `5` |
| `MAX_DAILY_GLOBAL_VARIANT_GENERATIONS` | Hard daily project cap, for example `100` |

For `FIREBASE_PRIVATE_KEY`, Vercel can store the multiline key directly. The API also accepts escaped `\n` characters.

Generate the proof secret once, store it only in Vercel, and use the same value for every function instance in an environment:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Missing or undersized `PREPARATION_PROOF_SECRET` fails closed before image processing. Rotating it immediately invalidates all outstanding preparation proofs, so customers with an open studio session must prepare and approve their product again.

Apply paid-provider variables only to the environments where generation should work, configure hard provider/project budgets and billing alerts, then redeploy. All three global-cap variables are required positive integers; missing or invalid values stop the corresponding paid operation instead of disabling its cap. A reserved attempt counts toward quota once image processing begins, even if the provider later rejects or the customer cancels.

`vercel.json` allows up to 300 seconds for high-quality image generation and 120 seconds for cutout preparation. Confirm the selected Vercel plan supports those limits; otherwise use a queued background job instead of reducing the timeout until requests disconnect.

## 6. Validate before launch

```powershell
npm.cmd run check
node scripts/generate-images.js --validate
```

For a local API test:

```powershell
npx.cmd vercel dev
```

Opening `dashboard.html` directly cannot execute the API endpoints.

Run a golden-product test before accepting customers:

1. Upload one sharp, front-facing product photo at 1500px or larger.
2. Generate Marketplace Main and one infographic concept.
3. Confirm that the label, logo, product color, shape, and proportions match the upload.
4. Inspect edges at 200% zoom for halos or missing transparent areas.
5. Verify every benefit and headline against the approved product claim sheet.
6. Download and confirm the final dimensions: square `2000×2000`, landscape `2000×1334`, or portrait `1334×2000`.

For the reference-gallery layouts, also test Problem / Solution with two substantiated states, Detail Callouts with up to three verified benefits, Performance Action in every allowed orientation, and Feature Collage with exactly three verified benefits. Problem / Solution and Feature Collage intentionally render as landscape. The AI generates only the object-free environmental plate; the approved product cutout, labels, callout lines, panels, numbers, and exact copy are drawn deterministically in the browser.

Also generate one variant of each type. Confirm PhotoRoom segmentation preserves green product pixels, and reject any result whose logo, label, text, components, color, or geometry changed outside the requested attribute.

## Security and privacy behavior

- OpenAI, PhotoRoom, and Firebase Admin credentials remain server-only.
- Every paid operation requires a valid Firebase ID token.
- Variant edits additionally require a non-expired preparation proof signed for the same Firebase user and exact cutout bytes.
- Firestore transactions enforce separate daily limits and cooldowns for preparation, backgrounds, and variants.
- Verified-email and optional paid-entitlement checks gate provider access; global daily caps limit damage from multiple accounts.
- Only JPG, PNG, and WebP inputs are accepted; the server validates decoded metadata and pixel limits.
- PhotoRoom receives only the selected opaque primary photo and, when variant mode is used, the resulting chroma-backed edited image; transparent originals bypass the first PhotoRoom call.
- Background generation sends no product image to OpenAI. The opt-in variant route sends only the approved cutout and sanitized controlled-edit instruction.
- Marketplace Main background generation uses no OpenAI request and retains the original approved cutout.
- The code does not persist uploaded, cutout, background, or completed image bytes.
- Server logs contain request IDs and error codes, not images, prompts, or customer copy.

Before launch, publish Terms of Use and a Privacy Policy that name the image providers, explain transmission and retention, require image rights and accurate claims, and disclose paid generation limits. Customers must review every image before marketplace publication.

## Files

- `dashboard.html` — customer workflow and provider disclosure
- `dashboard.css` — responsive studio design
- `dashboard.js` — primary-angle selection, original and variant review gates, 2000px infographic / 1600px variant-card compositing, approved copy, and downloads
- `api/prepare-product.js` — authenticated product cutout endpoint
- `api/generate-infographic.js` — authenticated product-free background endpoint
- `api/generate-variant.js` — authenticated controlled product-variant endpoint
- `api/_lib/photoroom.js` — server-only PhotoRoom adapter
- `api/_lib/firebase-admin.js` — ID-token verification and separate Firestore quotas
- `api/_lib/preparation-proof.js` — stateless user/cutout-bound HMAC proof issuance and verification
- `api/_lib/prompt.js` — constrained background prompt and 2K model sizes
- `api/_lib/variant-images.js` — decoded cutout and provider-output format, dimension, alpha, and opacity checks
- `api/_lib/variant-prompt.js` — sanitized variant validation and brand-lock/chroma prompt
- `vercel.json` — serverless duration configuration
- `firestore.rules` and `firebase.json` — deny browser access to server-owned quota documents
- `scripts/set-generation-access.js` — manual grant/revoke command for the paid-access custom claim
