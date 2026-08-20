// ============================================================
// STORE — Firestore operations cho module Dòng tiền (Phần 1)
// Collection:
//   dongTienItems   — khoản thu/chi nhập tay (không gồm khoản
//                      tự động từ hạn mức — xem dong-tien-hanmuc-adapter.ts)
// ============================================================
import {
  collection, doc, onSnapshot, setDoc, deleteDoc,
  query, orderBy, where, writeBatch,
  getDoc, getDocs, deleteField,
  QuerySnapshot, DocumentData,
} from 'firebase/firestore'
import { tasksDb, ensureTasksAuth } from '@/lib/firebase-tasks'
import { KhoanDongTien, ChuKyLap } from './dong-tien-types'

const db = () => tasksDb

// ── Collection ref ───────────────────────────────────────────
const ktCol = () => collection(db(), 'dongTienItems')

// ── Snap helper ──────────────────────────────────────────────
function snap<T>(s: QuerySnapshot<DocumentData>): T[] {
  return s.docs.map(d => ({ id: d.id, ...d.data() } as T))
}

// ── Date helpers (giống pattern han-muc-store) ──────────────
function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function fmtDate(d: Date): string {
  const y  = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${dd}`
}
function addMonths(d: Date, n: number): Date {
  const r = new Date(d); r.setMonth(r.getMonth() + n); return r
}

// ── Subscribe toàn bộ khoản dòng tiền, lọc theo entity (tuỳ chọn) ──
//
// ⚠️ QUAN TRỌNG — chống race condition khi đổi entity liên tục:
// `ensureTasksAuth()` là bất đồng bộ, nên nếu người dùng đổi
// pháp nhân (làm effect re-run) TRƯỚC KHI promise này resolve,
// hàm cleanup cũ chạy lúc `unsub` vẫn còn undefined → không huỷ
// được gì. Khi promise cũ resolve muộn, nó vẫn tạo `onSnapshot`
// mới toanh nhưng đã không còn ai gọi cleanup nữa → LISTENER BỊ
// RÒ RỈ, cứ âm thầm gọi `cb()` với dữ liệu SAI PHÁP NHÂN, ghi đè
// lên state của lần subscribe đúng (đây là nguyên nhân chọn
// SAHS nhưng vẫn hiện dữ liệu của entity đã chọn trước đó).
//
// Fix: dùng cờ `cancelled` — nếu subscription đã bị huỷ trước
// khi promise resolve thì bỏ qua, không tạo listener nữa.
export function subscribeDongTien(
  cb: (rows: KhoanDongTien[]) => void,
  entityFilter?: string,
): () => void {
  let unsub: (() => void) | undefined
  let cancelled = false

  ensureTasksAuth().then(() => {
    if (cancelled) return // effect đã bị huỷ trước khi auth xong — không tạo listener nữa
    const q = entityFilter && entityFilter !== 'all'
      ? query(ktCol(), where('entity', '==', entityFilter), orderBy('ngayDuKien', 'asc'))
      : query(ktCol(), orderBy('ngayDuKien', 'asc'))
    unsub = onSnapshot(q,
      s => { if (!cancelled) cb(snap<KhoanDongTien>(s)) },
      e => console.error('[subscribeDongTien] snapshot error:', e.code, e.message),
    )
  }).catch(e => console.error('[subscribeDongTien] auth failed', e))

  return () => {
    cancelled = true
    unsub?.()
  }
}

// ── Lưu 1 khoản (create/edit) ───────────────────────────────
// Nếu k.lap khác 'mot-lan' và k.soKyLap > 1 → sinh nhiều bản ghi độc lập,
// cách nhau theo tháng/quý, cùng chung lapNhomId để có thể sửa/xoá hàng loạt.
export async function saveKhoanDongTien(
  k: Omit<KhoanDongTien, 'id' | 'createdAt' | 'updatedAt'>,
  id?: string,
): Promise<string[]> {
  await ensureTasksAuth()
  const now = Date.now()

  const optionalFields: (keyof KhoanDongTien)[] = [
    'doTinCay', 'lap', 'soKyLap', 'lapNhomId',
    'daThucHien', 'ngayThucHien', 'soTienThucTe', 'ghiChu',
  ]

  // ── EDIT: sửa đúng 1 bản ghi, không sinh lại chuỗi lặp ──
  if (id) {
    const ref = doc(ktCol(), id)
    const existing = await getDoc(ref)
    const createdAt = existing.exists() ? (existing.data() as KhoanDongTien).createdAt ?? now : now

    const data: any = { ...k, id: ref.id, createdAt, updatedAt: now }
    optionalFields.forEach(f => {
      if (data[f] === undefined || data[f] === null) data[f] = deleteField()
    })
    await setDoc(ref, data, { merge: true })
    return [ref.id]
  }

  // ── TẠO MỚI, không lặp: 1 bản ghi ──
  const chuKy: ChuKyLap = k.lap ?? 'mot-lan'
  const soKy  = chuKy === 'mot-lan' ? 1 : Math.max(1, k.soKyLap ?? 1)

  if (soKy === 1) {
    const ref = doc(ktCol())
    const data: any = { ...k, id: ref.id, createdAt: now, updatedAt: now }
    optionalFields.forEach(f => {
      if (data[f] === undefined || data[f] === null) delete data[f]
    })
    await setDoc(ref, data)
    return [ref.id]
  }

  // ── TẠO MỚI, có lặp: sinh nhiều bản ghi, cùng lapNhomId ──
  const lapNhomId = doc(ktCol()).id
  const ngayGoc   = parseDate(k.ngayDuKien)
  const buocThang = chuKy === 'hang-thang' ? 1 : 3 // 'hang-quy'

  const ids: string[] = []
  const BATCH_SIZE = 400
  for (let i = 0; i < soKy; i += BATCH_SIZE) {
    const batch = writeBatch(db())
    const chunk = Array.from({ length: Math.min(BATCH_SIZE, soKy - i) }, (_, j) => i + j)
    chunk.forEach(idx => {
      const ref = doc(ktCol())
      const ngayKy = addMonths(ngayGoc, idx * buocThang)
      const data: any = {
        ...k,
        id: ref.id,
        ngayDuKien: fmtDate(ngayKy),
        lap: chuKy,
        soKyLap: soKy,
        lapNhomId,
        createdAt: now,
        updatedAt: now,
      }
      optionalFields.forEach(f => {
        if (data[f] === undefined || data[f] === null) delete data[f]
      })
      batch.set(ref, data)
      ids.push(ref.id)
    })
    await batch.commit()
  }
  return ids
}

// ── Xoá 1 khoản ──────────────────────────────────────────────
export async function deleteKhoanDongTien(id: string): Promise<void> {
  await ensureTasksAuth()
  await deleteDoc(doc(ktCol(), id))
}

// ── Xoá cả chuỗi lặp (mọi bản ghi cùng lapNhomId) ───────────
export async function deleteChuoiLap(lapNhomId: string): Promise<void> {
  await ensureTasksAuth()
  const snaps = await getDocs(query(ktCol(), where('lapNhomId', '==', lapNhomId)))
  const ids = snaps.docs.map(d => d.id)
  const BATCH_SIZE = 400
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = writeBatch(db())
    ids.slice(i, i + BATCH_SIZE).forEach(id => batch.delete(doc(ktCol(), id)))
    await batch.commit()
  }
}

// ── Đánh dấu đã thực hiện (đối chiếu thực tế) ───────────────
export async function markDongTienThucHien(
  id: string,
  ngayThucHien: string,
  soTienThucTe: number,
): Promise<void> {
  await ensureTasksAuth()
  await setDoc(doc(ktCol(), id), {
    daThucHien: true, ngayThucHien, soTienThucTe, updatedAt: Date.now(),
  }, { merge: true })
}

// ── Bỏ đánh dấu đã thực hiện (undo) ──────────────────────────
export async function unmarkDongTienThucHien(id: string): Promise<void> {
  await ensureTasksAuth()
  await setDoc(doc(ktCol(), id), {
    daThucHien: false,
    ngayThucHien: deleteField(),
    soTienThucTe: deleteField(),
    updatedAt: Date.now(),
  }, { merge: true })
}