// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyBvCqn4qvBjsKo5Y5MFuxhhpWaMhG3K0Bs",
  authDomain: "listing-optimization-ai.firebaseapp.com",
  projectId: "listing-optimization-ai",
  storageBucket: "listing-optimization-ai.firebasestorage.app",
  messagingSenderId: "862327013170",
  appId: "1:862327013170:web:d2ab455a2a431c025ae12b",
  measurementId: "G-46XGQ4SMCG"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Auth helpers
const Auth = {
  // Sign up with email and password
  async signup(email, password, name) {
    try {
      const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
      await userCredential.user.updateProfile({ displayName: name });
      await userCredential.user.sendEmailVerification();
      await firebase.auth().signOut();
      return { success: true, verificationRequired: true };
    } catch (error) {
      try { await firebase.auth().signOut(); } catch { /* No active session to clear. */ }
      return { success: false, error: error.message };
    }
  },

  // Login with email and password
  async login(email, password) {
    try {
      const userCredential = await firebase.auth().signInWithEmailAndPassword(email, password);
      const usesPassword = userCredential.user.providerData.some((provider) => provider.providerId === 'password');
      if (usesPassword && !userCredential.user.emailVerified) {
        try { await userCredential.user.sendEmailVerification(); } catch { /* Firebase may rate-limit repeat emails. */ }
        await firebase.auth().signOut();
        return { success: false, error: 'Verify your email before signing in. We sent a new link when allowed.' };
      }
      return { success: true, user: userCredential.user };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Google Sign In
  async signInWithGoogle() {
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      const userCredential = await firebase.auth().signInWithPopup(provider);
      return { success: true, user: userCredential.user };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Logout
  async logout() {
    try {
      await firebase.auth().signOut();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Check if user is logged in
  isLoggedIn() {
    return firebase.auth().currentUser !== null;
  },

  // Get current user
  getUser() {
    const user = firebase.auth().currentUser;
    if (user) {
      return {
        uid: user.uid,
        email: user.email,
        name: user.displayName || user.email.split('@')[0]
      };
    }
    return null;
  },

  // Listen for auth state changes
  onAuthStateChanged(callback) {
    return firebase.auth().onAuthStateChanged(callback);
  }
};

// Make Auth globally available
window.Auth = Auth;
