import { getMainFirestore, ensureAnonAuth } from '@/lib/firebase'
import {
  collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot,
  query, orderBy, Unsubscribe,
} from 'firebase/firestore'
import type {
  SapProject, HangMuc, DongTienItem, VatTuItem, NhaThau, KhoanVay, NguonVon,
  NghiemThu, KyTraNo,
} from '@/app/(authenticated)/sap-thi-cong/_lib/types'

const ROOT = 'sapThiCongProjects'

function db() {
  return getMainFirestore()
}

// Firestore không chấp nhận field có giá trị `undefined` (VD: field optional
// bị bỏ trống rồi set thành `undefined`) — loại bỏ trước khi addDoc/updateDoc.
function stripUndefined<T extends Record<string, unknown>>(data: T): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) out[k] = v
  }
  return out as T
}

// ─── Dự án ────────────────────────────────────────────────────
export function subscribeProjects(cb: (list: SapProject[]) => void): Unsubscribe {
  const q = query(collection(db(), ROOT), orderBy('createdAt', 'desc'))
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as SapProject))))
}

export async function createProject(data: Omit<SapProject, 'id' | 'createdAt'>) {
  await ensureAnonAuth()
  return addDoc(collection(db(), ROOT), stripUndefined({ ...data, createdAt: Date.now() }))
}

export async function updateProject(id: string, data: Partial<SapProject>) {
  await ensureAnonAuth()
  return updateDoc(doc(db(), ROOT, id), stripUndefined(data as Record<string, unknown>))
}

export async function deleteProject(id: string) {
  await ensureAnonAuth()
  // Lưu ý: xoá doc dự án KHÔNG tự xoá các subcollection con trên Firestore.
  // Cần Cloud Function hoặc dọn thủ công nếu muốn xoá sạch dữ liệu con.
  return deleteDoc(doc(db(), ROOT, id))
}

// ─── Factory CRUD cho các danh mục con theo từng dự án ─────────
function subPath(projectId: string, sub: string) {
  return `${ROOT}/${projectId}/${sub}`
}

function makeSubStore<T extends { id: string }>(sub: string) {
  return {
    subscribe(projectId: string, cb: (list: T[]) => void): Unsubscribe {
      const q = query(collection(db(), subPath(projectId, sub)))
      return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as T))))
    },
    async add(projectId: string, data: Omit<T, 'id'>) {
      await ensureAnonAuth()
      return addDoc(collection(db(), subPath(projectId, sub)), stripUndefined(data as Record<string, unknown>))
    },
    async update(projectId: string, itemId: string, data: Partial<T>) {
      await ensureAnonAuth()
      return updateDoc(doc(db(), subPath(projectId, sub), itemId), stripUndefined(data as Record<string, unknown>))
    },
    async remove(projectId: string, itemId: string) {
      await ensureAnonAuth()
      return deleteDoc(doc(db(), subPath(projectId, sub), itemId))
    },
  }
}

export const hangMucStore  = makeSubStore<HangMuc>('hangMuc')
export const dongTienStore = makeSubStore<DongTienItem>('dongTien')
export const vatTuStore    = makeSubStore<VatTuItem>('vatTu')
export const nhaThauStore  = makeSubStore<NhaThau>('nhaThau')
export const khoanVayStore = makeSubStore<KhoanVay>('khoanVay')
export const nguonVonStore = makeSubStore<NguonVon>('nguonVon')

// ─── Danh mục con lồng nhau: nghiemThu (trong nhaThau), kyTraNo (trong khoanVay) ─
function nestedPath(projectId: string, parentSub: string, parentId: string, childSub: string) {
  return `${ROOT}/${projectId}/${parentSub}/${parentId}/${childSub}`
}

function makeNestedStore<T extends { id: string }>(parentSub: string, childSub: string) {
  return {
    subscribe(projectId: string, parentId: string, cb: (list: T[]) => void): Unsubscribe {
      const q = query(collection(db(), nestedPath(projectId, parentSub, parentId, childSub)))
      return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as T))))
    },
    async add(projectId: string, parentId: string, data: Omit<T, 'id'>) {
      await ensureAnonAuth()
      return addDoc(collection(db(), nestedPath(projectId, parentSub, parentId, childSub)), stripUndefined(data as Record<string, unknown>))
    },
    async remove(projectId: string, parentId: string, itemId: string) {
      await ensureAnonAuth()
      return deleteDoc(doc(db(), nestedPath(projectId, parentSub, parentId, childSub), itemId))
    },
  }
}

export const nghiemThuStore = makeNestedStore<NghiemThu>('nhaThau', 'nghiemThu')
export const kyTraNoStore   = makeNestedStore<KyTraNo>('khoanVay', 'kyTraNo')
