/**
 * utils.js
 * ---------------------------------------------------------------------------
 * Pure, dependency-free helpers shared across the app: domain constants,
 * date math, leave-status calculation, formatting and small generic utils.
 * Nothing in this file touches the DOM or LocalStorage.
 * ---------------------------------------------------------------------------
 */

// ============================================================================
// DOMAIN CONSTANTS
// ============================================================================

export const RANK_GROUPS = {
    'NCO': ['Rookie', 'Police Officer II', 'Police Officer III'],
    'Supervisor': ['Sergeant I', 'Sergeant II'],
    'Command': ['Lieutenant', 'Captain', 'Commander'],
    'High Command': ['Deputy Chief', 'Assistant Chief', 'Chief of Police'],
    'Detective': ['Detective I', 'Detective II', 'Detective III']
};

export const ALL_RANKS = Object.values(RANK_GROUPS).flat();

export function rankGroupOf(rank) {
    for (const [group, ranks] of Object.entries(RANK_GROUPS)) {
        if (ranks.includes(rank)) return group;
    }
    return 'Unknown';
}

export const STATIONS = [
    'Station 71 (Alta)',
    'Station 72 (MRPD)',
    'Station 74 (Detective)'
];

export const DIVISIONS = [
    'Basic Unit (Patrol)', 'SWAT', 'ASD', 'SRT', 'OSS', 'IA', 'PA', 'RED', 'Detective'
];

export const LEAVE_TYPES = ['Sick Leave', 'Leave of Absence', 'Vacation / Annual Leave'];

// Core, mutually-exclusive lifecycle statuses (see calculateStatus below).
export const STATUS = {
    UPCOMING: 'Upcoming',
    ACTIVE: 'Active',
    RETURNING_TODAY: 'Returning Today',
    FINISHED: 'Finished',
    OVERDUE: 'Overdue'
};

export const STATUS_LIST = [STATUS.UPCOMING, STATUS.ACTIVE, STATUS.RETURNING_TODAY, STATUS.FINISHED, STATUS.OVERDUE];

// Tailwind class fragments keyed by status - text / bg-soft / dot, all theme-aware
// because they resolve through the CSS custom properties defined in style.css.
export const STATUS_STYLES = {
    [STATUS.UPCOMING]: { text: 'text-status-upcoming', bg: 'bg-status-upcoming/15', dot: 'bg-status-upcoming', border: 'border-status-upcoming/40', emoji: '🟡' },
    [STATUS.ACTIVE]: { text: 'text-status-active', bg: 'bg-status-active/15', dot: 'bg-status-active', border: 'border-status-active/40', emoji: '🟢' },
    [STATUS.RETURNING_TODAY]: { text: 'text-status-returning', bg: 'bg-status-returning/15', dot: 'bg-status-returning', border: 'border-status-returning/40', emoji: '🔵' },
    [STATUS.FINISHED]: { text: 'text-status-finished', bg: 'bg-status-finished/15', dot: 'bg-status-finished', border: 'border-status-finished/40', emoji: '⚫' },
    [STATUS.OVERDUE]: { text: 'text-status-overdue', bg: 'bg-status-overdue/15', dot: 'bg-status-overdue', border: 'border-status-overdue/40', emoji: '🔴' }
};

// Days after Leave End Date that a record is still considered "Finished"
// (freshly closed out) before it flips to "Overdue" and needs Command follow-up.
// A record becomes archived automatically once it reaches FINISHED or later.
export const DEFAULT_GRACE_DAYS = 2;

// ============================================================================
// DATE HELPERS  (all dates are handled as local-midnight YYYY-MM-DD strings)
// ============================================================================

/** Today as a YYYY-MM-DD string, local time. */
export function todayISO() {
    return toISODate(new Date());
}

/** Convert a Date object to a YYYY-MM-DD string using local time (no UTC drift). */
export function toISODate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/** Parse a YYYY-MM-DD string into a local-midnight Date object. */
export function parseISODate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
}

/** Whole-day difference (b - a) for two YYYY-MM-DD strings. */
export function daysBetween(isoA, isoB) {
    const a = parseISODate(isoA);
    const b = parseISODate(isoB);
    return Math.round((b - a) / 86400000);
}

