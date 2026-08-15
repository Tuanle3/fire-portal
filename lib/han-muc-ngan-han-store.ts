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
// Logic:
//   - Mặc định: gốc thu 1 lần cuối kỳ
//   - Lãi: theo kyTraLai (monthly / quarterly / cuoi-ky)
//   - Nếu có ngayTraLaiDauTien → kỳ 0 là kỳ lẻ ngày chỉ thu lãi
//     rồi các kỳ sau neo theo ngày-trong-tháng đó
// ─────────────────────────────────────────────────────────────
export function buildScheduleNH(
  bo: BoHoSoGiaiNgan,
  gocDaTra: number = 0, // gốc đã trả (từ các kỳ trước / giữa kỳ)
): KyThuNH[] {
  const ngayGiaiNgan = parseDate(bo.ngayGiaiNgan)
  const ngayDaoHan   = parseDate(bo.ngayDaoHan)
  const dunNoBanDau  = Math.max(0, bo.soTienGiaiNgan - gocDaTra)
  const lsNam        = bo.laiSuat / 100

  if (dunNoBanDau <= 0) return []

  // Với kỳ cuối: luôn thu gốc + lãi tháng đó
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

  // Xác định ankerDate nếu có kỳ lẻ ngày
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

  // Số kỳ lãi từ ankerDate đến đáo hạn
  const numKySau = Math.max(1, Math.floor(monthDiff(ankerDate, ngayDaoHan) / period))
  const rows: KyThuNH[] = []
  let dunNo = dunNoBanDau
  let soKy  = 0

  // Kỳ 0 lẻ ngày: chỉ thu lãi
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

  // Kỳ 1..N: lãi định kỳ, gốc thu kỳ cuối
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
// Tính hạn mức khả dụng (real-time, tính dư nợ thực tế)
// ─────────────────────────────────────────────────────────────
export function tinhKhaDung(
  khung:      HanMucNganHan,
  boList:     BoHoSoGiaiNgan[],
  kyThuMap:   Record<string, KyThuNH[]>,  // boId → kỳ thu
  traGocList: TraGocGiuaKy[],            // tất cả trả gốc giữa kỳ của khung này
): KhaDungSnapshot {
  let tongGiaiNgan = 0
  let tongGocDaTra = 0
  let soBoDangVay  = 0

  boList.forEach(bo => {
    if (bo.trangThai === 'tat-toan') return // tất toán → không chiếm hạn mức
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
    ? Math.min(100, Math.round((duNoHienTai / khung.tongHanMuc) * 100))
    : 0

  return { tongHanMuc: khung.tongHanMuc, tongGiaiNgan, tongGocDaTra, duNoHienTai, khaDung, phanTramSuDung, soBoDangVay }
}

// ─────────────────────────────────────────────────────────────
// Tính gốc đã trả của 1 bộ hồ sơ (qua kỳ thu + giữa kỳ)
// ─────────────────────────────────────────────────────────────
export function tinhGocDaTraBoHoSo(
  boId:       string,
  kyList:     KyThuNH[],
  traGocList: TraGocGiuaKy[],
): number {
  const quaKy  = kyList.filter(k => k.trangThai === 'da-thu').reduce((s, k) => s + (k.gocThucThu ?? k.gocThu), 0)
  const giuaKy = traGocList.filter(t => t.boHoSoId === boId).reduce((s, t) => s + t.soTienGoc, 0)
  return quaKy + giuaKy
}

// ═════════════════════════════════════════════════════════════
// SUBSCRIBE
// ═════════════════════════════════════════════════════════════

export function subscribeHanMucNganHan(
  cb: (list: HanMucNganHan[]) => void,
): () => void {
  let unsub: (() => void) | undefined
  ensureTasksAuth().then(() => {
    const q = query(khungCol(), orderBy('createdAt', 'desc'))
    unsub = onSnapshot(q, s => cb(snap<HanMucNganHan>(s)))
  }).catch(e => console.error('[subscribeHanMucNganHan]', e))
  return () => unsub?.()
}

export function subscribeBoHoSo(
  hanMucId: string,
  cb: (list: BoHoSoGiaiNgan[]) => void,
): () => void {
  let unsub: (() => void) | undefined
  ensureTasksAuth().then(() => {
    const q = query(boHoSoCol(hanMucId), orderBy('ngayGiaiNgan', 'desc'))
    unsub = onSnapshot(q, s => cb(snap<BoHoSoGiaiNgan>(s)))
  }).catch(e => console.error('[subscribeBoHoSo]', e))
  return () => unsub?.()
}

export function subscribeKyThuNH(
  hanMucId: string,
  boHoSoId: string,
  cb: (list: KyThuNH[]) => void,
): () => void {
  let unsub: (() => void) | undefined
  ensureTasksAuth().then(() => {
    const q = query(kyThuCol(hanMucId, boHoSoId), orderBy('soKy', 'asc'))
    unsub = onSnapshot(q, s => cb(snap<KyThuNH>(s)))
  }).catch(e => console.error('[subscribeKyThuNH]', e))
  return () => unsub?.()
}

/**
 * Subscribe tất cả kỳ thu của nhiều bộ hồ sơ trong 1 hạn mức.
 * FIX: bọc qua ensureTasksAuth trước khi attach listeners.
 */
export function subscribeAllKyThuNH(
  hanMucId: string,
  boIds:    string[],
  cb:       (map: Record<string, KyThuNH[]>) => void,
): () => void {
  if (!boIds.length) { cb({}); return () => {} }

  let unsubs: (() => void)[] = []
  let cancelled = false

  ensureTasksAuth().then(() => {
    if (cancelled) return
    const map: Record<string, KyThuNH[]> = {}
    boIds.forEach(boId => {
      const q = query(kyThuCol(hanMucId, boId), orderBy('soKy', 'asc'))
      const u = onSnapshot(q, s => {
        map[boId] = snap<KyThuNH>(s)
        cb({ ...map })
      })
      unsubs.push(u)
    })
  }).catch(e => console.error('[subscribeAllKyThuNH]', e))

  return () => {
    cancelled = true
    unsubs.forEach(u => u())
  }
}

export function subscribeTraGocGiuaKy(
  hanMucId: string,
  cb: (list: TraGocGiuaKy[]) => void,
): () => void {
  let unsub: (() => void) | undefined
  ensureTasksAuth().then(() => {
    const q = query(traGocCol(), where('hanMucId', '==', hanMucId), orderBy('ngayTra', 'desc'))
    unsub = onSnapshot(q, s => cb(snap<TraGocGiuaKy>(s)))
  }).catch(e => console.error('[subscribeTraGocGiuaKy]', e))
  return () => unsub?.()
}

// ═════════════════════════════════════════════════════════════
// WRITE — Hạn mức khung
// ═════════════════════════════════════════════════════════════

export async function saveHanMucNganHan(
  data: Omit<HanMucNganHan, 'id' | 'createdAt' | 'updatedAt'>,
  id?: string,
): Promise<string> {
  await ensureTasksAuth()
  const ref = id ? doc(khungCol(), id) : doc(khungCol())
  const now = Date.now()

  let createdAt = now
  if (id) {
    const ex = await getDoc(ref)
    if (ex.exists()) createdAt = (ex.data() as HanMucNganHan).createdAt ?? now
  }

  const toWrite: HanMucNganHan = { ...data, id: ref.id, createdAt, updatedAt: now }
  const optionals: (keyof HanMucNganHan)[] = ['chiNhanh', 'nguoiVay', 'laiSuatMacDinh', 'ghiChu']

  if (id) {
    const w: any = { ...toWrite }
    optionals.forEach(f => { if (w[f] == null) w[f] = deleteField() })
    await setDoc(ref, w, { merge: true })
  } else {
    const w: any = { ...toWrite }
    optionals.forEach(f => { if (w[f] == null) delete w[f] })
    await setDoc(ref, w)
  }
  return ref.id
}

export async function deleteHanMucNganHan(hanMucId: string): Promise<void> {
  await ensureTasksAuth()
  const boSnap  = await getDocs(boHoSoCol(hanMucId))
  const dangVay = boSnap.docs.filter(d => {
    const bo = d.data() as BoHoSoGiaiNgan
    return bo.trangThai !== 'tat-toan'
  })
  if (dangVay.length > 0) {
    throw new Error(`Không thể xóa: còn ${dangVay.length} bộ hồ sơ đang vay`)
  }
  const batch = writeBatch(db())
  boSnap.docs.forEach(d => batch.delete(d.ref))
  batch.delete(doc(khungCol(), hanMucId))
  await batch.commit()
}

// ═════════════════════════════════════════════════════════════
// WRITE — Bộ hồ sơ giải ngân
// ═════════════════════════════════════════════════════════════

export async function saveBoHoSo(
  data: Omit<BoHoSoGiaiNgan, 'id' | 'createdAt' | 'updatedAt'>,
  id?: string,
): Promise<string> {
  await ensureTasksAuth()
  const col = boHoSoCol(data.hanMucId)
  const ref = id ? doc(col, id) : doc(col)
  const now = Date.now()

  let createdAt = now
  if (id) {
    const ex = await getDoc(ref)
    if (ex.exists()) createdAt = (ex.data() as BoHoSoGiaiNgan).createdAt ?? now
  }

  const toWrite: BoHoSoGiaiNgan = { ...data, id: ref.id, createdAt, updatedAt: now }
  const optionals: (keyof BoHoSoGiaiNgan)[] = ['ngayTraLaiDauTien', 'mucDichVay', 'taiSanDamBao', 'ghiChu']

  if (id) {
    const w: any = { ...toWrite }
    optionals.forEach(f => { if (w[f] == null) w[f] = deleteField() })
    await setDoc(ref, w, { merge: true })
  } else {
    const w: any = { ...toWrite }
    optionals.forEach(f => { if (w[f] == null) delete w[f] })
    await setDoc(ref, w)
  }

  // Build & lưu lịch kỳ thu
  const schedule = buildScheduleNH(toWrite)
  const BATCH    = 400
  for (let i = 0; i < schedule.length; i += BATCH) {
    const batch = writeBatch(db())
    schedule.slice(i, i + BATCH).forEach(k => {
      batch.set(doc(kyThuCol(data.hanMucId, ref.id), k.id), k)
    })
    await batch.commit()
  }

  return ref.id
}

/** Đánh dấu kỳ thu đã thực hiện */
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

/** Huỷ đánh dấu kỳ thu (về lại chua-thu) */
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

/** Đồng bộ trạng thái bộ hồ sơ dựa trên gốc đã trả */
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

/** Xóa bộ hồ sơ (chỉ được nếu chưa có kỳ da-thu) */
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
// WRITE — Trả gốc giữa kỳ (trả trước hạn từng phần)
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

/**
 * Tính lãi tích lũy cho khoản vay "cuối kỳ" (bullet — chỉ 1 kỳ thu duy nhất
 * lúc đáo hạn), có xét TỪNG lần trả gốc giữa kỳ theo đúng mốc ngày phát sinh
 * (lãi tính trên dư nợ thực tế của từng đoạn thời gian, không phải áp thẳng
 * dư nợ cuối cùng cho toàn bộ thời gian vay — đúng chuẩn ngân hàng).
 */
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

/**
 * Cập nhật lại các kỳ CHƯA THU sau khi phát sinh trả gốc giữa kỳ (thêm/xóa),
 * dựa trên dư nợ thực tế còn lại — theo nghiệp vụ trả gốc bullet (gốc dồn
 * kỳ cuối, lãi mỗi kỳ tính trên dư nợ hiện hành).
 *
 * QUAN TRỌNG: các kỳ ĐÃ THU (trangThai='da-thu') giữ nguyên tuyệt đối —
 * không đụng tới, để đảm bảo số liệu lịch sử luôn khớp khi đối soát.
 * Chỉ các kỳ chưa thu được cập nhật tại chỗ (giữ nguyên id/ngày thu/soKy),
 * tránh việc tạo lại toàn bộ lịch (id trùng ky-0/ky-1... sẽ đè lên các kỳ
 * đã thu, làm mất dữ liệu lịch sử — đây là lỗi đã sửa).
 */
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

  // Đã trả hết gốc trước hạn → không còn gì để thu ở các kỳ còn lại, xóa hết
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
// MIGRATE 1 LẦN: đổi pháp nhân "SAG" → "SAP" cho toàn bộ hạn mức khung ngắn hạn
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
// Utility: lấy tất cả kỳ thu trong tháng YYYY-MM (cho calendar)
// ─────────────────────────────────────────────────────────────
export function filterKyThuTheoThang(
  kyThuMap: Record<string, KyThuNH[]>,
  thang:    string, // 'YYYY-MM'
): KyThuNH[] {
  return Object.values(kyThuMap)
    .flat()
    .filter(k => k.ngayThu.startsWith(thang))
    .sort((a, b) => a.ngayThu.localeCompare(b.ngayThu))
}