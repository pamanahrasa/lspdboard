/**
 * archive.js
 * ---------------------------------------------------------------------------
 * Leave Archive: every completed ("Finished") leave record, never deleted
 * automatically. Read-only on the Public Dashboard; Admin can still correct
 * or remove an archived entry. Supports search, filter, detail, and export.
 * ---------------------------------------------------------------------------
 */

import { StorageService } from './storage.js';
import { RANK_GROUPS, STATIONS, DIVISIONS, LEAVE_TYPES, STATUS, withComputedFields, todayISO, debounce, escapeHtml } from './utils.js';
import { renderFilterBar, applyFilters, confirmDialog, toast } from './ui.js';
import { renderLeaveTable, openOfficerDetailModal, openLeaveFormModal } from './leave.js';
import { exportRecordsToXlsx } from './xlsx-export.js';

const MONTHS = [
    { value: '01', label: 'January' }, { value: '02', label: 'February' }, { value: '03', label: 'March' },
    { value: '04', label: 'April' }, { value: '05', label: 'May' }, { value: '06', label: 'June' },
    { value: '07', label: 'July' }, { value: '08', label: 'August' }, { value: '09', label: 'September' },
    { value: '10', label: 'October' }, { value: '11', label: 'November' }, { value: '12', label: 'December' }
];

export function initArchive(container, { editable = false } = {}) {
    container.innerHTML = `
        <div class="flex flex-col lg:flex-row lg:items-center gap-3 mb-4">
            <div class="relative flex-1">
                <i class="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-lspd-textSecondary text-sm"></i>
                <input id="archive-search" type="text" placeholder="Search archived leave by officer or badge..." class="lspd-input pl-10 w-full" />
            </div>
            <button id="btn-export-archive" class="px-4 py-2 rounded-lg text-sm font-semibold bg-lspd-card text-lspd-text hover:text-lspd-gold border border-lspd-border transition-colors shrink-0">
                <i class="fa-solid fa-file-excel mr-2"></i>Export Excel
            </button>
        </div>
        <div id="archive-filter-bar" class="filter-bar mb-4"></div>
        <div class="flex items-center gap-2 mb-4">
            <div class="kpi-card !py-3 !px-4 inline-flex items-center gap-3">
                <i class="fa-solid fa-box-archive text-lspd-gold text-lg"></i>
                <div>
                    <p id="archive-total" class="text-xl font-black text-lspd-text leading-none">0</p>
                    <p class="text-[10px] uppercase tracking-wide text-lspd-textSecondary">Total Archived</p>
                </div>
            </div>
        </div>
        <div class="lspd-card-panel p-0 overflow-hidden">
            <div id="archive-table-host" class="p-1"></div>
        </div>
        <p id="archive-result-count" class="text-xs text-lspd-textSecondary mt-3"></p>`;

    const searchInput = container.querySelector('#archive-search');
    const tableHost = container.querySelector('#archive-table-host');
    const countEl = container.querySelector('#archive-result-count');
    const totalEl = container.querySelector('#archive-total');

    const years = () => {
        const set = new Set(StorageService.getAll().map(r => r.startDate.slice(0, 4)));
        set.add(String(new Date().getFullYear()));
        return [...set].sort().reverse();
    };

    const filterCtl = renderFilterBar(container.querySelector('#archive-filter-bar'), [
        { key: 'rank', label: 'Rank', options: Object.values(RANK_GROUPS).flat() },
        { key: 'station', label: 'Station', options: STATIONS },
        { key: 'division', label: 'Division', options: DIVISIONS },
        { key: 'leaveType', label: 'Type', options: LEAVE_TYPES },
        { key: 'month', label: 'Month', options: MONTHS },
        { key: 'year', label: 'Year', options: years() }
    ], () => render());

    function currentArchive() {
        const settings = StorageService.getSettings();
        return withComputedFields(StorageService.getAll(), todayISO(), settings.graceDays)
            .filter(r => r.status === STATUS.FINISHED)
            .sort((a, b) => b.endDate.localeCompare(a.endDate));
    }

    function render() {
        const archive = currentArchive();
        totalEl.textContent = archive.length;
        const term = searchInput.value.trim().toLowerCase();
        let filtered = applyFilters(archive, filterCtl.getState());
        if (term) filtered = filtered.filter(r => r.officerName.toLowerCase().includes(term) || r.badgeNumber.toLowerCase().includes(term));

        renderLeaveTable(tableHost, filtered, {
            editable,
            onView: (r) => openOfficerDetailModal(r, withComputedFields(StorageService.getAll())),
            onEdit: editable ? (r) => openLeaveFormModal(r) : undefined,
            onDelete: editable ? (r) => handleDelete(r) : undefined
        });
        countEl.textContent = `Showing ${filtered.length} of ${archive.length} archived record${archive.length === 1 ? '' : 's'}.`;
    }

    async function handleDelete(record) {
        const ok = await confirmDialog(`Permanently remove this archived record for <strong class="text-lspd-text">${escapeHtml(record.officerName)}</strong>?`, { confirmLabel: 'Delete' });
        if (!ok) return;
        try {
            await StorageService.remove(record.id);
            toast('Archived record deleted.', 'success');
        } catch (err) {
            toast('Could not delete: ' + err.message, 'error');
        }
    }

    container.querySelector('#btn-export-archive').addEventListener('click', async () => {
        const archive = currentArchive();
        if (!archive.length) { toast('No archived records to export.', 'error'); return; }
        try {
            await exportRecordsToXlsx(archive, { filename: 'lspd-leave-archive.xlsx', sheetName: 'Leave Archive', title: 'LSPD Notice Board - Leave Archive' });
            toast('Archive exported.', 'success');
        } catch (err) {
            toast('Export failed: ' + err.message, 'error');
        }
    });

    searchInput.addEventListener('input', debounce(render, 150));
    render();
    document.addEventListener('lspd:data-changed', render);
    return { render };
}
