// ============================================================
// STORE — Nhóm dòng tiền TUỲ CHỈNH (Firestore)
// Ngoài 7 nhóm THU + 15 nhóm CHI chuẩn (dong-tien-types.ts),
// người dùng bấm "+ Thêm nhóm mới" để tạo nhóm riêng — lưu ở
// đây để mọi người dùng chung đều thấy lại trong dropdown lần
// sau. Nhóm tuỳ chỉnh dùng CHÍNH TÊN làm giá trị `nhom` lưu trên
// KhoanDongTien (không có code riêng).
// ============================================================
import {
  collection, doc, onSnapshot, setDoc, query, orderBy,
  QuerySnapshot, DocumentData,
} from 'firebase/firestore'
import { tasksDb, ensureTasksAuth } from '@/lib/firebase-tasks'
import { LoaiDongTien } from './dong-tien-types'

const db  = () => tasksDb
const col = () => collection(db(), 'dongTienNhomTuyChinh')

export interface NhomTuyChinh {
  id:        string
  loai:      LoaiDongTien
  ten:       string
  createdAt: number
}

function snap<T>(s: QuerySnapshot<DocumentData>): T[] {
  return s.docs.map(d => ({ id: d.id, ...d.data() } as T))
}

// ── Subscribe toàn bộ nhóm tuỳ chỉnh (thu + chi) — lọc theo loai ở component ──
export function subscribeNhomTuyChinh(cb: (rows: NhomTuyChinh[]) => void): () => void {
  let unsub: (() => void) | undefined
  let cancelled = false

  ensureTasksAuth().then(() => {
    if (cancelled) return
    const q = query(col(), orderBy('createdAt', 'asc'))
    unsub = onSnapshot(q,
      s => { if (!cancelled) cb(snap<NhomTuyChinh>(s)) },
      e => console.error('[subscribeNhomTuyChinh] snapshot error:', e.code, e.message),
    )
  }).catch(e => console.error('[subscribeNhomTuyChinh] auth failed', e))

  return () => { cancelled = true; unsub?.() }
}

// ── Thêm 1 nhóm tuỳ chỉnh mới — trả về chính tên (dùng làm giá trị `nhom`) ──
export async function themNhomTuyChinh(loai: LoaiDongTien, ten: string): Promise<string> {
  await ensureTasksAuth()
  const tenSach = ten.trim()
  if (!tenSach) throw new Error('Tên nhóm không được để trống.')
  const ref = doc(col())
  await setDoc(ref, { id: ref.id, loai, ten: tenSach, createdAt: Date.now() })
  return tenSach
}