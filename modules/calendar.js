/**
 * calendar.js
 * ---------------------------------------------------------------------------
 * Monthly Leave Calendar. Combines the spec's "Heatmap Calendar" (darker cell
 * = more officers out that day) and "Leave Calendar" (Google Calendar style
 * event chips per day) into a single view: the cell background encodes
 * density, the chips inside show exactly who and what leave type/status.
 * Click any day to see the full roster on leave that date.
 * ---------------------------------------------------------------------------
 */

import { StorageService } from './storage.js';
import { withComputedFields, todayISO, toISODate, formatDate, escapeHtml, monthLabel, STATUS_STYLES, OPEN_ENDED_LEAVE_TYPE } from './utils.js';
import { openModal, statusBadge, avatarChip, openEndedBadge } from './ui.js';
import { openOfficerDetailModal } from './leave.js';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HEAT_STEPS = [0, 0.15, 0.32, 0.5, 0.7, 0.9];

function isOnLeave(record, iso) {
    return iso >= record.startDate && iso <= record.endDate;
}

export function initCalendar(container) {
    const now = new Date();
    let viewYear = now.getFullYear();
    let viewMonth = now.getMonth();

    container.innerHTML = `
        <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-2">
                <button id="cal-prev" class="zoom-btn"><i class="fa-solid fa-chevron-left"></i></button>
                <button id="cal-today" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-lspd-card text-lspd-text hover:text-lspd-gold border border-lspd-border transition-colors">Today</button>
                <button id="cal-next" class="zoom-btn"><i class="fa-solid fa-chevron-right"></i></button>
            </div>
            <h3 id="cal-label" class="text-lg font-bold text-lspd-text tracking-wide"></h3>
            <div class="hidden sm:flex items-center gap-1.5 text-[10px] text-lspd-textSecondary">
                <span>Fewer</span>
                ${HEAT_STEPS.map(s => `<span class="w-4 h-4 rounded" style="background-color: rgb(var(--lspd-gold) / ${s})"></span>`).join('')}
                <span>More</span>
            </div>
        </div>
        <div class="lspd-card-panel">
            <div class="grid grid-cols-7 mb-2">
                ${WEEKDAYS.map(w => `<div class="text-center text-[11px] font-bold uppercase tracking-wider text-lspd-textSecondary py-1">${w}</div>`).join('')}
            </div>
            <div id="cal-grid" class="grid grid-cols-7 gap-1.5"></div>
        </div>`;

    const grid = container.querySelector('#cal-grid');
    const label = container.querySelector('#cal-label');

    container.querySelector('#cal-prev').addEventListener('click', () => { viewMonth--; if (viewMonth < 0) { viewMonth = 11; viewYear--; } render(); });
    container.querySelector('#cal-next').addEventListener('click', () => { viewMonth++; if (viewMonth > 11) { viewMonth = 0; viewYear++; } render(); });
    container.querySelector('#cal-today').addEventListener('click', () => { viewYear = now.getFullYear(); viewMonth = now.getMonth(); render(); });

    function render() {
        label.textContent = monthLabel(viewYear, viewMonth);
        const today = todayISO();
        const enriched = withComputedFields(StorageService.getAll(), today, StorageService.getSettings().graceDays);

        const firstOfMonth = new Date(viewYear, viewMonth, 1);
        const gridStart = new Date(firstOfMonth);
        gridStart.setDate(gridStart.getDate() - firstOfMonth.getDay());

        const cells = [];
        for (let i = 0; i < 42; i++) {
            const d = new Date(gridStart);
            d.setDate(gridStart.getDate() + i);
            const iso = toISODate(d);
            const dayRecords = enriched.filter(r => isOnLeave(r, iso));
            cells.push({ date: d, iso, records: dayRecords, inMonth: d.getMonth() === viewMonth, isToday: iso === today });
        }
        const maxCount = Math.max(1, ...cells.map(c => c.records.length));

        grid.innerHTML = cells.map(c => {
            const level = c.records.length === 0 ? 0 : Math.min(HEAT_STEPS.length - 1, Math.ceil((c.records.length / maxCount) * (HEAT_STEPS.length - 1)));
            const heat = HEAT_STEPS[level];
            const shown = c.records.slice(0, 3);
            const extra = c.records.length - shown.length;
            return `
            <button data-iso="${c.iso}" class="cal-cell ${c.inMonth ? '' : 'cal-cell-outside'} ${c.isToday ? 'cal-cell-today' : ''}" style="background-color: rgb(var(--lspd-gold) / ${heat})">
                <span class="cal-daynum ${c.isToday ? 'cal-daynum-today' : ''}">${c.date.getDate()}</span>
                <span class="flex flex-col gap-0.5 w-full mt-1">
                    ${shown.map(r => `<span class="cal-chip ${STATUS_STYLES[r.status].bg} ${STATUS_STYLES[r.status].text} ${r.leaveType === OPEN_ENDED_LEAVE_TYPE ? 'openended-dashed' : ''}">${escapeHtml(r.officerName.split(' ')[0])}</span>`).join('')}
                    ${extra > 0 ? `<span class="cal-chip bg-lspd-navy/40 text-lspd-textSecondary">+${extra} more</span>` : ''}
                </span>
            </button>`;
        }).join('');

        grid.querySelectorAll('.cal-cell').forEach(btn => {
            btn.addEventListener('click', () => openDayModal(btn.dataset.iso, enriched));
        });
    }

    render();
    document.addEventListener('lspd:data-changed', render);
    return { render };
}

function openDayModal(iso, enriched) {
    const dayRecords = enriched.filter(r => isOnLeave(r, iso)).sort((a, b) => a.officerName.localeCompare(b.officerName));
    const body = openModal({
        title: formatDate(iso),
        widthClass: 'max-w-lg',
        bodyHtml: dayRecords.length ? `
            <p class="text-xs text-lspd-textSecondary mb-4">${dayRecords.length} officer${dayRecords.length === 1 ? '' : 's'} on leave this day.</p>
            <div class="space-y-1 max-h-96 overflow-y-auto pr-1">
                ${dayRecords.map(r => `
                <button data-id="${r.id}" class="w-full flex items-center gap-3 py-2.5 px-2 rounded-lg hover:bg-lspd-navy/50 transition-colors text-left">
                    ${avatarChip(r.officerName)}
                    <div class="min-w-0 flex-1">
                        <p class="text-sm font-semibold text-lspd-text truncate">${escapeHtml(r.officerName)}</p>
                        <p class="text-[11px] text-lspd-textSecondary truncate flex items-center">${escapeHtml(r.rank)} &middot; ${escapeHtml(r.station)} &middot; ${escapeHtml(r.leaveType)}${r.leaveType === OPEN_ENDED_LEAVE_TYPE ? openEndedBadge() : ''}</p>
                    </div>
                    ${statusBadge(r.status)}
                </button>`).join('')}
            </div>` : `<div class="empty-state py-6"><i class="fa-solid fa-calendar-check text-3xl mb-3 opacity-50"></i><p>No officers on leave this day.</p></div>`
    });
    body.querySelectorAll('[data-id]').forEach(btn => {
        btn.addEventListener('click', () => {
            const rec = dayRecords.find(r => r.id === btn.dataset.id);
            if (rec) openOfficerDetailModal(rec, enriched);
        });
    });
}
