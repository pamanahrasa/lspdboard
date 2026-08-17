/**
 * auth.js
 * ---------------------------------------------------------------------------
 * Thin wrapper around Firebase Authentication for the Admin login gate.
 * There is deliberately no sign-up flow anywhere in the app - the one
 * Command Staff account is created once via the Firebase Console (see
 * README.md), matching the single-admin philosophy of this project. This
 * module only ever signs an already-existing user IN or OUT.
 * ---------------------------------------------------------------------------
 */

import {
    getAuth, signInWithEmailAndPassword, signOut as firebaseSignOut, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js';
import { app, isConfigured } from './firebase-init.js';

const auth = isConfigured ? getAuth(app) : null;

/** Friendly text for Firebase Auth error codes, since the raw codes are cryptic. */
function friendlyAuthError(err) {
    const code = err && err.code;
    switch (code) {
        case 'auth/invalid-email': return 'That email address doesn\'t look valid.';
        case 'auth/user-not-found':
        case 'auth/invalid-credential':
        case 'auth/wrong-password': return 'Incorrect email or password.';
        case 'auth/too-many-requests': return 'Too many attempts - please wait a moment and try again.';
        case 'auth/network-request-failed': return 'Network error - check your internet connection.';
        default: return (err && err.message) || 'Sign-in failed. Please try again.';
    }
}

/** Resolves with the signed-in user, or throws with a friendly message. */
export async function signIn(email, password) {
    if (!isConfigured) throw new Error('Firebase is not configured yet - see README.md.');
    try {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        return cred.user;
    } catch (err) {
        throw new Error(friendlyAuthError(err));
    }
}

export async function signOutAdmin() {
    if (!isConfigured) return;
    await firebaseSignOut(auth);
}

/** Calls `callback(user)` immediately and again on every future sign-in/out. */
export function watchAuthState(callback) {
    if (!isConfigured) { callback(null); return () => {}; }
    return onAuthStateChanged(auth, callback);
}

export function getCurrentUser() {
    return isConfigured ? auth.currentUser : null;
}

export { isConfigured };
