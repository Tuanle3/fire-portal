// Dán toàn bộ nội dung file này vào Extensions → Apps Script của Google Sheet "BCTC_SAG_2026".
// Sau khi dán, lưu lại, mở lại Sheet (F5 hoặc đóng/mở tab) để menu "🔄 Đồng bộ Firebase" xuất hiện.
//
// Đặt SYNC_URL đúng domain fire-portal đang deploy (ví dụ https://sonanland.vercel.app/api/sync-tai-chinh)
// và SYNC_SECRET đúng giá trị TAICHINH_SYNC_SECRET trong .env.local / Vercel của fire-portal.

const SYNC_URL = 'https://<domain-fire-portal>/api/sync-tai-chinh'
const SYNC_SECRET = 'dgqJzHDSawG0EonpuWbMcr3oyl8E_gs1'
const TABS = ['Data_TB', 'Data_PL', 'Data_BS', 'Data_AR', 'Data_AP']

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🔄 Đồng bộ Firebase')
    .addItem('Đồng bộ ngay', 'syncAllToFirebase')
    .addItem('Bật đồng bộ tự động hàng ngày (6h sáng)', 'installDailyTrigger')
    .addToUi()
}

function syncAllToFirebase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  const log = []
  for (const tab of TABS) {
    const sheet = ss.getSheetByName(tab)
    if (!sheet) { log.push(`${tab}: KHÔNG TÌM THẤY TAB`); continue }
    const values = sheet.getDataRange().getValues()
    try {
      const res = UrlFetchApp.fetch(SYNC_URL, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({ secret: SYNC_SECRET, tab, values }),
        muteHttpExceptions: true,
      })
      log.push(`${tab}: HTTP ${res.getResponseCode()} — ${res.getContentText().slice(0, 120)}`)
    } catch (e) {
      log.push(`${tab}: LỖI — ${e}`)
    }
  }
  SpreadsheetApp.getUi().alert(log.join('\n'))
}

// Chạy 1 lần (menu "Bật đồng bộ tự động...") để tạo lưới an toàn hàng ngày, song song với nút
// đồng bộ thủ công. Không dùng onEdit vì nhập liệu kế toán diễn ra thành cụm — trigger theo mỗi
// keystroke sẽ tốn quota vô ích.
function installDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'syncAllToFirebase') ScriptApp.deleteTrigger(t)
  })
  ScriptApp.newTrigger('syncAllToFirebase').timeBased().everyDays(1).atHour(6).create()
  SpreadsheetApp.getUi().alert('Đã bật đồng bộ tự động hàng ngày lúc 6h sáng.')
}
