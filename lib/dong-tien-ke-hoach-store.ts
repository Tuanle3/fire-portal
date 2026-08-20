// ============================================================
// STORE — Kế hoạch dòng tiền (Bước A+B)
//
// Quản lý:
//   1. SoDuDauKy — tồn quỹ đầu kỳ theo tháng + entity (nhỏ, nhập 1 lần/tháng)
//   2. Query khoản kế hoạch/thực hiện theo tháng — đọc từ collection
//      dongTienItems (dùng chung với dong-tien-store.ts, lọc thêm loaiKhoan)
//
// Collection mới: dongTienSoDuDauKy
// Collection dùng chung: dongTienItems (đã có từ Phần 1)
// ============================================================
import {
  collection, doc, onSnapshot, setDoc, deleteDoc,
  query, where, orderBy, QuerySnapshot, DocumentData,
} from 'firebase/firestore'
import { tasksDb, ensureTasksAuth } from '@/lib/firebase-tasks'
import { SoDuDauKy, KhoanDongTien, LoaiKhoan } from './dong-tien-types'
import type { EntityType } from '@/lib/han-muc-types'

const db = () => tasksDb

// ── Collection refs ──────────────────────────────────────────
const soDuCol  = () => collection(db(), 'dongTienSoDuDauKy')
const ktCol    = () => collection(db(), 'dongTienItems')

// ── Snap helper ──────────────────────────────────────────────
function snap<T>(s: QuerySnapshot<DocumentData>): T[] {
  return s.docs.map(d => ({ id: d.id, ...d.data() } as T))
}

// ── Doc id ổn định cho SoDuDauKy ────────────────────────────
export function soDuDocId(thang: string, entity: EntityType | 'all'): string {
  return `${thang}__${entity.replace(/\s/g, '_')}`
}

// ─────────────────────────────────────────────────────────────
// SỐ DƯ ĐẦU KỲ
// ─────────────────────────────────────────────────────────────

/** Subscribe số dư đầu kỳ của 1 tháng (tất cả entity) */
export function subscribeSoDuDauKy(
  thang: string,
  cb: (rows: SoDuDauKy[]) => void,
): () => void {
  let unsub: (() => void) | undefined
  ensureTasksAuth().then(() => {
    const q = query(soDuCol(), where('thang', '==', thang))
    unsub = onSnapshot(q,
      s => cb(snap<SoDuDauKy>(s)),
      e => console.error('[subscribeSoDuDauKy]', e),
    )
  }).catch(e => console.error('[subscribeSoDuDauKy] auth', e))
  return () => unsub?.()
}

/** Lưu (upsert) số dư đầu kỳ */
export async function saveSoDuDauKy(
  data: Omit<SoDuDauKy, 'id' | 'updatedAt'>,
): Promise<void> {
  await ensureTasksAuth()
  const id  = soDuDocId(data.thang, data.entity)
  const ref = doc(soDuCol(), id)
  await setDoc(ref, { ...data, id, updatedAt: Date.now() }, { merge: true })
}

/** Xoá số dư đầu kỳ */
export async function deleteSoDuDauKy(thang: string, entity: EntityType | 'all'): Promise<void> {
  await ensureTasksAuth()
  await deleteDoc(doc(soDuCol(), soDuDocId(thang, entity)))
}

// ─────────────────────────────────────────────────────────────
// SUBSCRIBE KẾ HOẠCH / THỰC HIỆN theo tháng
// ─────────────────────────────────────────────────────────────

/**
 * Subscribe khoản kế hoạch ('ke-hoach') của 1 tháng.
 * Lọc: ngayDuKien trong [tuNgay, denNgay] (đầu tháng → cuối tháng).
 * Dùng cả 2 nguồn:
 *   • loaiKhoan === 'ke-hoach' (khoản mới tạo sau Bước B)
 *   Khoản cũ (loaiKhoan undefined) KHÔNG hiển thị ở đây — chỉ ở tab thực hiện.
 */
export function subscribeKeHoachThang(
  thang: string,            // 'YYYY-MM'
  cb: (rows: KhoanDongTien[]) => void,
  entityFilter?: EntityType | 'all',
): () => void {
  const [y, m] = thang.split('-').map(Number)
  const tuNgay  = `${thang}-01`
  const denNgay = `${thang}-${new Date(y, m, 0).getDate().toString().padStart(2, '0')}`

  let unsub: (() => void) | undefined
  ensureTasksAuth().then(() => {
    let q = query(
      ktCol(),
      where('loaiKhoan', '==', 'ke-hoach'),
      where('ngayDuKien', '>=', tuNgay),
      where('ngayDuKien', '<=', denNgay),
      orderBy('ngayDuKien', 'asc'),
    )
    if (entityFilter && entityFilter !== 'all') {
      q = query(
        ktCol(),
        where('loaiKhoan', '==', 'ke-hoach'),
        where('entity', '==', entityFilter),
        where('ngayDuKien', '>=', tuNgay),
        where('ngayDuKien', '<=', denNgay),
        orderBy('ngayDuKien', 'asc'),
      )
    }
    unsub = onSnapshot(q,
      s => cb(snap<KhoanDongTien>(s)),
      e => console.error('[subscribeKeHoachThang]', e),
    )
  }).catch(e => console.error('[subscribeKeHoachThang] auth', e))
  return () => unsub?.()
}

// ─────────────────────────────────────────────────────────────
// HELPER — Lấy nhãn tháng đẹp + danh sách tháng gần đây
// ─────────────────────────────────────────────────────────────

export function labelThang(thang: string): string {
  const [y, m] = thang.split('-')
  return `Tháng ${Number(m)}/${y}`
}

/** Danh sách N tháng gần nhất (mặc định 12), format 'YYYY-MM', giảm dần */
export function danhSachThangGanDay(n = 12): string[] {
  const now = new Date()
  const result: string[] = []
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return result
}

/** Tháng hiện tại format 'YYYY-MM' */
export function thangHienTai(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/** Tuần tiếp theo trong tháng — trả về ngày đầu tuần (Thứ 2) */
export function danhSachTuanTrongThang(thang: string): { tuNgay: string; denNgay: string; label: string }[] {
  const [y, m] = thang.split('-').map(Number)
  const dauThang = new Date(y, m - 1, 1)
  const cuoiThang = new Date(y, m, 0)
  const result: { tuNgay: string; denNgay: string; label: string }[] = []

  // Bắt đầu từ Thứ 2 của tuần chứa ngày 1
  const dow = (dauThang.getDay() + 6) % 7
  let cur = new Date(dauThang)
  cur.setDate(cur.getDate() - dow)

  let tuanSo = 1
  while (cur <= cuoiThang) {
    const start = new Date(Math.max(cur.getTime(), dauThang.getTime()))
    const end   = new Date(Math.min(new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 6).getTime(), cuoiThang.getTime()))
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    result.push({
      tuNgay: fmt(start),
      denNgay: fmt(end),
      label: `Tuần ${tuanSo} (${String(start.getDate()).padStart(2,'0')}/${String(start.getMonth()+1).padStart(2,'0')} – ${String(end.getDate()).padStart(2,'0')}/${String(end.getMonth()+1).padStart(2,'0')})`,
    })
    cur.setDate(cur.getDate() + 7)
    tuanSo++
  }
  return result
}
