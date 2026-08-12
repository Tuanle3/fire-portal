import {
  collection, doc, setDoc, deleteDoc, onSnapshot, Unsubscribe,
} from 'firebase/firestore'
import { getMainFirestore, ensureAnonAuth } from './firebase'
import { BankRelation, BankProposal, BankNote } from './bank-types'

const COL_NH = 'bank_relations'
const COL_PA = 'bank_proposals'
const COL_GC = 'bank_notes'

const db = () => getMainFirestore()

// Firestore không chấp nhận giá trị undefined
function clean<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) out[k] = v ?? null
  return out
}

// ── Ngân hàng ────────────────────────────────────────────────────────────
function fromFirestoreNH(id: string, data: Record<string, unknown>): BankRelation {
  return {
    id,
    tenNganHang:    (data.tenNganHang as string) ?? '',
    chiNhanh:       (data.chiNhanh as string) ?? '',
    loaiHinh:       (data.loaiHinh as BankRelation['loaiHinh']) ?? 'ngan_hang',
    nguoiLienHe:    (data.nguoiLienHe as BankRelation['nguoiLienHe']) ?? [],
    danhGia:        (data.danhGia as BankRelation['danhGia']) ?? 'binh_thuong',
    trangThai:      (data.trangThai as BankRelation['trangThai']) ?? 'dang_hop_tac',
    hanMucHienTai:  Number(data.hanMucHienTai ?? 0),
    duNoHienTai:    Number(data.duNoHienTai ?? 0),
    laiSuatBinhQuan: Number(data.laiSuatBinhQuan ?? 0),
    ghiChuChung:    (data.ghiChuChung as string) ?? '',
    updatedAt:      (data.updatedAt as string) ?? '',
  }
}

export async function saveBankRelation(r: BankRelation): Promise<void> {
  await ensureAnonAuth()
  await setDoc(doc(db(), COL_NH, r.id), clean({ ...r, updatedAt: new Date().toISOString().slice(0, 10) }))
}

export async function deleteBankRelation(id: string): Promise<void> {
  await ensureAnonAuth()
  await deleteDoc(doc(db(), COL_NH, id))
}

export function subscribeBankRelations(cb: (rows: BankRelation[]) => void): Unsubscribe {
  return onSnapshot(collection(db(), COL_NH), snap => {
    cb(snap.docs.map(d => fromFirestoreNH(d.id, d.data() as Record<string, unknown>)))
  })
}

// ── Phương án vay ────────────────────────────────────────────────────────
function fromFirestorePA(id: string, data: Record<string, unknown>): BankProposal {
  return {
    id,
    nganHangId:    (data.nganHangId as string) ?? '',
    tenPhuongAn:   (data.tenPhuongAn as string) ?? '',
    loaiVay:       (data.loaiVay as BankProposal['loaiVay']) ?? 'ngan_han',
    thoiHan:       (data.thoiHan as string) ?? '',
    ngayNopHoSo:   (data.ngayNopHoSo as string) ?? '',
    laiSuatBacThang: (data.laiSuatBacThang as BankProposal['laiSuatBacThang']) ?? [],
    laiSuatThaNoi: (data.laiSuatThaNoi as string) ?? '',
    hanMucDeXuat:  Number(data.hanMucDeXuat ?? 0),
    mucTaiTroMoTa: (data.mucTaiTroMoTa as string) ?? '',
    tyLeTSDB:      Number(data.tyLeTSDB ?? 0),
    tsdbDieuKien:  (data.tsdbDieuKien as string) ?? '',
    tsdbTuChoi:    (data.tsdbTuChoi as string) ?? '',
    hoTroDacBiet:  (data.hoTroDacBiet as string) ?? '',
    phuongThucTT:  (data.phuongThucTT as string) ?? '',
    phiDichVu:     (data.phiDichVu as string) ?? '',
    dieuKien:      (data.dieuKien as string) ?? '',
    uuDiem:        (data.uuDiem as string[]) ?? [],
    nhuocDiem:     (data.nhuocDiem as string[]) ?? [],
    customRows:    (data.customRows as BankProposal['customRows']) ?? [],
    trangThai:     (data.trangThai as BankProposal['trangThai']) ?? 'soan_ho_so',
    nguoiPhuTrach: (data.nguoiPhuTrach as string) ?? '',
    ngayCapNhat:   (data.ngayCapNhat as string) ?? '',
  }
}

export async function saveBankProposal(p: BankProposal): Promise<void> {
  await ensureAnonAuth()
  await setDoc(doc(db(), COL_PA, p.id), clean({ ...p, ngayCapNhat: new Date().toISOString().slice(0, 10) }))
}

export async function deleteBankProposal(id: string): Promise<void> {
  await ensureAnonAuth()
  await deleteDoc(doc(db(), COL_PA, id))
}

export function subscribeBankProposals(cb: (rows: BankProposal[]) => void): Unsubscribe {
  return onSnapshot(collection(db(), COL_PA), snap => {
    cb(snap.docs.map(d => fromFirestorePA(d.id, d.data() as Record<string, unknown>)))
  })
}

// ── Ghi chú / nhật ký làm việc ───────────────────────────────────────────
function fromFirestoreGC(id: string, data: Record<string, unknown>): BankNote {
  return {
    id,
    nganHangId:    (data.nganHangId as string) ?? '',
    ngay:          (data.ngay as string) ?? '',
    nguoiLienHe:   (data.nguoiLienHe as string) ?? '',
    hangMuc:       (data.hangMuc as BankNote['hangMuc']) ?? [],
    danhGiaChung:  (data.danhGiaChung as string) ?? '',
    viecCanLam:    (data.viecCanLam as string) ?? '',
    hanXuLy:       (data.hanXuLy as string) ?? '',
    nguoiPhuTrach: (data.nguoiPhuTrach as string) ?? '',
  }
}

export async function saveBankNote(n: BankNote): Promise<void> {
  await ensureAnonAuth()
  await setDoc(doc(db(), COL_GC, n.id), clean({ ...n }))
}

export async function deleteBankNote(id: string): Promise<void> {
  await ensureAnonAuth()
  await deleteDoc(doc(db(), COL_GC, id))
}

export function subscribeBankNotes(cb: (rows: BankNote[]) => void): Unsubscribe {
  return onSnapshot(collection(db(), COL_GC), snap => {
    cb(snap.docs.map(d => fromFirestoreGC(d.id, d.data() as Record<string, unknown>)))
  })
}