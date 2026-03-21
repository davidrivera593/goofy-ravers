# goofy-ravers

React (Vite) app with Firebase Auth / Firestore / Storage initialized in `src/firebase/config.js`.

## Prereqs

- Node.js (LTS recommended)
- A Firebase project with a **Web App** created

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create your local env file:
   - Copy `.env.example` to `.env`
   - Fill in the values from: Firebase Console → Project settings → General → Your apps → Web app → SDK setup and configuration

3. Start the dev server:

   ```bash
   npm run dev
   ```

## Firebase console checks (for this repo)

This app’s `Home` page uses Email/Password auth and Google sign-in.

- Firebase Console → Authentication → Sign-in method
  - Enable **Email/Password**
  - Enable **Google** (pick a support email)

If Google sign-in fails locally, also check:

- Firebase Console → Authentication → Settings → Authorized domains
  - Ensure `localhost` is present

## Quick “is it wired up?” sanity check

- With `npm run dev` running, open the app and try:
  - Create account (Email/Password)
  - Log out
  - Continue with Google
- Confirm users appear in Firebase Console → Authentication → Users

If the Firebase env vars are missing, the app will throw a clear error at startup.
