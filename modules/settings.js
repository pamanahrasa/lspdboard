/**
 * settings.js
 * ---------------------------------------------------------------------------
 * Admin Settings, gated behind a PIN separate from the main Firebase Auth
 * sign-in - a lightweight second check for an already-authenticated admin,
 * not a replacement for it. The PIN's hash lives in a Firestore document
 * that only signed-in accounts can read at all (see storage.js
 * getSettingsPinHash/setSettingsPinHash and firestore/firestore.rules), so
 * unlike totalRoster/graceDays it is never exposed to the Public Dashboard.
 *
 * First visit with no PIN set yet -> prompts to create one.
 * Every visit after that -> prompts to enter it.
 * Stays unlocked for the rest of this browser session once entered
 * correctly (re-locks on page reload, or via the "Lock Settings" button).
 * ---------------------------------------------------------------------------
 */

import { StorageService } from './storage.js';
import { currentTheme, setTheme, toast, confirmDialog } from './ui.js';
import { exportBackupJSON, wireImportInput } from './report.js';
import { sha256Hex } from './utils.js';

let unlockedThisSession = false;

export function initSettings(container) {
    function renderGate() {
        container.innerHTML = `
            <div class="max-w-sm mx-auto mt-6 sm:mt-10">
                <div class="text-center mb-6">
                    <i class="fa-solid fa-lock text-3xl text-lspd-gold mb-3"></i>
                    <h3 class="text-lg font-bold text-lspd-text">Settings Locked</h3>
                    <p id="pin-gate-subtitle" class="text-xs text-lspd-textSecondary mt-1"></p>
                </div>
                <form id="pin-gate-form" class="lspd-card-panel space-y-4">
                    <div>
                        <label id="pin-gate-label" class="lspd-label"></label>
                        <input type="password" inputmode="numeric" pattern="[0-9]*" id="pin-gate-input" required minlength="4" maxlength="8"
                               class="lspd-input w-full text-center tracking-[0.5em] text-lg" placeholder="&bull;&bull;&bull;&bull;">
                    </div>
                    <div id="pin-gate-confirm-wrap" class="hidden">
                        <label class="lspd-label">Confirm PIN</label>
                        <input type="password" inputmode="numeric" pattern="[0-9]*" id="pin-gate-confirm" minlength="4" maxlength="8"
                               class="lspd-input w-full text-center tracking-[0.5em] text-lg" placeholder="&bull;&bull;&bull;&bull;">
                    </div>
                    <p id="pin-gate-error" class="text-status-overdue text-xs font-semibold hidden"></p>
                    <button type="submit" id="pin-gate-submit" class="btn-gold w-full"></button>
                </form>
            </div>`;

        let hasPin = false;
        StorageService.getSettingsPinHash().then(hash => {
            hasPin = !!hash;
            container.querySelector('#pin-gate-subtitle').textContent = hasPin
                ? 'Enter the Settings PIN to continue.'
                : 'No PIN is set yet - create one now to protect this page.';
            container.querySelector('#pin-gate-label').textContent = hasPin ? 'PIN' : 'Create a PIN (4-8 digits)';
            container.querySelector('#pin-gate-submit').textContent = hasPin ? 'Unlock' : 'Set PIN & Continue';
            container.querySelector('#pin-gate-confirm-wrap').classList.toggle('hidden', hasPin);
        }).catch(err => {
            container.querySelector('#pin-gate-subtitle').textContent = 'Could not check PIN status: ' + err.message;
        });

        container.querySelector('#pin-gate-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const errEl = container.querySelector('#pin-gate-error');
            errEl.classList.add('hidden');
            const pin = container.querySelector('#pin-gate-input').value.trim();
            if (!/^\d{4,8}$/.test(pin)) {
                errEl.textContent = 'PIN must be 4-8 digits.';
                errEl.classList.remove('hidden');
                return;
            }
            try {
                if (!hasPin) {
                    const confirmPin = container.querySelector('#pin-gate-confirm').value.trim();
                    if (pin !== confirmPin) {
                        errEl.textContent = 'PINs do not match.';
                        errEl.classList.remove('hidden');
                        return;
                    }
                    await StorageService.setSettingsPinHash(await sha256Hex(pin));
                    toast('Settings PIN created.', 'success');
                    unlockedThisSession = true;
                    renderUnlocked();
                } else {
                    const storedHash = await StorageService.getSettingsPinHash();
                    if (await sha256Hex(pin) === storedHash) {
                        unlockedThisSession = true;
                        renderUnlocked();
                    } else {
                        errEl.textContent = 'Incorrect PIN.';
                        errEl.classList.remove('hidden');
                        container.querySelector('#pin-gate-input').value = '';
                        container.querySelector('#pin-gate-input').focus();
                    }
                }
            } catch (err) {
                errEl.textContent = 'Error: ' + err.message;
                errEl.classList.remove('hidden');
            }
        });
    }

    function renderUnlocked() {
        const settings = StorageService.getSettings();
        const theme = currentTheme();
        container.innerHTML = `
            <div class="flex justify-end mb-4">
                <button id="set-lock" class="text-xs font-semibold text-lspd-textSecondary hover:text-lspd-gold transition-colors"><i class="fa-solid fa-lock mr-1.5"></i>Lock Settings</button>
            </div>
            <div class="grid md:grid-cols-2 gap-5">
                <div class="lspd-card-panel">
                    <p class="text-xs font-bold uppercase tracking-wider text-lspd-gold mb-4"><i class="fa-solid fa-palette mr-2"></i>Appearance</p>
                    <div class="flex gap-3">
                        <button data-theme-choice="dark" class="theme-choice-btn ${theme === 'dark' ? 'theme-choice-active' : ''}"><i class="fa-solid fa-moon mr-2"></i>Dark Mode</button>
                        <button data-theme-choice="light" class="theme-choice-btn ${theme === 'light' ? 'theme-choice-active' : ''}"><i class="fa-solid fa-sun mr-2"></i>Light Mode</button>
                    </div>
                    <p class="text-[11px] text-lspd-textSecondary mt-3">This is a display preference for this device only.</p>
                </div>

                <div class="lspd-card-panel">
                    <p class="text-xs font-bold uppercase tracking-wider text-lspd-gold mb-4"><i class="fa-solid fa-sliders mr-2"></i>Operational Parameters</p>
                    <div class="space-y-4">
                        <div>
                            <label class="lspd-label">Total Officer Roster</label>
                            <input type="number" min="0" id="set-roster" class="lspd-input w-full" value="${settings.totalRoster}">
                            <p class="text-[11px] text-lspd-textSecondary mt-1">Used to calculate "Officers Available". Shared with everyone viewing the dashboard.</p>
                        </div>
                        <div>
                            <label class="lspd-label">Grace Period (days)</label>
                            <input type="number" min="0" max="30" id="set-grace" class="lspd-input w-full" value="${settings.graceDays}">
                            <p class="text-[11px] text-lspd-textSecondary mt-1">Days a leave stays <strong class="text-status-overdue">Overdue</strong> before escalating to <strong class="text-status-awol">AWOL</strong> if return isn't confirmed.</p>
                        </div>
                    </div>
                </div>

                <div class="lspd-card-panel">
                    <p class="text-xs font-bold uppercase tracking-wider text-lspd-gold mb-4"><i class="fa-solid fa-key mr-2"></i>Settings PIN</p>
                    <form id="set-pin-change-form" class="space-y-3">
                        <input type="password" inputmode="numeric" pattern="[0-9]*" id="set-pin-current" required minlength="4" maxlength="8" placeholder="Current PIN" class="lspd-input w-full">
                        <input type="password" inputmode="numeric" pattern="[0-9]*" id="set-pin-new" required minlength="4" maxlength="8" placeholder="New PIN (4-8 digits)" class="lspd-input w-full">
                        <input type="password" inputmode="numeric" pattern="[0-9]*" id="set-pin-new-confirm" required minlength="4" maxlength="8" placeholder="Confirm new PIN" class="lspd-input w-full">
                        <p id="set-pin-error" class="text-status-overdue text-xs font-semibold hidden"></p>
                        <button type="submit" class="px-4 py-2 rounded-lg text-sm font-semibold bg-lspd-card text-lspd-text hover:text-lspd-gold border border-lspd-border transition-colors w-full">Change PIN</button>
                    </form>
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
                    <p class="text-[11px] text-lspd-textSecondary mt-3">Restoring replaces the <strong class="text-status-overdue">shared</strong> database everyone sees - export a backup first.</p>
                </div>

                <div class="lspd-card-panel panel-danger md:col-span-2">
                    <p class="text-xs font-bold uppercase tracking-wider text-status-overdue mb-4"><i class="fa-solid fa-triangle-exclamation mr-2"></i>Danger Zone</p>
                    <button id="set-reset" class="px-4 py-2 rounded-lg text-sm font-bold bg-status-overdue/15 text-status-overdue border border-status-overdue/40 hover:bg-status-overdue hover:text-white transition-colors">
                        <i class="fa-solid fa-trash-can mr-2"></i>Reset Shared Database
                    </button>
                    <p class="text-[11px] text-lspd-textSecondary mt-3">Permanently erases every leave record for <strong class="text-status-overdue">everyone</strong> viewing this dashboard. Export a backup first - this cannot be undone.</p>
                </div>
            </div>`;

        container.querySelector('#set-lock').addEventListener('click', () => { unlockedThisSession = false; renderGate(); });

        container.querySelectorAll('[data-theme-choice]').forEach(btn => btn.addEventListener('click', () => { setTheme(btn.dataset.themeChoice); renderUnlocked(); }));

        container.querySelector('#set-roster').addEventListener('change', async (e) => {
            const val = Math.max(0, Number(e.target.value) || 0);
            try {
                await StorageService.updateSettings({ totalRoster: val });
                toast('Roster size updated.', 'success');
            } catch (err) {
                toast('Could not update: ' + err.message, 'error');
            }
        });
        container.querySelector('#set-grace').addEventListener('change', async (e) => {
            const val = Math.min(30, Math.max(0, Number(e.target.value) || 0));
            try {
                await StorageService.updateSettings({ graceDays: val });
                toast('Grace period updated.', 'success');
            } catch (err) {
                toast('Could not update: ' + err.message, 'error');
            }
        });

        container.querySelector('#set-pin-change-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const errEl = container.querySelector('#set-pin-error');
            errEl.classList.add('hidden');
            const current = container.querySelector('#set-pin-current').value.trim();
            const next = container.querySelector('#set-pin-new').value.trim();
            const confirmNext = container.querySelector('#set-pin-new-confirm').value.trim();
            if (!/^\d{4,8}$/.test(next)) { errEl.textContent = 'New PIN must be 4-8 digits.'; errEl.classList.remove('hidden'); return; }
            if (next !== confirmNext) { errEl.textContent = 'New PINs do not match.'; errEl.classList.remove('hidden'); return; }
            try {
                const storedHash = await StorageService.getSettingsPinHash();
                if (await sha256Hex(current) !== storedHash) { errEl.textContent = 'Current PIN is incorrect.'; errEl.classList.remove('hidden'); return; }
                await StorageService.setSettingsPinHash(await sha256Hex(next));
                toast('Settings PIN changed.', 'success');
                e.target.reset();
            } catch (err) {
                errEl.textContent = 'Error: ' + err.message;
                errEl.classList.remove('hidden');
            }
        });

        container.querySelector('#set-backup').addEventListener('click', exportBackupJSON);
        wireImportInput(container.querySelector('#set-restore'));

        container.querySelector('#set-reset').addEventListener('click', async () => {
            const ok = await confirmDialog('This will permanently delete every leave record for EVERYONE viewing this dashboard, on every device. Export a backup first if you want to keep a copy. This cannot be undone.', { confirmLabel: 'Reset Database' });
            if (!ok) return;
            try {
                await StorageService.resetDatabase();
                toast('Database has been reset.', 'success');
            } catch (err) {
                toast('Could not reset: ' + err.message, 'error');
            }
        });
    }

    if (unlockedThisSession) renderUnlocked(); else renderGate();

    document.addEventListener('lspd:data-changed', () => {
        if (unlockedThisSession) renderUnlocked();
    });

    return { render: () => (unlockedThisSession ? renderUnlocked() : renderGate()) };
}
