/**
 * leave.js
 * ---------------------------------------------------------------------------
 * Leave Management: the sortable/searchable/filterable record table, the
 * Add/Edit form modal (Admin only), delete, and the shared Officer Detail
 * modal (reused by timeline.js and archive.js too).
 * ---------------------------------------------------------------------------
 */

import { StorageService } from './storage.js';
import {
    RANK_GROUPS, STATIONS, DIVISIONS, LEAVE_TYPES, STATUS_LIST, OPEN_ENDED_LEAVE_TYPE,
    withComputedFields, formatDate, formatDateTime, escapeHtml, debounce, todayISO
} from './utils.js';
import { toast, openModal, closeModal, confirmDialog, statusBadge, openEndedBadge, avatarChip, renderFilterBar, applyFilters } from './ui.js';

const TABLE_COLUMNS = ['Status', 'Officer', 'Badge', 'Rank', 'Station', 'Division', 'Leave Type', 'Start', 'End', 'Duration', 'Remaining', 'Notes'];

// ============================================================================
// TABLE RENDERING
// ============================================================================

export function renderLeaveTable(container, records, { editable = false, onView, onEdit, onDelete, onConfirmReturn } = {}) {
    if (!records.length) {
        container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-inbox text-3xl mb-3 opacity-50"></i><p>No leave records match your search or filters.</p></div>`;
        return;
    }
    const rows = records.map(r => `
        <tr class="hover:bg-lspd-navy/40 cursor-pointer transition-colors" data-id="${r.id}">
            <td class="px-3 py-3">${statusBadge(r.status)}</td>
            <td class="px-3 py-3">
                <div class="flex items-center gap-2.5 min-w-[10rem]">
                    ${avatarChip(r.officerName, 'h-8 w-8 text-[10px]')}
                    <span class="font-semibold text-lspd-text">${escapeHtml(r.officerName)}</span>
                </div>
            </td>
            <td class="px-3 py-3 font-mono text-lspd-textSecondary">${escapeHtml(r.badgeNumber)}</td>
            <td class="px-3 py-3 whitespace-nowrap">${escapeHtml(r.rank)}</td>
            <td class="px-3 py-3 whitespace-nowrap">${escapeHtml(r.station)}</td>
            <td class="px-3 py-3 whitespace-nowrap">${escapeHtml(r.division)}</td>
            <td class="px-3 py-3 whitespace-nowrap flex items-center">${escapeHtml(r.leaveType)}${r.leaveType === OPEN_ENDED_LEAVE_TYPE ? openEndedBadge() : ''}</td>
            <td class="px-3 py-3 whitespace-nowrap">${formatDate(r.startDate)}</td>
            <td class="px-3 py-3 whitespace-nowrap">${formatDate(r.endDate)}</td>
            <td class="px-3 py-3 text-center">${r.duration}d</td>
            <td class="px-3 py-3 text-center ${r.remainingDays === 0 ? 'text-lspd-textSecondary' : 'text-lspd-gold font-bold'}">${r.remainingDays > 0 ? r.remainingDays + 'd' : '-'}</td>
            <td class="px-3 py-3 max-w-[10rem] truncate text-lspd-textSecondary">${escapeHtml(r.notes || '-')}</td>
            <td class="px-3 py-3">
                <div class="flex items-center gap-3 text-sm">
                    <button data-action="view" title="View detail" class="text-lspd-textSecondary hover:text-lspd-gold transition-colors"><i class="fa-solid fa-eye"></i></button>
                    ${editable ? `
                    <button data-action="edit" title="Edit" class="text-lspd-textSecondary hover:text-status-active transition-colors"><i class="fa-solid fa-pen"></i></button>
                    <button data-action="delete" title="Delete" class="text-lspd-textSecondary hover:text-status-overdue transition-colors"><i class="fa-solid fa-trash"></i></button>
                    ${r.canConfirmReturn ? `<button data-action="confirm" title="Confirm officer is back on duty" class="text-status-active hover:text-status-active/70 transition-colors"><i class="fa-solid fa-user-check"></i></button>` : ''}` : ''}
                </div>
            </td>
        </tr>`).join('');

    container.innerHTML = `
        <div class="scroll-x-fade">
        <table class="lspd-table">
            <thead><tr>${TABLE_COLUMNS.map(c => `<th class="px-3 py-3 text-left whitespace-nowrap">${c}</th>`).join('')}<th class="px-3 py-3">Actions</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>
        </div>`;

    container.querySelectorAll('tbody tr').forEach(tr => {
        const record = records.find(r => r.id === tr.dataset.id);
        tr.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            const action = btn ? btn.dataset.action : 'view';
            if (action === 'view' && onView) onView(record);
            if (action === 'edit' && onEdit) onEdit(record);
            if (action === 'delete' && onDelete) onDelete(record);
            if (action === 'confirm' && onConfirmReturn) onConfirmReturn(record);
        });
    });
}

