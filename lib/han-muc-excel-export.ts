'use client'

/**
 * han-muc-excel-export.ts
 * ─────────────────────────────────────────────────────────────
 * Xuất Excel (.xlsx) cho module Hạn mức tín dụng — dùng chung cho
 * cả 2 tab "Tín dụng dài hạn" (HopDongTinDung + KyTraNo) và
 * "Hạn mức ngắn hạn" (HanMucNganHan + BoHoSoGiaiNgan + KyThuNH).
 *
 * Mỗi hàm build 1 workbook rồi tải xuống trực tiếp trên trình duyệt
 * (không qua server) bằng thư viện SheetJS (`xlsx`).
 *
 * Cài đặt (nếu repo chưa có):
 *   npm install xlsx
 * ─────────────────────────────────────────────────────────────
 */

import * as XLSX from 'xlsx'
import { HopDongTinDung, KyTraNo } from '@/lib/han-muc-types'
import { HanMucNganHan, BoHoSoGiaiNgan, KyThuNH, TraGocGiuaKy } from '@/lib/han-muc-ngan-han-types'

// ── Helpers dùng chung ──────────────────────────────────────
function downloadWorkbook(wb: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(wb, filename, { bookType: 'xlsx' })
}

/** Tên sheet Excel: bỏ ký tự cấm, giới hạn 31 ký tự */
function safeSheetName(name: string, usedNames: Set<string>): string {
  let base = (name || 'Sheet').replace(/[:\\/?*\[\]]/g, '-').trim().slice(0, 31) || 'Sheet'
  let final = base
  let i = 2
  while (usedNames.has(final)) {
    const suffix = `-${i}`
    final = base.slice(0, 31 - suffix.length) + suffix
    i++
  }
  usedNames.add(final)
  return final
}

/** Tự co giãn độ rộng cột theo nội dung dài nhất mỗi cột (ước lượng) */
function autoWidth(aoa: (string | number | null | undefined)[][]): { wch: number }[] {
  const widths: number[] = []
  aoa.forEach(row => {
    row.forEach((cell, i) => {
      const len = cell == null ? 0 : String(cell).length
      widths[i] = Math.max(widths[i] ?? 8, Math.min(len + 2, 42))
    })
  })
  return widths.map(w => ({ wch: w }))
}

function sheetFromAoa(aoa: (string | number | null | undefined)[][]): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = autoWidth(aoa)
  return ws
}

const todayFile = () => new Date().toISOString().slice(0, 10)

// ═════════════════════════════════════════════════════════════
// TAB "TÍN DỤNG DÀI HẠN" — HopDongTinDung + KyTraNo
// ═════════════════════════════════════════════════════════════

const TRANG_THAI_HD_LABEL: Record<string, string> = {
  'dang-vay': 'Đang vay', 'binh-thuong': 'Bình thường', 'gan-dao-han': 'Gần đáo hạn',
  'qua-han': 'Quá hạn', 'tat-toan': 'Tất toán',
}
const KY_TRA_NO_STATUS_LABEL: Record<string, string> = {
  'chua-tra': 'Chưa trả', 'gan-han': 'Gần hạn', 'qua-han': 'Quá hạn',
  'da-tra': 'Đã trả', 'co-cau': 'Đã cơ cấu',
}

