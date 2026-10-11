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

## Step 4: Deploy and Test
1. Push changes to GitHub: `git add . && git commit -m "Add Firebase auth" && git push`
2. Vercel/Netlify will auto-deploy
3. Visit `/login.html` or `/signup.html`
4. Test signup, login, and logout

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
- Error handling with user-friendly messages

## Next Steps
- Update navigation links in `index.html` (already done)
- Add Firebase Hosting for better performance
- Customize auth UI to match your brand
- Add password reset functionality
- Add email verification