// ============================================================================
// SELF-MOUNTING LEAVE MANAGEMENT PAGE (search + filter + table + add button)
// ============================================================================

export function initLeaveManagement(container, { editable = true } = {}) {
    container.innerHTML = `
        <div class="flex flex-col lg:flex-row lg:items-center gap-3 mb-4">
            <div class="relative flex-1">
                <i class="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-lspd-textSecondary text-sm"></i>
                <input id="leave-search" type="text" placeholder="Search by officer name or badge number..." class="lspd-input pl-10 w-full" />
            </div>
            ${editable ? `<button id="btn-add-leave" class="btn-gold shrink-0"><i class="fa-solid fa-plus mr-2"></i>Add New Leave</button>` : ''}
        </div>
        <div id="leave-filter-bar" class="filter-bar mb-4"></div>
        <div class="lspd-card-panel p-0 overflow-hidden">
            <div id="leave-table-host" class="p-1"></div>
        </div>
        <p id="leave-result-count" class="text-xs text-lspd-textSecondary mt-3"></p>`;

    const searchInput = container.querySelector('#leave-search');
    const filterHost = container.querySelector('#leave-filter-bar');
    const tableHost = container.querySelector('#leave-table-host');
    const countEl = container.querySelector('#leave-result-count');

    const filterCtl = renderFilterBar(filterHost, [
        { key: 'rank', label: 'Rank', options: Object.values(RANK_GROUPS).flat() },
        { key: 'station', label: 'Station', options: STATIONS },
        { key: 'division', label: 'Division', options: DIVISIONS },
        { key: 'leaveType', label: 'Type', options: LEAVE_TYPES },
        { key: 'status', label: 'Status', options: STATUS_LIST }
    ], () => render());

    function render() {
        const settings = StorageService.getSettings();
        const enriched = withComputedFields(StorageService.getAll(), todayISO(), settings.graceDays)
            .sort((a, b) => b.startDate.localeCompare(a.startDate));
        const term = searchInput.value.trim().toLowerCase();
        let filtered = applyFilters(enriched, filterCtl.getState(), { statusOf: r => r.status });
        if (term) {
            filtered = filtered.filter(r => r.officerName.toLowerCase().includes(term) || r.badgeNumber.toLowerCase().includes(term));
        }
        renderLeaveTable(tableHost, filtered, {
            editable,
            onView: (r) => openOfficerDetailModal(r, enriched),
            onEdit: (r) => openLeaveFormModal(r),
            onDelete: (r) => handleDelete(r),
            onConfirmReturn: (r) => handleConfirmReturn(r)
        });
        countEl.textContent = `Showing ${filtered.length} of ${enriched.length} record${enriched.length === 1 ? '' : 's'}.`;
    }

    searchInput.addEventListener('input', debounce(render, 150));
    if (editable) container.querySelector('#btn-add-leave').addEventListener('click', () => openLeaveFormModal(null));

    render();
    document.addEventListener('lspd:data-changed', render);
    return { render };
}

async function handleDelete(record) {
    const ok = await confirmDialog(`Delete the leave record for <strong class="text-lspd-text">${escapeHtml(record.officerName)}</strong> (${formatDate(record.startDate)} - ${formatDate(record.endDate)})? This cannot be undone.`, { confirmLabel: 'Delete Record' });
    if (!ok) return;
    try {
        await StorageService.remove(record.id);
        toast('Leave record deleted.', 'success');
    } catch (err) {
        toast('Could not delete: ' + err.message, 'error');
    }
}

