// ============================================================
// STORE — Firestore operations cho module Hạn mức ngắn hạn
// Collections:
//   hanMucNganHan                            — hạn mức khung
//   hanMucNganHan/{id}/boHoSo               — bộ hồ sơ giải ngân
//   hanMucNganHan/{id}/boHoSo/{bId}/kyThu   — kỳ thu lãi/gốc
//   traGocGiuaKy                             — top-level, trả gốc trước hạn
// ============================================================
import {
  collection, doc, onSnapshot, setDoc, deleteDoc,
  query, orderBy, where, writeBatch,
  getDoc, getDocs, updateDoc, deleteField,
  QuerySnapshot, DocumentData,
} from 'firebase/firestore'
import { tasksDb, ensureTasksAuth } from '@/lib/firebase-tasks'
import type {
  HanMucNganHan, BoHoSoGiaiNgan, KyThuNH, TraGocGiuaKy,
  KhaDungSnapshot, TrangThaiKhung, TrangThaiBoHoSo,
} from './han-muc-ngan-han-types'
import { taoBoMaNganSach } from '@/lib/ma-ngan-sach'

const db = () => tasksDb

// ── Collection refs ──────────────────────────────────────────
const khungCol = () =>
  collection(db(), 'hanMucNganHan')

const boHoSoCol = (hanMucId: string) =>
  collection(db(), 'hanMucNganHan', hanMucId, 'boHoSo')

const kyThuCol = (hanMucId: string, boId: string) =>
  collection(db(), 'hanMucNganHan', hanMucId, 'boHoSo', boId, 'kyThu')

const traGocCol = () =>
  collection(db(), 'traGocGiuaKy')

// ── Snap helper ───────────────────────────────────────────────
function snap<T>(s: QuerySnapshot<DocumentData>): T[] {
  return s.docs.map(d => ({ id: d.id, ...d.data() } as T))
}

// ── Helpers ngày tháng ────────────────────────────────────────
function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function monthDiff(a: Date, b: Date): number {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
}
function addMonths(d: Date, n: number): Date {
  const r = new Date(d)
  r.setMonth(r.getMonth() + n)
  return r
}
function daysDiff(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86400000)
}

// ── Tính trạng thái hạn mức khung theo ngày ─────────────────
export function tinhTrangThaiKhung(ngayHetHan: string): TrangThaiKhung {
  const today = new Date()
  const het   = parseDate(ngayHetHan)
  const diff  = daysDiff(today, het)
  if (diff < 0)   return 'het-han'
  if (diff <= 30) return 'gan-het-han'
  return 'con-hieu-luc'
}

// ── Tính trạng thái bộ hồ sơ ─────────────────────────────────
export function tinhTrangThaiBoHoSo(bo: BoHoSoGiaiNgan, gocDaTra: number): TrangThaiBoHoSo {
  if (gocDaTra >= bo.soTienGiaiNgan) return 'tat-toan'
  const today = new Date()
  const dao   = parseDate(bo.ngayDaoHan)
  const diff  = daysDiff(today, dao)
  if (diff < 0)   return 'qua-han'
  if (diff <= 10) return 'gan-dao-han'
  return 'dang-vay'
}

// ── Tính trạng thái kỳ thu ───────────────────────────────────
function trangThaiKy(ngayThu: string): KyThuNH['trangThai'] {
  const today = new Date()
  const diff  = daysDiff(today, parseDate(ngayThu))
  if (diff < 0)   return 'qua-han'
  if (diff <= 7)  return 'gan-han'
  return 'chua-thu'
}