/** Bảng "Thông tin hợp đồng" dạng key-value cho 1 HopDongTinDung */
function hopDongInfoAoa(hd: HopDongTinDung): (string | number | null)[][] {
  const rows: (string | number | null)[][] = [
    ['Số hợp đồng', hd.soHopDong],
    ['Pháp nhân', hd.entity],
    ['Người vay / đứng tên', hd.nguoiVay || ''],
    ['Ngân hàng', hd.nganHang],
    ['Chi nhánh', hd.chiNhanh || ''],
    ['Hạn mức (VNĐ)', hd.hanMuc],
    ['Số tiền giải ngân (VNĐ)', hd.soTienGiaiNgan],
    ['Loại lãi suất', hd.laiSuatLoai === 'tha-noi' ? 'Thả nổi (có ưu đãi)' : 'Cố định'],
    ['Lãi suất (%/năm)', hd.laiSuat],
  ]
  if (hd.laiSuatLoai === 'tha-noi') {
    rows.push(['Số tháng ưu đãi', hd.soThangUuDai ?? ''])
    rows.push(['Lãi suất sau ưu đãi (%/năm)', hd.laiSuatSauUuDai ?? ''])
  }
  rows.push(
    ['Phương thức trả gốc', hd.phuongThuc],
    ['Kỳ trả lãi', hd.kyTra === 'monthly' ? 'Hàng tháng' : hd.kyTra === 'quarterly' ? 'Hàng quý' : 'Lưu động'],
    ['Kỳ trả gốc', hd.kyTraGoc || '(đồng nhất với kỳ trả lãi)'],
    ['Ân hạn gốc (số kỳ đầu chỉ trả lãi)', hd.soKyAnHan ?? ''],
    ['Gốc cứng/kỳ theo NH (VNĐ)', hd.gocTraCoDinh ?? ''],
    ['Ngày ký', hd.ngayKy],
    ['Ngày trả gốc đầu tiên (nếu lẻ ngày)', hd.ngayTraGocDauTien || ''],
    ['Ngày đáo hạn', hd.ngayDaoHan],
    ['Trạng thái', TRANG_THAI_HD_LABEL[hd.trangThai] ?? hd.trangThai],
    ['Loại hợp đồng', hd.loaiHD === 'han-muc-khung' ? 'Hạn mức khung' : 'Thông thường'],
    ['Thuộc hạn mức khung (ID)', hd.hanMucKhungId || ''],
    ['Số bộ hồ sơ', hd.soBoHoSo || ''],
    ['Ghi chú', hd.ghiChu || ''],
  )
  return [['THÔNG TIN HỢP ĐỒNG'], ...rows]
}

const KY_TRA_NO_HEADER = [
  'Kỳ', 'Ngày trả (KH)', 'Ngày thực trả', 'Dư nợ đầu kỳ',
  'Gốc phải trả', 'Gốc thực trả', 'Lãi phải trả', 'Lãi thực trả',
  'Tổng phải trả', 'Chênh lệch thực trả', 'Dư nợ cuối kỳ', 'Trạng thái',
]

function kyTraNoRows(rows: KyTraNo[]): (string | number | null)[][] {
  return rows.map(k => {
    const thucTong = k.trangThai === 'da-tra' && k.gocThucTra != null
      ? (k.gocThucTra ?? 0) + (k.laiThucTra ?? 0) : null
    const lech = thucTong != null ? thucTong - k.tongTra : null
    return [
      k.soKy, k.ngayTra, k.ngayThucTra || '', k.dunNoDauKy,
      k.gocTra, k.gocThucTra ?? '', k.laiTra, k.laiThucTra ?? '',
      k.tongTra, lech ?? '', k.dunNoCuoiKy,
      KY_TRA_NO_STATUS_LABEL[k.trangThai] ?? k.trangThai,
    ]
  })
}

/** Xuất Excel chi tiết 1 hợp đồng tín dụng dài hạn: sheet Thông tin + sheet Lịch trả nợ */
export function exportHopDongDaiHanExcel(hopDong: HopDongTinDung, kyList: KyTraNo[]) {
  const wb = XLSX.utils.book_new()
  const used = new Set<string>()

  XLSX.utils.book_append_sheet(wb, sheetFromAoa(hopDongInfoAoa(hopDong)), safeSheetName('Thông tin', used))
  XLSX.utils.book_append_sheet(
    wb,
    sheetFromAoa([KY_TRA_NO_HEADER, ...kyTraNoRows(kyList)]),
    safeSheetName('Lịch trả nợ', used),
  )

  downloadWorkbook(wb, `${hopDong.soHopDong}_chi-tiet_${todayFile()}.xlsx`)
}