/**
 * The only way a record leaves "pending confirmation" (Active / Returning
 * Today / Overdue / AWOL) and becomes Finished: Command explicitly confirms
 * the officer is back on duty. Writes straight to Firestore, so the change
 * is visible on the Public Dashboard for everyone immediately.
 */
async function handleConfirmReturn(record) {
    const ok = await confirmDialog(
        `Confirm that <strong class="text-lspd-text">${escapeHtml(record.officerName)}</strong> has returned to duty? This moves the record to Finished / Leave Archive${record.status === 'AWOL' ? ' and clears the AWOL flag' : ''}.`,
        { confirmLabel: 'Confirm Returned', danger: false }
    );
    if (!ok) return;
    try {
        await StorageService.update(record.id, { confirmedReturned: true, confirmedAt: new Date().toISOString() });
        toast(`${record.officerName} confirmed back on duty.`, 'success');
    } catch (err) {
        toast('Could not confirm: ' + err.message, 'error');
    }
}

// ============================================================================
// ADD / EDIT FORM MODAL
// ============================================================================

function optionsHtml(list, selected) {
    return list.map(v => `<option value="${v}" ${v === selected ? 'selected' : ''}>${v}</option>`).join('');
}

function rankOptionsHtml(selected) {
    return Object.entries(RANK_GROUPS).map(([group, ranks]) => `
        <optgroup label="${group}">${optionsHtml(ranks, selected)}</optgroup>`).join('');
}

function formTemplate(r) {
    const v = r || { officerName: '', badgeNumber: '', rank: '', station: '', division: '', leaveType: '', reason: '', startDate: todayISO(), endDate: todayISO(), notes: '' };
    return `
    <form id="leave-form" novalidate>
        <div class="grid sm:grid-cols-2 gap-4">
            <div class="sm:col-span-2 relative">
                <label class="lspd-label">Officer Name *</label>
                <input required id="f-officerName" autocomplete="off" class="lspd-input w-full" value="${escapeHtml(v.officerName)}" placeholder="e.g. John Kowalski">
                <div id="officer-suggestions" class="autocomplete-list hidden"></div>
            </div>
            <div>
                <label class="lspd-label">Badge Number *</label>
                <input required id="f-badgeNumber" class="lspd-input w-full font-mono" value="${escapeHtml(v.badgeNumber)}" placeholder="e.g. 7041">
            </div>
            <div>
                <label class="lspd-label">Rank *</label>
                <select required id="f-rank" class="lspd-input w-full">
                    <option value="" disabled ${!v.rank ? 'selected' : ''}>-- Select Rank --</option>
                    ${rankOptionsHtml(v.rank)}
                </select>
            </div>
            <div>
                <label class="lspd-label">Station *</label>
                <select required id="f-station" class="lspd-input w-full">
                    <option value="" disabled ${!v.station ? 'selected' : ''}>-- Select Station --</option>
                    ${optionsHtml(STATIONS, v.station)}
                </select>
            </div>
            <div>
                <label class="lspd-label">Division *</label>
                <select required id="f-division" class="lspd-input w-full">
                    <option value="" disabled ${!v.division ? 'selected' : ''}>-- Select Division --</option>
                    ${optionsHtml(DIVISIONS, v.division)}
                </select>
            </div>
            <div class="sm:col-span-2">
                <label class="lspd-label">Leave Type *</label>
                <select required id="f-leaveType" class="lspd-input w-full">
                    <option value="" disabled ${!v.leaveType ? 'selected' : ''}>-- Select Leave Type --</option>
                    ${optionsHtml(LEAVE_TYPES, v.leaveType)}
                </select>
            </div>
            <div class="sm:col-span-2">
                <label class="lspd-label">Reason</label>
                <input id="f-reason" class="lspd-input w-full" value="${escapeHtml(v.reason || '')}" placeholder="Brief reason (optional)">
            </div>
            <div>
                <label class="lspd-label">Start Date *</label>
                <input required type="date" id="f-startDate" class="lspd-input w-full" value="${v.startDate}">
            </div>
            <div>
                <label class="lspd-label">End Date *</label>
                <input required type="date" id="f-endDate" class="lspd-input w-full" value="${v.endDate}">
            </div>
            <div class="sm:col-span-2">
                <label class="lspd-label">Notes</label>
                <textarea id="f-notes" rows="2" class="lspd-input w-full resize-none">${escapeHtml(v.notes || '')}</textarea>
            </div>
        </div>
        <p id="form-error" class="text-status-overdue text-xs font-semibold mt-3 hidden"></p>
        <div class="flex justify-end gap-3 mt-6">
            <button type="button" id="form-cancel" class="px-4 py-2 rounded-lg text-sm font-semibold bg-lspd-card text-lspd-text hover:opacity-80 transition">Cancel</button>
            <button type="submit" id="form-submit" class="btn-gold">${r ? 'Save Changes' : 'Add Leave Record'}</button>
        </div>
    </form>`;
}