// ─────────────────────────────────────────────────────────────
// BUILD SCHEDULE — tạo lịch thu lãi/gốc cho 1 bộ hồ sơ
// ─────────────────────────────────────────────────────────────
export function buildScheduleNH(
  bo: BoHoSoGiaiNgan,
  gocDaTra: number = 0,
): KyThuNH[] {
  const ngayGiaiNgan = parseDate(bo.ngayGiaiNgan)
  const ngayDaoHan   = parseDate(bo.ngayDaoHan)
  const dunNoBanDau  = Math.max(0, bo.soTienGiaiNgan - gocDaTra)
  const lsNam        = bo.laiSuat / 100

  if (dunNoBanDau <= 0) return []

  if (bo.kyTraLai === 'cuoi-ky') {
    const soNgay = daysDiff(ngayGiaiNgan, ngayDaoHan)
    const laiThu = Math.round(dunNoBanDau * lsNam * (soNgay / 365))
    return [{
      id:          `ky-1-${bo.id}`,
      boHoSoId:    bo.id,
      hanMucId:    bo.hanMucId,
      soKy:        1,
      ngayThu:     fmtDate(ngayDaoHan),
      loai:        'goc-va-lai',
      dunNoDauKy:  dunNoBanDau,
      gocThu:      dunNoBanDau,
      laiThu,
      tongThu:     dunNoBanDau + laiThu,
      dunNoCuoiKy: 0,
      trangThai:   trangThaiKy(fmtDate(ngayDaoHan)),
    }]
  }

  const period    = bo.kyTraLai === 'quarterly' ? 3 : 1
  const kyPerYear = bo.kyTraLai === 'quarterly' ? 4 : 12

  const coKyLe   = !!bo.ngayTraLaiDauTien
  let ankerDate  = ngayGiaiNgan
  let coKyLeThuc = false

  if (coKyLe) {
    const ankerDay  = parseDate(bo.ngayTraLaiDauTien!).getDate()
    const candidate = new Date(ngayGiaiNgan.getFullYear(), ngayGiaiNgan.getMonth(), ankerDay)
    if (candidate.getTime() === ngayGiaiNgan.getTime()) {
      ankerDate = ngayGiaiNgan
    } else if (candidate.getTime() < ngayGiaiNgan.getTime()) {
      ankerDate  = addMonths(candidate, 1)
      coKyLeThuc = true
    } else {
      ankerDate  = candidate
      coKyLeThuc = true
    }
  }

  const numKySau = Math.max(1, Math.floor(monthDiff(ankerDate, ngayDaoHan) / period))
  const rows: KyThuNH[] = []
  let dunNo = dunNoBanDau
  let soKy  = 0

  if (coKyLeThuc) {
    soKy++
    const soNgay = daysDiff(ngayGiaiNgan, ankerDate)
    const laiThu = Math.round(dunNo * lsNam * (soNgay / 365))
    rows.push({
      id:          `ky-0-${bo.id}`,
      boHoSoId:    bo.id,
      hanMucId:    bo.hanMucId,
      soKy:        0,
      ngayThu:     fmtDate(ankerDate),
      loai:        'lai',
      dunNoDauKy:  dunNo,
      gocThu:      0,
      laiThu,
      tongThu:     laiThu,
      dunNoCuoiKy: dunNo,
      trangThai:   trangThaiKy(fmtDate(ankerDate)),
    })
  }

  for (let i = 1; i <= numKySau; i++) {
    soKy++
    const isLast    = i === numKySau
    const ngayThu   = addMonths(ankerDate, i * period)
    const gocThu    = isLast ? dunNo : 0
    const laiThu    = Math.round(dunNo * lsNam / kyPerYear)
    const dunNoCuoi = Math.max(0, dunNo - gocThu)
    rows.push({
      id:          `ky-${i}-${bo.id}`,
      boHoSoId:    bo.id,
      hanMucId:    bo.hanMucId,
      soKy,
      ngayThu:     fmtDate(ngayThu),
      loai:        isLast ? 'goc-va-lai' : 'lai',
      dunNoDauKy:  dunNo,
      gocThu,
      laiThu,
      tongThu:     gocThu + laiThu,
      dunNoCuoiKy: dunNoCuoi,
      trangThai:   trangThaiKy(fmtDate(ngayThu)),
    })
    dunNo = dunNoCuoi
  }

  return rows
}

