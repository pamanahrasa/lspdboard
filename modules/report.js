/**
 * report.js
 * ---------------------------------------------------------------------------
 * Reports: Export JSON / Export Excel / Print, and Import JSON. The same
 * exportDatabaseJSON()/importFromFile() functions power the "Backup
 * Database" / "Restore Database" actions on the Settings page. Import/
 * Restore write to the SHARED Firestore database, visible to everyone - the
 * copy here says so explicitly rather than implying it's local to this
 * device. Excel export goes through xlsx-export.js (ExcelJS, loaded via CDN
 * in the HTML) so the file always matches exactly what's live in Firestore.
 * ---------------------------------------------------------------------------
 */

import { StorageService } from './storage.js';
import { withComputedFields, todayISO, formatDate, downloadFile, escapeHtml } from './utils.js';
import { toast, confirmDialog } from './ui.js';
import { renderLeaveTable, openOfficerDetailModal } from './leave.js';
import { exportRecordsToXlsx } from './xlsx-export.js';

export function exportDatabaseJSON() {
    downloadFile('leave-data.json', StorageService.exportJSON(), 'application/json');
    toast('Database exported as leave-data.json', 'success');
}

export function exportBackupJSON() {
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
    downloadFile(`lspd-notice-board-backup-${stamp}.json`, StorageService.exportJSON(), 'application/json');
    toast('Backup downloaded.', 'success');
}

export async function exportAllXlsx() {
    const records = withComputedFields(StorageService.getAll(), todayISO(), StorageService.getSettings().graceDays)
        .sort((a, b) => b.startDate.localeCompare(a.startDate));
    if (!records.length) { toast('No records to export.', 'error'); return; }
    try {
        await exportRecordsToXlsx(records, { filename: 'lspd-leave-records.xlsx', sheetName: 'Leave Records', title: 'LSPD Notice Board - Leave Records' });
        toast('Excel file exported.', 'success');
    } catch (e) {
        toast('Export failed: ' + e.message, 'error');
    }
}

export function printReport() {
    window.print();
}

/** Reads a File object, confirms with the admin, then replaces the SHARED database. */
export async function importFromFile(file) {
    if (!file) return;
    const ok = await confirmDialog(
        `Importing <strong class="text-lspd-text">${escapeHtml(file.name)}</strong> will replace the leave data <strong class="text-status-overdue">for everyone</strong> viewing this dashboard. Export a backup first if you are not sure. Continue?`,
        { confirmLabel: 'Import & Replace' }
    );
    if (!ok) return;
    try {
        const text = await file.text();
        await StorageService.importJSON(text);
        toast('Database imported successfully.', 'success');
    } catch (e) {
        toast('Import failed: ' + e.message, 'error');
    }
}

export function wireImportInput(inputEl) {
    inputEl.addEventListener('change', () => {
        const file = inputEl.files[0];
        importFromFile(file).finally(() => { inputEl.value = ''; });
    });
}

// ============================================================================
// SELF-MOUNTING REPORTS PAGE (Admin only)
// ============================================================================

export function initReports(container) {
    container.innerHTML = `
        <div class="grid md:grid-cols-2 gap-5 mb-6 print-hide">
            <div class="lspd-card-panel">
                <p class="text-xs font-bold uppercase tracking-wider text-lspd-gold mb-3"><i class="fa-solid fa-file-export mr-2"></i>Export</p>
                <div class="flex flex-wrap gap-2.5">
                    <button id="rep-export-json" class="btn-gold"><i class="fa-solid fa-file-code mr-2"></i>Export JSON</button>
                    <button id="rep-export-xlsx" class="px-4 py-2 rounded-lg text-sm font-semibold bg-lspd-card text-lspd-text hover:text-lspd-gold border border-lspd-border transition-colors"><i class="fa-solid fa-file-excel mr-2"></i>Export Excel</button>
                    <button id="rep-print" class="px-4 py-2 rounded-lg text-sm font-semibold bg-lspd-card text-lspd-text hover:text-lspd-gold border border-lspd-border transition-colors"><i class="fa-solid fa-print mr-2"></i>Print</button>
                </div>
                <p class="text-[11px] text-lspd-textSecondary mt-3 leading-relaxed">Export JSON produces <code class="text-lspd-gold">leave-data.json</code> - this file is your full backup and can be re-imported here or on another computer.</p>
            </div>
            <div class="lspd-card-panel">
                <p class="text-xs font-bold uppercase tracking-wider text-lspd-gold mb-3"><i class="fa-solid fa-file-import mr-2"></i>Import</p>
                <label class="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-lspd-border rounded-lg py-5 cursor-pointer hover:border-lspd-gold transition-colors">
                    <i class="fa-solid fa-upload text-lspd-textSecondary text-lg"></i>
                    <span class="text-xs text-lspd-textSecondary">Click to choose a <code class="text-lspd-gold">leave-data.json</code> file</span>
                    <input id="rep-import-input" type="file" accept="application/json,.json" class="hidden">
                </label>
                <p class="text-[11px] text-lspd-textSecondary mt-3 leading-relaxed">Importing <strong class="text-status-overdue">replaces the shared data for everyone</strong>. Export a backup first.</p>
            </div>
        </div>
        <div id="rep-print-area">
            <div class="hidden print:block mb-4">
                <h2 class="text-xl font-bold">LSPD Notice Board Report</h2>
                <p class="text-xs text-gray-600">Generated ${formatDate(todayISO())}</p>
            </div>
            <div class="lspd-card-panel p-0 overflow-hidden">
                <div id="rep-table-host" class="p-1"></div>
            </div>
        </div>`;

    container.querySelector('#rep-export-json').addEventListener('click', exportDatabaseJSON);
    container.querySelector('#rep-export-xlsx').addEventListener('click', exportAllXlsx);
    container.querySelector('#rep-print').addEventListener('click', printReport);
    wireImportInput(container.querySelector('#rep-import-input'));

    const tableHost = container.querySelector('#rep-table-host');
    function render() {
        const records = withComputedFields(StorageService.getAll(), todayISO(), StorageService.getSettings().graceDays)
            .sort((a, b) => b.startDate.localeCompare(a.startDate));
        renderLeaveTable(tableHost, records, { editable: false, onView: (r) => openOfficerDetailModal(r, records) });
    }
    render();
    document.addEventListener('lspd:data-changed', render);
    return { render };
}