export function openLeaveFormModal(existing) {
    let cleanupAutocomplete = null;
    const body = openModal({
        title: existing ? 'Edit Leave Record' : 'Input New Leave Record',
        bodyHtml: formTemplate(existing),
        widthClass: 'max-w-2xl',
        onClose: () => { if (cleanupAutocomplete) cleanupAutocomplete(); }
    });
    const $ = (sel) => body.querySelector(sel);

    cleanupAutocomplete = wireOfficerAutocomplete($('#f-officerName'), {
        badge: $('#f-badgeNumber'), rank: $('#f-rank'), station: $('#f-station'), division: $('#f-division'), box: $('#officer-suggestions')
    });

    $('#form-cancel').addEventListener('click', () => closeModal());

    $('#leave-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            officerName: $('#f-officerName').value.trim(),
            badgeNumber: $('#f-badgeNumber').value.trim(),
            rank: $('#f-rank').value,
            station: $('#f-station').value,
            division: $('#f-division').value,
            leaveType: $('#f-leaveType').value,
            reason: $('#f-reason').value.trim(),
            startDate: $('#f-startDate').value,
            endDate: $('#f-endDate').value,
            notes: $('#f-notes').value.trim()
        };
        const errEl = $('#form-error');
        if (!payload.officerName || !payload.badgeNumber || !payload.rank || !payload.station || !payload.division || !payload.leaveType || !payload.startDate || !payload.endDate) {
            errEl.textContent = 'Please fill in all required fields.';
            errEl.classList.remove('hidden');
            return;
        }
        if (payload.endDate < payload.startDate) {
            errEl.textContent = 'End Date cannot be earlier than Start Date.';
            errEl.classList.remove('hidden');
            return;
        }
        const submitBtn = $('#form-submit');
        const originalLabel = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';
        try {
            if (existing) {
                await StorageService.update(existing.id, payload);
                toast('Leave record updated.', 'success');
            } else {
                await StorageService.add(payload);
                toast('Leave record added.', 'success');
            }
            closeModal();
        } catch (err) {
            errEl.textContent = 'Could not save: ' + err.message;
            errEl.classList.remove('hidden');
            submitBtn.disabled = false;
            submitBtn.textContent = originalLabel;
        }
    });
}

function wireOfficerAutocomplete(nameInput, refs) {
    nameInput.addEventListener('input', debounce(() => {
        const term = nameInput.value.trim().toLowerCase();
        refs.box.classList.add('hidden');
        refs.box.innerHTML = '';
        if (term.length < 2) return;
        const seen = new Map();
        StorageService.getAll().forEach(r => {
            if (r.officerName.toLowerCase().includes(term) && !seen.has(r.officerName)) seen.set(r.officerName, r);
        });
        const matches = [...seen.values()].slice(0, 6);
        if (!matches.length) return;
        refs.box.innerHTML = matches.map(m => `
            <button type="button" class="autocomplete-item" data-name="${escapeHtml(m.officerName)}">
                <span class="font-semibold text-lspd-text">${escapeHtml(m.officerName)}</span>
                <span class="text-lspd-textSecondary text-xs ml-2">#${escapeHtml(m.badgeNumber)} · ${escapeHtml(m.rank)}</span>
            </button>`).join('');
        refs.box.classList.remove('hidden');
        refs.box.querySelectorAll('.autocomplete-item').forEach(btn => {
            btn.addEventListener('click', () => {
                const match = matches.find(m => m.officerName === btn.dataset.name);
                nameInput.value = match.officerName;
                refs.badge.value = match.badgeNumber;
                refs.rank.value = match.rank;
                refs.station.value = match.station;
                refs.division.value = match.division;
                refs.box.classList.add('hidden');
            });
        });
    }, 150));
    const outsideClickHandler = (e) => {
        if (!refs.box.contains(e.target) && e.target !== nameInput) refs.box.classList.add('hidden');
    };
    document.addEventListener('click', outsideClickHandler);
    return () => document.removeEventListener('click', outsideClickHandler);
}

