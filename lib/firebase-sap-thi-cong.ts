import { getMainFirestore, ensureAnonAuth } from '@/lib/firebase'
import {
  collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot,
  query, orderBy, Unsubscribe,
} from 'firebase/firestore'
import type {
  SapProject, HangMuc, DongTienItem, VatTuItem, NhaThau, KhoanVay, NguonVon,
  NghiemThu, KyTraNo, DoiTac,
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
export const doiTacStore   = makeSubStore<DoiTac>('doiTac')

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
    async update(projectId: string, parentId: string, itemId: string, data: Partial<T>) {
      await ensureAnonAuth()
      return updateDoc(doc(db(), nestedPath(projectId, parentSub, parentId, childSub), itemId), stripUndefined(data as Record<string, unknown>))
    },
    async remove(projectId: string, parentId: string, itemId: string) {
      await ensureAnonAuth()
      return deleteDoc(doc(db(), nestedPath(projectId, parentSub, parentId, childSub), itemId))
    },
  }
}

export const nghiemThuStore = makeNestedStore<NghiemThu>('nhaThau', 'nghiemThu')
export const kyTraNoStore   = makeNestedStore<KyTraNo>('khoanVay', 'kyTraNo')

// ─── Đồng bộ Dòng tiền tự động theo nghiệp vụ thanh toán / giải ngân ───
// Nguyên tắc: mỗi khoản thanh toán/giải ngân có TỐI ĐA 1 bản ghi Dòng tiền
// (`auto:true`) đi kèm. Id được lưu 2 chiều (`dongTienId` trên bản ghi
// nguồn ⇄ `sourceId` trên bản ghi Dòng tiền) để sửa/xoá luôn đồng bộ,
// tránh phải nhập lại thủ công ở tab Dòng tiền.

async function upsertAutoDongTien(
  projectId: string,
  existingDongTienId: string | undefined,
  data: Omit<DongTienItem, 'id'>,
): Promise<string> {
  if (existingDongTienId) {
    await dongTienStore.update(projectId, existingDongTienId, data)
    return existingDongTienId
  }
  const ref = await dongTienStore.add(projectId, data)
  return ref.id
}

async function removeAutoDongTien(projectId: string, dongTienId?: string) {
  if (!dongTienId) return
  try {
    await dongTienStore.remove(projectId, dongTienId)
  } catch {
    // Bản ghi có thể đã bị xoá thủ công trước đó — bỏ qua.
  }
}

// --- Nghiệm thu nhà thầu phụ → dòng tiền "chi" theo `paid` ---
export async function saveNghiemThuWithSync(
  projectId: string,
  subconId: string,
  subconName: string,
  data: Omit<NghiemThu, 'id' | 'dongTienId'>,
  existing?: NghiemThu,
) {
  await ensureAnonAuth()
  const buildCash = (sourceId: string): Omit<DongTienItem, 'id'> => ({
    date: data.bbDate || new Date().toISOString().slice(0, 10),
    type: 'chi',
    category: `Thanh toán nghiệm thu – ${subconName} (${data.dot})`,
    amount: data.paid,
    note: data.note,
    auto: true,
    sourceType: 'nghiem-thu',
    sourceId,
    sourceParentId: subconId,
  })

  if (existing) {
    let dongTienId: string | undefined = existing.dongTienId
    if (data.paid > 0) {
      dongTienId = await upsertAutoDongTien(projectId, existing.dongTienId, buildCash(existing.id))
    } else {
      await removeAutoDongTien(projectId, existing.dongTienId)
      dongTienId = undefined
    }
    await nghiemThuStore.update(projectId, subconId, existing.id, { ...data, dongTienId })
  } else {
    const ref = await nghiemThuStore.add(projectId, subconId, data)
    if (data.paid > 0) {
      const dongTienId = await upsertAutoDongTien(projectId, undefined, buildCash(ref.id))
      await nghiemThuStore.update(projectId, subconId, ref.id, { dongTienId })
    }
  }
}

export async function removeNghiemThuWithSync(projectId: string, subconId: string, item: NghiemThu) {
  await removeAutoDongTien(projectId, item.dongTienId)
  await nghiemThuStore.remove(projectId, subconId, item.id)
}

