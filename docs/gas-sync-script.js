/**
 * GAS SCRIPT - Dán vào Google Apps Script của Sheet NOXH Nguyễn Trãi
 * URL Sheet: https://docs.google.com/spreadsheets/d/15shx_icL1B07iVP-Ho7U8Ixu3fyotMTynKhkevmFk7I
 *
 * Sau khi dán:
 *   1. Triển khai → Triển khai mới → Web App
 *   2. Thực thi dưới dạng: Bản thân (Me)
 *   3. Ai có quyền truy cập: Mọi người (Anyone)
 *   4. Copy URL mới → paste vào fire-portal .env NEXT_PUBLIC_GAS_WRITE_URL
 */

const SHEET_ID = '15shx_icL1B07iVP-Ho7U8Ixu3fyotMTynKhkevmFk7I';

// ─── READ (giữ nguyên hành vi cũ) ────────────────────────────────────────────
function doGet(e) {
  try {
    const sheetName = e.parameter.sheet;
    const ss   = SpreadsheetApp.openById(SHEET_ID);
    const sheet = sheetName ? ss.getSheetByName(sheetName) : ss.getSheets()[0];
    if (!sheet) return jsonErr('Sheet not found: ' + sheetName);

    const data  = sheet.getDataRange().getValues();
    const rows  = data.map(row => row.map(cell =>
      cell instanceof Date
        ? Utilities.formatDate(cell, Session.getScriptTimeZone(), 'dd/MM/yyyy')
        : String(cell)
    ));
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, rows }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return jsonErr(err.message);
  }
}

// ─── WRITE (mới) ──────────────────────────────────────────────────────────────
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const action  = payload.action;

    if (action === 'syncChungTu') {
      // Ghi đè toàn bộ: rows = [{loai, don_vi, ngay, mo_ta, so_tien, chung_tu_so, ghi_chu, link_file}]
      const rows   = payload.rows || [];
      const thuRows = rows.filter(r => r.loai === 'Thu');
      const chiRows = rows.filter(r => r.loai === 'Chi');

      const ss = SpreadsheetApp.openById(SHEET_ID);
      writeToSheet(ss.getSheets()[0], thuRows);          // Tab đầu = Thu
      writeToSheet(getOrCreate(ss, 'Chi'), chiRows);     // Tab Chi

      return jsonOk({ thu: thuRows.length, chi: chiRows.length });
    }

    if (action === 'addRow') {
      // Thêm 1 dòng: row = {loai, don_vi, ngay, mo_ta, so_tien, ...}
      const row = payload.row;
      const ss  = SpreadsheetApp.openById(SHEET_ID);
      const sheet = row.loai === 'Thu' ? ss.getSheets()[0] : getOrCreate(ss, 'Chi');
      appendRow(sheet, row);
      updateTotal(sheet);
      return jsonOk({ appended: 1 });
    }

    if (action === 'deleteRow') {
      // Xóa theo mã chứng từ: chung_tu_so
      const maCT = payload.chung_tu_so;
      const loai = payload.loai;
      const ss   = SpreadsheetApp.openById(SHEET_ID);
      const sheet = loai === 'Thu' ? ss.getSheets()[0] : ss.getSheetByName('Chi');
      if (!sheet) return jsonOk({ deleted: 0 });

      const data    = sheet.getDataRange().getValues();
      let deleted   = 0;
      for (let i = data.length - 1; i >= 2; i--) {
        if (String(data[i][4]).trim() === maCT) {
          sheet.deleteRow(i + 1);
          deleted++;
        }
      }
      updateTotal(sheet);
      return jsonOk({ deleted });
    }

    return jsonErr('Unknown action: ' + action);
  } catch(err) {
    return jsonErr(err.message);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function writeToSheet(sheet, rows) {
  // Xóa data cũ từ hàng 3 trở đi (giữ hàng 1 = tổng, hàng 2 = header)
  const lastRow = sheet.getLastRow();
  if (lastRow >= 3) sheet.getRange(3, 1, lastRow - 2, 7).clearContent();

  // Ghi data mới
  if (rows.length > 0) {
    const vals = rows.map(r => [
      r.don_vi   || '',
      fmtDate(r.ngay),
      r.mo_ta    || '',
      r.so_tien  || 0,
      r.chung_tu_so || '',
      r.ghi_chu  || '',
      r.link_file|| '',
    ]);
    sheet.getRange(3, 1, vals.length, 7).setValues(vals);
  }

  // Cập nhật tổng
  updateTotal(sheet);

  // Đảm bảo header hàng 2
  sheet.getRange(2, 1, 1, 7).setValues([[
    'Đơn vị', '', 'Nội dung', '', 'Mã chứng từ', 'Ghi chú', 'File đính kèm'
  ]]);
}

function appendRow(sheet, r) {
  const nextRow = Math.max(sheet.getLastRow() + 1, 3);
  sheet.getRange(nextRow, 1, 1, 7).setValues([[
    r.don_vi || '', fmtDate(r.ngay), r.mo_ta || '',
    r.so_tien || 0, r.chung_tu_so || '', r.ghi_chu || '', r.link_file || '',
  ]]);
}

function updateTotal(sheet) {
  const last = sheet.getLastRow();
  if (last < 3) { sheet.getRange(1, 4).setValue(0); return; }
  const total = sheet.getRange(3, 4, last - 2, 1).getValues()
    .flat().reduce((s, v) => s + (Number(v) || 0), 0);
  sheet.getRange(1, 4).setValue(total);
}

function getOrCreate(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function fmtDate(d) {
  // yyyy-MM-dd → dd/MM/yyyy
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(d);
}

function jsonOk(data)  {
  return ContentService.createTextOutput(JSON.stringify({ ok: true,  ...data }))
    .setMimeType(ContentService.MimeType.JSON);
}
function jsonErr(msg) {
  return ContentService.createTextOutput(JSON.stringify({ ok: false, error: msg }))
    .setMimeType(ContentService.MimeType.JSON);
}
