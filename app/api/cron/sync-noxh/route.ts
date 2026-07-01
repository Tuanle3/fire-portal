import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'

export const dynamic    = 'force-dynamic'
export const maxDuration = 60

const SHEET_ID = '13A-wl1LyWrmz07enhSw1R0LA6n7H17mjXmABCKjpy1s'
const PREFIX   = 'NOXH_NT'

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return req.headers.get('authorization') === `Bearer ${secret}`
}

// ─── CSV ──────────────────────────────────────────────────────────────────────
async function fetchTab(tab: string): Promise<string[][]> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`
  const res  = await fetch(url, { cache: 'no-store' })
  const text = await res.text()
  if (!text || text.trim().length < 10 || text.includes('does not exist')) return []
  return text.trim().split('\n').map(parseLine)
}

function parseLine(line: string): string[] {
  const cols: string[] = []; let cur = '', inQ = false
  for (const c of line) {
    if (c === '"') inQ = !inQ
    else if (c === ',' && !inQ) { cols.push(cur.trim()); cur = '' }
    else cur += c
  }
  cols.push(cur.trim()); return cols
}

function norm(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
}
function hdr(headers: string[]): Record<string, number> {
  const m: Record<string, number> = {}
  headers.forEach((h, i) => { m[norm(h)] = i }); return m
}
function col(row: string[], m: Record<string, number>, ...keys: string[]): string {
  for (const k of keys) {
    const i = m[norm(k)]
    if (i !== undefined && row[i]?.trim()) return row[i].trim()
  }
  return ''
}
function num(s: string) {
  return parseFloat(s.replace(/\./g, '').replace(/,/g, '.').replace(/[^\d.-]/g, '')) || 0
}
function dat(s: string) {
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  return m ? `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}` : s
}
function pick(a: string[][], b: string[][]) { return a.length >= 2 ? a : b }

// ─── Parsers ──────────────────────────────────────────────────────────────────
function parseThongTin(rows: string[][]): Record<string, string|number> {
  const r: Record<string, string|number> = {}
  for (const row of rows) {
    if (row.length < 3) continue
    const k = norm(row[1] ?? ''), v = (row[2] ?? '').trim()
    if (!k || !v || k === 'noidung') continue
    if (k.includes('dientich'))                               r.area       = v
    if (k.includes('tongvon'))                                r.totalCap   = num(v) / 1e9
    if (k.includes('hanmucvay'))                              r.loan       = num(v) / 1e9
    if (k.includes('khoicong'))                               r.startDate  = dat(v) || v
    if (k.includes('hoanhthanh') || k.includes('hoanthanh')) r.estEnd     = dat(v) || v
    if (k.includes('tongcan') || k.includes('canho'))        r.totalUnits = num(v)
  }
  return r
}

function parsePhapLy(rows: string[][]): Record<string, object> {
  if (rows.length < 2) return {}
  const m = hdr(rows[0])
  return toObj(rows.slice(1).filter(r => col(r, m, 'Tên hồ sơ', 'Tên', 'ten')).map(r => ({
    ten:        col(r, m, 'Tên hồ sơ', 'Tên', 'ten'),
    loai:       col(r, m, 'Loại', 'Loai'),
    so_hieu:    col(r, m, 'Số hiệu', 'So hieu'),
    ngay_cap:   dat(col(r, m, 'Ngày cấp', 'Ngay cap')),
    han:        dat(col(r, m, 'Hạn', 'Han')),
    don_vi:     col(r, m, 'Đơn vị', 'Don vi'),
    trang_thai: mapPL(col(r, m, 'Trạng thái', 'Trang thai')),
    ghi_chu:    col(r, m, 'Ghi chú', 'Ghi chu'),
  })))
}

function parseThiCong(rows: string[][]): Record<string, object> {
  if (rows.length < 2) return {}
  const m = hdr(rows[0])
  return toObj(rows.slice(1).filter(r => col(r, m, 'Tên', 'Ten', 'Hạng mục')).map(r => ({
    ma:          col(r, m, 'Mã', 'Ma', 'STT'),
    ten:         col(r, m, 'Tên', 'Ten', 'Hạng mục'),
    nhom:        col(r, m, 'Nhóm', 'Nhom'),
    nha_thau:    col(r, m, 'Nhà thầu', 'Nha thau'),
    goi_thau:    col(r, m, 'Gói thầu', 'Goi thau'),
    gia_tri:     num(col(r, m, 'Giá trị', 'Gia tri', 'Giá trị (tỷ)')),
    kl_ke_hoach: num(col(r, m, 'KL kế hoạch', 'KL KH')),
    kl_thuc_te:  num(col(r, m, 'KL thực tế', 'KL TT')),
    pct:         num(col(r, m, '%', 'Pct', 'Tiến độ %')),
    ngay_bd:     dat(col(r, m, 'Ngày BD', 'Ngày bắt đầu')),
    ngay_kt:     dat(col(r, m, 'Ngày KT', 'Ngày kết thúc')),
    delay_days:  num(col(r, m, 'Trễ (ngày)', 'Delay')),
    trang_thai:  mapTC(col(r, m, 'Trạng thái', 'Trang thai')),
  })))
}

function parseLienDanh(rows: string[][]): Record<string, object> {
  if (rows.length < 2) return {}
  const m = hdr(rows[0])
  return toObj(rows.slice(1).filter(r => col(r, m, 'Tên', 'Ten', 'Thành viên')).map(r => ({
    ten:     col(r, m, 'Tên', 'Ten', 'Thành viên', 'Thanh vien'),
    cam_ket: num(col(r, m, 'Cam kết', 'Cam ket', 'Vốn cam kết')),
    da_gop:  num(col(r, m, 'Đã góp', 'Da gop', 'Thực góp')),
  })))
}

function parseVonVay(rows: string[][]): Record<string, object> {
  if (rows.length < 2) return {}
  const m = hdr(rows[0])
  return toObj(rows.slice(1).filter(r => col(r, m, 'Gói', 'Goi', 'Tên', 'Đợt')).map(r => ({
    goi:            col(r, m, 'Gói', 'Goi', 'Tên', 'Đợt'),
    so_tien:        num(col(r, m, 'Số tiền', 'So tien', 'Hạn mức')),
    ngay_giai_ngan: dat(col(r, m, 'Ngày giải ngân', 'Ngay giai ngan')),
    lai_suat:       num(col(r, m, 'Lãi suất', 'Lai suat', 'LS %')),
    trang_thai:     mapVV(col(r, m, 'Trạng thái', 'Trang thai')),
    ghi_chu:        col(r, m, 'Ghi chú', 'Ghi chu'),
  })))
}

function parseBanHang(rows: string[][]): Record<string, object> {
  if (rows.length < 2) return {}
  const m = hdr(rows[0])
  return toObj(rows.slice(1).filter(r => col(r, m, 'Căn hộ', 'Can ho', 'Mã căn')).map(r => ({
    can_ho:       col(r, m, 'Căn hộ', 'Can ho', 'Mã căn'),
    loai:         col(r, m, 'Loại', 'Loai'),
    tang:         col(r, m, 'Tầng', 'Tang'),
    dien_tich:    num(col(r, m, 'Diện tích', 'Dien tich', 'DT')),
    dien_tich_sd: num(col(r, m, 'Diện tích SD', 'DT sử dụng')),
    gia:          num(col(r, m, 'Giá', 'Gia', 'Giá bán')),
    khach:        col(r, m, 'Khách hàng', 'Khach hang', 'Tên khách'),
    ngay_ban:     dat(col(r, m, 'Ngày bán', 'Ngay ban')),
    trang_thai:   mapBH(col(r, m, 'Trạng thái', 'Trang thai')),
  })))
}

function parseCongNo(rows: string[][]): Record<string, object> {
  if (rows.length < 2) return {}
  const m = hdr(rows[0])
  return toObj(rows.slice(1)
    .map(r => ({
      loai: 'Thu', ngay: dat(col(r, m, 'Ngày', 'Ngay', 'Ngày thu')),
      mo_ta:       col(r, m, 'Nội dung', 'Mô tả', 'Mo ta'),
      so_tien:     num(col(r, m, 'Số tiền', 'So tien', 'Giá trị')),
      nhom:        col(r, m, 'Nhóm', 'Nhom') || 'Thu khác',
      don_vi:      col(r, m, 'Đơn vị', 'Don vi'),
      chung_tu_so: col(r, m, 'Số CT', 'Chứng từ', 'Chung tu so'),
      trang_thai:  col(r, m, 'Trạng thái', 'Trang thai') || 'da_xac_nhan',
      ghi_chu:     col(r, m, 'Ghi chú', 'Ghi chu'),
    }))
    .filter((r: any) => r.so_tien > 0))
}

function parseThanhToan(rows: string[][]): Record<string, object> {
  if (rows.length < 2) return {}
  const m = hdr(rows[0])
  return toObj(rows.slice(1)
    .map(r => {
      const ngay = dat(col(r, m, 'Ngày', 'Ngay')), d = ngay ? new Date(ngay) : null
      return {
        loai:       col(r, m, 'Loại', 'Loai') || 'Chi nhà thầu',
        nhom:       col(r, m, 'Nhóm', 'Nhom') || 'Chi nhà thầu',
        nha_thau:   col(r, m, 'Nhà thầu', 'Nha thau', 'Đơn vị'),
        so_tien:    num(col(r, m, 'Số tiền', 'So tien', 'Giá trị')),
        ngay, thang: d ? d.getMonth() + 1 : 0, nam: d ? d.getFullYear() : 0,
        trang_thai: mapTT(col(r, m, 'Trạng thái', 'Trang thai')),
        ghi_chu:    col(r, m, 'Ghi chú', 'Ghi chu'),
      }
    })
    .filter((r: any) => r.so_tien > 0))
}

// deterministic keys so reruns overwrite cleanly
function toObj(arr: object[]): Record<string, object> {
  const o: Record<string, object> = {}
  arr.forEach((item, i) => { o[`s${i.toString().padStart(4,'0')}`] = item })
  return o
}

function mapPL(s: string) {
  const n = norm(s)
  if (n.includes('hieuluc')) return 'hieu_luc'
  if (n.includes('hethan'))  return 'het_han'
  if (n.includes('choduyet'))return 'cho_duyet'
  return 'dang_lam'
}
function mapTC(s: string) {
  const n = norm(s)
  if (n.includes('hoanthanh'))  return 'hoan_thanh'
  if (n.includes('tre'))        return 'tre'
  if (n.includes('dang'))       return 'dang_thi_cong'
  return 'chua_bat_dau'
}
function mapVV(s: string) {
  const n = norm(s)
  if (n.includes('dagiaingan')) return 'da_giai_ngan'
  if (n.includes('dangxet'))    return 'dang_xet'
  return 'chua_giai_ngan'
}
function mapBH(s: string) {
  const n = norm(s)
  if (n.includes('bangiao'))                           return 'ban_giao'
  if (n.includes('kyhopdong') || n.includes('kyhd'))  return 'ky_hop_dong'
  if (n.includes('datcoc'))                            return 'dat_coc'
  return 'chua_ban'
}
function mapTT(s: string) {
  const n = norm(s)
  if (n.includes('dathanhtoan')) return 'da_thanh_toan'
  if (n.includes('huy'))         return 'huy'
  return 'cho_duyet'
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  if (!isAuthorized(req))
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  try {
    const db = getAdminDb()

    // Fetch all tabs in parallel (try no-diacritic names first, fallback to diacritic)
    const [r00, r01, r01a, r02, r02a, r03, r03a, r04, r04a, r05, r05a, r06, r06a, r09, r09a] =
      await Promise.all([
        fetchTab('00_Thong tin'),
        fetchTab('01_PHAP LY'),     fetchTab('01_PHÁP LÝ'),
        fetchTab('02_THI CONG'),    fetchTab('02_THI CÔNG'),
        fetchTab('03_LIEN DANH'),   fetchTab('03_LIÊN DANH'),
        fetchTab('04_VON VAY'),     fetchTab('04_VỐN VAY'),
        fetchTab('05_BAN HANG'),    fetchTab('05_BÁN HÀNG'),
        fetchTab('06_CONG NO_THU'), fetchTab('06_CÔNG NỢ_THU'),
        fetchTab('09_THANH TOAN_NT'),fetchTab('09_THANH TOÁN_NT'),
      ])

    const thongTin  = parseThongTin(r00)
    const phapLy    = parsePhapLy(pick(r01, r01a))
    const thiCong   = parseThiCong(pick(r02, r02a))
    const lienDanh  = parseLienDanh(pick(r03, r03a))
    const vonVay    = parseVonVay(pick(r04, r04a))
    const banHang   = parseBanHang(pick(r05, r05a))
    const congNo    = parseCongNo(pick(r06, r06a))
    const thanhToan = parseThanhToan(pick(r09, r09a))

    // Write to Firebase using Admin SDK (set = replace entire node)
    const writes: [string, object][] = [
      [`${PREFIX}_PhapLy`,    phapLy],
      [`${PREFIX}_ThiCong`,   thiCong],
      [`${PREFIX}_LienDanh`,  lienDanh],
      [`${PREFIX}_VonVay`,    vonVay],
      [`${PREFIX}_BanHang`,   banHang],
      [`${PREFIX}_ChungTu`,   congNo],
      [`${PREFIX}_ThanhToan`, thanhToan],
    ]
    await Promise.all(writes.map(([path, data]) => db.ref(path).set(data)))

    // Merge thongTin into existing Info
    if (Object.keys(thongTin).length > 0) {
      const snap = await db.ref(`${PREFIX}_Info`).get()
      const cur  = snap.exists() ? snap.val() : {}
      await db.ref(`${PREFIX}_Info`).set({ ...cur, ...thongTin })
    }

    const now = new Date().toISOString()
    const counts = {
      phapLy:    Object.keys(phapLy).length,
      thiCong:   Object.keys(thiCong).length,
      lienDanh:  Object.keys(lienDanh).length,
      vonVay:    Object.keys(vonVay).length,
      banHang:   Object.keys(banHang).length,
      congNo:    Object.keys(congNo).length,
      thanhToan: Object.keys(thanhToan).length,
    }
    await db.ref(`${PREFIX}_SyncLog`).set({ last_sync: now, counts })

    return NextResponse.json({ ok: true, synced_at: now, counts })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
