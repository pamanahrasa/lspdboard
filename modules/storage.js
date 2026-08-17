/**
 * storage.js
 * ---------------------------------------------------------------------------
 * StorageService - now backed by Cloud Firestore instead of LocalStorage, so
 * every admin change is visible to everyone viewing the Public Dashboard on
 * any device, in real time. This is the ONLY module that talks to Firestore
 * directly; every other module still goes through the same functions as
 * before (getAll / add / update / remove / getSettings / updateSettings /
 * exportJSON / importJSON / resetDatabase) - which is exactly why swapping
 * the backend didn't require touching Dashboard, Timeline, Calendar,
 * Statistics or Archive at all.
 *
 * How live updates work:
 *   Firestore's onSnapshot() keeps a local in-memory cache fresh - the
 *   moment ANY device writes a change, Firestore pushes the update to every
 *   other open tab/device, this module updates its cache, and dispatches
 *   the same `lspd:data-changed` event the rest of the app already listens
 *   for. No polling, no manual refresh.
 *
 * Reads (getAll/getById/getSettings/recordCount) stay synchronous, served
 * from that cache. Writes (add/update/remove/updateSettings/importJSON/
 * resetDatabase) are now async - callers must await them and handle
 * rejection (e.g. not signed in, or offline).
 *
 * Theme is deliberately NOT stored in Firestore - it's a per-device display
 * preference, not shared operational data, so it stays in localStorage only
 * (see ui.js). getSettings() still returns a `theme` field for convenience.
 * ---------------------------------------------------------------------------
 */

import {
    getFirestore, collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc,
    setDoc, getDocs, writeBatch
} from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js';
import { app, isConfigured } from './firebase-init.js';

export { isConfigured };

const THEME_KEY = 'lspd_theme';
const DEFAULT_SETTINGS = { totalRoster: 60, graceDays: 2 };
const WRITE_BATCH_CHUNK = 400; // stays comfortably under Firestore's 500-op batch limit

const db = isConfigured ? getFirestore(app) : null;
const recordsCol = isConfigured ? collection(db, 'leaveRecords') : null;
const settingsRef = isConfigured ? doc(db, 'settings', 'app') : null;

let cachedRecords = [];
let cachedSettings = { ...DEFAULT_SETTINGS };
let unsubscribeRecords = null;
let unsubscribeSettings = null;

function currentSettingsWithTheme() {
    return { ...cachedSettings, theme: localStorage.getItem(THEME_KEY) || 'dark' };
}

function notifyChanged() {
    document.dispatchEvent(new CustomEvent('lspd:data-changed'));
}

function notifyError(error, context) {
    console.error(`[StorageService] ${context}:`, error);
    document.dispatchEvent(new CustomEvent('lspd:storage-error', { detail: { error, context } }));
}

/**
 * Must be called once on page load before any other StorageService method.
 * Resolves once the first snapshot of both records and settings has
 * arrived (or immediately if Firebase isn't configured yet), so callers can
 * safely render right after awaiting this instead of seeing a flash of
 * empty data.
 */
function init() {
    if (!isConfigured) return Promise.resolve();

    return new Promise((resolve) => {
        let recordsReady = false, settingsReady = false, resolved = false;
        const maybeResolve = () => {
            if (recordsReady && settingsReady && !resolved) { resolved = true; resolve(); }
        };

        unsubscribeRecords = onSnapshot(recordsCol, (snapshot) => {
            cachedRecords = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            recordsReady = true;
            maybeResolve();
            if (resolved) notifyChanged();
        }, (error) => { recordsReady = true; maybeResolve(); notifyError(error, 'listening to leave records'); });

        unsubscribeSettings = onSnapshot(settingsRef, (snap) => {
            cachedSettings = { ...DEFAULT_SETTINGS, ...(snap.exists() ? snap.data() : {}) };
            settingsReady = true;
            maybeResolve();
            if (resolved) notifyChanged();
        }, (error) => { settingsReady = true; maybeResolve(); notifyError(error, 'listening to settings'); });
    });
}

// ---------------------------------------------------------------------------
// Records - reads (synchronous, from cache)
// ---------------------------------------------------------------------------

