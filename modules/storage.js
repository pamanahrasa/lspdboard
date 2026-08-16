/**
 * storage.js
 * ---------------------------------------------------------------------------
 * StorageService — the ONLY module allowed to touch LocalStorage directly.
 * Every other module (dashboard, leave, timeline, calendar, statistics,
 * archive, report, ui) reads and writes leave data exclusively through the
 * functions exported here.
 *
 * Why this shape:
 *   Version 1 ships with a LocalStorage-backed implementation, but the
 *   PROJECT is designed so a future StorageService (Firebase / Supabase /
 *   REST API / Forum Scraper) can be dropped in without touching any
 *   Dashboard, Timeline, Calendar, Statistics, Search or Filter code -
 *   as long as it exposes the same async-shaped API below.
 *
 * Change notifications:
 *   Any write dispatches a `lspd:data-changed` CustomEvent on `document`.
 *   UI modules subscribe to that instead of polling LocalStorage.
 * ---------------------------------------------------------------------------
 */

import { uid } from './utils.js';

const DB_KEY = 'lspd_leave_dashboard_db_v1';
const SEED_URL = new URL('../data/sample-data.json', import.meta.url);
const SCHEMA_VERSION = 1;

function emptyDb() {
    return {
        version: SCHEMA_VERSION,
        records: [],
        settings: {
            theme: 'dark',
            totalRoster: 60,
            graceDays: 2
        },
        meta: {
            lastModified: new Date().toISOString(),
            seeded: false
        }
    };
}

let cache = null;

function load() {
    if (cache) return cache;
    try {
        const raw = localStorage.getItem(DB_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            cache = { ...emptyDb(), ...parsed, settings: { ...emptyDb().settings, ...(parsed.settings || {}) } };
            return cache;
        }
    } catch (e) {
        console.error('[StorageService] Failed to read LocalStorage, starting fresh.', e);
    }
    cache = emptyDb();
    return cache;
}

function persist() {
    cache.meta.lastModified = new Date().toISOString();
    try {
        localStorage.setItem(DB_KEY, JSON.stringify(cache));
    } catch (e) {
        console.error('[StorageService] Failed to write LocalStorage (quota exceeded?).', e);
        document.dispatchEvent(new CustomEvent('lspd:storage-error', { detail: { error: e } }));
        return false;
    }
    document.dispatchEvent(new CustomEvent('lspd:data-changed', { detail: { db: cache } }));
    return true;
}

/**
 * Must be called once on page load before any other StorageService method.
 * Seeds LocalStorage from data/sample-data.json on first run only (never
 * overwrites existing admin data). Safe to call multiple times.
 */
async function init() {
    load();
    if (cache.records.length === 0 && !cache.meta.seeded) {
        try {
            const res = await fetch(SEED_URL);
            if (res.ok) {
                const seed = await res.json();
                if (Array.isArray(seed) && seed.length) {
                    cache.records = seed;
                }
            }
        } catch (e) {
            // Expected when opened directly via file:// (fetch is blocked by CORS).
            // Not fatal: the dashboard still works, and data/sample-data.json can
            // be loaded manually via Reports > Import JSON.
            console.warn('[StorageService] Could not auto-seed sample data (likely running from file://). Use Import JSON in Reports to load data/sample-data.json manually.', e);
        }
        cache.meta.seeded = true;
        persist();
    }
    return cache;
}

// ---------------------------------------------------------------------------
// Records CRUD
// ---------------------------------------------------------------------------

function getAll() {
    return [...load().records];
}

function getById(id) {
    return load().records.find(r => r.id === id) || null;
}

function add(record) {
    const db = load();
    const now = new Date().toISOString();
    const full = { id: uid(), createdAt: now, updatedAt: now, ...record };
    db.records.push(full);
    persist();
    return full;
}

function update(id, changes) {
    const db = load();
    const idx = db.records.findIndex(r => r.id === id);
    if (idx === -1) return null;
    db.records[idx] = { ...db.records[idx], ...changes, id, updatedAt: new Date().toISOString() };
    persist();
    return db.records[idx];
}

function remove(id) {
    const db = load();
    const before = db.records.length;
    db.records = db.records.filter(r => r.id !== id);
    persist();
    return db.records.length < before;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function getSettings() {
    return { ...load().settings };
}

function updateSettings(changes) {
    const db = load();
    db.settings = { ...db.settings, ...changes };
    persist();
    return db.settings;
}

// ---------------------------------------------------------------------------
// Backup / Restore / Export / Import / Reset
// ---------------------------------------------------------------------------

function exportJSON() {
    const db = load();
    return JSON.stringify({
        version: db.version,
        exportedAt: new Date().toISOString(),
        records: db.records,
        settings: db.settings
    }, null, 2);
}

/**
 * Replaces the current database with the contents of a previously exported
 * JSON string. Accepts either the full export shape ({records, settings})
 * or a bare array of records (e.g. data/sample-data.json itself, so that
 * file can always be loaded via Reports > Import as a fallback when
 * fetch()-based auto-seeding is blocked by file:// CORS). Throws on
 * malformed input so the caller can show an error instead of silently
 * corrupting the database.
 */
function importJSON(jsonString) {
    let parsed;
    try {
        parsed = JSON.parse(jsonString);
    } catch (e) {
        throw new Error('File is not valid JSON.');
    }
    const records = Array.isArray(parsed) ? parsed : parsed && parsed.records;
    if (!Array.isArray(records)) {
        throw new Error('File does not look like an LSPD Leave Dashboard export (expected a "records" array).');
    }
    const settings = Array.isArray(parsed) ? {} : (parsed.settings || {});
    cache = {
        ...emptyDb(),
        version: SCHEMA_VERSION,
        records,
        settings: { ...emptyDb().settings, ...settings },
        meta: { lastModified: new Date().toISOString(), seeded: true }
    };
    persist();
    return cache;
}

function resetDatabase() {
    cache = emptyDb();
    cache.meta.seeded = true; // prevent immediate re-seed; admin can re-import sample data manually
    persist();
    return cache;
}

function recordCount() {
    return load().records.length;
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
