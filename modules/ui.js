/**
 * ui.js
 * ---------------------------------------------------------------------------
 * Shared, reusable UI primitives with no business logic: toasts, modal,
 * confirm dialog, theme switching, mobile sidebar drawer, the live clock,
 * status badges/avatars, and a generic filter bar builder.
 * ---------------------------------------------------------------------------
 */

import { StorageService } from './storage.js';
import { STATUS_STYLES, initials, nameHash, escapeHtml } from './utils.js';

// ============================================================================
// TOAST
// ============================================================================

let toastTimer = null;
export function toast(message, type = 'gold') {
    let el = document.getElementById('toast');
    if (!el) {
        el = document.createElement('div');
        el.id = 'toast';
        document.body.appendChild(el);
    }
    const palette = {
        gold: 'bg-lspd-gold text-lspd-navy',
        success: 'bg-status-active text-white',
        error: 'bg-status-overdue text-white',
        info: 'bg-lspd-card text-lspd-text'
    };
    el.className = `${palette[type] || palette.gold}`;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

// ============================================================================
// MODAL
// ============================================================================

function ensureModalRoot() {
    let root = document.getElementById('modal-root');
    if (!root) {
        root = document.createElement('div');
        root.id = 'modal-root';
        document.body.appendChild(root);
    }
    return root;
}

let currentOnClose = null;

/**
 * Opens a modal with arbitrary inner HTML. Returns the content element so
 * the caller can wire up its own form/buttons. `onClose` (if given) fires
 * exactly once no matter how the modal closes - backdrop click, the X
 * button, Escape, or a plain closeModal() call from inside the caller.
 */
export function openModal({ title, bodyHtml, widthClass = 'max-w-lg', onClose } = {}) {
    currentOnClose = onClose || null;
    const root = ensureModalRoot();
    root.innerHTML = `
        <div class="modal-backdrop" data-close-backdrop="1">
            <div class="modal-panel ${widthClass}" role="dialog" aria-modal="true">
                <div class="flex items-center justify-between px-5 py-4 border-b border-lspd-border">
                    <h3 class="text-base font-bold text-lspd-text tracking-wide">${title || ''}</h3>
                    <button type="button" data-close-btn="1" class="text-lspd-textSecondary hover:text-lspd-gold transition-colors" aria-label="Close">
                        <i class="fa-solid fa-xmark text-lg"></i>
                    </button>
                </div>
                <div class="modal-body">${bodyHtml || ''}</div>
            </div>
        </div>`;
    // Backdrop: only close on a click on the overlay itself, not on anything
    // inside the panel (the panel is a descendant of the backdrop for
    // centering purposes, so clicks inside it would otherwise bubble here).
    const backdrop = root.querySelector('[data-close-backdrop="1"]');
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });
    // Close button: close on a click anywhere inside it (including its icon).
    root.querySelector('[data-close-btn="1"]').addEventListener('click', () => closeModal());
    document.addEventListener('keydown', escListener);
    return root.querySelector('.modal-body');
}

function escListener(e) {
    if (e.key === 'Escape') closeModal();
}

export function closeModal(onClose) {
    const root = document.getElementById('modal-root');
    if (root) root.innerHTML = '';
    document.removeEventListener('keydown', escListener);
    const cb = onClose || currentOnClose;
    currentOnClose = null;
    if (typeof cb === 'function') cb();
}

export function confirmDialog(message, { confirmLabel = 'Confirm', danger = true, title = 'Please Confirm' } = {}) {
    return new Promise((resolve) => {
        const body = openModal({
            title,
            widthClass: 'max-w-sm',
            bodyHtml: `
                <p class="text-sm text-lspd-textSecondary leading-relaxed mb-6">${message}</p>
                <div class="flex justify-end gap-3">
                    <button id="confirm-cancel" class="px-4 py-2 rounded-lg text-sm font-semibold bg-lspd-card text-lspd-text hover:opacity-80 transition">Cancel</button>
                    <button id="confirm-ok" class="px-4 py-2 rounded-lg text-sm font-bold ${danger ? 'bg-status-overdue text-white' : 'bg-lspd-gold text-lspd-navy'} hover:opacity-90 transition">${confirmLabel}</button>
                </div>`
        });
        body.querySelector('#confirm-cancel').addEventListener('click', () => { closeModal(); resolve(false); });
        body.querySelector('#confirm-ok').addEventListener('click', () => { closeModal(); resolve(true); });
    });
}

// ============================================================================
// THEME
// ============================================================================

const THEME_KEY = 'lspd_theme';

export function applyStoredTheme() {
    const theme = localStorage.getItem(THEME_KEY) || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    return theme;
}

