/**
 * firebase-init.js
 * ---------------------------------------------------------------------------
 * Initializes the Firebase app exactly once and shares it between storage.js
 * (Firestore) and auth.js (Authentication) - Firebase only wants
 * initializeApp() called a single time per config.
 *
 * Also detects whether firebase-config.js still has its placeholder values
 * (a fresh, un-configured copy of this project) so the rest of the app can
 * show a clear "Setup Required" screen instead of a confusing Firebase
 * error in the console.
 * ---------------------------------------------------------------------------
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js';
import { firebaseConfig } from './firebase-config.js';

export const isConfigured = Object.values(firebaseConfig).every(v => typeof v === 'string' && !v.includes('PASTE_YOUR'));

export const app = isConfigured ? initializeApp(firebaseConfig) : null;
