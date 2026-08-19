/**
 * officer-search.js
 * ---------------------------------------------------------------------------
 * Global officer search - reachable from a search icon in the header on
 * every page (Public and Admin). Type a name or badge number, pick a
 * result, and it opens that officer's full detail + complete leave history
 * immediately. Reads live through StorageService (Firestore-backed), so
 * results are always the real, currently-synced data - not a mock.
 * ---------------------------------------------------------------------------
 */

import { StorageService } from './storage.js';
import { withComputedFields, todayISO, escapeHtml, debounce, STATUS } from './utils.js';
import { openModal, closeModal, avatarChip } from './ui.js';
import { openOfficerDetailModal } from './leave.js';

/** Lower number = more operationally urgent/relevant record to show first per officer. */
function recordPriority(r) {
    if (r.status === STATUS.AWOL) return 0;
    if ([STATUS.ACTIVE, STATUS.OVERDUE, STATUS.RETURNING_TODAY].includes(r.status)) return 1;
    if (r.status === STATUS.UPCOMING) return 2;
    return 3; // Finished
}

export function initGlobalSearch(triggerEl) {
    if (!triggerEl) return;
    triggerEl.addEventListener('click', openSearchModal);
}

function openSearchModal() {
    const body = openModal({
        title: 'Search Officer',
        widthClass: 'max-w-lg',
        bodyHtml: `
            <div class="relative">
                <i class="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-lspd-textSecondary text-sm"></i>
                <input id="gs-input" type="text" placeholder="Search by officer name or badge number..." class="lspd-input pl-10 w-full" autocomplete="off">
            </div>
            <div id="gs-results" class="mt-3 max-h-80 overflow-y-auto space-y-1"></div>`
    });

    const input = body.querySelector('#gs-input');
    const results = body.querySelector('#gs-results');
    let lastMatches = [];

    function render() {
        const term = input.value.trim().toLowerCase();
        const enriched = withComputedFields(StorageService.getAll(), todayISO(), StorageService.getSettings().graceDays);

        if (!term) {
            results.innerHTML = `<p class="text-xs text-lspd-textSecondary text-center py-6">Start typing a name or badge number...</p>`;
            lastMatches = [];
            return;
        }

        // One entry per distinct officer, keeping their most operationally relevant record.
        const byOfficer = new Map();
        enriched.forEach(r => {
            if (!r.officerName.toLowerCase().includes(term) && !r.badgeNumber.toLowerCase().includes(term)) return;
            const key = r.officerName + '|' + r.badgeNumber;
            const existing = byOfficer.get(key);
            if (!existing || recordPriority(r) < recordPriority(existing) || (recordPriority(r) === recordPriority(existing) && r.startDate > existing.startDate)) {
                byOfficer.set(key, r);
            }
        });
        lastMatches = [...byOfficer.values()].sort((a, b) => a.officerName.localeCompare(b.officerName)).slice(0, 30);

        if (!lastMatches.length) {
            results.innerHTML = `<p class="text-xs text-lspd-textSecondary text-center py-6">No officer found matching "${escapeHtml(input.value.trim())}".</p>`;
            return;
        }

        results.innerHTML = lastMatches.map(r => `
            <button data-id="${r.id}" class="w-full flex items-center gap-3 py-2.5 px-2 rounded-lg hover:bg-lspd-navy/50 transition-colors text-left">
                ${avatarChip(r.officerName)}
                <div class="min-w-0 flex-1">
                    <p class="text-sm font-semibold text-lspd-text truncate">${escapeHtml(r.officerName)}</p>
                    <p class="text-[11px] text-lspd-textSecondary truncate">${escapeHtml(r.rank)} &middot; Badge #${escapeHtml(r.badgeNumber)} &middot; ${r.status}</p>
                </div>
                <i class="fa-solid fa-chevron-right text-lspd-textSecondary text-xs"></i>
            </button>`).join('');

        results.querySelectorAll('[data-id]').forEach(btn => {
            btn.addEventListener('click', () => {
                const rec = lastMatches.find(r => r.id === btn.dataset.id);
                if (!rec) return;
                closeModal();
                // Let the search modal fully close before opening the detail modal
                // (both use #modal-root - opening immediately would race the closing one).
                setTimeout(() => openOfficerDetailModal(rec, enriched), 60);
            });
        });
    }

    input.addEventListener('input', debounce(render, 120));
    input.focus();
    render();
}
