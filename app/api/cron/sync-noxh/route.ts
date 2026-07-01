import { NextResponse } from 'next/server'

export const dynamic   = 'force-dynamic'
export const maxDuration = 60   // seconds — Vercel cron allows up to 300 on Pro

const SHEET_ID   = '13A-wl1LyWrmz07enhSw1R0LA6n7H17mjXmABCKjpy1s'
const DB_URL     = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL   // e.g. https://xxx.firebaseio.com
const DB_SECRET  = process.env.FIREBASE_DB_SECRET                  // Firebase console → Project settings → Service accounts → Database secrets
const PREFIX     = 'NOXH_NT'

// ─── Auth ──────────────────────────────────────────────────────────────────────
// Vercel sends Authorization: Bearer {CRON_SECRET} automatically for cron routes.
// We also allow unauthenticated calls in dev (no CRON_SECRET set).
function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true                            // dev / not configured
  const auth = req.headers.get('authorization') ?? ''
  return auth === `Bearer ${secret}`
}

// ─── CSV helpers ───────────────────────────────────────────────────────────────
async function fetchTab(tab: string): Promise<string[][]> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`
  const res  = await fetch(url, { cache: 'no-store' })
  const text = await res.text()
  if (!text || text.trim().length < 10 || text.includes('does not exist')) return []
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

function norm(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
}
function hm(headers: string[]): Record<string, number> {
  const m: Record<string, number> = {}
  headers.forEach((h, i) => { m[norm(h)] = i })
  return m
}
function col(row: string[], map: Record<string, number>, ...keys: string[]): string {
  for (const k of keys) {
    const idx = map[norm(k)]
    if (idx !== undefined && idx < row.length && row[idx]?.trim()) return row[idx].trim()
  }
  return ''
}
function num(s: string) {
  return parseFloat(s.replace(/\./g, '').replace(/,/g, '.').replace(/[^\d.]/g, '')) || 0
}
function date(s: string) {
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  return m ? `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}` : s
}

// ─── per-tab parsers (same logic as /api/sync-noxh-sheet) ────────────────────
function parseThongTin(rows: string[][]): Record<string, string|number> {
  const r: Record<string, string|number> = {}
  for (const row of rows) {
    if (row.length < 3) continue
    const k = norm(row[1] ?? ''), v = (row[2] ?? '').trim()
    if (!k || !v || k === 'noidung') continue
    if (k.includes('dientich'))                                    r.area       = v
    if (k.includes('tongvon'))                                     r.totalCap   = num(v) / 1e9
    if (k.includes('hanmucvay'))                                   r.loan       = num(v) / 1e9
    if (k.includes('khoicong'))                                    r.startDate  = date(v) || v
    if (k.includes('hoanhthanh') || k.includes('hoanthanh'))      r.estEnd     = date(v) || v
    if (k.includes('tongcan') || k.includes('canho'))             r.totalUnits = num(v)
    if (k.includes('tieudo') || k.includes('tiendobc'))           r.progress   = num(v)
  }
  return r
}

function parsePhapLy(rows: string[][]): object[] {
  if (rows.length < 2) return []
  const map = hm(rows[0])
  return rows.slice(1).filter(r => r.some(c => c.trim())).map(r => ({
    ten:        col(r, map, 'Tên hồ sơ', 'Tên', 'ten'),
    loai:       col(r, map, 'Loại', 'Loai'),
    so_hieu:    col(r, map, 'Số hiệu', 'So hieu'),
    ngay_cap:   date(col(r, map, 'Ngày cấp', 'Ngay cap')),
    han:        date(col(r, map, 'Hạn', 'Han')),
    don_vi:     col(r, map, 'Đơn vị', 'Don vi'),
    trang_thai: mapTTPhapLy(col(r, map, 'Trạng thái', 'Trang thai')),
    ghi_chu:    col(r, map, 'Ghi chú', 'Ghi chu'),
  })).filter((r: any) => r.ten)
}

function parseThiCong(rows: string[][]): object[] {
  if (rows.length < 2) return []
  const map = hm(rows[0])
  return rows.slice(1).filter(r => r.some(c => c.trim())).map(r => ({
    ma:          col(r, map, 'Mã', 'Ma', 'STT'),
    ten:         col(r, map, 'Tên', 'Ten', 'Hạng mục'),
    nhom:        col(r, map, 'Nhóm', 'Nhom'),
    nha_thau:    col(r, map, 'Nhà thầu', 'Nha thau'),
    goi_thau:    col(r, map, 'Gói thầu', 'Goi thau'),
    gia_tri:     num(col(r, map, 'Giá trị', 'Gia tri', 'Giá trị (tỷ)')),
    kl_ke_hoach: num(col(r, map, 'KL kế hoạch', 'KL KH', 'Kế hoạch')),
    kl_thuc_te:  num(col(r, map, 'KL thực tế', 'KL TT', 'Thực tế')),
    pct:         num(col(r, map, '%', 'Pct', 'Tiến độ %', 'Tỷ lệ')),
    ngay_bd:     date(col(r, map, 'Ngày BD', 'Ngày bắt đầu')),
    ngay_kt:     date(col(r, map, 'Ngày KT', 'Ngày kết thúc')),
    delay_days:  num(col(r, map, 'Trễ (ngày)', 'Delay', 'Tre ngay')),
    trang_thai:  mapTTThiCong(col(r, map, 'Trạng thái', 'Trang thai')),
  })).filter((r: any) => r.ten)
}

function parseLienDanh(rows: string[][]): object[] {
  if (rows.length < 2) return []
  const map = hm(rows[0])
  return rows.slice(1).filter(r => r.some(c => c.trim())).map(r => ({
    ten:     col(r, map, 'Tên', 'Ten', 'Thành viên', 'Thanh vien'),
    cam_ket: num(col(r, map, 'Cam kết', 'Cam ket', 'Vốn cam kết')),
    da_gop:  num(col(r, map, 'Đã góp', 'Da gop', 'Thực góp')),
  })).filter((r: any) => r.ten)
}

function parseVonVay(rows: string[][]): object[] {
  if (rows.length < 2) return []
  const map = hm(rows[0])
  return rows.slice(1).filter(r => r.some(c => c.trim())).map(r => ({
    goi:            col(r, map, 'Gói', 'Goi', 'Tên', 'Đợt'),
    so_tien:        num(col(r, map, 'Số tiền', 'So tien', 'Hạn mức')),
    ngay_giai_ngan: date(col(r, map, 'Ngày giải ngân', 'Ngay giai ngan')),
    lai_suat:       num(col(r, map, 'Lãi suất', 'Lai suat', 'LS %')),
    trang_thai:     mapTTVonVay(col(r, map, 'Trạng thái', 'Trang thai')),
    ghi_chu:        col(r, map, 'Ghi chú', 'Ghi chu'),
  })).filter((r: any) => r.goi)
}

function parseBanHang(rows: string[][]): object[] {
  if (rows.length < 2) return []
  const map = hm(rows[0])
  return rows.slice(1).filter(r => r.some(c => c.trim())).map(r => ({
    can_ho:       col(r, map, 'Căn hộ', 'Can ho', 'Mã căn'),
    loai:         col(r, map, 'Loại', 'Loai'),
    tang:         col(r, map, 'Tầng', 'Tang'),
    dien_tich:    num(col(r, map, 'Diện tích', 'Dien tich', 'DT')),
    dien_tich_sd: num(col(r, map, 'Diện tích SD', 'DT sử dụng')),
    gia:          num(col(r, map, 'Giá', 'Gia', 'Giá bán')),
    khach:        col(r, map, 'Khách hàng', 'Khach hang', 'Tên khách'),
    ngay_ban:     date(col(r, map, 'Ngày bán', 'Ngay ban')),
    trang_thai:   mapTTBanHang(col(r, map, 'Trạng thái', 'Trang thai')),
  })).filter((r: any) => r.can_ho)
}

function parseCongNo(rows: string[][]): object[] {
  if (rows.length < 2) return []
  const map = hm(rows[0])
  return rows.slice(1).filter(r => r.some(c => c.trim())).map(r => ({
    loai:        'Thu',
    ngay:        date(col(r, map, 'Ngày', 'Ngay', 'Ngày thu')),
    mo_ta:       col(r, map, 'Nội dung', 'Mô tả', 'Mo ta'),
    so_tien:     num(col(r, map, 'Số tiền', 'So tien', 'Giá trị')),
    nhom:        col(r, map, 'Nhóm', 'Nhom') || 'Thu khác',
    don_vi:      col(r, map, 'Đơn vị', 'Don vi'),
    chung_tu_so: col(r, map, 'Số CT', 'Chứng từ', 'Chung tu so'),
    trang_thai:  col(r, map, 'Trạng thái', 'Trang thai') || 'da_xac_nhan',
    ghi_chu:     col(r, map, 'Ghi chú', 'Ghi chu'),
  })).filter((r: any) => r.so_tien > 0)
}

function parseThanhToan(rows: string[][]): object[] {
  if (rows.length < 2) return []
  const map = hm(rows[0])
  return rows.slice(1).filter(r => r.some(c => c.trim())).map(r => {
    const ngay = date(col(r, map, 'Ngày', 'Ngay'))
    const d = ngay ? new Date(ngay) : null
    return {
      loai:       col(r, map, 'Loại', 'Loai') || 'Chi nhà thầu',
      nhom:       col(r, map, 'Nhóm', 'Nhom') || 'Chi nhà thầu',
      nha_thau:   col(r, map, 'Nhà thầu', 'Nha thau', 'Đơn vị'),
      so_tien:    num(col(r, map, 'Số tiền', 'So tien', 'Giá trị')),
      ngay,
      thang:      d ? d.getMonth() + 1 : 0,
      nam:        d ? d.getFullYear() : 0,
      trang_thai: mapTTThanhToan(col(r, map, 'Trạng thái', 'Trang thai')),
      ghi_chu:    col(r, map, 'Ghi chú', 'Ghi chu'),
    }
  }).filter((r: any) => r.so_tien > 0)
}

function mapTTPhapLy(s: string) {
  const n = norm(s)
  if (n.includes('hieuluc')) return 'hieu_luc'
  if (n.includes('hethan'))  return 'het_han'
  if (n.includes('choduyet'))return 'cho_duyet'
  return 'dang_lam'
}
function mapTTThiCong(s: string) {
  const n = norm(s)
  if (n.includes('hoanthanh'))  return 'hoan_thanh'
  if (n.includes('tre'))        return 'tre'
  if (n.includes('dang'))       return 'dang_thi_cong'
  return 'chua_bat_dau'
}
function mapTTVonVay(s: string) {
  const n = norm(s)
  if (n.includes('dagiaingan')) return 'da_giai_ngan'
  if (n.includes('dangxet'))    return 'dang_xet'
  return 'chua_giai_ngan'
}
function mapTTBanHang(s: string) {
  const n = norm(s)
  if (n.includes('bangiao'))    return 'ban_giao'
  if (n.includes('kyhopdong') || n.includes('kyhd')) return 'ky_hop_dong'
  if (n.includes('datcoc'))     return 'dat_coc'
  return 'chua_ban'
}
function mapTTThanhToan(s: string) {
  const n = norm(s)
  if (n.includes('dathanhtoan'))return 'da_thanh_toan'
  if (n.includes('huy'))        return 'huy'
  return 'cho_duyet'
}

// ─── Firebase REST helpers ────────────────────────────────────────────────────
function dbUrl(path: string) {
  return `${DB_URL}/${path}.json?auth=${DB_SECRET}`
}

// Convert array to Firebase push-key object  { "-auto1": item1, ... }
function toPushObj(arr: object[]): Record<string, object> {
  const obj: Record<string, object> = {}
  arr.forEach((item, i) => {
    // generate a deterministic-ish key so reruns are idempotent
    obj[`sync_${i.toString().padStart(4, '0')}`] = item
  })
  return obj
}

async function fbPut(path: string, data: unknown) {
  const res = await fetch(dbUrl(path), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Firebase PUT ${path} → ${res.status}: ${text}`)
  }
}

