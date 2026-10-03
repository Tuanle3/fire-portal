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
  QuerySnapshot, QueryDocumentSnapshot, DocumentData,
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
export function subscribeDongTien(
  cb: (rows: KhoanDongTien[]) => void,
  entityFilter?: string,
): () => void {
  let unsub: (() => void) | undefined
  ensureTasksAuth().then(() => {
    const q = entityFilter && entityFilter !== 'all'
      ? query(ktCol(), where('entity', '==', entityFilter), orderBy('ngayDuKien', 'asc'))
      : query(ktCol(), orderBy('ngayDuKien', 'asc'))
    unsub = onSnapshot(q,
      s => cb(snap<KhoanDongTien>(s)),
      e => console.error('[subscribeDongTien] snapshot error:', e.code, e.message),
    )
  }).catch(e => console.error('[subscribeDongTien] auth failed', e))
  return () => unsub?.()
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
    // Bước A — liên kết kế hoạch ↔ thực hiện
    'loaiKhoan', 'nhomCha', 'nhomChaLabel',
    // Tab Kế hoạch dòng tiền — để trống thì xoá field (không ghi undefined)
    'nguonThanhToan', 'doiTac', 'loaiGiaoDich', 'nhomBaoCao',
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

// ============================================================
// ĐỒNG BỘ KHI ĐỔI TÊN / ĐỔI MÃ (Loại giao dịch, Nguồn thanh toán, Nhóm)
// Mọi hàm chạy trên TOÀN BỘ khoản đã lưu (mọi tháng) và ghi theo lô 400.
// ============================================================
async function capNhatHangLoat(
  docs: QueryDocumentSnapshot<DocumentData>[],
  patch: (d: any) => Record<string, any> | null,
): Promise<number> {
  let dem = 0
  const BATCH_SIZE = 400
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = writeBatch(db())
    let coGhi = false
    for (const d of docs.slice(i, i + BATCH_SIZE)) {
      const p = patch(d.data())
      if (!p) continue
      batch.update(d.ref, p); dem++; coGhi = true
    }
    if (coGhi) await batch.commit()
  }
  return dem
}

/** Đổi tên 1 giá trị ở trường loaiGiaoDich / nguonThanhToan / nhomBaoCao / entity (pháp nhân) trên mọi khoản đang dùng tên cũ. Trả về số khoản đã cập nhật. */
export async function doiTenTruongKhoan(
  field: 'loaiGiaoDich' | 'nguonThanhToan' | 'nhomBaoCao' | 'entity',
  tenCu: string,
  tenMoi: string,
): Promise<number> {
  await ensureTasksAuth()
  if (!tenCu || !tenMoi || tenCu === tenMoi) return 0
  const snaps = await getDocs(query(ktCol(), where(field, '==', tenCu)))
  const now = Date.now()
  return capNhatHangLoat(snaps.docs, () => ({ [field]: tenMoi, updatedAt: now }))
}

/**
 * Đổi tên NHÓM: khoản gắn nhóm bằng mã (nhom), nhưng còn giữ bản sao tên ở nhomBaoCao ("4. Tên nhóm") và nhomChaLabel.
 * Cập nhật 2 bản sao này cho mọi khoản kế hoạch thuộc nhóm `nhom`. Giữ số thứ tự riêng của từng khoản
 * (nếu khoản chưa có số thì dùng sttMacDinh).
 */
export async function dongBoTenNhomKhoan(p: { nhom: string; ten: string; sttMacDinh?: string }): Promise<number> {
  await ensureTasksAuth()
  const snaps = await getDocs(query(ktCol(), where('nhom', '==', p.nhom)))
  const now = Date.now()
  return capNhatHangLoat(snaps.docs, d => {
    if ((d.loaiKhoan ?? 'thuc-hien') !== 'ke-hoach') return null
    const m = String(d.nhomBaoCao ?? '').match(/^\s*(\d+)\s*[.)]\s*/)
    const stt = m ? m[1] : (p.sttMacDinh ?? '')
    const bc = stt ? `${stt}. ${p.ten}` : p.ten
    if (d.nhomBaoCao === bc && d.nhomChaLabel === p.ten) return null
    return { nhomBaoCao: bc, nhomChaLabel: p.ten, updatedAt: now }
  })
}

/** Đổi MÃ nhóm của các khoản kế hoạch (VD nhóm chưa có mã '@Tên' → được cấp mã NH-xxxxx). */
export async function doiMaNhomKhoan(maCu: string, maMoi: string): Promise<number> {
  await ensureTasksAuth()
  if (!maCu || !maMoi || maCu === maMoi) return 0
  const snaps = await getDocs(query(ktCol(), where('nhom', '==', maCu)))
  const now = Date.now()
  return capNhatHangLoat(snaps.docs, d =>
    (d.loaiKhoan ?? 'thuc-hien') === 'ke-hoach' ? { nhom: maMoi, nhomCha: maMoi, updatedAt: now } : null)
}
