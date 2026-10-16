# Production ecommerce infographic setup

The customer studio uses a hybrid workflow so the product itself is not redrawn by an image model:

1. A Firebase-authenticated customer uploads one to three product photos and selects the primary angle.
2. The browser resizes the primary photo before transmission.
3. `/api/prepare-product` verifies the Firebase ID token and Firestore quota.
4. A transparent upload is normalized directly; an opaque upload is sent to PhotoRoom for background removal.
5. `/api/generate-infographic` sends only the sanitized creative brief to OpenAI and requests a product-free 2K scene.
6. The customer reviews the cutout before any paid background request begins.
7. The browser composites the original transparent product, a controlled shadow, and approved copy on a 2000px Canvas.
8. Marketplace Main skips OpenAI entirely and places the original cutout on shadow-free pure white.

This separation is deliberate. PhotoRoom isolates the photographed product without generatively redrawing it, OpenAI creates only the environment, and deterministic code owns product placement, typography, claims, and final export.

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

Store the key only in Vercel as `PHOTOROOM_API_KEY`. The default adapter uses the official segmentation endpoint and sends only the selected primary product photo. If PhotoRoom changes the endpoint or multipart field for your account, override `PHOTOROOM_SEGMENT_URL` or `PHOTOROOM_FILE_FIELD` without changing browser code.

A genuinely transparent PNG/WebP bypasses PhotoRoom and is normalized locally by the server.

## 3. Configure OpenAI

Create an API key at:

https://platform.openai.com/api-keys

Image generation guidance:

https://platform.openai.com/docs/guides/image-generation

The implementation requests `gpt-image-2`, high quality, WebP delivery, and a model size near 2K. OpenAI receives category, audience, style, brand color, and verified benefits. It does **not** receive the product photo or PhotoRoom cutout.

API generation is paid usage. Never place either provider key in `firebase.js`, `dashboard.js`, HTML, GitHub, or any browser-visible file.

## 4. Configure Firebase Admin

The public Firebase configuration in `firebase.js` is not a server credential. The API additionally needs a Firebase service account:

1. Open Firebase Console.
2. Select `listing-optimization-ai`.
3. Open **Project settings → Service accounts**.
4. Choose **Generate new private key**.
5. Save the downloaded JSON outside this repository, copy only its required values into Vercel, then remove the local download when it is no longer needed.

Enable **Cloud Firestore** in Native mode. Deploy the included locked rules with `npx.cmd firebase-tools deploy --only firestore:rules`; browser clients must never read or modify `generationUsage`. Firebase Admin bypasses these rules and keeps separate per-user and global counters for product preparation and AI background generation.

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
| `REQUIRE_VERIFIED_EMAIL` | `true` |
| `REQUIRE_GENERATION_ENTITLEMENT` | `true` in production; omission also fails closed; use `false` only during controlled setup testing |
| `MAX_DAILY_GENERATIONS` | `6` or your chosen per-user background limit |
| `GENERATION_COOLDOWN_SECONDS` | `5` |
| `MAX_DAILY_GLOBAL_GENERATIONS` | Hard daily project cap, for example `100` |
| `MAX_DAILY_PRODUCT_PREPARATIONS` | `10` |
| `PRODUCT_PREPARATION_COOLDOWN_SECONDS` | `3` |
| `MAX_DAILY_GLOBAL_PRODUCT_PREPARATIONS` | Hard daily project cap, for example `200` |

For `FIREBASE_PRIVATE_KEY`, Vercel can store the multiline key directly. The API also accepts escaped `\n` characters.

Apply paid-provider variables only to the environments where generation should work, configure hard provider/project budgets and billing alerts, then redeploy. Both global-cap variables are required positive integers; missing or invalid values stop paid operations instead of disabling the cap. A reserved attempt counts toward quota once image processing begins, even if the provider later rejects or the customer cancels.

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

## Security and privacy behavior

- OpenAI, PhotoRoom, and Firebase Admin credentials remain server-only.
- Every paid operation requires a valid Firebase ID token.
- Firestore transactions enforce separate daily limits and cooldowns.
- Verified-email and optional paid-entitlement checks gate provider access; global daily caps limit damage from multiple accounts.
- Only JPG, PNG, and WebP inputs are accepted; the server validates decoded metadata and pixel limits.
- Only the selected primary photo is sent to PhotoRoom.
- OpenAI receives no product image, which prevents model-driven label or packaging changes.
- Marketplace Main uses no OpenAI request.
- The code does not persist uploaded, cutout, background, or completed image bytes.
- Server logs contain request IDs and error codes, not images, prompts, or customer copy.

Before launch, publish Terms of Use and a Privacy Policy that name the image providers, explain transmission and retention, require image rights and accurate claims, and disclose paid generation limits. Customers must review every image before marketplace publication.

## Files

- `dashboard.html` — customer workflow and provider disclosure
- `dashboard.css` — responsive studio design
- `dashboard.js` — primary-angle selection, cutout approval, compression, 2000px compositing, approved copy, and downloads
- `api/prepare-product.js` — authenticated product cutout endpoint
- `api/generate-infographic.js` — authenticated product-free background endpoint
- `api/_lib/photoroom.js` — server-only PhotoRoom adapter
- `api/_lib/firebase-admin.js` — ID-token verification and separate Firestore quotas
- `api/_lib/prompt.js` — constrained background prompt and 2K model sizes
- `vercel.json` — serverless duration configuration
- `firestore.rules` and `firebase.json` — deny browser access to server-owned quota documents
- `scripts/set-generation-access.js` — manual grant/revoke command for the paid-access custom claim