export function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
    StorageService.updateSettings({ theme });
    document.dispatchEvent(new CustomEvent('lspd:theme-changed', { detail: { theme } }));
}

export function currentTheme() {
    return document.documentElement.getAttribute('data-theme') || 'dark';
}

export function toggleTheme() {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    setTheme(next);
    return next;
}

// ============================================================================
// SIDEBAR / MOBILE DRAWER
// ============================================================================

export function initSidebarToggle() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobile-overlay');
    if (!sidebar || !overlay) return;
    const toggle = () => {
        const isOpen = sidebar.classList.contains('translate-x-0');
        sidebar.classList.toggle('translate-x-0', !isOpen);
        sidebar.classList.toggle('-translate-x-full', isOpen);
        overlay.classList.toggle('hidden', isOpen);
        overlay.classList.toggle('opacity-0', isOpen);
    };
    document.querySelectorAll('[data-toggle-sidebar]').forEach(btn => btn.addEventListener('click', toggle));
    overlay.addEventListener('click', toggle);
    // Close drawer automatically after picking a nav item on mobile
    sidebar.querySelectorAll('[data-nav]').forEach(btn => btn.addEventListener('click', () => {
        if (window.innerWidth < 768) toggle();
    }));
}

// ============================================================================
// LIVE CLOCK
// ============================================================================

export function initLiveClock(elId = 'current-time') {
    const el = document.getElementById(elId);
    if (!el) return;
    const tick = () => {
        el.textContent = new Date().toLocaleTimeString('en-GB', { hour12: false });
    };
    tick();
    setInterval(tick, 1000);
}

// ============================================================================
// STATUS BADGE / AVATAR RENDERING
// ============================================================================

export function statusBadge(status, { withDot = true, size = 'sm' } = {}) {
    const s = STATUS_STYLES[status] || STATUS_STYLES.Finished;
    const pad = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs';
    return `<span class="inline-flex items-center gap-1.5 rounded-full font-bold uppercase tracking-wide ${pad} ${s.bg} ${s.text} border ${s.border}">
        ${withDot ? `<span class="w-1.5 h-1.5 rounded-full ${s.dot}"></span>` : ''}${status}
    </span>`;
}

const AVATAR_PALETTE = [
    'bg-amber-500/20 text-amber-400 border-amber-500/40',
    'bg-sky-500/20 text-sky-400 border-sky-500/40',
    'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
    'bg-violet-500/20 text-violet-400 border-violet-500/40',
    'bg-rose-500/20 text-rose-400 border-rose-500/40',
    'bg-cyan-500/20 text-cyan-400 border-cyan-500/40',
    'bg-orange-500/20 text-orange-400 border-orange-500/40',
    'bg-lime-500/20 text-lime-400 border-lime-500/40'
];

export function avatarChip(name, size = 'h-9 w-9 text-xs') {
    const palette = AVATAR_PALETTE[nameHash(name || '') % AVATAR_PALETTE.length];
    return `<div class="${size} rounded-full border flex items-center justify-center font-bold shrink-0 ${palette}">${escapeHtml(initials(name))}</div>`;
}

// ============================================================================
// GENERIC FILTER BAR
// ============================================================================

/**
 * Renders a row of <select> filters into `container` and calls onChange(state)
 * whenever any of them changes. `fields` is [{key,label,options:[...]}].
 */
export function renderFilterBar(container, fields, onChange) {
    const state = {};
    container.innerHTML = fields.map(f => `
        <select data-filter-key="${f.key}" class="filter-select">
            <option value="">${f.label}: All</option>
            ${f.options.map(o => {
                const opt = typeof o === 'object' ? o : { value: o, label: o };
                return `<option value="${opt.value}">${opt.label}</option>`;
            }).join('')}
        </select>`).join('');
    container.querySelectorAll('select').forEach(sel => {
        sel.addEventListener('change', () => {
            state[sel.dataset.filterKey] = sel.value;
            onChange({ ...state });
        });
    });
    return {
        reset() {
            container.querySelectorAll('select').forEach(sel => { sel.value = ''; delete state[sel.dataset.filterKey]; });
            onChange({ ...state });
        },
        getState: () => ({ ...state })
    };
}

export function applyFilters(records, filters, extra = {}) {
    return records.filter(r => {
        for (const [key, value] of Object.entries(filters)) {
            if (!value) continue;
            if (key === 'month') { if (r.startDate.slice(5, 7) !== value) return false; continue; }
            if (key === 'year') { if (r.startDate.slice(0, 4) !== value) return false; continue; }
            if (key === 'status') { if (extra.statusOf && extra.statusOf(r) !== value) return false; continue; }
            if (r[key] !== value) return false;
        }
        return true;
    });
}