// ─────────────────────────────────────────────────────────────
// Tính hạn mức khả dụng
// ─────────────────────────────────────────────────────────────
export function tinhKhaDung(
  khung:      HanMucNganHan,
  boList:     BoHoSoGiaiNgan[],
  kyThuMap:   Record<string, KyThuNH[]>,
  traGocList: TraGocGiuaKy[],
): KhaDungSnapshot {
  let tongGiaiNgan = 0
  let tongGocDaTra = 0
  let soBoDangVay  = 0

  boList.forEach(bo => {
    if (bo.trangThai === 'tat-toan') return
    tongGiaiNgan += bo.soTienGiaiNgan

    const kyList    = kyThuMap[bo.id] ?? []
    const gocQuaKy  = kyList
      .filter(k => k.trangThai === 'da-thu')
      .reduce((s, k) => s + (k.gocThucThu ?? k.gocThu), 0)
    const gocGiuaKy = traGocList
      .filter(t => t.boHoSoId === bo.id)
      .reduce((s, t) => s + t.soTienGoc, 0)
    tongGocDaTra += gocQuaKy + gocGiuaKy
    soBoDangVay++
  })

  const duNoHienTai    = Math.max(0, tongGiaiNgan - tongGocDaTra)
  const khaDung        = Math.max(0, khung.tongHanMuc - duNoHienTai)
  const phanTramSuDung = khung.tongHanMuc > 0
    ? Math.round((duNoHienTai / khung.tongHanMuc) * 100) : 0

  return { tongHanMuc: khung.tongHanMuc, tongGiaiNgan, tongGocDaTra, duNoHienTai, khaDung, phanTramSuDung, soBoDangVay }
}

// ── Tính gốc đã trả của 1 bộ hồ sơ ─────────────────────────
export function tinhGocDaTraBoHoSo(
  boHoSoId:    string,
  kyList:      KyThuNH[],
  traGocList:  TraGocGiuaKy[],
): number {
  const gocQuaKy  = kyList
    .filter(k => k.trangThai === 'da-thu')
    .reduce((s, k) => s + (k.gocThucThu ?? k.gocThu), 0)
  const gocGiuaKy = traGocList
    .filter(t => t.boHoSoId === boHoSoId)
    .reduce((s, t) => s + t.soTienGoc, 0)
  return gocQuaKy + gocGiuaKy
}

// ═════════════════════════════════════════════════════════════
// SUBSCRIBE
// ═════════════════════════════════════════════════════════════

export function subscribeHanMucNganHan(
  cb: (rows: HanMucNganHan[]) => void,
  entityFilter?: string,
): () => void {
  let unsub: (() => void) | undefined
  ensureTasksAuth().then(() => {
    const q = entityFilter && entityFilter !== 'all'
      ? query(khungCol(), where('entity', '==', entityFilter), orderBy('createdAt', 'desc'))
      : query(khungCol(), orderBy('createdAt', 'desc'))
    unsub = onSnapshot(q, s => cb(snap<HanMucNganHan>(s)))
  }).catch(e => console.error('[subscribeHanMucNganHan] auth failed', e))
  return () => unsub?.()
}

export function subscribeBoHoSo(
  hanMucId: string,
  cb: (rows: BoHoSoGiaiNgan[]) => void,
): () => void {
  let unsub: (() => void) | undefined
  ensureTasksAuth().then(() => {
    const q = query(boHoSoCol(hanMucId), orderBy('ngayGiaiNgan', 'asc'))
    unsub = onSnapshot(q, s => cb(snap<BoHoSoGiaiNgan>(s)))
  }).catch(e => console.error('[subscribeBoHoSo] auth failed', e))
  return () => unsub?.()
}