// --- Vật tư → dòng tiền "chi" theo `paidAmount` ---
export async function saveVatTuWithSync(
  projectId: string,
  data: Omit<VatTuItem, 'id' | 'dongTienId'>,
  existing?: VatTuItem,
) {
  await ensureAnonAuth()
  const buildCash = (sourceId: string): Omit<DongTienItem, 'id'> => ({
    date: data.date || new Date().toISOString().slice(0, 10),
    type: 'chi',
    category: `Thanh toán vật tư – ${data.name}${data.supplier ? ` (${data.supplier})` : ''}`,
    amount: data.paidAmount,
    doiTacId: data.doiTacId,
    note: data.note,
    auto: true,
    sourceType: 'vat-tu',
    sourceId,
  })

  if (existing) {
    let dongTienId: string | undefined = existing.dongTienId
    if (data.paidAmount > 0) {
      dongTienId = await upsertAutoDongTien(projectId, existing.dongTienId, buildCash(existing.id))
    } else {
      await removeAutoDongTien(projectId, existing.dongTienId)
      dongTienId = undefined
    }
    await vatTuStore.update(projectId, existing.id, { ...data, dongTienId })
  } else {
    const ref = await vatTuStore.add(projectId, data)
    if (data.paidAmount > 0) {
      const dongTienId = await upsertAutoDongTien(projectId, undefined, buildCash(ref.id))
      await vatTuStore.update(projectId, ref.id, { dongTienId })
    }
  }
}

export async function removeVatTuWithSync(projectId: string, item: VatTuItem) {
  await removeAutoDongTien(projectId, item.dongTienId)
  await vatTuStore.remove(projectId, item.id)
}

// --- Khoản vay (giải ngân) → dòng tiền "thu" theo `amount` ---
export async function saveKhoanVayWithSync(
  projectId: string,
  data: Omit<KhoanVay, 'id' | 'dongTienId'>,
  existing?: KhoanVay,
) {
  await ensureAnonAuth()
  const buildCash = (sourceId: string): Omit<DongTienItem, 'id'> => ({
    date: data.date,
    type: 'thu',
    category: `Giải ngân vay – ${data.batch}${data.bank ? ` (${data.bank})` : ''}`,
    amount: data.amount,
    note: data.note,
    auto: true,
    sourceType: 'khoan-vay',
    sourceId,
  })

  if (existing) {
    const dongTienId = await upsertAutoDongTien(projectId, existing.dongTienId, buildCash(existing.id))
    await khoanVayStore.update(projectId, existing.id, { ...data, dongTienId })
  } else {
    const ref = await khoanVayStore.add(projectId, data)
    const dongTienId = await upsertAutoDongTien(projectId, undefined, buildCash(ref.id))
    await khoanVayStore.update(projectId, ref.id, { dongTienId })
  }
}

export async function removeKhoanVayWithSync(projectId: string, item: KhoanVay) {
  await removeAutoDongTien(projectId, item.dongTienId)
  await khoanVayStore.remove(projectId, item.id)
}

// --- Kỳ trả nợ → dòng tiền "chi" (gốc + lãi) khi đánh dấu đã trả ---
export async function saveKyTraNoWithSync(
  projectId: string,
  vayId: string,
  vayBatch: string,
  data: Omit<KyTraNo, 'id' | 'dongTienId'>,
  existing?: KyTraNo,
) {
  await ensureAnonAuth()
  const buildCash = (sourceId: string): Omit<DongTienItem, 'id'> => ({
    date: data.dueDate,
    type: 'chi',
    category: `Trả nợ vay – ${vayBatch} (gốc + lãi)`,
    amount: data.goc + data.lai,
    auto: true,
    sourceType: 'ky-tra-no',
    sourceId,
    sourceParentId: vayId,
  })

  if (existing) {
    let dongTienId: string | undefined = existing.dongTienId
    if (data.paid) {
      dongTienId = await upsertAutoDongTien(projectId, existing.dongTienId, buildCash(existing.id))
    } else {
      await removeAutoDongTien(projectId, existing.dongTienId)
      dongTienId = undefined
    }
    await kyTraNoStore.update(projectId, vayId, existing.id, { ...data, dongTienId })
  } else {
    const ref = await kyTraNoStore.add(projectId, vayId, data)
    if (data.paid) {
      const dongTienId = await upsertAutoDongTien(projectId, undefined, buildCash(ref.id))
      await kyTraNoStore.update(projectId, vayId, ref.id, { dongTienId })
    }
  }
}

export async function removeKyTraNoWithSync(projectId: string, vayId: string, item: KyTraNo) {
  await removeAutoDongTien(projectId, item.dongTienId)
  await kyTraNoStore.remove(projectId, vayId, item.id)
}
