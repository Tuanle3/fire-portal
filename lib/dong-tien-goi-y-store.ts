// ============================================================
// DANH SÁCH GỢI Ý TUỲ CHỈNH cho form khoản kế hoạch
// (Loại giao dịch, Nhóm báo cáo, ...). Lưu Firestore cùng DB với ngân sách:
//   • themGoiY   — thêm mục mới (có trong danh sách chọn ở mọi lần nhập sau)
//   • doiTenGoiY — đổi tên 1 mục: mục tuỳ chỉnh → sửa thẳng; mục gốc (có sẵn
//                  trong code) → ghi bản "đổi tên" đè lên tên gốc.
// Lưu ý: đổi tên chỉ đổi trong danh sách chọn, KHÔNG sửa các khoản đã lưu trước đó.
// ============================================================
import { collection, doc, onSnapshot, query, setDoc, updateDoc, serverTimestamp, where } from 'firebase/firestore'
import { diennuocDb } from '@/lib/firebase-diennuoc'

const COL = 'dong_tien_goi_y'

export type KieuGoiY = 'loaiGiaoDich' | 'nhomBaoCao' | 'nguonThanhToan'

export interface GoiYTuyChinh {
  id:    string
  kieu:  KieuGoiY
  loai:  'thu' | 'chi'
  ten:   string
  goc?:  string   // có → đây là bản ĐỔI TÊN của mục gốc có tên `goc`
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

function chuan(ten: string): string {
  const t = ten.trim().replace(/\s+/g, ' ')
  if (!t) throw new Error('Tên không được để trống.')
  return t
}

/** Thêm mục mới, trả về tên đã lưu (đã chuẩn hoá khoảng trắng). */
export async function themGoiY(kieu: KieuGoiY, loai: 'thu' | 'chi', ten: string): Promise<string> {
  const t = chuan(ten)
  const id = `${kieu}__${loai}__${slug(t) || Date.now()}`
  await setDoc(doc(collection(diennuocDb, COL), id), { kieu, loai, ten: t, createdAt: serverTimestamp() })
  return t
}

/**
 * Đổi tên 1 mục. `id` có → sửa thẳng bản ghi đó (mục tuỳ chỉnh hoặc bản đổi tên cũ).
 * Không có `id` nhưng có `goc` → mục gốc trong code, tạo bản đổi tên đè lên.
 */
export async function doiTenGoiY(p: {
  kieu: KieuGoiY; loai: 'thu' | 'chi'; id?: string; goc?: string; tenMoi: string
}): Promise<string> {
  const t = chuan(p.tenMoi)
  if (p.id) {
    await updateDoc(doc(collection(diennuocDb, COL), p.id), { ten: t, updatedAt: serverTimestamp() })
  } else if (p.goc) {
    const id = `${p.kieu}__doiten__${slug(p.goc) || Date.now()}`
    await setDoc(doc(collection(diennuocDb, COL), id), { kieu: p.kieu, loai: p.loai, ten: t, goc: p.goc, createdAt: serverTimestamp() })
  } else {
    throw new Error('Không xác định được mục cần đổi tên.')
  }
  return t
}