export function subscribeKyThu(
  hanMucId: string,
  boHoSoId: string,
  cb: (rows: KyThuNH[]) => void,
): () => void {
  let unsub: (() => void) | undefined
  ensureTasksAuth().then(() => {
    const q = query(kyThuCol(hanMucId, boHoSoId), orderBy('soKy', 'asc'))
    unsub = onSnapshot(q, s => cb(snap<KyThuNH>(s)))
  }).catch(e => console.error('[subscribeKyThu] auth failed', e))
  return () => unsub?.()
}

export function subscribeTraGoc(
  hanMucId: string,
  cb: (rows: TraGocGiuaKy[]) => void,
): () => void {
  let unsub: (() => void) | undefined
  ensureTasksAuth().then(() => {
    const q = query(traGocCol(), where('hanMucId', '==', hanMucId), orderBy('ngayTra', 'asc'))
    unsub = onSnapshot(q, s => cb(snap<TraGocGiuaKy>(s)))
  }).catch(e => console.error('[subscribeTraGoc] auth failed', e))
  return () => unsub?.()
}

// ── Subscribe tất cả kỳ thu của NHIỀU bộ hồ sơ cùng 1 khung ──
// (gom lại từ nhiều subscribeKyThu — 1 cho mỗi bộ hồ sơ)
export function subscribeAllKyThuNH(
  hanMucId:  string,
  boHoSoIds: string[],
  cb: (kyThuMap: Record<string, KyThuNH[]>) => void,
): () => void {
  if (!boHoSoIds.length) { cb({}); return () => {} }
  const unsubs: (() => void)[] = []
  const map: Record<string, KyThuNH[]> = {}
  boHoSoIds.forEach(boId => {
    const u = subscribeKyThu(hanMucId, boId, kys => {
      map[boId] = kys
      cb({ ...map })
    })
    unsubs.push(u)
  })
  return () => unsubs.forEach(u => u())
}
 
// ── Alias — TabHanMucNganHan.tsx gọi bằng 2 tên này, chữ ký giống
// hệt subscribeKyThu / subscribeTraGoc đã có sẵn (có thể do đổi tên
// hàm trước đây mà quên sửa chỗ gọi). Alias để không phải sửa lại
// TabHanMucNganHan.tsx. ──
export { subscribeKyThu as subscribeKyThuNH }
export { subscribeTraGoc as subscribeTraGocGiuaKy }


// ═════════════════════════════════════════════════════════════
// WRITE — Hạn mức khung
// ═════════════════════════════════════════════════════════════

export async function saveHanMucNganHan(
  data: Omit<HanMucNganHan, 'id' | 'createdAt' | 'updatedAt' | 'trangThai'
    | 'maNganSachLai' | 'maNganSachGoc' | 'maNganSachThu'>,
  id?: string,
): Promise<string> {
  await ensureTasksAuth()
  const ref = id ? doc(khungCol(), id) : doc(khungCol())
  const now = Date.now()

  let createdAt = now
  if (id) {
    const existing = await getDoc(ref)
    if (existing.exists()) createdAt = (existing.data() as HanMucNganHan).createdAt ?? now
  }

  // ── Sinh mã ngân sách ─────────────────────────────────────
  // HanMucNganHan luôn là DN (nhánh A), kyHan luôn là 'ngan-han'
  // → không bao giờ có canhBaoMa, không cần đổi return type
  const boMa = taoBoMaNganSach(data.entity, 'ngan-han', data.nganHang)

  const trangThai = tinhTrangThaiKhung(data.ngayHetHan)
  const docData: HanMucNganHan = {
    ...data,
    ...boMa,
    id: ref.id, trangThai, createdAt, updatedAt: now,
  }

  const optionalFields: (keyof HanMucNganHan)[] = [
    'chiNhanh', 'nguoiVay', 'laiSuatMacDinh', 'ghiChu',
    'maNganSachLai', 'maNganSachGoc', 'maNganSachThu',
  ]

  if (id) {
    const dataToWrite: any = { ...docData }
    optionalFields.forEach(f => {
      if (dataToWrite[f] === undefined || dataToWrite[f] === null) dataToWrite[f] = deleteField()
    })
    await setDoc(ref, dataToWrite, { merge: true })
  } else {
    const dataToWrite: any = { ...docData }
    optionalFields.forEach(f => {
      if (dataToWrite[f] === undefined || dataToWrite[f] === null) delete dataToWrite[f]
    })
    await setDoc(ref, dataToWrite)
  }

  return ref.id
}

