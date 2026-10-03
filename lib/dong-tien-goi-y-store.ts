// ============================================================
// DANH SÁCH GỢI Ý TUỲ CHỈNH cho form khoản kế hoạch (Loại giao dịch...)
// Lưu Firestore (cùng DB với ngân sách) — thêm 1 lần, mọi lần nhập sau đều
// có trong danh sách chọn. Hiện dùng cho kieu = 'loaiGiaoDich'; muốn thêm
// cho "Nhóm (báo cáo)" / "Nguồn thanh toán" chỉ cần dùng thêm kieu mới.
// ============================================================
import { collection, doc, onSnapshot, query, setDoc, serverTimestamp, where } from 'firebase/firestore'
import { diennuocDb } from '@/lib/firebase-diennuoc'

const COL = 'dong_tien_goi_y'

export type KieuGoiY = 'loaiGiaoDich' | 'nhomBaoCao' | 'nguonThanhToan'

export interface GoiYTuyChinh {
  id:   string
  kieu: KieuGoiY
  loai: 'thu' | 'chi'
  ten:  string
}

function slug(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
}

export function subscribeGoiY(kieu: KieuGoiY, cb: (list: GoiYTuyChinh[]) => void): () => void {
  const q = query(collection(diennuocDb, COL), where('kieu', '==', kieu))
  return onSnapshot(q, snap => {
    const list = snap.docs
      .map(d => ({ id: d.id, ...(d.data() as Omit<GoiYTuyChinh, 'id'>) }))
      .sort((a, b) => a.ten.localeCompare(b.ten, 'vi'))
    cb(list)
  }, () => cb([]))
}

/** Thêm 1 gợi ý mới, trả về tên đã lưu (đã trim). Trùng tên → ghi đè cùng 1 bản ghi, không tạo bản sao. */
export async function themGoiY(kieu: KieuGoiY, loai: 'thu' | 'chi', ten: string): Promise<string> {
  const t = ten.trim().replace(/\s+/g, ' ')
  if (!t) throw new Error('Tên không được để trống.')
  const id = `${kieu}__${loai}__${slug(t) || Date.now()}`
  await setDoc(doc(collection(diennuocDb, COL), id), { kieu, loai, ten: t, createdAt: serverTimestamp() })
  return t
}
