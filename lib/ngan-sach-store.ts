import {
  collection, doc, getDoc, setDoc, onSnapshot, serverTimestamp,
} from 'firebase/firestore'
import { getMainFirestore } from '@/lib/firebase'
import { NganSachThang, NganSachItem, GiaiPhap, DEFAULT_ITEMS, DEFAULT_GIAI_PHAP } from '@/lib/ngan-sach-types'

const COL = 'ngan_sach'

function makeId() {
  return Math.random().toString(36).slice(2, 10)
}

export function subscribeNganSach(
  thang: string,
  cb: (data: NganSachThang) => void,
): () => void {
  const db = getMainFirestore()
  const ref = doc(collection(db, COL), thang)
  return onSnapshot(ref, snap => {
    if (snap.exists()) {
      cb(snap.data() as NganSachThang)
    } else {
      cb(makeDefault(thang))
    }
  })
}

export function makeDefault(thang: string): NganSachThang {
  return {
    thang,
    ngay_cap_nhat: new Date().toLocaleDateString('vi-VN'),
    items: DEFAULT_ITEMS.map(it => ({ ...it, id: makeId() })),
    giai_phap: DEFAULT_GIAI_PHAP.map(gp => ({ ...gp, id: makeId() })),
  }
}

export async function saveNganSach(data: NganSachThang): Promise<void> {
  const db = getMainFirestore()
  const ref = doc(collection(db, COL), data.thang)
  await setDoc(ref, {
    ...data,
    ngay_cap_nhat: new Date().toLocaleDateString('vi-VN'),
    updatedAt: serverTimestamp(),
  })
}

export async function getNganSach(thang: string): Promise<NganSachThang> {
  const db = getMainFirestore()
  const snap = await getDoc(doc(collection(db, COL), thang))
  if (snap.exists()) return snap.data() as NganSachThang
  return makeDefault(thang)
}

// helpers
export function addItem(data: NganSachThang, after_id: string, nhom: string): NganSachThang {
  const idx = data.items.findIndex(i => i.id === after_id)
  const newItem: NganSachItem = {
    id: makeId(), nhom, is_section: false, stt: '',
    dien_giai: '', kmcp: '', ke_hoach: 0, thuc_hien: 0,
    thuc_hien_manual: true, ghi_chu: '',
  }
  const items = [...data.items]
  items.splice(idx + 1, 0, newItem)
  return { ...data, items }
}

export function removeItem(data: NganSachThang, id: string): NganSachThang {
  return { ...data, items: data.items.filter(i => i.id !== id) }
}

export function updateItem(data: NganSachThang, id: string, patch: Partial<NganSachItem>): NganSachThang {
  return { ...data, items: data.items.map(i => i.id === id ? { ...i, ...patch } : i) }
}

export function addGiaiPhap(data: NganSachThang): NganSachThang {
  const gp: GiaiPhap = {
    id: makeId(), mo_ta: '', so_tien_ke_hoach: 0,
    so_tien_thuc_hien: 0, trang_thai: 'pending', ghi_chu: '',
  }
  return { ...data, giai_phap: [...data.giai_phap, gp] }
}

export function removeGiaiPhap(data: NganSachThang, id: string): NganSachThang {
  return { ...data, giai_phap: data.giai_phap.filter(g => g.id !== id) }
}

export function updateGiaiPhap(data: NganSachThang, id: string, patch: Partial<GiaiPhap>): NganSachThang {
  return { ...data, giai_phap: data.giai_phap.map(g => g.id === id ? { ...g, ...patch } : g) }
}