export async function deleteHanMucNganHan(id: string): Promise<void> {
  await ensureTasksAuth()
  // Xóa toàn bộ bộ hồ sơ + kỳ thu trước khi xóa khung
  const boSnap = await getDocs(boHoSoCol(id))
  for (const boDoc of boSnap.docs) {
    const kySnap = await getDocs(kyThuCol(id, boDoc.id))
    const BATCH  = 400
    for (let i = 0; i < kySnap.docs.length; i += BATCH) {
      const batch = writeBatch(db())
      kySnap.docs.slice(i, i + BATCH).forEach(d => batch.delete(d.ref))
      await batch.commit()
    }
    await deleteDoc(boDoc.ref)
  }
  await deleteDoc(doc(khungCol(), id))
}

// ═════════════════════════════════════════════════════════════
// WRITE — Bộ hồ sơ giải ngân
// ═════════════════════════════════════════════════════════════

export async function saveBoHoSo(
  data: Omit<BoHoSoGiaiNgan, 'id' | 'createdAt' | 'updatedAt' | 'trangThai'>,
  id?: string,
): Promise<string> {
  await ensureTasksAuth()
  const ref = id ? doc(boHoSoCol(data.hanMucId), id) : doc(boHoSoCol(data.hanMucId))
  const now = Date.now()

  let createdAt = now
  if (id) {
    const existing = await getDoc(ref)
    if (existing.exists()) createdAt = (existing.data() as BoHoSoGiaiNgan).createdAt ?? now
  }

  // Tính trạng thái dựa trên gốc đã trả hiện tại
  const kySnap     = id ? await getDocs(kyThuCol(data.hanMucId, id)) : null
  const traGocSnap = id ? await getDocs(query(traGocCol(), where('boHoSoId', '==', id))) : null
  const kyList     = kySnap ? snap<KyThuNH>(kySnap as QuerySnapshot<DocumentData>) : []
  const traGocList = traGocSnap ? snap<TraGocGiuaKy>(traGocSnap as QuerySnapshot<DocumentData>) : []
  const gocDaTra   = id ? tinhGocDaTraBoHoSo(id, kyList, traGocList) : 0
  const trangThai  = tinhTrangThaiBoHoSo({ ...data, id: ref.id } as BoHoSoGiaiNgan, gocDaTra)

  const docData: BoHoSoGiaiNgan = { ...data, id: ref.id, trangThai, createdAt, updatedAt: now }

  const optionalFields: (keyof BoHoSoGiaiNgan)[] = [
    'ngayTraLaiDauTien', 'mucDichVay', 'taiSanDamBao', 'ghiChu',
  ]

  if (id) {
    const dataToWrite: any = { ...docData }
    optionalFields.forEach(f => {
      if (dataToWrite[f] === undefined || dataToWrite[f] === null) dataToWrite[f] = deleteField()
    })
    await setDoc(ref, dataToWrite, { merge: true })
  } else {
    const dataToWrite: any = { ...docData }
    optionalFields.forEach(f => {
      if (dataToWrite[f] === undefined || dataToWrite[f] === null) delete dataToWrite[f]
    })
    await setDoc(ref, dataToWrite)
  }

  // Tạo lịch thu mới (chỉ khi tạo mới, không rebuild khi edit để giữ kỳ da-thu)
  if (!id) {
    const schedule = buildScheduleNH(docData, 0)
    const BATCH    = 400
    for (let i = 0; i < schedule.length; i += BATCH) {
      const batch = writeBatch(db())
      schedule.slice(i, i + BATCH).forEach(ky => {
        batch.set(doc(kyThuCol(data.hanMucId, ref.id), ky.id), ky)
      })
      await batch.commit()
    }
  }

  return ref.id
}

