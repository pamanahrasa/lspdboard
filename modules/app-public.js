/**
 * app-public.js
 * ---------------------------------------------------------------------------
 * Entry point / orchestrator for public-dashboard.html. Wires the sidebar,
 * header clock, theme toggle and tab-routing, then lazily hands each tab off
 * to its module the first time it's opened. The Public Dashboard is
 * read-only everywhere: every module below is mounted with editable:false.
 * ---------------------------------------------------------------------------
 */

import { StorageService } from './storage.js';
import { applyStoredTheme, toggleTheme, initSidebarToggle, initLiveClock } from './ui.js';
import { initDashboardPage } from './dashboard.js';
import { initTimeline } from './timeline.js';
import { initCalendar } from './calendar.js';
import { initStatistics } from './statistics.js';
import { initArchive } from './archive.js';

const TAB_LABELS = {
    dashboard: 'Dashboard',
    timeline: 'Leave Timeline',
    calendar: 'Leave Calendar',
    statistics: 'Statistics',
    archive: 'Leave Archive'
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
        timeline: () => initTimeline(document.getElementById('page-timeline')),
        calendar: () => initCalendar(document.getElementById('page-calendar')),
        statistics: () => initStatistics(document.getElementById('page-statistics')),
        archive: () => initArchive(document.getElementById('page-archive'), { editable: false })
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
    switchTab((location.hash || '#dashboard').slice(1));
}

main();
