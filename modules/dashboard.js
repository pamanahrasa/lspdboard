/**
 * dashboard.js
 * ---------------------------------------------------------------------------
 * Command Center summary: KPI cards, Today's Coverage, auto-generated
 * insights, and the Upcoming Return / Upcoming Leave panels. Pure rendering
 * functions - identical output on the Public and Admin dashboards.
 * ---------------------------------------------------------------------------
 */

import { STATUS, todayISO, withComputedFields, formatDate, daysBetween, escapeHtml } from './utils.js';
import { avatarChip } from './ui.js';
import { StorageService } from './storage.js';

export function computeSummary(records, settings, today = todayISO()) {
    const enriched = withComputedFields(records, today, settings.graceDays);
    const active = enriched.filter(r => r.status === STATUS.ACTIVE);
    const upcoming = enriched.filter(r => r.status === STATUS.UPCOMING);
    const returningToday = enriched.filter(r => r.status === STATUS.RETURNING_TODAY);
    const returningTomorrow = enriched.filter(r => r.isReturningTomorrow);
    const startingTomorrow = enriched.filter(r => r.isStartingTomorrow);
    const overdue = enriched.filter(r => r.status === STATUS.OVERDUE);
    const finished = enriched.filter(r => r.status === STATUS.FINISHED);

    const thisMonthPrefix = today.slice(0, 7);
    const totalThisMonth = enriched.filter(r => r.startDate.slice(0, 7) === thisMonthPrefix).length;

    const avgDuration = enriched.length
        ? Math.round((enriched.reduce((sum, r) => sum + r.duration, 0) / enriched.length) * 10) / 10
        : 0;

    const onLeaveToday = active.length;
    const totalRoster = settings.totalRoster || 0;
    const officersAvailable = Math.max(0, totalRoster - onLeaveToday);

    return {
        enriched, active, upcoming, returningToday, returningTomorrow, startingTomorrow, overdue, finished,
        totalThisMonth, avgDuration, onLeaveToday, totalRoster, officersAvailable
    };
}

const CARD_DEFS = [
    { key: 'active', label: 'Active Leave', icon: 'fa-user-clock', tone: 'active' },
    { key: 'upcoming', label: 'Upcoming Leave', icon: 'fa-calendar-plus', tone: 'upcoming' },
    { key: 'returningToday', label: 'Returning Today', icon: 'fa-door-open', tone: 'returning' },
    { key: 'returningTomorrow', label: 'Returning Tomorrow', icon: 'fa-calendar-day', tone: 'returning' },
    { key: 'overdue', label: 'Overdue Leave', icon: 'fa-triangle-exclamation', tone: 'overdue' },
    { key: 'totalThisMonth', label: 'Total Leave This Month', icon: 'fa-calendar-check', tone: 'gold' },
    { key: 'avgDuration', label: 'Avg. Leave Duration', icon: 'fa-hourglass-half', tone: 'gold', suffix: ' days' },
    { key: 'officersAvailable', label: 'Officers Available', icon: 'fa-shield-halved', tone: 'active' },
    { key: 'onLeaveToday', label: 'Officers On Leave', icon: 'fa-user-slash', tone: 'overdue' }
];

const TONE_CLASSES = {
    active: 'text-status-active',
    upcoming: 'text-status-upcoming',
    returning: 'text-status-returning',
    overdue: 'text-status-overdue',
    gold: 'text-lspd-gold'
};