// ═════════════════════════════════════════════════════════════
// WRITE — Đánh dấu kỳ thu
// ═════════════════════════════════════════════════════════════

export async function markKyThuDaThu(
  hanMucId:    string,
  boHoSoId:    string,
  kyId:        string,
  ngayThucThu: string,
  gocThucThu:  number,
  laiThucThu:  number,
): Promise<void> {
  await ensureTasksAuth()
  await setDoc(
    doc(kyThuCol(hanMucId, boHoSoId), kyId),
    {
      trangThai:   'da-thu',
      ngayThucThu,
      gocThucThu,
      laiThucThu,
      tongThucThu: gocThucThu + laiThucThu,
      updatedAt:   Date.now(),
    },
    { merge: true },
  )
  await _syncTrangThaiBoHoSo(hanMucId, boHoSoId)
}

export async function unmarkKyThu(
  hanMucId:  string,
  boHoSoId:  string,
  kyId:      string,
  ngayThu:   string,
): Promise<void> {
  await ensureTasksAuth()
  await setDoc(
    doc(kyThuCol(hanMucId, boHoSoId), kyId),
    {
      trangThai:   trangThaiKy(ngayThu),
      ngayThucThu: deleteField(),
      gocThucThu:  deleteField(),
      laiThucThu:  deleteField(),
      tongThucThu: deleteField(),
    },
    { merge: true },
  )
  await _syncTrangThaiBoHoSo(hanMucId, boHoSoId)
}

async function _syncTrangThaiBoHoSo(hanMucId: string, boHoSoId: string): Promise<void> {
  const boRef  = doc(boHoSoCol(hanMucId), boHoSoId)
  const boSnap = await getDoc(boRef)
  if (!boSnap.exists()) return
  const bo = { id: boSnap.id, ...boSnap.data() } as BoHoSoGiaiNgan

  const kySnap     = await getDocs(query(kyThuCol(hanMucId, boHoSoId)))
  const kyList     = snap<KyThuNH>(kySnap as QuerySnapshot<DocumentData>)
  const traGocSnap = await getDocs(query(traGocCol(), where('boHoSoId', '==', boHoSoId)))
  const traGocList = snap<TraGocGiuaKy>(traGocSnap as QuerySnapshot<DocumentData>)

  const gocDaTra  = tinhGocDaTraBoHoSo(boHoSoId, kyList, traGocList)
  const trangThai = tinhTrangThaiBoHoSo(bo, gocDaTra)
  await updateDoc(boRef, { trangThai, updatedAt: Date.now() })
}

export async function deleteBoHoSo(hanMucId: string, boId: string): Promise<void> {
  await ensureTasksAuth()
  const kySnap = await getDocs(kyThuCol(hanMucId, boId))
  const daThu  = kySnap.docs.filter(d => (d.data() as KyThuNH).trangThai === 'da-thu')
  if (daThu.length > 0) throw new Error('Không thể xóa: bộ hồ sơ đã có kỳ thu')

  const batch = writeBatch(db())
  kySnap.docs.forEach(d => batch.delete(d.ref))
  batch.delete(doc(boHoSoCol(hanMucId), boId))
  await batch.commit()
}

// ═════════════════════════════════════════════════════════════
// WRITE — Trả gốc giữa kỳ
// ═════════════════════════════════════════════════════════════

export async function saveTraGocGiuaKy(
  data: Omit<TraGocGiuaKy, 'id' | 'createdAt'>,
): Promise<string> {
  await ensureTasksAuth()
  const ref = doc(traGocCol())
  const now = Date.now()
  await setDoc(ref, { ...data, id: ref.id, createdAt: now })
  await _rebuildKyThuSauTraGoc(data.hanMucId, data.boHoSoId)
  return ref.id
}

