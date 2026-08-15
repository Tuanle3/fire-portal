// ============================================================
// STORE — Danh sách pháp nhân tuỳ chỉnh (module Hạn mức tín dụng)
// Dùng chung cho cả Dài hạn (HopDongForm) và Ngắn hạn (KhungForm).
// Collection: hanMucCustomEntities
// ============================================================
import {
  collection, doc, onSnapshot, setDoc,
  query, orderBy, QuerySnapshot, DocumentData,
} from 'firebase/firestore'
import { tasksDb, ensureTasksAuth } from '@/lib/firebase-tasks'

const db = () => tasksDb
const entCol = () => collection(db(), 'hanMucCustomEntities')

export interface CustomEntity {
  id:        string
  ten:       string
  createdAt: number
}

/** Slug ổn định làm doc id, tránh trùng lặp khi nhiều người thêm cùng 1 tên */
function slugify(ten: string): string {
  return ten
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // bỏ dấu
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `pn-${Date.now()}`
}

export function subscribeCustomEntities(cb: (rows: CustomEntity[]) => void): () => void {
  let unsub: (() => void) | undefined
  ensureTasksAuth().then(() => {
    const q = query(entCol(), orderBy('createdAt', 'asc'))
    unsub = onSnapshot(
      q,
      s => cb(snap<CustomEntity>(s)),
      e => console.error('[subscribeCustomEntities] snapshot error:', e.code, e.message),
    )
  }).catch(e => console.error('[subscribeCustomEntities] auth failed', e))
  return () => unsub?.()
}

/** Thêm 1 pháp nhân mới vào danh sách dùng chung. Không lỗi nếu đã tồn tại (merge). */
export async function addCustomEntity(ten: string): Promise<void> {
  const tenTrim = ten.trim()
  if (!tenTrim) return
  await ensureTasksAuth()
  const id = slugify(tenTrim)
  await setDoc(doc(entCol(), id), { ten: tenTrim, createdAt: Date.now() }, { merge: true })
}

function snap<T>(snapshot: QuerySnapshot<DocumentData>): T[] {
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }) as T)
}