export function renderSummaryCards(container, summary) {
    container.innerHTML = CARD_DEFS.map(def => {
        const raw = summary[def.key];
        const value = Array.isArray(raw) ? raw.length : raw;
        return `
        <div class="kpi-card">
            <div class="flex items-start justify-between">
                <p class="text-[11px] font-bold uppercase tracking-wider text-lspd-textSecondary leading-tight max-w-[9rem]">${def.label}</p>
                <i class="fa-solid ${def.icon} ${TONE_CLASSES[def.tone]} text-lg opacity-80"></i>
            </div>
            <p class="mt-3 text-3xl font-black ${TONE_CLASSES[def.tone]} kpi-value" data-count="${value}">0</p>
            ${def.suffix ? `<p class="text-[11px] text-lspd-textSecondary -mt-1">${def.suffix.trim()}</p>` : ''}
        </div>`;
    }).join('');

    // Small count-up flourish for the command-center feel.
    container.querySelectorAll('.kpi-value').forEach(el => {
        const target = Number(el.dataset.count) || 0;
        const isDecimal = !Number.isInteger(target);
        let current = 0;
        const step = Math.max(target / 20, isDecimal ? 0.1 : 1);
        const tick = () => {
            current = Math.min(target, current + step);
            el.textContent = isDecimal ? current.toFixed(1) : Math.round(current);
            if (current < target) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    });
}

export function renderTodaysCoverage(container, summary) {
    const byGroup = (list, key) => {
        const counts = {};
        list.forEach(r => { counts[r[key]] = (counts[r[key]] || 0) + 1; });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]);
    };
    const stationCounts = byGroup(summary.active, 'station');
    const divisionCounts = byGroup(summary.active, 'division');
    const rankCounts = byGroup(summary.active, 'rank');

    const miniBars = (entries, max) => entries.length ? entries.map(([label, count]) => `
        <div class="flex items-center gap-2 text-xs">
            <span class="w-28 truncate text-lspd-textSecondary">${label}</span>
            <div class="flex-1 h-2 rounded-full bg-lspd-navy/60 overflow-hidden">
                <div class="h-full bg-lspd-gold rounded-full" style="width:${Math.round((count / max) * 100)}%"></div>
            </div>
            <span class="w-5 text-right font-bold text-lspd-text">${count}</span>
        </div>`).join('') : `<p class="text-xs text-lspd-textSecondary italic">No one currently on leave.</p>`;

    const max = Math.max(1, summary.active.length ? Math.max(...[...stationCounts, ...divisionCounts, ...rankCounts].map(e => e[1])) : 1);

    container.innerHTML = `
        <div class="grid grid-cols-3 gap-3 mb-6">
            <div class="text-center">
                <p class="text-2xl font-black text-lspd-text">${summary.totalRoster}</p>
                <p class="text-[10px] uppercase tracking-wide text-lspd-textSecondary">Total Officers</p>
            </div>
            <div class="text-center">
                <p class="text-2xl font-black text-status-active">${summary.officersAvailable}</p>
                <p class="text-[10px] uppercase tracking-wide text-lspd-textSecondary">Active Duty</p>
            </div>
            <div class="text-center">
                <p class="text-2xl font-black text-status-overdue">${summary.onLeaveToday}</p>
                <p class="text-[10px] uppercase tracking-wide text-lspd-textSecondary">On Leave</p>
            </div>
        </div>
        <div class="grid md:grid-cols-3 gap-6">
            <div>
                <p class="text-[11px] font-bold uppercase tracking-wider text-lspd-gold mb-2">By Station</p>
                <div class="space-y-2">${miniBars(stationCounts, max)}</div>
            </div>
            <div>
                <p class="text-[11px] font-bold uppercase tracking-wider text-lspd-gold mb-2">By Division</p>
                <div class="space-y-2">${miniBars(divisionCounts, max)}</div>
            </div>
            <div>
                <p class="text-[11px] font-bold uppercase tracking-wider text-lspd-gold mb-2">By Rank</p>
                <div class="space-y-2">${miniBars(rankCounts, max)}</div>
            </div>
        </div>`;
}

export function generateInsights(summary) {
    const insights = [];
    const top = (list, key) => {
        const counts = {};
        list.forEach(r => { counts[r[key]] = (counts[r[key]] || 0) + 1; });
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        return sorted[0];
    };

    insights.push(`${summary.onLeaveToday} officer${summary.onLeaveToday === 1 ? '' : 's'} ${summary.onLeaveToday === 1 ? 'is' : 'are'} currently on leave.`);
    if (summary.returningToday.length) insights.push(`${summary.returningToday.length} officer${summary.returningToday.length === 1 ? '' : 's'} return${summary.returningToday.length === 1 ? 's' : ''} to duty today.`);
    if (summary.startingTomorrow.length) insights.push(`${summary.startingTomorrow.length} officer${summary.startingTomorrow.length === 1 ? '' : 's'} begin${summary.startingTomorrow.length === 1 ? 's' : ''} leave tomorrow.`);
    if (summary.returningTomorrow.length) insights.push(`${summary.returningTomorrow.length} officer${summary.returningTomorrow.length === 1 ? '' : 's'} return${summary.returningTomorrow.length === 1 ? 's' : ''} tomorrow.`);

    const topStation = top(summary.active, 'station');
    if (topStation) insights.push(`${topStation[0]} has the highest number of officers on leave (${topStation[1]}).`);

    const topRank = top(summary.active, 'rank');
    if (topRank) insights.push(`${topRank[0]} is the rank with the highest leave count (${topRank[1]}).`);

    if (summary.overdue.length) insights.push(`⚠ ${summary.overdue.length} leave record${summary.overdue.length === 1 ? '' : 's'} ${summary.overdue.length === 1 ? 'is' : 'are'} overdue and need Command follow-up.`);

    return insights;
}