export async function deleteTraGocGiuaKy(id: string, hanMucId: string, boHoSoId: string): Promise<void> {
  await ensureTasksAuth()
  await deleteDoc(doc(traGocCol(), id))
  await _rebuildKyThuSauTraGoc(hanMucId, boHoSoId)
}

function tinhLaiCuoiKyTichLuy(bo: BoHoSoGiaiNgan, traGocList: TraGocGiuaKy[]): number {
  const lsNam  = bo.laiSuat / 100
  const events = [...traGocList].sort((a, b) => a.ngayTra.localeCompare(b.ngayTra))
  let moc  = parseDate(bo.ngayGiaiNgan)
  let duNo = bo.soTienGiaiNgan
  let lai  = 0
  for (const ev of events) {
    const ngayTra = parseDate(ev.ngayTra)
    const soNgay  = Math.max(0, daysDiff(moc, ngayTra))
    lai  += duNo * lsNam * (soNgay / 365)
    duNo  = Math.max(0, duNo - ev.soTienGoc)
    moc   = ngayTra
  }
  const soNgayConLai = Math.max(0, daysDiff(moc, parseDate(bo.ngayDaoHan)))
  lai += duNo * lsNam * (soNgayConLai / 365)
  return Math.round(lai)
}

async function _rebuildKyThuSauTraGoc(hanMucId: string, boHoSoId: string): Promise<void> {
  const boRef  = doc(boHoSoCol(hanMucId), boHoSoId)
  const boSnap = await getDoc(boRef)
  if (!boSnap.exists()) return
  const bo = { id: boSnap.id, ...boSnap.data() } as BoHoSoGiaiNgan

  const kySnap  = await getDocs(query(kyThuCol(hanMucId, boHoSoId), orderBy('soKy', 'asc')))
  const oldList = snap<KyThuNH>(kySnap as QuerySnapshot<DocumentData>)
  const paid    = oldList.filter(k => k.trangThai === 'da-thu')
  const unpaid  = oldList.filter(k => k.trangThai !== 'da-thu').sort((a, b) => a.soKy - b.soKy)

  const traGocSnap = await getDocs(query(traGocCol(), where('boHoSoId', '==', boHoSoId)))
  const traGocList = snap<TraGocGiuaKy>(traGocSnap as QuerySnapshot<DocumentData>)
  const gocGiuaKy  = traGocList.reduce((s, t) => s + t.soTienGoc, 0)
  const gocQuaKy   = paid.reduce((s, k) => s + (k.gocThucThu ?? k.gocThu), 0)
  const duNoConLai = Math.max(0, bo.soTienGiaiNgan - gocQuaKy - gocGiuaKy)

  const BATCH = 400

  if (unpaid.length === 0) {
    await _syncTrangThaiBoHoSo(hanMucId, boHoSoId)
    return
  }

  if (duNoConLai <= 0) {
    for (let i = 0; i < unpaid.length; i += BATCH) {
      const batch = writeBatch(db())
      unpaid.slice(i, i + BATCH).forEach(k => batch.delete(doc(kyThuCol(hanMucId, boHoSoId), k.id)))
      await batch.commit()
    }
    await _syncTrangThaiBoHoSo(hanMucId, boHoSoId)
    return
  }

  const lsNam     = bo.laiSuat / 100
  const kyPerYear = bo.kyTraLai === 'quarterly' ? 4 : bo.kyTraLai === 'monthly' ? 12 : 1
  const lastSoKy  = unpaid[unpaid.length - 1].soKy

  const updated: KyThuNH[] = unpaid.map(k => {
    const isLast = k.soKy === lastSoKy
    const gocThu = isLast ? duNoConLai : 0
    const laiThu = bo.kyTraLai === 'cuoi-ky'
      ? tinhLaiCuoiKyTichLuy(bo, traGocList)
      : Math.round(duNoConLai * lsNam / kyPerYear)
    return {
      ...k,
      dunNoDauKy:  duNoConLai,
      gocThu,
      laiThu,
      tongThu:     gocThu + laiThu,
      dunNoCuoiKy: isLast ? 0 : duNoConLai,
      loai:        (gocThu > 0 ? 'goc-va-lai' : 'lai') as KyThuNH['loai'],
    }
  })

  for (let i = 0; i < updated.length; i += BATCH) {
    const batch = writeBatch(db())
    updated.slice(i, i + BATCH).forEach(k => {
      batch.set(doc(kyThuCol(hanMucId, boHoSoId), k.id), k, { merge: true })
    })
    await batch.commit()
  }

  await _syncTrangThaiBoHoSo(hanMucId, boHoSoId)
}