/**
 * Xuất Excel toàn bộ danh sách hợp đồng dài hạn:
 * sheet "Tổng hợp" (1 dòng/HĐ) + 1 sheet lịch trả nợ riêng cho từng HĐ.
 */
export function exportDanhSachHopDongDaiHanExcel(
  hopDongs: HopDongTinDung[],
  kyMap: Record<string, KyTraNo[]>,
  fileLabel = 'Tin-dung-dai-han',
) {
  const wb = XLSX.utils.book_new()
  const used = new Set<string>()

  const tongHopHeader = [
    'Số hợp đồng', 'Pháp nhân', 'Ngân hàng', 'Chi nhánh', 'Hạn mức', 'Giải ngân',
    'Lãi suất (%)', 'Ngày ký', 'Đáo hạn', 'Trạng thái',
    'Số kỳ gốc đã trả', 'Số kỳ lãi đã trả', 'Gốc đã trả', 'Lãi đã trả', 'Dư nợ gốc còn lại',
  ]
  const tongHopRows = hopDongs.map(h => {
    const rows = kyMap[h.id] ?? []
    const daTra = rows.filter(k => k.trangThai === 'da-tra')
    const goc = daTra.reduce((s, k) => s + (k.gocThucTra ?? k.gocTra), 0)
    const lai = daTra.reduce((s, k) => s + (k.laiThucTra ?? k.laiTra), 0)
    const soKyGocDaTra = daTra.filter(k => (k.gocThucTra ?? k.gocTra) > 0).length
    return [
      h.soHopDong, h.entity, h.nganHang, h.chiNhanh || '', h.hanMuc, h.soTienGiaiNgan,
      h.laiSuat, h.ngayKy, h.ngayDaoHan, TRANG_THAI_HD_LABEL[h.trangThai] ?? h.trangThai,
      soKyGocDaTra, daTra.length, goc, lai, Math.max(0, h.soTienGiaiNgan - goc),
    ]
  })
  XLSX.utils.book_append_sheet(wb, sheetFromAoa([tongHopHeader, ...tongHopRows]), safeSheetName('Tổng hợp', used))

  hopDongs.forEach(h => {
    const rows = kyMap[h.id] ?? []
    if (!rows.length) return
    XLSX.utils.book_append_sheet(
      wb,
      sheetFromAoa([KY_TRA_NO_HEADER, ...kyTraNoRows(rows)]),
      safeSheetName(h.soHopDong, used),
    )
  })

  downloadWorkbook(wb, `${fileLabel}_${todayFile()}.xlsx`)
}

// ═════════════════════════════════════════════════════════════
// TAB "HẠN MỨC NGẮN HẠN" — HanMucNganHan + BoHoSoGiaiNgan + KyThuNH
// ═════════════════════════════════════════════════════════════

const TRANG_THAI_KHUNG_LABEL: Record<string, string> = {
  'con-hieu-luc': 'Còn hiệu lực', 'gan-het-han': 'Gần hết hạn', 'het-han': 'Hết hạn',
}
const TRANG_THAI_BO_LABEL: Record<string, string> = {
  'dang-vay': 'Đang vay', 'binh-thuong': 'Bình thường', 'gan-dao-han': 'Gần đáo hạn',
  'qua-han': 'Quá hạn', 'tat-toan': 'Tất toán',
}
const TRANG_THAI_KY_THU_LABEL: Record<string, string> = {
  'chua-thu': 'Chưa thu', 'gan-han': 'Gần hạn', 'qua-han': 'Quá hạn', 'da-thu': 'Đã thu',
}

const KY_THU_HEADER = [
  'Kỳ', 'Ngày thu (KH)', 'Ngày thực thu', 'Loại', 'Dư nợ đầu kỳ',
  'Gốc phải thu', 'Gốc thực thu', 'Lãi phải thu', 'Lãi thực thu', 'Tổng thu', 'Dư nợ cuối kỳ', 'Trạng thái',
]

