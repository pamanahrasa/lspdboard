/**
 * app-admin.js
 * ---------------------------------------------------------------------------
 * Entry point / orchestrator for admin-dashboard.html. Now gated behind
 * Firebase Authentication: nothing in #admin-app renders (and
 * StorageService.init() isn't even called) until watchAuthState() confirms
 * a signed-in Command Staff user. There is no sign-up UI - the one admin
 * account is created once via the Firebase Console (see README.md).
 * ---------------------------------------------------------------------------
 */

import { StorageService } from './storage.js';
import { applyStoredTheme, toggleTheme, initSidebarToggle, initLiveClock, toast } from './ui.js';
import { initGlobalSearch } from './officer-search.js';
import { signIn, signOutAdmin, watchAuthState, isConfigured } from './auth.js';
import { initDashboardPage } from './dashboard.js';
import { initLeaveManagement, openLeaveFormModal } from './leave.js';
import { initTimeline } from './timeline.js';
import { initCalendar } from './calendar.js';
import { initStatistics } from './statistics.js';
import { initArchive } from './archive.js';
import { initReports } from './report.js';
import { initSettings } from './settings.js';

const TAB_LABELS = {
    dashboard: 'Dashboard',
    'leave-management': 'Leave Management',
    timeline: 'Leave Timeline',
    calendar: 'Leave Calendar',
    statistics: 'Statistics',
    archive: 'Leave Archive',
    reports: 'Reports',
    settings: 'Settings'
};

function showLogin() {
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('admin-app').classList.add('hidden');
}

function showApp() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('admin-app').classList.remove('hidden');
}

let appStarted = false;

async function startApp() {
    if (appStarted) return; // watchAuthState can fire more than once; only wire the app up the first time
    appStarted = true;

    await StorageService.init();

    initSidebarToggle();
    initLiveClock();
    initGlobalSearch(document.getElementById('btn-global-search'));
    document.querySelectorAll('[data-toggle-theme]').forEach(btn => btn.addEventListener('click', () => {
        const t = toggleTheme();
        btn.querySelector('i').className = t === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    }));

    const initializers = {
        dashboard: () => initDashboardPage({
            summaryEl: document.getElementById('dash-summary-cards'),
            coverageEl: document.getElementById('dash-coverage'),
            insightsEl: document.getElementById('dash-insights'),
            returnEl: document.getElementById('dash-upcoming-return'),
            upcomingLeaveEl: document.getElementById('dash-upcoming-leave')
        }),
        'leave-management': () => initLeaveManagement(document.getElementById('page-leave-management'), { editable: true }),
        timeline: () => initTimeline(document.getElementById('page-timeline')),
        calendar: () => initCalendar(document.getElementById('page-calendar')),
        statistics: () => initStatistics(document.getElementById('page-statistics')),
        archive: () => initArchive(document.getElementById('page-archive'), { editable: true }),
        reports: () => initReports(document.getElementById('page-reports')),
        settings: () => initSettings(document.getElementById('page-settings'))
    };

    const initialized = new Set();
    function switchTab(tab) {
        if (!TAB_LABELS[tab]) tab = 'dashboard';
        document.querySelectorAll('.page-content').forEach(p => p.classList.toggle('active', p.id === 'page-' + tab));
        document.querySelectorAll('.nav-item[data-nav]').forEach(n => n.classList.toggle('active', n.dataset.nav === tab));
        document.getElementById('page-title').textContent = TAB_LABELS[tab];
        if (!initialized.has(tab)) { initializers[tab](); initialized.add(tab); }
        history.replaceState(null, '', '#' + tab);
    }

    document.querySelectorAll('[data-nav]').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.nav)));

    const quickAdd = document.getElementById('btn-quick-add-leave');
    const quickAddMobile = document.getElementById('btn-quick-add-leave-mobile');
    if (quickAdd) quickAdd.addEventListener('click', () => openLeaveFormModal(null));
    if (quickAddMobile) quickAddMobile.addEventListener('click', () => openLeaveFormModal(null));

    document.addEventListener('lspd:storage-error', (e) => {
        toast('Sync issue: ' + (e.detail && e.detail.error && e.detail.error.message || 'could not reach the database.'), 'error');
    });

    switchTab((location.hash || '#dashboard').slice(1));
}

function wireLoginForm() {
    const form = document.getElementById('login-form');
    const errEl = document.getElementById('login-error');
    const submitBtn = document.getElementById('login-submit');
    const setupNotice = document.getElementById('login-setup-notice');

    if (!isConfigured) setupNotice.classList.remove('hidden');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errEl.classList.add('hidden');
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Signing in...';
        try {
            await signIn(email, password);
            // watchAuthState's callback (below) takes it from here.
        } catch (err) {
            errEl.textContent = err.message;
            errEl.classList.remove('hidden');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Sign In';
        }
    });
}

function wireSignOut() {
    const btn = document.getElementById('btn-sign-out');
    if (!btn) return;
    btn.addEventListener('click', async () => {
        await signOutAdmin();
        location.reload(); // simplest way to guarantee a fully clean state back at the login screen
    });
}

function main() {
    applyStoredTheme();
    wireLoginForm();
    wireSignOut();

    watchAuthState((user) => {
        if (user) {
            showApp();
            startApp();
        } else {
            showLogin();
        }
    });
}

main();
