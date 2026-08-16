/**
 * settings.js
 * ---------------------------------------------------------------------------
 * Admin Settings: theme, the two tunable numbers the status engine depends
 * on (Total Roster for "Officers Available", grace days before a finished
 * leave is flagged Overdue), and the Backup / Restore / Reset actions
 * (built on the same functions report.js uses for Export/Import).
 * ---------------------------------------------------------------------------
 */

import { StorageService } from './storage.js';
import { currentTheme, setTheme, toast, confirmDialog } from './ui.js';
import { exportBackupJSON, wireImportInput } from './report.js';

export function initSettings(container) {
    function render() {
        const settings = StorageService.getSettings();
        const theme = currentTheme();
        container.innerHTML = `
            <div class="grid md:grid-cols-2 gap-5">
                <div class="lspd-card-panel">
                    <p class="text-xs font-bold uppercase tracking-wider text-lspd-gold mb-4"><i class="fa-solid fa-palette mr-2"></i>Appearance</p>
                    <div class="flex gap-3">
                        <button data-theme-choice="dark" class="theme-choice-btn ${theme === 'dark' ? 'theme-choice-active' : ''}"><i class="fa-solid fa-moon mr-2"></i>Dark Mode</button>
                        <button data-theme-choice="light" class="theme-choice-btn ${theme === 'light' ? 'theme-choice-active' : ''}"><i class="fa-solid fa-sun mr-2"></i>Light Mode</button>
                    </div>
                </div>

                <div class="lspd-card-panel">
                    <p class="text-xs font-bold uppercase tracking-wider text-lspd-gold mb-4"><i class="fa-solid fa-sliders mr-2"></i>Operational Parameters</p>
                    <div class="space-y-4">
                        <div>
                            <label class="lspd-label">Total Officer Roster</label>
                            <input type="number" min="0" id="set-roster" class="lspd-input w-full" value="${settings.totalRoster}">
                            <p class="text-[11px] text-lspd-textSecondary mt-1">Used to calculate "Officers Available" (Roster - On Leave Today). This dashboard tracks leave only, not the full personnel roster.</p>
                        </div>
                        <div>
                            <label class="lspd-label">Grace Period (days)</label>
                            <input type="number" min="0" max="30" id="set-grace" class="lspd-input w-full" value="${settings.graceDays}">
                            <p class="text-[11px] text-lspd-textSecondary mt-1">How many days a leave stays flagged <strong class="text-status-overdue">Overdue</strong> after the return date before it automatically settles into <strong class="text-status-finished">Finished</strong> and moves to the Archive.</p>
                        </div>
                    </div>
                </div>

                <div class="lspd-card-panel">
                    <p class="text-xs font-bold uppercase tracking-wider text-lspd-gold mb-4"><i class="fa-solid fa-database mr-2"></i>Backup &amp; Restore</p>
                    <div class="flex flex-wrap gap-2.5">
                        <button id="set-backup" class="btn-gold"><i class="fa-solid fa-cloud-arrow-down mr-2"></i>Backup Database</button>
                        <label class="px-4 py-2 rounded-lg text-sm font-semibold bg-lspd-card text-lspd-text hover:text-lspd-gold border border-lspd-border transition-colors cursor-pointer">
                            <i class="fa-solid fa-cloud-arrow-up mr-2"></i>Restore Database
                            <input type="file" id="set-restore" accept="application/json,.json" class="hidden">
                        </label>
                    </div>
                    <p class="text-[11px] text-lspd-textSecondary mt-3">Same JSON format as Reports &gt; Export/Import - use whichever page is convenient.</p>
                </div>

                <div class="lspd-card-panel panel-danger">
                    <p class="text-xs font-bold uppercase tracking-wider text-status-overdue mb-4"><i class="fa-solid fa-triangle-exclamation mr-2"></i>Danger Zone</p>
                    <button id="set-reset" class="px-4 py-2 rounded-lg text-sm font-bold bg-status-overdue/15 text-status-overdue border border-status-overdue/40 hover:bg-status-overdue hover:text-white transition-colors">
                        <i class="fa-solid fa-trash-can mr-2"></i>Reset Local Database
                    </button>
                    <p class="text-[11px] text-lspd-textSecondary mt-3">Permanently erases every leave record on this device. Export a backup first - this cannot be undone.</p>
                </div>
            </div>`;

        container.querySelectorAll('[data-theme-choice]').forEach(btn => btn.addEventListener('click', () => { setTheme(btn.dataset.themeChoice); render(); }));

        container.querySelector('#set-roster').addEventListener('change', (e) => {
            const val = Math.max(0, Number(e.target.value) || 0);
            StorageService.updateSettings({ totalRoster: val });
            toast('Roster size updated.', 'success');
        });
        container.querySelector('#set-grace').addEventListener('change', (e) => {
            const val = Math.min(30, Math.max(0, Number(e.target.value) || 0));
            StorageService.updateSettings({ graceDays: val });
            toast('Grace period updated.', 'success');
        });

        container.querySelector('#set-backup').addEventListener('click', exportBackupJSON);
        wireImportInput(container.querySelector('#set-restore'));

        container.querySelector('#set-reset').addEventListener('click', async () => {
            const ok = await confirmDialog('This will permanently delete every leave record stored on this device. Export a backup first if you want to keep a copy. This cannot be undone.', { confirmLabel: 'Reset Database' });
            if (!ok) return;
            StorageService.resetDatabase();
            toast('Database has been reset.', 'success');
        });
    }

    render();
    document.addEventListener('lspd:data-changed', render);
    return { render };
}