/** Add N days (can be negative) to a YYYY-MM-DD string, returns YYYY-MM-DD. */
export function addDays(iso, n) {
    const d = parseISODate(iso);
    d.setDate(d.getDate() + n);
    return toISODate(d);
}

/** Human readable date, e.g. "21 Jul 2026". */
export function formatDate(iso) {
    if (!iso) return '-';
    const d = parseISODate(iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Short readable date without year, e.g. "21 Jul". */
export function formatDateShort(iso) {
    const d = parseISODate(iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

export function formatDateTime(iso) {
    const d = new Date(iso);
    return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function monthLabel(year, monthIndex) {
    return new Date(year, monthIndex, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// ============================================================================
// LEAVE STATUS / DURATION LOGIC
// ============================================================================

/**
 * Compute the full lifecycle picture of a leave record relative to "today".
 * Convention: startDate/endDate are inclusive leave days; the officer is
 * expected back on duty the day AFTER endDate.
 *
 *   today < start                              -> Upcoming
 *   start <= today <= end                       -> Active
 *   today == end + 1  (first day back)           -> Returning Today
 *   end+1 < today <= end+1+graceDays             -> Overdue    (needs follow-up)
 *   today  > end+1+graceDays                     -> Finished   (auto-archived, stays Finished)
 *
 * Overdue is deliberately a short, bounded window right after the expected
 * return day (Command should notice a no-show quickly). Because there is no
 * separate "mark as returned" action in this app (everything is computed
 * live from dates, per the brief), Overdue MUST eventually settle into a
 * permanent Finished/archived state rather than flagging every old record
 * forever - so Finished, not Overdue, is the open-ended branch below.
 */
export function calculateStatus(startDate, endDate, today = todayISO(), graceDays = DEFAULT_GRACE_DAYS) {
    const duration = daysBetween(startDate, endDate) + 1;
    const returnDate = addDays(endDate, 1);
    const daysPastReturn = daysBetween(returnDate, today); // 0 on return day, negative before

    let status;
    if (daysBetween(today, startDate) > 0) {
        status = STATUS.UPCOMING;
    } else if (daysBetween(today, endDate) >= 0) {
        status = STATUS.ACTIVE;
    } else if (daysPastReturn === 0) {
        status = STATUS.RETURNING_TODAY;
    } else if (daysPastReturn <= graceDays) {
        status = STATUS.OVERDUE;
    } else {
        status = STATUS.FINISHED;
    }

    const remainingDays = status === STATUS.ACTIVE ? daysBetween(today, endDate)
        : status === STATUS.UPCOMING ? daysBetween(today, startDate)
        : 0;

    return {
        status,
        duration,
        remainingDays,
        returnDate,
        isReturningTomorrow: status === STATUS.ACTIVE && daysBetween(today, endDate) === 0,
        isStartingTomorrow: status === STATUS.UPCOMING && daysBetween(today, startDate) === 1,
        daysPastReturn: Math.max(0, daysPastReturn)
    };
}

export function calculateDuration(startDate, endDate) {
    return daysBetween(startDate, endDate) + 1;
}

/**
 * Maps raw stored records into records enriched with their live-computed
 * status/duration/remainingDays. This is the single source of truth every
 * view (dashboard, leave table, timeline, calendar, statistics, archive)
 * should render from, so status is never out of sync between screens.
 */
export function withComputedFields(records, today = todayISO(), graceDays = DEFAULT_GRACE_DAYS) {
    return records.map(r => ({ ...r, ...calculateStatus(r.startDate, r.endDate, today, graceDays) }));
}

// ============================================================================
// GENERIC UTILS
// ============================================================================

export function uid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

export function debounce(fn, wait = 200) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), wait);
    };
}

export function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/** Deterministic color index (0-7) derived from a name, for avatar chips. */
export function nameHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

export function initials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Convert an array of flat objects into a downloadable CSV string. */
export function arrayToCSV(rows, columns) {
    const escape = (v) => {
        const s = v === null || v === undefined ? '' : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = columns.map(c => escape(c.label)).join(',');
    const lines = rows.map(row => columns.map(c => escape(row[c.key])).join(','));
    return [header, ...lines].join('\r\n');
}

export function downloadFile(filename, content, mime = 'application/json') {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

export function readCssVar(name) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v ? `rgb(${v})` : null;
}
