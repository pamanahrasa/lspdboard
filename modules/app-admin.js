/**
 * app-admin.js
 * ---------------------------------------------------------------------------
 * Entry point / orchestrator for admin-dashboard.html (Command Staff only -
 * no login by design, see README). Same tab-routing pattern as
 * app-public.js, plus the CRUD-capable pages: Leave Management, Reports
 * (Export/Import), and Settings (Backup/Restore/Reset).
 * ---------------------------------------------------------------------------
 */

import { StorageService } from './storage.js';
import { applyStoredTheme, toggleTheme, initSidebarToggle, initLiveClock, toast } from './ui.js';
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

async function main() {
    applyStoredTheme();
    await StorageService.init();

    initSidebarToggle();
    initLiveClock();
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

    document.addEventListener('lspd:storage-error', () => toast('Could not save - browser storage may be full or disabled.', 'error'));

    switchTab((location.hash || '#dashboard').slice(1));
}

main();