function kyThuRows(rows: KyThuNH[]): (string | number | null)[][] {
  return rows.map(k => [
    k.soKy, k.ngayThu, k.ngayThucThu || '',
    k.loai === 'goc-va-lai' ? 'Gốc + Lãi' : k.loai === 'goc' ? 'Gốc' : 'Lãi',
    k.dunNoDauKy, k.gocThu, k.gocThucThu ?? '', k.laiThu, k.laiThucThu ?? '',
    k.tongThu, k.dunNoCuoiKy, TRANG_THAI_KY_THU_LABEL[k.trangThai] ?? k.trangThai,
  ])
}

function boHoSoInfoAoa(bo: BoHoSoGiaiNgan, khung: HanMucNganHan): (string | number | null)[][] {
  return [
    ['THÔNG TIN BỘ HỒ SƠ GIẢI NGÂN'],
    ['Bộ hồ sơ', bo.soBoHoSo],
    ['Thuộc hạn mức khung', khung.soHopDong],
    ['Pháp nhân', khung.entity],
    ['Ngân hàng', khung.nganHang],
    ['Chi nhánh', khung.chiNhanh || ''],
    ['Ngày giải ngân', bo.ngayGiaiNgan],
    ['Ngày đáo hạn', bo.ngayDaoHan],
    ['Số tiền giải ngân (VNĐ)', bo.soTienGiaiNgan],
    ['Lãi suất (%/năm)', bo.laiSuat],
    ['Kỳ trả lãi', bo.kyTraLai],
    ['Trạng thái', TRANG_THAI_BO_LABEL[bo.trangThai] ?? bo.trangThai],
    ['Mục đích vay', bo.mucDichVay || ''],
    ['Tài sản đảm bảo', bo.taiSanDamBao || ''],
    ['Ghi chú', bo.ghiChu || ''],
  ]
}

/** Xuất Excel chi tiết 1 bộ hồ sơ giải ngân: sheet Thông tin + sheet Lịch thu + Trả gốc giữa kỳ (nếu có) */
export function exportBoHoSoNganHanExcel(
  bo: BoHoSoGiaiNgan, khung: HanMucNganHan, kyList: KyThuNH[], traGocList: TraGocGiuaKy[] = [],
) {
  const wb = XLSX.utils.book_new()
  const used = new Set<string>()

  XLSX.utils.book_append_sheet(wb, sheetFromAoa(boHoSoInfoAoa(bo, khung)), safeSheetName('Thông tin', used))
  XLSX.utils.book_append_sheet(
    wb,
    sheetFromAoa([KY_THU_HEADER, ...kyThuRows([...kyList].sort((a, b) => a.ngayThu.localeCompare(b.ngayThu)))]),
    safeSheetName('Lịch thu lãi & gốc', used),
  )
  const boTraGoc = traGocList.filter(t => t.boHoSoId === bo.id)
  if (boTraGoc.length) {
    const header = ['Ngày trả', 'Số tiền gốc', 'Ghi chú']
    const rows = boTraGoc.map(t => [t.ngayTra, t.soTienGoc, t.ghiChu || ''])
    XLSX.utils.book_append_sheet(wb, sheetFromAoa([header, ...rows]), safeSheetName('Trả gốc giữa kỳ', used))
  }

  downloadWorkbook(wb, `${bo.soBoHoSo}_chi-tiet_${todayFile()}.xlsx`)
}

/**
 * Xuất Excel toàn bộ 1 hạn mức khung ngắn hạn:
 * sheet "Tổng hợp bộ hồ sơ" (1 dòng/bộ hồ sơ) + 1 sheet lịch thu riêng cho từng bộ hồ sơ.
 */
