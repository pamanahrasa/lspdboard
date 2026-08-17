/**
 * timeline.js
 * ---------------------------------------------------------------------------
 * The Gantt-style Leave Timeline - the primary operational visualization of
 * the dashboard. Officers on the vertical axis (sticky column), dates on the
 * horizontal axis (zoomable, horizontally scrollable). Bars are positioned
 * with CSS custom properties (--day-index / --day-span) against a shared
 * --day-width variable, so Zoom In/Out is a single style-property change
 * with no re-render needed.
 * ---------------------------------------------------------------------------
 */

import { StorageService } from './storage.js';
import {
    RANK_GROUPS, STATIONS, DIVISIONS, LEAVE_TYPES, STATUS_LIST, STATUS_STYLES,
    withComputedFields, todayISO, addDays, daysBetween, parseISODate, escapeHtml
} from './utils.js';
import { renderFilterBar, applyFilters, avatarChip } from './ui.js';
import { openOfficerDetailModal } from './leave.js';

const ZOOM_LEVELS = [24, 34, 46, 64];
const RANGE_PRESETS = [
    { label: '2 Weeks', before: 3, after: 10 },
    { label: '1 Month', before: 7, after: 23 },
    { label: '3 Months', before: 7, after: 83 }
];

export function initTimeline(container) {
    let zoomIdx = 1;
    let rangeIdx = 1;
    let filters = {};

    container.innerHTML = `
        <div class="flex flex-wrap items-center gap-3 mb-4">
            <div class="flex rounded-lg overflow-hidden border border-lspd-border" id="range-toggle">
                ${RANGE_PRESETS.map((p, i) => `<button data-range="${i}" class="px-3 py-1.5 text-xs font-bold ${i === rangeIdx ? 'bg-lspd-gold text-lspd-navy' : 'bg-lspd-card text-lspd-textSecondary'}">${p.label}</button>`).join('')}
            </div>
            <button id="btn-jump-today" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-lspd-card text-lspd-text hover:text-lspd-gold border border-lspd-border transition-colors">
                <i class="fa-regular fa-calendar mr-1.5"></i>Today
            </button>
            <div class="flex items-center gap-1 ml-auto">
                <button id="btn-zoom-out" class="zoom-btn"><i class="fa-solid fa-magnifying-glass-minus"></i></button>
                <button id="btn-zoom-in" class="zoom-btn"><i class="fa-solid fa-magnifying-glass-plus"></i></button>
            </div>
        </div>
        <div id="timeline-filter-bar" class="filter-bar mb-4"></div>
        <div class="timeline-legend">
            ${STATUS_LIST.map(s => `<span class="legend-chip"><span class="w-2.5 h-2.5 rounded-full ${STATUS_STYLES[s].dot} inline-block"></span>${s}</span>`).join('')}
        </div>
        <div class="lspd-card-panel p-0">
            <div id="timeline-host"></div>
        </div>`;

    const host = container.querySelector('#timeline-host');
    const filterCtl = renderFilterBar(container.querySelector('#timeline-filter-bar'), [
        { key: 'rank', label: 'Rank', options: Object.values(RANK_GROUPS).flat() },
        { key: 'station', label: 'Station', options: STATIONS },
        { key: 'division', label: 'Division', options: DIVISIONS },
        { key: 'leaveType', label: 'Type', options: LEAVE_TYPES }
    ], (state) => { filters = state; render(); });

    container.querySelector('#range-toggle').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-range]');
        if (!btn) return;
        rangeIdx = Number(btn.dataset.range);
        container.querySelectorAll('#range-toggle [data-range]').forEach(b => {
            b.classList.toggle('bg-lspd-gold', b === btn);
            b.classList.toggle('text-lspd-navy', b === btn);
            b.classList.toggle('bg-lspd-card', b !== btn);
            b.classList.toggle('text-lspd-textSecondary', b !== btn);
        });
        render();
    });
    container.querySelector('#btn-zoom-in').addEventListener('click', () => { zoomIdx = Math.min(ZOOM_LEVELS.length - 1, zoomIdx + 1); applyZoom(); });
    container.querySelector('#btn-zoom-out').addEventListener('click', () => { zoomIdx = Math.max(0, zoomIdx - 1); applyZoom(); });
    container.querySelector('#btn-jump-today').addEventListener('click', () => scrollToToday(true));

    function applyZoom() {
        const inner = host.querySelector('.timeline-inner');
        if (inner) inner.style.setProperty('--day-width', ZOOM_LEVELS[zoomIdx] + 'px');
    }

    function scrollToToday(smooth) {
        const scrollEl = host.querySelector('.timeline-scroll');
        const line = host.querySelector('.timeline-today-line');
        if (!scrollEl || !line) return;
        // line.style.left holds the declared calc() expression, not a resolved
        // pixel number - offsetLeft gives the browser's actual computed position
        // (relative to .timeline-inner, its offsetParent), which is what we need.
        const target = Math.max(0, line.offsetLeft - scrollEl.clientWidth / 2);
        scrollEl.scrollTo({ left: target, behavior: smooth ? 'smooth' : 'auto' });
    }

    function render() {
        const preset = RANGE_PRESETS[rangeIdx];
        const today = todayISO();
        const rangeStart = addDays(today, -preset.before);
        const rangeEnd = addDays(today, preset.after);
        const totalDays = daysBetween(rangeStart, rangeEnd) + 1;
        const todayIndex = daysBetween(rangeStart, today);
        const settings = StorageService.getSettings();

        const enriched = withComputedFields(StorageService.getAll(), today, settings.graceDays);
        const filtered = applyFilters(enriched, filters, { statusOf: r => r.status });

        // Group by officer, keep only records intersecting the visible range.
        const byOfficer = new Map();
        filtered.forEach(r => {
            const startIdx = daysBetween(rangeStart, r.startDate);
            const endIdx = daysBetween(rangeStart, r.endDate);
            const clampedStart = Math.max(0, startIdx);
            const clampedEnd = Math.min(totalDays - 1, endIdx);
            if (clampedStart > clampedEnd) return; // outside visible range entirely
            const key = r.officerName + '|' + r.badgeNumber;
            if (!byOfficer.has(key)) byOfficer.set(key, { name: r.officerName, badge: r.badgeNumber, rank: r.rank, bars: [] });
            byOfficer.get(key).bars.push({ record: r, dayIndex: clampedStart, span: clampedEnd - clampedStart + 1 });
        });
        const officers = [...byOfficer.values()].sort((a, b) => a.name.localeCompare(b.name));

        if (!officers.length) {
            host.innerHTML = `<div class="empty-state"><i class="fa-solid fa-calendar-xmark text-3xl mb-3 opacity-50"></i><p>No leave records fall within this date range / filter selection.</p></div>`;
            return;
        }

        // Day header cells
        const dayCells = [];
        for (let i = 0; i < totalDays; i++) {
            const date = addDays(rangeStart, i);
            const d = parseISODate(date);
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            const isFirstOfMonth = d.getDate() === 1 || i === 0;
            dayCells.push(`
                <div class="timeline-day-cell ${isWeekend ? 'timeline-weekend' : ''} ${i === todayIndex ? 'timeline-today-col' : ''}">
                    <p class="text-[8px] text-lspd-gold font-bold leading-none h-2.5">${isFirstOfMonth ? d.toLocaleDateString('en-US', { month: 'short' }) : ''}</p>
                    <p class="text-xs font-bold leading-tight text-lspd-text">${d.getDate()}</p>
                    <p class="text-[8px] text-lspd-textSecondary leading-none">${d.toLocaleDateString('en-US', { weekday: 'narrow' })}</p>
                </div>`);
        }

        const rows = officers.map(o => `
            <div class="timeline-row">
                <div class="timeline-name-cell" data-officer-name="${escapeHtml(o.name)}" data-officer-badge="${escapeHtml(o.badge)}">
                    ${avatarChip(o.name, 'h-7 w-7 text-[10px]')}
                    <div class="min-w-0">
                        <p class="text-xs font-semibold text-lspd-text truncate">${escapeHtml(o.name)}</p>
                        <p class="text-[10px] text-lspd-textSecondary truncate font-mono">#${escapeHtml(o.badge)}</p>
                    </div>
                </div>
                <div class="timeline-track">
                    ${dayCells.join('')}
                    ${o.bars.map(b => `
                        <div class="timeline-bar ${STATUS_STYLES[b.record.status].dot}" style="--day-index:${b.dayIndex};--day-span:${b.span};" data-record-id="${b.record.id}" title="${escapeHtml(b.record.leaveType)} · ${b.record.status} · ${b.record.startDate} to ${b.record.endDate}"></div>`).join('')}
                </div>
            </div>`).join('');

        host.innerHTML = `
            <div class="timeline-scroll">
                <div class="timeline-inner" style="--day-width:${ZOOM_LEVELS[zoomIdx]}px;">
                    <div class="timeline-row timeline-header-row">
                        <div class="timeline-name-cell timeline-corner">Officer</div>
                        <div class="timeline-track">${dayCells.join('')}</div>
                    </div>
                    ${rows}
                    <div class="timeline-today-line" style="left:calc(160px + ${todayIndex} * var(--day-width) + var(--day-width) / 2);"></div>
                </div>
            </div>`;

        host.querySelectorAll('.timeline-bar').forEach(bar => {
            bar.addEventListener('click', () => {
                const rec = enriched.find(r => r.id === bar.dataset.recordId);
                if (rec) openOfficerDetailModal(rec, enriched);
            });
        });
        host.querySelectorAll('.timeline-name-cell[data-officer-name]').forEach(cell => {
            cell.addEventListener('click', () => {
                const name = cell.dataset.officerName, badge = cell.dataset.officerBadge;
                const officerRecords = enriched.filter(r => r.officerName === name && r.badgeNumber === badge);
                const primary = officerRecords.find(r => ['Active', 'Overdue', 'Returning Today'].includes(r.status))
                    || officerRecords.find(r => r.status === 'Upcoming')
                    || officerRecords[0];
                if (primary) openOfficerDetailModal(primary, enriched);
            });
        });

        requestAnimationFrame(() => scrollToToday(false));
    }

    render();
    document.addEventListener('lspd:data-changed', render);
    return { render };
}
