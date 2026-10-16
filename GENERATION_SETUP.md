# Customer infographic generator setup

The dashboard now implements this production flow:

1. Firebase-authenticated customer uploads one to three product photos.
2. The browser resizes and compresses those photos before transmission.
3. A Vercel serverless function verifies the Firebase ID token and checks the user's Firestore quota.
4. The server sends the product references and a controlled, no-text composition prompt to the image-edit model.
5. The browser adds the customer's exact approved headline and benefits with Canvas typography.
6. The customer reviews and downloads the final JPG files.

This split is deliberate: the image model handles product-aware scenes, while deterministic code renders exact copy without misspellings.

## 1. Install dependencies

```powershell
cd "C:\Users\aashu\OneDrive\Desktop\httpslistingoptimization.ai"
npm install
```

## 2. Configure OpenAI

Create an API key at:

https://platform.openai.com/api-keys

The implementation uses the Images edit endpoint. Current official guidance is available at:

https://platform.openai.com/docs/guides/image-generation

API generation is paid usage. Do not place the key in `firebase.js`, `dashboard.js`, HTML, or any committed file.

## 3. Configure Firebase Admin

The public Firebase browser configuration in `firebase.js` is not a server credential. The API additionally needs a Firebase service account:

1. Open Firebase Console.
2. Select `listing-optimization-ai`.
3. Open **Project settings → Service accounts**.
4. Choose **Generate new private key**.
5. Keep the downloaded JSON private and copy only its required values into Vercel environment variables.

Enable **Cloud Firestore** in Native mode for the same project. The API creates a `generationUsage` collection automatically to enforce daily quotas and cooldowns.

## 4. Add Vercel environment variables

In Vercel open **Project → Settings → Environment Variables** and add:

| Name | Value |
| --- | --- |
| `OPENAI_API_KEY` | Your server-side OpenAI API key |
| `OPENAI_IMAGE_MODEL` | `gpt-image-2` |
| `OPENAI_IMAGE_QUALITY` | `high` |
| `FIREBASE_PROJECT_ID` | `listing-optimization-ai` |
| `FIREBASE_CLIENT_EMAIL` | `client_email` from the service-account JSON |
| `FIREBASE_PRIVATE_KEY` | Full `private_key` from the JSON |
| `MAX_DAILY_GENERATIONS` | `6` or your preferred per-user daily limit |
| `GENERATION_COOLDOWN_SECONDS` | `5` |

For `FIREBASE_PRIVATE_KEY`, Vercel can store the multiline key directly. The API also accepts escaped `\n` characters.

Apply variables to Production, Preview, and Development only where you intend paid generation to work. Then redeploy the latest commit.

## 5. Validate before deployment

```powershell
npm run check
node scripts/generate-images.js --validate
```

For a complete local API test, install the Vercel CLI and run:

```powershell
npx vercel dev
```

Opening `dashboard.html` directly cannot execute `/api/generate-infographic`; use `vercel dev` or a deployed Vercel preview.

## Security and privacy behavior

- OpenAI and Firebase service-account credentials remain server-only.
- Every generation request requires a valid Firebase ID token.
- Firestore transactions enforce daily limits and a cooldown per user.
- Only JPG, PNG, and WebP inputs are accepted.
- The browser sends at most three compressed references.
- The server validates payload size, decodes images, checks actual image metadata, and normalizes them before provider upload.
- Each selected concept is one paid generation and counts separately against the daily limit.
- This implementation does not persist uploaded or generated image bytes. The customer must download finished results before leaving the page.
- Server logs contain request IDs and error codes, not product images or customer copy.

`gpt-image-2` uses high-fidelity image inputs automatically. Even so, generative edits cannot guarantee pixel-identical packaging or label text. Require customer review before publishing; for label-critical products, start with a sharp, front-facing photo on a plain background.

Before accepting real customers, publish Terms of Use and a Privacy Policy describing the image provider, retention expectations, prohibited content, ownership requirements, and API usage charges.

## Files

- `dashboard.html` — generator interface
- `dashboard.css` — responsive studio design
- `dashboard.js` — upload compression, validation, progress, exact text overlays, result downloads
- `api/generate-infographic.js` — authenticated image-edit endpoint
- `api/_lib/firebase-admin.js` — ID-token verification and Firestore quota
- `api/_lib/prompt.js` — constrained composition prompt builder
- `vercel.json` — serverless duration configuration
