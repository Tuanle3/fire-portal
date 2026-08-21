// ============================================================
// ADAPTER — Đọc CP hoạt động + thu khác THỰC TẾ từ data_quy
// (Firebase RTDB, đồng bộ từ Google Sheet).
//
// QUY TẮC CHỐNG TRÙNG: dòng nào có Mã ngân sách khớp bất kỳ pattern
// vay nào (Nhánh A doanh nghiệp, Nhánh B cá nhân, HOẶC pattern lịch
// sử tự do NV_/Ngoai_/TTD_) thì KHÔNG đưa vào tổng dòng tiền chính —
// phần vay NH (Nhánh A/B) do module Hạn mức tín dụng đảm nhiệm (chính
// xác hơn, theo từng hợp đồng); phần lịch sử tự do đại ca soát tay
// riêng (không tự động khớp được). Dùng CHUNG `parseMaNganSach()` từ
// `lib/ma-ngan-sach.ts` (nguồn công thức chân lý) — KHÔNG tự viết hàm
// parse riêng ở đây nữa để tránh lệch với công thức sinh mã.
//
// ⚠️ FIX so với bản nháp trước: bản nháp dùng hàm `parseMaNganSachVay`
// local, CHỈ nhận diện được Nhánh A (doanh nghiệp) — nghĩa là các dòng
// vay Nhánh B (Cá nhân, VD `Vu_BIDV_4.5_Goc`) và pattern lịch sử tự do
// (`NV_...`, `Ngoai_...`, `TTD_...`) bị lọt xuống nhánh "CP hoạt động"
// và bị CỘNG NHẦM vào tổng dòng tiền chính — vi phạm nguyên tắc chống
// trùng đã chốt ở log. Bản này dùng `parseMaNganSach()` để nhận diện
// đủ cả 2 nhánh + pattern tự do, loại đúng tất cả khỏi tổng chính.
//
// Chỉ lấy Loại === 'Thực tế' (theo yêu cầu đại ca — tạm thời).
// ============================================================
import { getDb } from '@/lib/firebase'
import { ref, onValue, off } from 'firebase/database'
import { DongTienItem, LoaiDongTien } from './dong-tien-types'
import type { EntityType } from '@/lib/han-muc-types'
import { parseMaNganSach, MaNganSachParsed } from '@/lib/ma-ngan-sach'

// ── Raw row từ data_quy (giữ nguyên tên field tiếng Việt có dấu) ──
export interface DataQuyRow {
  'Đơn_vị'?:        string
  'Đơn vị'?:         string
  'Số_tài_khoản'?:  string
  'Ngân_hàng'?:      string
  'Ngân hàng'?:      string
  'Ngày'?:           string
  'Nội_dung'?:       string
  'Nội dung'?:       string
  'Số_tiền_PS'?:     number
  'Tồn'?:            number
  'Ghi_chu'?:        string
  'Nhóm'?:           string
  'Nhóm_CP'?:        string
  'Mã ngân sách'?:   string
  'Ma_ngan_sach'?:   string
  'Loại'?:           string
  [k: string]: any
}

/** Mã ngân sách của dòng VAY (Nhánh A doanh nghiệp, Nhánh B cá nhân, hoặc
 *  pattern lịch sử tự do NV_/Ngoai_/TTD_) — loại khỏi tổng dòng tiền chính.
 *  `parsed.xacDinh === false` → pattern lịch sử tự do, đại ca cần soát tay
 *  riêng (đối chiếu engine không tự động khớp được các dòng này). */
export interface VayNganSachRow {
  raw:        DataQuyRow
  parsed:     MaNganSachParsed
  ngay:       string
  soTien:     number   // dương, đã lấy trị tuyệt đối
}

function normStr(v: any): string { return String(v ?? '').trim() }

function getField(r: DataQuyRow, ...keys: string[]): any {
  for (const k of keys) if (r[k] !== undefined && r[k] !== '') return r[k]
  return undefined
}

function toArr(val: any): DataQuyRow[] {
  if (!val) return []
  if (Array.isArray(val)) return val.filter(Boolean)
  if (typeof val === 'object') return Object.values(val).filter((v): v is DataQuyRow => !!v && typeof v === 'object')
  return []
}