export function exportKhungNganHanExcel(
  khung: HanMucNganHan,
  boList: BoHoSoGiaiNgan[],
  kyThuMap: Record<string, KyThuNH[]>,
  traGocList: TraGocGiuaKy[] = [],
  gocDaTraFn: (boId: string, kyList: KyThuNH[], tgList: TraGocGiuaKy[]) => number,
) {
  const wb = XLSX.utils.book_new()
  const used = new Set<string>()

  const infoAoa: (string | number | null)[][] = [
    ['THÔNG TIN HẠN MỨC KHUNG'],
    ['Số hợp đồng', khung.soHopDong],
    ['Pháp nhân', khung.entity],
    ['Ngân hàng', khung.nganHang],
    ['Chi nhánh', khung.chiNhanh || ''],
    ['Người vay / đứng tên', khung.nguoiVay || ''],
    ['Tổng hạn mức (VNĐ)', khung.tongHanMuc],
    ['Ngày hiệu lực', khung.ngayHieuLuc],
    ['Ngày hết hạn', khung.ngayHetHan],
    ['Lãi suất mặc định (%/năm)', khung.laiSuatMacDinh ?? ''],
    ['Trạng thái', TRANG_THAI_KHUNG_LABEL[khung.trangThai] ?? khung.trangThai],
  ]
  XLSX.utils.book_append_sheet(wb, sheetFromAoa(infoAoa), safeSheetName('Thông tin khung', used))

  const tongHopHeader = [
    'Bộ hồ sơ', 'Ngày giải ngân', 'Đáo hạn', 'Giải ngân', 'Gốc đã trả', 'Dư nợ còn lại',
    'Lãi suất (%)', 'Kỳ trả lãi', 'Trạng thái',
  ]
  const tongHopRows = boList.map(bo => {
    const kyList = kyThuMap[bo.id] ?? []
    const tgList = traGocList.filter(t => t.boHoSoId === bo.id)
    const gocDaTra = gocDaTraFn(bo.id, kyList, tgList)
    return [
      bo.soBoHoSo, bo.ngayGiaiNgan, bo.ngayDaoHan, bo.soTienGiaiNgan, gocDaTra,
      Math.max(0, bo.soTienGiaiNgan - gocDaTra), bo.laiSuat, bo.kyTraLai,
      TRANG_THAI_BO_LABEL[bo.trangThai] ?? bo.trangThai,
    ]
  })
  XLSX.utils.book_append_sheet(wb, sheetFromAoa([tongHopHeader, ...tongHopRows]), safeSheetName('Tổng hợp bộ hồ sơ', used))

  boList.forEach(bo => {
    const kyList = [...(kyThuMap[bo.id] ?? [])].sort((a, b) => a.ngayThu.localeCompare(b.ngayThu))
    if (!kyList.length) return
    XLSX.utils.book_append_sheet(
      wb,
      sheetFromAoa([KY_THU_HEADER, ...kyThuRows(kyList)]),
      safeSheetName(bo.soBoHoSo, used),
    )
  })

  downloadWorkbook(wb, `${khung.soHopDong}_chi-tiet_${todayFile()}.xlsx`)
}

/** Xuất Excel toàn bộ danh sách hạn mức khung ngắn hạn (1 dòng/khung, không kèm chi tiết kỳ thu) */
export function exportDanhSachKhungNganHanExcel(khungList: HanMucNganHan[]) {
  const wb = XLSX.utils.book_new()
  const used = new Set<string>()

  const header = [
    'Số hợp đồng', 'Pháp nhân', 'Ngân hàng', 'Chi nhánh', 'Tổng hạn mức',
    'Ngày hiệu lực', 'Ngày hết hạn', 'Lãi suất mặc định (%)', 'Trạng thái',
  ]
  const rows = khungList.map(k => [
    k.soHopDong, k.entity, k.nganHang, k.chiNhanh || '', k.tongHanMuc,
    k.ngayHieuLuc, k.ngayHetHan, k.laiSuatMacDinh ?? '', TRANG_THAI_KHUNG_LABEL[k.trangThai] ?? k.trangThai,
  ])
  XLSX.utils.book_append_sheet(wb, sheetFromAoa([header, ...rows]), safeSheetName('Hạn mức ngắn hạn', used))

  downloadWorkbook(wb, `Han-muc-ngan-han_${todayFile()}.xlsx`)
}