// ============================================================================
// OFFICER DETAIL MODAL (reused by timeline.js / archive.js)
// ============================================================================

export function openOfficerDetailModal(record, allEnrichedRecords) {
    const history = (allEnrichedRecords || withComputedFields(StorageService.getAll()))
        .filter(r => r.officerName === record.officerName && r.badgeNumber === record.badgeNumber)
        .sort((a, b) => b.startDate.localeCompare(a.startDate));

    const body = openModal({
        title: 'Officer Leave Detail',
        widthClass: 'max-w-xl',
        bodyHtml: `
        <div class="flex items-center gap-4 mb-5">
            ${avatarChip(record.officerName, 'h-14 w-14 text-base')}
            <div>
                <p class="text-lg font-bold text-lspd-text">${escapeHtml(record.officerName)}</p>
                <p class="text-xs text-lspd-textSecondary font-mono">Badge #${escapeHtml(record.badgeNumber)} · ${escapeHtml(record.rank)}</p>
            </div>
            <div class="ml-auto">${statusBadge(record.status, { size: 'md' })}</div>
        </div>
        <div class="grid grid-cols-2 gap-x-4 gap-y-3 text-sm mb-5 p-4 rounded-lg bg-lspd-navy/50 border border-lspd-border">
            <div><p class="detail-label">Station</p><p class="detail-value">${escapeHtml(record.station)}</p></div>
            <div><p class="detail-label">Division</p><p class="detail-value">${escapeHtml(record.division)}</p></div>
            <div><p class="detail-label">Leave Type</p><p class="detail-value flex items-center">${escapeHtml(record.leaveType)}${record.leaveType === OPEN_ENDED_LEAVE_TYPE ? openEndedBadge() : ''}</p></div>
            <div><p class="detail-label">Duration</p><p class="detail-value">${record.duration} day${record.duration === 1 ? '' : 's'}</p></div>
            <div><p class="detail-label">Start Date</p><p class="detail-value">${formatDate(record.startDate)}</p></div>
            <div><p class="detail-label">End Date</p><p class="detail-value">${formatDate(record.endDate)}</p></div>
            <div><p class="detail-label">Remaining</p><p class="detail-value">${record.remainingDays > 0 ? record.remainingDays + ' day(s)' : '-'}</p></div>
            <div><p class="detail-label">Return Date</p><p class="detail-value">${formatDate(record.returnDate)}</p></div>
            ${record.confirmedReturned ? `<div class="col-span-2"><p class="detail-label">Return Confirmed</p><p class="detail-value text-status-active"><i class="fa-solid fa-circle-check mr-1"></i>${record.confirmedAt ? formatDateTime(record.confirmedAt) : 'Yes'}</p></div>` : ''}
            ${record.reason ? `<div class="col-span-2"><p class="detail-label">Reason</p><p class="detail-value">${escapeHtml(record.reason)}</p></div>` : ''}
            ${record.notes ? `<div class="col-span-2"><p class="detail-label">Notes</p><p class="detail-value">${escapeHtml(record.notes)}</p></div>` : ''}
        </div>
        <p class="text-[11px] font-bold uppercase tracking-wider text-lspd-gold mb-2">Complete Leave History (${history.length})</p>
        <div class="max-h-48 overflow-y-auto space-y-1.5 pr-1">
            ${history.map(h => `
                <div class="flex items-center justify-between text-xs py-1.5 px-2 rounded ${h.id === record.id ? 'bg-lspd-gold/10 border border-lspd-gold/30' : ''}">
                    <span class="text-lspd-textSecondary flex items-center">${formatDate(h.startDate)} - ${formatDate(h.endDate)} &middot; ${escapeHtml(h.leaveType)}${h.leaveType === OPEN_ENDED_LEAVE_TYPE ? openEndedBadge() : ''}</span>
                    ${statusBadge(h.status)}
                </div>`).join('')}
        </div>`
    });
}
