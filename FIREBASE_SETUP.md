# Firebase Authentication Setup Guide

## Step 1: Create Firebase Project
1. Go to https://console.firebase.google.com
2. Click "Add project"
3. Enter project name: `listing-optimization-ai`
4. Disable Google Analytics (optional for auth only)
5. Click "Create project"

## Step 2: Enable Authentication
1. In Firebase Console, go to **Build → Authentication**
2. Click "Get started"
3. Go to **Sign-in method** tab
4. Enable **Email/Password**:
   - Click on "Email/Password"
   - Toggle "Enable"
   - Click "Save"
5. Enable **Google**:
   - Click on "Google"
   - Toggle "Enable"
   - Select a support email from the dropdown
   - Click "Save"
6. Open **Settings → Authorized domains** and add your Vercel production domain, custom domains, and local test domain.

## Step 3: Get Firebase Config
1. Go to **Project Settings** (gear icon)
2. Scroll down to "Your apps" section
3. Click "Add app" → Select "</>" (web)
4. Register app with name: `listing-optimization-ai-web`
5. Copy the firebaseConfig object
6. Replace the config in `firebase.js` with your values

Example config:
```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "listing-optimization-ai.firebaseapp.com",
  projectId: "listing-optimization-ai",
  storageBucket: "listing-optimization-ai.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

## Step 4: Lock Firestore

The quota collection is server-owned. Deploy the included deny-by-default rules:

```powershell
npx.cmd firebase-tools login
npx.cmd firebase-tools deploy --only firestore:rules --project listing-optimization-ai
```

Do not use Firestore test-mode rules in production.

## Step 5: Deploy and Test

1. Keep service-account JSON files outside the repository; `.gitignore` also blocks common credential filenames.
2. Stage only reviewed files, for example: `git add firebase.js firebase.json firestore.rules login.html signup.html dashboard.html`.
3. Commit and push to GitHub; deploy this full project to Vercel because the generator requires `/api` serverless functions.
4. Add the Vercel/custom domain under Firebase Auth **Authorized domains**.
5. Visit `/signup.html`, create an email account, follow the verification email, then test login and logout.
6. Test Google sign-in and confirm an unverified account cannot call paid APIs.

## Files Created
- `firebase.js` - Firebase configuration and auth helpers
- `login.html` - Login page with email/password and Google sign-in
- `signup.html` - Signup page with email/password and Google sign-in
- `dashboard.html` - Protected dashboard page

## Features Implemented
- Email/password signup
- Email/password login
- Google sign-in
- Protected dashboard (redirects to login if not authenticated)
- Logout functionality
- Session persistence
- Email verification before paid generation
- Error handling with user-friendly messages
- Manual generation-access provisioning with `npm.cmd run access:set -- <email-or-uid> grant`

## Next Steps
- Update navigation links in `index.html` (already done)
- Customize auth UI to match your brand
- Add password reset functionality
- Automate the same `generationAccess` custom claim from your billing webhook after validating the manual provisioning flow
