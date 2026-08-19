/**
 * statistics.js
 * ---------------------------------------------------------------------------
 * Chart.js dashboards: leave volume by month/rank/station/division/type, and
 * average duration by leave type. Charts re-theme on dark/light toggle by
 * reading the same CSS custom properties the rest of the UI uses.
 * Requires the global `Chart` (Chart.js UMD build, loaded via CDN in HTML).
 * ---------------------------------------------------------------------------
 */
/* global Chart */

import { StorageService } from './storage.js';
import { withComputedFields, todayISO, readCssVar, LEAVE_TYPES, OPEN_ENDED_LEAVE_TYPE } from './utils.js';

const PALETTE = ['#eab308', '#38bdf8', '#10b981', '#f59e0b', '#a78bfa', '#f472b6', '#fb923c', '#22d3ee', '#84cc16', '#f87171'];

function themeColors() {
    return {
        text: readCssVar('--lspd-text-secondary') || '#94a3b8',
        grid: 'rgba(148, 163, 184, 0.12)',
        gold: readCssVar('--lspd-gold') || '#eab308'
    };
}

function baseOptions(extra = {}) {
    const t = themeColors();
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { labels: { color: t.text, font: { size: 11 }, boxWidth: 12 } },
            tooltip: { backgroundColor: '#0f172a', titleColor: '#f8fafc', bodyColor: '#e2e8f0', borderColor: '#334155', borderWidth: 1, padding: 10 }
        },
        scales: extra.noScales ? {} : {
            x: { ticks: { color: t.text, font: { size: 10 } }, grid: { color: t.grid } },
            y: { ticks: { color: t.text, font: { size: 10 } }, grid: { color: t.grid }, beginAtZero: true }
        },
        ...extra.options
    };
}

function countBy(records, key) {
    const counts = {};
    records.forEach(r => { counts[r[key]] = (counts[r[key]] || 0) + 1; });
    return counts;
}

const charts = {};
function makeChart(canvas, config) {
    if (charts[canvas.id]) charts[canvas.id].destroy();
    charts[canvas.id] = new Chart(canvas, config);
}

const CHART_DEFS = [
    { id: 'chart-month', title: 'Leave by Month', icon: 'fa-calendar-days' },
    { id: 'chart-type', title: 'Leave by Type', icon: 'fa-tags', half: true },
    { id: 'chart-rank', title: 'Leave by Rank', icon: 'fa-ranking-star' },
    { id: 'chart-station', title: 'Leave by Station', icon: 'fa-building-shield' },
    { id: 'chart-division', title: 'Leave by Division', icon: 'fa-sitemap' },
    { id: 'chart-duration', title: 'Average Duration by Type (days)', icon: 'fa-hourglass-half', half: true }
];

export function initStatistics(container) {
    container.innerHTML = `
        <div id="stats-empty" class="empty-state hidden"><i class="fa-solid fa-chart-simple text-3xl mb-3 opacity-50"></i><p>No leave data yet - statistics will appear once records are added.</p></div>
        <div id="stats-grid" class="grid lg:grid-cols-2 gap-5">
            ${CHART_DEFS.map(c => `
            <div class="lspd-card-panel ${c.half ? '' : 'lg:col-span-2'}">
                <p class="text-xs font-bold uppercase tracking-wider text-lspd-gold mb-3"><i class="fa-solid ${c.icon} mr-2"></i>${c.title}</p>
                <div class="chart-box"><canvas id="${c.id}"></canvas></div>
            </div>`).join('')}
        </div>`;

    const emptyEl = container.querySelector('#stats-empty');
    const gridEl = container.querySelector('#stats-grid');

    function render() {
        const today = todayISO();
        const records = withComputedFields(StorageService.getAll(), today, StorageService.getSettings().graceDays);
        if (!records.length) {
            emptyEl.classList.remove('hidden');
            gridEl.classList.add('hidden');
            return;
        }
        emptyEl.classList.add('hidden');
        gridEl.classList.remove('hidden');

        // Leave by month (current year, Jan-Dec)
        const year = today.slice(0, 4);
        const monthCounts = Array(12).fill(0);
        records.forEach(r => { if (r.startDate.startsWith(year)) monthCounts[Number(r.startDate.slice(5, 7)) - 1]++; });
        const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        // by rank / station / division / type
        const rankCounts = countBy(records, 'rank');
        const stationCounts = countBy(records, 'station');
        const divisionCounts = countBy(records, 'division');
        const typeCounts = countBy(records, 'leaveType');

        // avg duration per leave type
        const avgDuration = LEAVE_TYPES.map(t => {
            const recs = records.filter(r => r.leaveType === t);
            return recs.length ? Math.round((recs.reduce((s, r) => s + r.duration, 0) / recs.length) * 10) / 10 : 0;
        });

        const t = themeColors();
        const el = (id) => container.querySelector('#' + id);
        const openEndedColor = readCssVar('--leave-openended') || '#8b5cf6';
        const typeColorFor = (labels) => labels.map((label, i) => label === OPEN_ENDED_LEAVE_TYPE ? openEndedColor : PALETTE[i % PALETTE.length]);

        makeChart(el('chart-month'), {
            type: 'bar',
            data: { labels: monthLabels, datasets: [{ label: `Leave Records (${year})`, data: monthCounts, backgroundColor: t.gold, borderRadius: 6, maxBarThickness: 34 }] },
            options: baseOptions()
        });

        makeChart(el('chart-type'), {
            type: 'doughnut',
            data: { labels: Object.keys(typeCounts), datasets: [{ data: Object.values(typeCounts), backgroundColor: typeColorFor(Object.keys(typeCounts)), borderColor: '#0f172a', borderWidth: 2 }] },
            options: baseOptions({ noScales: true })
        });

        makeChart(el('chart-rank'), {
            type: 'bar',
            data: { labels: Object.keys(rankCounts), datasets: [{ label: 'Records', data: Object.values(rankCounts), backgroundColor: PALETTE[1], borderRadius: 6, maxBarThickness: 28 }] },
            options: { ...baseOptions(), indexAxis: 'y' }
        });

        makeChart(el('chart-station'), {
            type: 'bar',
            data: { labels: Object.keys(stationCounts), datasets: [{ label: 'Records', data: Object.values(stationCounts), backgroundColor: PALETTE[2], borderRadius: 6, maxBarThickness: 40 }] },
            options: baseOptions()
        });

        makeChart(el('chart-division'), {
            type: 'bar',
            data: { labels: Object.keys(divisionCounts), datasets: [{ label: 'Records', data: Object.values(divisionCounts), backgroundColor: PALETTE, borderRadius: 6, maxBarThickness: 34 }] },
            options: baseOptions()
        });

        makeChart(el('chart-duration'), {
            type: 'bar',
            data: { labels: LEAVE_TYPES, datasets: [{ label: 'Avg Days', data: avgDuration, backgroundColor: typeColorFor(LEAVE_TYPES), borderRadius: 6, maxBarThickness: 40 }] },
            options: { ...baseOptions(), indexAxis: 'y' }
        });
    }

    render();
    document.addEventListener('lspd:data-changed', render);
    document.addEventListener('lspd:theme-changed', () => setTimeout(render, 50));
    return { render };
}