// ─── Main handler ──────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  if (!DB_URL || !DB_SECRET) {
    return NextResponse.json({ ok: false, error: 'NEXT_PUBLIC_FIREBASE_DATABASE_URL or FIREBASE_DB_SECRET not set' }, { status: 500 })
  }

  const log: string[] = []
  try {
    // 1. Fetch all sheet tabs (try with and without diacritics)
    const [r00, r01, r01a, r02, r02a, r03, r03a, r04, r04a, r05, r05a, r06, r06a, r09, r09a] =
      await Promise.all([
        fetchTab('00_Thong tin'),
        fetchTab('01_PHAP LY'),   fetchTab('01_PHÁP LÝ'),
        fetchTab('02_THI CONG'),  fetchTab('02_THI CÔNG'),
        fetchTab('03_LIEN DANH'), fetchTab('03_LIÊN DANH'),
        fetchTab('04_VON VAY'),   fetchTab('04_VỐN VAY'),
        fetchTab('05_BAN HANG'),  fetchTab('05_BÁN HÀNG'),
        fetchTab('06_CONG NO_THU'), fetchTab('06_CÔNG NỢ_THU'),
        fetchTab('09_THANH TOAN_NT'), fetchTab('09_THANH TOÁN_NT'),
      ])

    const pick = (a: string[][], b: string[][]) => a.length >= 2 ? a : b

    // 2. Parse
    const thongTin  = parseThongTin(r00)
    const phapLy    = parsePhapLy(pick(r01, r01a))
    const thiCong   = parseThiCong(pick(r02, r02a))
    const lienDanh  = parseLienDanh(pick(r03, r03a))
    const vonVay    = parseVonVay(pick(r04, r04a))
    const banHang   = parseBanHang(pick(r05, r05a))
    const congNo    = parseCongNo(pick(r06, r06a))
    const thanhToan = parseThanhToan(pick(r09, r09a))

    // 3. Write to Firebase via REST (PUT = replace entire node)
    const writes: [string, object[] | Record<string, unknown>][] = [
      [`${PREFIX}_PhapLy`,   toPushObj(phapLy)],
      [`${PREFIX}_ThiCong`,  toPushObj(thiCong)],
      [`${PREFIX}_LienDanh`, toPushObj(lienDanh)],
      [`${PREFIX}_VonVay`,   toPushObj(vonVay)],
      [`${PREFIX}_BanHang`,  toPushObj(banHang)],
      [`${PREFIX}_ChungTu`,  toPushObj(congNo)],
      [`${PREFIX}_ThanhToan`,toPushObj(thanhToan)],
    ]

    await Promise.all(writes.map(([path, data]) => fbPut(path, data)))

    // Info: merge — GET first then PUT
    if (Object.keys(thongTin).length > 0) {
      const cur = await fetch(dbUrl(`${PREFIX}_Info`)).then(r => r.json()).catch(() => ({}))
      await fbPut(`${PREFIX}_Info`, { ...cur, ...thongTin, _synced: new Date().toISOString() })
    }

    // 4. Write sync log to Firebase so the UI can show last-sync time
    await fbPut(`${PREFIX}_SyncLog`, {
      last_sync: new Date().toISOString(),
      counts: {
        phapLy: phapLy.length, thiCong: thiCong.length,
        lienDanh: lienDanh.length, vonVay: vonVay.length,
        banHang: banHang.length, congNo: congNo.length,
        thanhToan: thanhToan.length,
      },
    })

    log.push(`Synced at ${new Date().toISOString()}`)
    return NextResponse.json({ ok: true, log, counts: writes.map(([p, d]) => ({ [p]: Object.keys(d).length })) })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, log }, { status: 500 })
  }
}