export interface DongTienQuyData {
  hoatDong:    DongTienItem[]       // CP hoạt động + thu khác thực tế → cộng vào tổng dòng tiền
  vayRows:     VayNganSachRow[]     // dòng vay (Nhánh A/B + pattern tự do) — CHỈ dùng đối chiếu, không cộng tổng.
                                    // Lọc `parsed.xacDinh === true` để lấy các dòng khớp mã tự động;
                                    // `xacDinh === false` là pattern lịch sử tự do (NV_/Ngoai_/TTD_),
                                    // đại ca soát tay riêng — Phần 5 nên hiển thị 2 nhóm tách biệt.
  khongXacDinh: DataQuyRow[]        // dòng không có Mã ngân sách gì cả — để rà soát, KHÔNG cộng tổng
  tonQuyRealtime: number            // tổng Tồn mới nhất mọi tài khoản
}

const ENTITY_MAP: Record<string, EntityType> = {
  SAP: 'SAP', SAHS: 'SAHS', DTSA: 'ĐTSA', 'ĐTSA': 'ĐTSA',
  YANA: 'YANA', SaoViet: 'Sao Việt', 'SaoViệt': 'Sao Việt', CaNhan: 'Cá nhân',
}
function chuanHoaEntity(raw: string): EntityType {
  return (ENTITY_MAP[raw] ?? raw) as EntityType
}

export function subscribeDongTienTuQuy(
  cb: (data: DongTienQuyData) => void,
  entityFilter?: string,
): () => void {
  const dbRef = ref(getDb(), 'data_quy')

  const listener = (snap: any) => {
    const rows = toArr(snap.val())

    const hoatDong: DongTienItem[]      = []
    const vayRows:  VayNganSachRow[]    = []
    const khongXacDinh: DataQuyRow[]    = []
    const latestTon = new Map<string, number>()

    // Sort theo ngày để lấy Tồn mới nhất chính xác (giống pattern page.tsx Ngân sách)
    const sorted = [...rows].sort((a, b) =>
      normStr(getField(a, 'Ngày')).localeCompare(normStr(getField(b, 'Ngày'))))

    sorted.forEach(r => {
      const stk = normStr(getField(r, 'Số_tài_khoản'))
      if (stk) latestTon.set(stk, Number(getField(r, 'Tồn') ?? 0))

      const loai = normStr(getField(r, 'Loại'))
      if (loai && loai !== 'Thực tế') return // ⚙️ tạm thời chỉ lấy Thực tế

      const entityRaw = normStr(getField(r, 'Đơn_vị', 'Đơn vị'))
      const entity = entityRaw ? chuanHoaEntity(entityRaw) : undefined
      if (entityFilter && entityFilter !== 'all' && entity !== entityFilter) return

      const ngay   = normStr(getField(r, 'Ngày'))
      const ps     = Number(getField(r, 'Số_tiền_PS') ?? 0)
      const maNS   = normStr(getField(r, 'Mã ngân sách', 'Ma_ngan_sach'))
      const noiDung = normStr(getField(r, 'Nội_dung', 'Nội dung'))
      const nhomCP  = normStr(getField(r, 'Nhóm_CP', 'Nhóm'))
      if (!ngay || ps === 0) return

      // ── Phân loại: dòng vay (Nhánh A/B hoặc pattern lịch sử tự do)
      //     → tách riêng, KHÔNG cộng vào tổng dòng tiền chính ──
      const vay = parseMaNganSach(maNS)
      if (vay) {
        vayRows.push({ parsed: vay, raw: r, ngay, soTien: Math.abs(ps) })
        return
      }

      // ── CP hoạt động / thu khác — cộng vào tổng dòng tiền ──
      if (!maNS) { khongXacDinh.push(r); return } // không có mã → chưa rõ nhóm, để rà soát riêng

      const loaiDT: LoaiDongTien = ps >= 0 ? 'thu' : 'chi'
      hoatDong.push({
        id:        `quy-${stk}-${ngay}-${maNS}-${hoatDong.length}`,
        entity:    (entity ?? 'SAP') as EntityType,
        loai:      loaiDT,
        ngay,
        soTien:    Math.abs(ps),
        nguon:     'so-quy-thuc-te',
        nhom:      maNS,
        nhanNhan:  noiDung || nhomCP || maNS,
        trangThai: 'thuc-te',
      })
    })

    let tonQuyRealtime = 0
    latestTon.forEach(v => { tonQuyRealtime += v })

    cb({ hoatDong, vayRows, khongXacDinh, tonQuyRealtime })
  }

  onValue(dbRef, listener, e => console.error('[subscribeDongTienTuQuy]', e))
  return () => off(dbRef, 'value', listener)
}