// ─────────────────────────────────────────────────────────────
// MIGRATE 1 LẦN: đổi pháp nhân "SAG" → "SAP"
// ─────────────────────────────────────────────────────────────
export async function migrateEntitySAGtoSAPNganHan(): Promise<{ updated: number }> {
  await ensureTasksAuth()
  const snap_ = await getDocs(query(khungCol(), where('entity', '==', 'SAG')))
  const ids   = snap_.docs.map(d => d.id)
  const BATCH = 400
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = writeBatch(db())
    ids.slice(i, i + BATCH).forEach(id => batch.update(doc(khungCol(), id), { entity: 'SAP' }))
    await batch.commit()
  }
  return { updated: ids.length }
}

// ─────────────────────────────────────────────────────────────
// MIGRATE 1 LẦN: gắn mã ngân sách cho toàn bộ hạn mức khung ngắn hạn đã có sẵn
// (chạy 1 lần duy nhất — khung nào đã có maNganSachLai thì bỏ qua)
// ─────────────────────────────────────────────────────────────
export async function migrateMaNganSachNganHan(): Promise<{ updated: number; skipped: number }> {
  await ensureTasksAuth()
  const snap_ = await getDocs(query(khungCol(), orderBy('createdAt', 'asc')))
  const BATCH = 400
  let updated = 0, skipped = 0

  const toWrite: Array<{ id: string; fields: Record<string, string> }> = []

  snap_.docs.forEach(d => {
    const khung = { id: d.id, ...d.data() } as HanMucNganHan
    if (khung.maNganSachLai) { skipped++; return }

    // Luôn nhánh A, ngan-han
    const boMa = taoBoMaNganSach(khung.entity, 'ngan-han', khung.nganHang)
    const fields: Record<string, string> = {}
    if (boMa.maNganSachLai) fields.maNganSachLai = boMa.maNganSachLai
    if (boMa.maNganSachGoc) fields.maNganSachGoc = boMa.maNganSachGoc
    if (boMa.maNganSachThu) fields.maNganSachThu = boMa.maNganSachThu
    toWrite.push({ id: khung.id, fields })
  })

  for (let i = 0; i < toWrite.length; i += BATCH) {
    const batch = writeBatch(db())
    toWrite.slice(i, i + BATCH).forEach(({ id, fields }) => {
      batch.update(doc(khungCol(), id), fields)
      updated++
    })
    await batch.commit()
  }

  return { updated, skipped }
}

// ─────────────────────────────────────────────────────────────
// Utility: lấy tất cả kỳ thu trong tháng YYYY-MM (cho calendar)
// ─────────────────────────────────────────────────────────────
export function filterKyThuTheoThang(
  kyThuMap: Record<string, KyThuNH[]>,
  thang:    string,
): KyThuNH[] {
  return Object.values(kyThuMap)
    .flat()
    .filter(k => k.ngayThu.startsWith(thang))
    .sort((a, b) => a.ngayThu.localeCompare(b.ngayThu))
}