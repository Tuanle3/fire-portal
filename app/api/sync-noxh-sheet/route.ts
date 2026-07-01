import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const SHEET_ID = '13A-wl1LyWrmz07enhSw1R0LA6n7H17mjXmABCKjpy1s'

// ─── CSV fetch ────────────────────────────────────────────────────────────────
async function fetchTab(tab: string): Promise<string[][]> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`
  const res  = await fetch(url, { cache: 'no-store' })
  const text = await res.text()
  if (text.includes('does not exist') || text.trim().length < 10) return []
  return text.trim().split('\n').map(parseCsvLine)
}

function parseCsvLine(line: string): string[] {
  const cols: string[] = []
  let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') { inQ = !inQ }
    else if (c === ',' && !inQ) { cols.push(cur.trim()); cur = '' }
    else cur += c
  }
  cols.push(cur.trim())
  return cols
}

// ─── normalise header for loose matching ─────────────────────────────────────
function norm(s: string) {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // strip diacritics
    .replace(/[^a-z0-9]/g, '')                          // keep alphanumeric
}

function headerMap(headers: string[]): Record<string, number> {
  const m: Record<string, number> = {}
  headers.forEach((h, i) => { m[norm(h)] = i })
  return m
}

function col(row: string[], hm: Record<string, number>, ...keys: string[]): string {
  for (const k of keys) {
    const idx = hm[norm(k)]
    if (idx !== undefined && idx < row.length) {
      const v = row[idx]?.trim()
      if (v) return v
    }
  }
  return ''
}

// ─── value parsers ────────────────────────────────────────────────────────────
function parseNum(s: string): number {
  return parseFloat(s.replace(/\./g, '').replace(/,/g, '.').replace(/[^\d.]/g, '')) || 0
}

function parseDate(s: string): string {
  // dd/MM/yyyy → yyyy-MM-dd
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`
  return s
}

// ─── per-tab parsers ──────────────────────────────────────────────────────────

/** 00_Thông tin: key-value rows [STT, NỘI DUNG, THÔNG SỐ] */
function parseThongTin(rows: string[][]): Record<string, string|number> {
  const result: Record<string, string|number> = {}
  for (const row of rows) {
    if (row.length < 3) continue
    const key = norm(row[1] ?? '')
    const val = (row[2] ?? '').trim()
    if (!key || !val || key === 'noidung') continue
    // Map known keys
    if (key.includes('dientich'))           result.area       = val
    if (key.includes('tongvon'))            result.totalCap   = parseNum(val) / 1e9
    if (key.includes('hanmucvay'))          result.loan       = parseNum(val) / 1e9
    if (key.includes('khoicong'))           result.startDate  = parseDate(val) || val
    if (key.includes('hoanhthanh') || key.includes('hoanthanh')) result.estEnd = parseDate(val) || val
    if (key.includes('tongcan') || key.includes('can ho')) result.totalUnits = parseNum(val)
    if (key.includes('tiendobc') || key.includes('tieudo')) result.progress = parseNum(val)
  }
  return result
}

/** 01_PHÁP LÝ */
function parsePhapLy(rows: string[][]): object[] {
  if (rows.length < 2) return []
  const hm = headerMap(rows[0])
  return rows.slice(1).filter(r => r.some(c => c.trim())).map(r => ({
    ten:        col(r, hm, 'Tên hồ sơ', 'Tên', 'ten'),
    loai:       col(r, hm, 'Loại', 'Loai'),
    so_hieu:    col(r, hm, 'Số hiệu', 'So hieu', 'so hieu'),
    ngay_cap:   parseDate(col(r, hm, 'Ngày cấp', 'Ngay cap', 'ngay cap')),
    han:        parseDate(col(r, hm, 'Hạn', 'Han')),
    don_vi:     col(r, hm, 'Đơn vị', 'Don vi'),
    trang_thai: mapTrangThai(col(r, hm, 'Trạng thái', 'Trang thai')),
    ghi_chu:    col(r, hm, 'Ghi chú', 'Ghi chu'),
  })).filter(r => r.ten)
}

/** 02_THI CÔNG */
function parseThiCong(rows: string[][]): object[] {
  if (rows.length < 2) return []
  const hm = headerMap(rows[0])
  return rows.slice(1).filter(r => r.some(c => c.trim())).map(r => ({
    ma:          col(r, hm, 'Mã', 'Ma', 'STT'),
    ten:         col(r, hm, 'Tên', 'Ten', 'Hạng mục'),
    nhom:        col(r, hm, 'Nhóm', 'Nhom'),
    nha_thau:    col(r, hm, 'Nhà thầu', 'Nha thau'),
    goi_thau:    col(r, hm, 'Gói thầu', 'Goi thau'),
    gia_tri:     parseNum(col(r, hm, 'Giá trị', 'Gia tri', 'Giá trị (tỷ)')),
    kl_ke_hoach: parseNum(col(r, hm, 'KL kế hoạch', 'KL KH', 'Kế hoạch')),
    kl_thuc_te:  parseNum(col(r, hm, 'KL thực tế', 'KL TT', 'Thực tế')),
    pct:         parseNum(col(r, hm, '%', 'Pct', 'Tiến độ %', 'Tỷ lệ')),
    ngay_bd:     parseDate(col(r, hm, 'Ngày BD', 'Ngày bắt đầu', 'Bat dau')),
    ngay_kt:     parseDate(col(r, hm, 'Ngày KT', 'Ngày kết thúc', 'Ket thuc')),
    delay_days:  parseNum(col(r, hm, 'Trễ (ngày)', 'Delay', 'Tre ngay')),
    trang_thai:  mapThiCongTT(col(r, hm, 'Trạng thái', 'Trang thai')),
  })).filter(r => r.ten)
}

