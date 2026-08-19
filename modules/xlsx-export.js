/**
 * xlsx-export.js
 * ---------------------------------------------------------------------------
 * Builds a neatly formatted, fully-bordered .xlsx workbook from an array of
 * enriched leave records, using ExcelJS (loaded via CDN in the HTML - see
 * SKILL note in report.js/archive.js). Shared by both Reports > Export and
 * Leave Archive > Export, on the Admin and Public dashboards alike, so the
 * exported file always matches exactly what's stored live in Firestore.
 * ---------------------------------------------------------------------------
 */
/* global ExcelJS */

import { formatDate, downloadBlob } from './utils.js';

const COLUMNS = [
    { header: 'Status', key: 'status', width: 15 },
    { header: 'Officer', key: 'officerName', width: 22 },
    { header: 'Badge', key: 'badgeNumber', width: 10 },
    { header: 'Rank', key: 'rank', width: 18 },
    { header: 'Station', key: 'station', width: 20 },
    { header: 'Division', key: 'division', width: 18 },
    { header: 'Leave Type', key: 'leaveType', width: 20 },
    { header: 'Start', key: 'startDate', width: 12 },
    { header: 'End', key: 'endDate', width: 12 },
    { header: 'Duration (days)', key: 'duration', width: 14 },
    { header: 'Remaining Days', key: 'remainingDays', width: 14 },
    { header: 'Return Confirmed', key: 'confirmedReturnedLabel', width: 16 },
    { header: 'Reason', key: 'reason', width: 26 },
    { header: 'Notes', key: 'notes', width: 28 }
];

const STATUS_FILL = {
    Upcoming: 'FFFEF3C7', Active: 'FFD1FAE5', 'Returning Today': 'FFDBEAFE',
    Overdue: 'FFFFE4CC', AWOL: 'FFFECACA', Finished: 'FFE2E8F0'
};
const BORDER_COLOR = { argb: 'FF94A3B8' };
const THIN = { style: 'thin', color: BORDER_COLOR };
const ALL_BORDERS = { top: THIN, left: THIN, bottom: THIN, right: THIN };

/**
 * @param {Array} records - enriched records (withComputedFields output)
 * @param {Object} opts - { filename, sheetName, title }
 */
export async function exportRecordsToXlsx(records, { filename, sheetName = 'Leave Records', title } = {}) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'LSPD Notice Board';
    workbook.created = new Date();
    const sheet = workbook.addWorksheet(sheetName);

    COLUMNS.forEach((c, i) => { sheet.getColumn(i + 1).width = c.width; });

    let rowNum = 1;
    if (title) {
        sheet.mergeCells(rowNum, 1, rowNum, COLUMNS.length);
        const titleCell = sheet.getCell(rowNum, 1);
        titleCell.value = title;
        titleCell.font = { bold: true, size: 14, color: { argb: 'FF0F172A' } };
        sheet.getRow(rowNum).height = 22;
        rowNum++;

        sheet.mergeCells(rowNum, 1, rowNum, COLUMNS.length);
        const genCell = sheet.getCell(rowNum, 1);
        genCell.value = `Generated ${new Date().toLocaleString('en-GB')} - ${records.length} record${records.length === 1 ? '' : 's'}`;
        genCell.font = { italic: true, size: 9, color: { argb: 'FF64748B' } };
        rowNum++;
        rowNum++; // blank spacer row before the table
    }

    const headerRowNum = rowNum;
    const headerRow = sheet.getRow(headerRowNum);
    COLUMNS.forEach((c, i) => {
        const cell = headerRow.getCell(i + 1);
        cell.value = c.header;
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
        cell.border = ALL_BORDERS;
    });
    headerRow.height = 20;
    rowNum++;

    records.forEach(r => {
        const row = sheet.getRow(rowNum);
        COLUMNS.forEach((c, i) => {
            const cell = row.getCell(i + 1);
            let val;
            if (c.key === 'startDate' || c.key === 'endDate') val = formatDate(r[c.key]);
            else if (c.key === 'confirmedReturnedLabel') val = r.confirmedReturned ? 'Yes' : 'No';
            else val = r[c.key];
            cell.value = (val === undefined || val === null || val === '') ? '-' : val;
            cell.alignment = { vertical: 'middle', wrapText: c.key === 'reason' || c.key === 'notes' };
            cell.border = ALL_BORDERS;
            if (c.key === 'status') {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STATUS_FILL[r.status] || 'FFFFFFFF' } };
                cell.font = { bold: true };
            }
        });
        rowNum++;
    });

    sheet.views = [{ state: 'frozen', ySplit: headerRowNum }];

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    downloadBlob(filename, blob);
}