export function renderInsights(container, summary) {
    const insights = generateInsights(summary);
    container.innerHTML = `<ul class="space-y-2.5">${insights.map(text => `
        <li class="flex items-start gap-2.5 text-sm text-lspd-text">
            <i class="fa-solid fa-circle-dot text-lspd-gold text-[8px] mt-1.5 shrink-0"></i>
            <span>${text}</span>
        </li>`).join('')}</ul>`;
}

function returnPanelRow(r) {
    return `
        <div class="flex items-center gap-3 py-2.5 border-b border-lspd-border last:border-0">
            ${avatarChip(r.officerName)}
            <div class="min-w-0 flex-1">
                <p class="text-sm font-semibold text-lspd-text truncate">${escapeHtml(r.officerName)}</p>
                <p class="text-[11px] text-lspd-textSecondary truncate">${escapeHtml(r.rank)} · ${escapeHtml(r.station)}</p>
            </div>
            <div class="text-right shrink-0">
                <p class="text-xs font-bold text-lspd-gold">${formatDate(r.returnDate)}</p>
            </div>
        </div>`;
}

export function renderUpcomingReturn(container, records, today = todayISO(), graceDays) {
    const enriched = withComputedFields(records, today, graceDays);
    const buckets = [
        { label: 'Returning Today', list: enriched.filter(r => r.status === STATUS.RETURNING_TODAY) },
        { label: 'Returning Tomorrow', list: enriched.filter(r => r.isReturningTomorrow) },
        { label: 'Within 2 Days', list: enriched.filter(r => r.status === STATUS.ACTIVE && daysBetween(today, r.endDate) === 1) },
        { label: 'Within 3 Days', list: enriched.filter(r => r.status === STATUS.ACTIVE && daysBetween(today, r.endDate) === 2) },
        { label: 'Next Week', list: enriched.filter(r => r.status === STATUS.ACTIVE && daysBetween(today, r.endDate) >= 3 && daysBetween(today, r.endDate) <= 7) }
    ];
    container.innerHTML = buckets.map(b => `
        <div class="mb-4 last:mb-0">
            <p class="text-[11px] font-bold uppercase tracking-wider text-lspd-textSecondary mb-1">${b.label} <span class="text-lspd-gold">(${b.list.length})</span></p>
            ${b.list.length ? b.list.map(returnPanelRow).join('') : '<p class="text-xs italic text-lspd-textSecondary py-1">None</p>'}
        </div>`).join('');
}

export function renderUpcomingLeave(container, records, today = todayISO(), graceDays) {
    const enriched = withComputedFields(records, today, graceDays)
        .filter(r => r.status === STATUS.UPCOMING)
        .sort((a, b) => a.startDate.localeCompare(b.startDate))
        .slice(0, 8);
    container.innerHTML = enriched.length ? enriched.map(r => `
        <div class="flex items-center gap-3 py-2.5 border-b border-lspd-border last:border-0">
            ${avatarChip(r.officerName)}
            <div class="min-w-0 flex-1">
                <p class="text-sm font-semibold text-lspd-text truncate">${escapeHtml(r.officerName)}</p>
                <p class="text-[11px] text-lspd-textSecondary truncate">${escapeHtml(r.leaveType)}</p>
            </div>
            <p class="text-xs font-bold text-status-upcoming shrink-0">${formatDate(r.startDate)}</p>
        </div>`).join('') : '<p class="text-xs italic text-lspd-textSecondary py-1">No upcoming leave scheduled.</p>';
}

/**
 * Self-mounting Dashboard page. `refs` holds the container elements for each
 * sub-panel; any that are omitted are simply skipped (lets the Public and
 * Admin dashboards reuse the exact same wiring even if a panel differs).
 */
export function initDashboardPage(refs) {
    function render() {
        const records = StorageService.getAll();
        const settings = StorageService.getSettings();
        const summary = computeSummary(records, settings);
        if (refs.summaryEl) renderSummaryCards(refs.summaryEl, summary);
        if (refs.coverageEl) renderTodaysCoverage(refs.coverageEl, summary);
        if (refs.insightsEl) renderInsights(refs.insightsEl, summary);
        if (refs.returnEl) renderUpcomingReturn(refs.returnEl, records, todayISO(), settings.graceDays);
        if (refs.upcomingLeaveEl) renderUpcomingLeave(refs.upcomingLeaveEl, records, todayISO(), settings.graceDays);
    }
    render();
    document.addEventListener('lspd:data-changed', render);
    return { render };
}