/** 03_LIÊN DANH */
function parseLienDanh(rows: string[][]): object[] {
  if (rows.length < 2) return []
  const hm = headerMap(rows[0])
  return rows.slice(1).filter(r => r.some(c => c.trim())).map(r => ({
    ten:      col(r, hm, 'Tên', 'Ten', 'Thành viên', 'Thanh vien'),
    cam_ket:  parseNum(col(r, hm, 'Cam kết', 'Cam ket', 'Vốn cam kết')),
    da_gop:   parseNum(col(r, hm, 'Đã góp', 'Da gop', 'Thực góp')),
  })).filter(r => r.ten)
}

/** 04_VỐN VAY */
function parseVonVay(rows: string[][]): object[] {
  if (rows.length < 2) return []
  const hm = headerMap(rows[0])
  return rows.slice(1).filter(r => r.some(c => c.trim())).map(r => ({
    goi:            col(r, hm, 'Gói', 'Goi', 'Tên', 'Đợt'),
    so_tien:        parseNum(col(r, hm, 'Số tiền', 'So tien', 'Hạn mức')),
    ngay_giai_ngan: parseDate(col(r, hm, 'Ngày giải ngân', 'Ngay giai ngan')),
    lai_suat:       parseNum(col(r, hm, 'Lãi suất', 'Lai suat', 'LS %')),
    trang_thai:     mapVonVayTT(col(r, hm, 'Trạng thái', 'Trang thai')),
    ghi_chu:        col(r, hm, 'Ghi chú', 'Ghi chu'),
  })).filter(r => r.goi)
}

/** 05_BÁN HÀNG */
function parseBanHang(rows: string[][]): object[] {
  if (rows.length < 2) return []
  const hm = headerMap(rows[0])
  return rows.slice(1).filter(r => r.some(c => c.trim())).map(r => ({
    can_ho:      col(r, hm, 'Căn hộ', 'Can ho', 'Mã căn'),
    loai:        col(r, hm, 'Loại', 'Loai'),
    tang:        col(r, hm, 'Tầng', 'Tang'),
    dien_tich:   parseNum(col(r, hm, 'Diện tích', 'Dien tich', 'DT')),
    dien_tich_sd:parseNum(col(r, hm, 'Diện tích SD', 'DT sử dụng')),
    gia:         parseNum(col(r, hm, 'Giá', 'Gia', 'Giá bán')),
    khach:       col(r, hm, 'Khách hàng', 'Khach hang', 'Tên khách'),
    ngay_ban:    parseDate(col(r, hm, 'Ngày bán', 'Ngay ban')),
    trang_thai:  mapBanHangTT(col(r, hm, 'Trạng thái', 'Trang thai')),
  })).filter(r => r.can_ho)
}

/** 06_CÔNG NỢ_THU → ChungTu (loai=Thu) */
function parseCongNo(rows: string[][]): object[] {
  if (rows.length < 2) return []
  const hm = headerMap(rows[0])
  return rows.slice(1).filter(r => r.some(c => c.trim())).map(r => ({
    loai:        'Thu' as const,
    ngay:        parseDate(col(r, hm, 'Ngày', 'Ngay', 'Ngày thu')),
    mo_ta:       col(r, hm, 'Nội dung', 'Mô tả', 'Mo ta'),
    so_tien:     parseNum(col(r, hm, 'Số tiền', 'So tien', 'Giá trị')),
    nhom:        col(r, hm, 'Nhóm', 'Nhom') || 'Thu khác',
    don_vi:      col(r, hm, 'Đơn vị', 'Don vi'),
    chung_tu_so: col(r, hm, 'Số CT', 'Chứng từ', 'Chung tu so'),
    trang_thai:  col(r, hm, 'Trạng thái', 'Trang thai') || 'da_xac_nhan',
    ghi_chu:     col(r, hm, 'Ghi chú', 'Ghi chu'),
  })).filter((r: any) => r.so_tien > 0)
}

