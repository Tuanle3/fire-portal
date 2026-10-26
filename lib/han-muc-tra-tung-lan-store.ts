// ============================================================
// STORE — Sổ trả nợ TỪNG LẦN (dùng cho tab "Vay ngoài")
// Mỗi lần trả = 1 document trong collection `hanMucTraTungLan`.
// Không đụng tới lịch trả nợ theo kỳ (han-muc-store) nên không ảnh hưởng HĐ ngân hàng.
// ============================================================
import {
  collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc,
  query, where, QuerySnapshot, DocumentData,
} from 'firebase/firestore'
import { tasksDb, ensureTasksAuth } from '@/lib/firebase-tasks'

const col = () => collection(tasksDb, 'hanMucTraTungLan')

export interface TraTungLan {
  id:        string
  hopDongId: string
  ngay:      string    // yyyy-mm-dd
  goc:       number
  lai:       number
  ghiChu?:   string
  createdAt: number
}

export type TraTungLanInput = Pick<TraTungLan, 'ngay' | 'goc' | 'lai'> & { ghiChu?: string }

const snap = (s: QuerySnapshot<DocumentData>) =>
  s.docs.map(d => ({ id: d.id, ...d.data() }) as TraTungLan)

const byNgay = (a: TraTungLan, b: TraTungLan) =>
  a.ngay < b.ngay ? -1 : a.ngay > b.ngay ? 1 : a.createdAt - b.createdAt

/** Các lần trả của 1 hợp đồng (đã sắp theo ngày tăng dần) */
export function subscribeTraTungLan(hopDongId: string, cb: (rows: TraTungLan[]) => void): () => void {
  let unsub: (() => void) | undefined
  ensureTasksAuth().then(() => {
    unsub = onSnapshot(
      query(col(), where('hopDongId', '==', hopDongId)),
      s => cb(snap(s).sort(byNgay)),
      e => console.error('[subscribeTraTungLan]', e.code, e.message),
    )
  }).catch(e => console.error('[subscribeTraTungLan] auth failed', e))
  return () => unsub?.()
}

/** Toàn bộ các lần trả (để tính tổng ở danh sách) */
export function subscribeAllTraTungLan(cb: (rows: TraTungLan[]) => void): () => void {
  let unsub: (() => void) | undefined
  ensureTasksAuth().then(() => {
    unsub = onSnapshot(
      col(),
      s => cb(snap(s).sort(byNgay)),
      e => console.error('[subscribeAllTraTungLan]', e.code, e.message),
    )
  }).catch(e => console.error('[subscribeAllTraTungLan] auth failed', e))
  return () => unsub?.()
}

// Firestore không nhận giá trị undefined → chỉ đưa ghiChu vào khi có
const clean = (d: TraTungLanInput) => {
  const o: Record<string, unknown> = { ngay: d.ngay, goc: d.goc, lai: d.lai }
  if (d.ghiChu && d.ghiChu.trim()) o.ghiChu = d.ghiChu.trim()
  return o
}

export async function addTraTungLan(hopDongId: string, d: TraTungLanInput): Promise<void> {
  await ensureTasksAuth()
  await addDoc(col(), { hopDongId, ...clean(d), createdAt: Date.now() })
}

export async function updateTraTungLan(id: string, d: TraTungLanInput): Promise<void> {
  await ensureTasksAuth()
  // ghiChu bị xoá trắng thì ghi đè rỗng để mất ghi chú cũ
  await updateDoc(doc(col(), id), { ...clean(d), ...(d.ghiChu?.trim() ? {} : { ghiChu: '' }) })
}

export async function deleteTraTungLan(id: string): Promise<void> {
  await ensureTasksAuth()
  await deleteDoc(doc(col(), id))
}