function getAll() {
    return [...cachedRecords];
}

function getById(id) {
    return cachedRecords.find(r => r.id === id) || null;
}

function recordCount() {
    return cachedRecords.length;
}

// ---------------------------------------------------------------------------
// Records - writes (async, go straight to Firestore; the cache updates
// itself via the onSnapshot listener above once the write round-trips)
// ---------------------------------------------------------------------------

async function add(record) {
    requireConfigured();
    const now = new Date().toISOString();
    const docRef = await addDoc(recordsCol, { ...record, createdAt: now, updatedAt: now });
    return { id: docRef.id, ...record, createdAt: now, updatedAt: now };
}

async function update(id, changes) {
    requireConfigured();
    await updateDoc(doc(db, 'leaveRecords', id), { ...changes, updatedAt: new Date().toISOString() });
    return getById(id);
}

async function remove(id) {
    requireConfigured();
    await deleteDoc(doc(db, 'leaveRecords', id));
    return true;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function getSettings() {
    return currentSettingsWithTheme();
}

async function updateSettings(changes) {
    const rest = { ...changes };
    if ('theme' in rest) {
        localStorage.setItem(THEME_KEY, rest.theme);
        delete rest.theme;
    }
    if (Object.keys(rest).length) {
        requireConfigured();
        await setDoc(settingsRef, rest, { merge: true });
    }
    return currentSettingsWithTheme();
}

// ---------------------------------------------------------------------------
// Export / Import / Reset
// ---------------------------------------------------------------------------

function exportJSON() {
    return JSON.stringify({
        version: 1,
        exportedAt: new Date().toISOString(),
        records: cachedRecords,
        settings: cachedSettings // theme intentionally excluded - it's per-device
    }, null, 2);
}

async function batchDeleteAll() {
    const snap = await getDocs(recordsCol);
    const ids = snap.docs.map(d => d.id);
    for (let i = 0; i < ids.length; i += WRITE_BATCH_CHUNK) {
        const batch = writeBatch(db);
        ids.slice(i, i + WRITE_BATCH_CHUNK).forEach(id => batch.delete(doc(db, 'leaveRecords', id)));
        await batch.commit();
    }
}

/**
 * Replaces the ENTIRE shared database with the contents of a previously
 * exported JSON string - this affects every device viewing the dashboard,
 * not just this browser. Accepts either the full export shape
 * ({records, settings}) or a bare array (e.g. data/sample-data.json, so
 * that file can be loaded straight from Reports > Import). Throws on
 * malformed input or if Firebase isn't configured yet.
 */
async function importJSON(jsonString) {
    requireConfigured();
    let parsed;
    try {
        parsed = JSON.parse(jsonString);
    } catch (e) {
        throw new Error('File is not valid JSON.');
    }
    const records = Array.isArray(parsed) ? parsed : parsed && parsed.records;
    if (!Array.isArray(records)) {
        throw new Error('File does not look like an LSPD Notice Board export (expected a "records" array).');
    }
    const settings = Array.isArray(parsed) ? {} : (parsed.settings || {});

    await batchDeleteAll();

    const now = new Date().toISOString();
    for (let i = 0; i < records.length; i += WRITE_BATCH_CHUNK) {
        const batch = writeBatch(db);
        records.slice(i, i + WRITE_BATCH_CHUNK).forEach(r => {
            const { id, ...rest } = r; // never trust an imported id - let Firestore assign one
            batch.set(doc(recordsCol), { ...rest, createdAt: rest.createdAt || now, updatedAt: now });
        });
        await batch.commit();
    }

    if (Object.keys(settings).length) await updateSettings(settings);
}

/** Permanently deletes every leave record from the shared database (settings are kept). */
async function resetDatabase() {
    requireConfigured();
    await batchDeleteAll();
}

function requireConfigured() {
    if (!isConfigured) throw new Error('Firebase is not configured yet - see README.md to connect your project.');
}

export const StorageService = {
    init,
    getAll,
    getById,
    add,
    update,
    remove,
    getSettings,
    updateSettings,
    exportJSON,
    importJSON,
    resetDatabase,
    recordCount
};