/** 09_THANH TOÁN_NT → ThanhToanRow (Chi) */
function parseThanhToan(rows: string[][]): object[] {
  if (rows.length < 2) return []
  const hm = headerMap(rows[0])
  return rows.slice(1).filter(r => r.some(c => c.trim())).map(r => {
    const ngay = parseDate(col(r, hm, 'Ngày', 'Ngay'))
    const d = ngay ? new Date(ngay) : null
    return {
      loai:        col(r, hm, 'Loại', 'Loai') || 'Chi nhà thầu',
      nhom:        col(r, hm, 'Nhóm', 'Nhom') || 'Chi nhà thầu',
      nha_thau:    col(r, hm, 'Nhà thầu', 'Nha thau', 'Đơn vị'),
      so_tien:     parseNum(col(r, hm, 'Số tiền', 'So tien', 'Giá trị')),
      ngay,
      thang:       d ? d.getMonth() + 1 : 0,
      nam:         d ? d.getFullYear() : 0,
      trang_thai:  mapThanhToanTT(col(r, hm, 'Trạng thái', 'Trang thai')),
      ghi_chu:     col(r, hm, 'Ghi chú', 'Ghi chu'),
    }
  }).filter((r: any) => r.so_tien > 0)
}

// ─── Status mappers ───────────────────────────────────────────────────────────
function mapTrangThai(s: string): string {
  const n = norm(s)
  if (n.includes('hieuluc') || n.includes('conhieuluc')) return 'hieu_luc'
  if (n.includes('hethan'))  return 'het_han'
  if (n.includes('choduyet'))return 'cho_duyet'
  if (n.includes('danglam') || n.includes('dangthuchien')) return 'dang_lam'
  return 'dang_lam'
}

function mapThiCongTT(s: string): string {
  const n = norm(s)
  if (n.includes('hoanthanh')) return 'hoan_thanh'
  if (n.includes('dang'))      return 'dang_thi_cong'
  if (n.includes('tre'))       return 'tre'
  if (n.includes('chuabatdau'))return 'chua_bat_dau'
  return 'chua_bat_dau'
}

function mapVonVayTT(s: string): string {
  const n = norm(s)
  if (n.includes('dagiaingan') || n.includes('dagiaingan')) return 'da_giai_ngan'
  if (n.includes('dangxet'))   return 'dang_xet'
  return 'chua_giai_ngan'
}

function mapBanHangTT(s: string): string {
  const n = norm(s)
  if (n.includes('bangiao'))   return 'ban_giao'
  if (n.includes('kyhd') || n.includes('kyhopdong')) return 'ky_hop_dong'
  if (n.includes('datcoc'))    return 'dat_coc'
  return 'chua_ban'
}

function mapThanhToanTT(s: string): string {
  const n = norm(s)
  if (n.includes('dathanhtoan') || n.includes('dathanhtoan')) return 'da_thanh_toan'
  if (n.includes('huy'))       return 'huy'
  return 'cho_duyet'
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export async function GET() {
  try {
    const [r00, r01, r02, r03, r04, r05, r06, r09] = await Promise.all([
      fetchTab('00_Thong tin'),
      fetchTab('01_PHAP LY'),
      fetchTab('02_THI CONG'),
      fetchTab('03_LIEN DANH'),
      fetchTab('04_VON VAY'),
      fetchTab('05_BAN HANG'),
      fetchTab('06_CONG NO_THU'),
      fetchTab('09_THANH TOAN_NT'),
    ])

    // Try diacritic tab names too
    const [r01a, r02a, r03a, r04a, r05a, r06a, r09a] = await Promise.all([
      r01.length < 2 ? fetchTab('01_PHÁP LÝ')       : Promise.resolve([]),
      r02.length < 2 ? fetchTab('02_THI CÔNG')       : Promise.resolve([]),
      r03.length < 2 ? fetchTab('03_LIÊN DANH')      : Promise.resolve([]),
      r04.length < 2 ? fetchTab('04_VỐN VAY')        : Promise.resolve([]),
      r05.length < 2 ? fetchTab('05_BÁN HÀNG')       : Promise.resolve([]),
      r06.length < 2 ? fetchTab('06_CÔNG NỢ_THU')    : Promise.resolve([]),
      r09.length < 2 ? fetchTab('09_THANH TOÁN_NT')  : Promise.resolve([]),
    ])

    const phapLy   = parsePhapLy(r01.length   >= 2 ? r01   : r01a)
    const thiCong  = parseThiCong(r02.length  >= 2 ? r02   : r02a)
    const lienDanh = parseLienDanh(r03.length >= 2 ? r03   : r03a)
    const vonVay   = parseVonVay(r04.length   >= 2 ? r04   : r04a)
    const banHang  = parseBanHang(r05.length  >= 2 ? r05   : r05a)
    const congNo   = parseCongNo(r06.length   >= 2 ? r06   : r06a)
    const thanhToan= parseThanhToan(r09.length>= 2 ? r09   : r09a)
    const thongTin = parseThongTin(r00)

    return NextResponse.json({
      ok: true,
      sheetId: SHEET_ID,
      data: { thongTin, phapLy, thiCong, lienDanh, vonVay, banHang, congNo, thanhToan },
      counts: {
        phapLy:    phapLy.length,
        thiCong:   thiCong.length,
        lienDanh:  lienDanh.length,
        vonVay:    vonVay.length,
        banHang:   banHang.length,
        congNo:    congNo.length,
        thanhToan: thanhToan.length,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
