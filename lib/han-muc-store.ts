// ============================================================
// STORE — Firestore operations cho module Hạn mức tín dụng
// Collections:
//   hanMucTinDung   — hợp đồng tín dụng
//   lichTraNo       — kỳ trả nợ (sub-collection)
//   coCauNo         — phương án cơ cấu
// ============================================================
import {
  collection, doc, onSnapshot, setDoc, deleteDoc,
  query, orderBy, where, writeBatch,
  getDoc, updateDoc, deleteField, getDocs,
  QuerySnapshot, DocumentData,
} from 'firebase/firestore'
import { tasksDb, ensureTasksAuth } from '@/lib/firebase-tasks'
import { HopDongTinDung, KyTraNo, CoCauNo, PhuongThuc, KyTra } from './han-muc-types'

const db = () => tasksDb

// ── Collection refs ─────────────────────────────────────────
const hdCol  = ()             => collection(db(), 'hanMucTinDung')
const kyCol  = (hdId: string) => collection(db(), 'hanMucTinDung', hdId, 'lichTraNo')
const ccCol  = ()             => collection(db(), 'coCauNo')

// ── Snap helper ──────────────────────────────────────────────
function snap<T>(snapshot: QuerySnapshot<DocumentData>): T[] {
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as T))
}

// ── Subscribe hợp đồng ──────────────────────────────────────
export function subscribeHopDong(
  cb: (rows: HopDongTinDung[]) => void,
  entityFilter?: string,
): () => void {
  console.log('[subscribeHopDong] called, filter:', entityFilter)
  let unsub: (() => void) | undefined
  ensureTasksAuth().then(() => {
    console.log('[subscribeHopDong] auth ok, setting up listener')
    const q = entityFilter && entityFilter !== 'all'
      ? query(hdCol(), where('entity', '==', entityFilter), orderBy('createdAt', 'desc'))
      : query(hdCol(), orderBy('createdAt', 'desc'))
    unsub = onSnapshot(q,
      s => { console.log('[subscribeHopDong] snapshot docs:', s.docs.length); cb(snap<HopDongTinDung>(s)) },
      e => console.error('[subscribeHopDong] snapshot error:', e.code, e.message)
    )
  }).catch(e => console.error('[subscribeHopDong] auth failed', e))
  return () => unsub?.()
}

// ── Subscribe lịch trả nợ của 1 hợp đồng ───────────────────
export function subscribeLichTraNo(
  hopDongId: string,
  cb: (rows: KyTraNo[]) => void,
): () => void {
  let unsub: (() => void) | undefined
  ensureTasksAuth().then(() => {
    const q = query(kyCol(hopDongId), orderBy('soKy', 'asc'))
    unsub = onSnapshot(q, s => cb(snap<KyTraNo>(s)))
  }).catch(e => console.error('[subscribeLichTraNo] auth failed', e))
  return () => unsub?.()
}

// ── Subscribe tất cả kỳ trả nợ (nhiều HĐ) ──────────────────
export function subscribeAllKyTraNo(
  hopDongIds: string[],
  cb: (rows: KyTraNo[]) => void,
): () => void {
  if (!hopDongIds.length) { cb([]); return () => {} }
  const unsubs: (() => void)[] = []
  const map = new Map<string, KyTraNo[]>()
  hopDongIds.forEach(id => {
    const q = query(kyCol(id), orderBy('soKy', 'asc'))
    const u = onSnapshot(q, s => {
      map.set(id, snap<KyTraNo>(s))
      cb(Array.from(map.values()).flat())
    })
    unsubs.push(u)
  })
  return () => unsubs.forEach(u => u())
}

// ── Subscribe cơ cấu nợ ─────────────────────────────────────
export function subscribeCoCauNo(
  cb: (rows: CoCauNo[]) => void,
  hopDongId?: string,
): () => void {
  const q = hopDongId
    ? query(ccCol(), where('hopDongId', '==', hopDongId), orderBy('createdAt', 'desc'))
    : query(ccCol(), orderBy('createdAt', 'desc'))
  return onSnapshot(q, s => cb(snap<CoCauNo>(s)))
}

// ── Save hợp đồng + tự tạo lịch trả nợ ─────────────────────
export async function saveHopDong(
  hd: Omit<HopDongTinDung, 'id' | 'createdAt' | 'updatedAt'>,
  id?: string,
): Promise<string> {
  await ensureTasksAuth()
  const ref  = id ? doc(hdCol(), id) : doc(hdCol())
  const now  = Date.now()
  const data: HopDongTinDung = { ...hd, id: ref.id, createdAt: now, updatedAt: now }
  await setDoc(ref, data)

  const schedule = buildSchedule(data)
  const batch    = writeBatch(db())
  schedule.forEach(ky => batch.set(doc(kyCol(ref.id), ky.id), ky))
  await batch.commit()
  return ref.id
}

// ── Đánh dấu kỳ đã trả (không tách gốc/lãi — giữ cho tương thích cũ) ──
export async function markKyDaTra(
  hopDongId: string,
  kyId: string,
  ngayThucTra: string,
  soTienThucTra: number,
): Promise<void> {
  await ensureTasksAuth()
  await setDoc(doc(kyCol(hopDongId), kyId), {
    trangThai: 'da-tra', ngayThucTra, soTienThucTra, updatedAt: Date.now(),
  }, { merge: true })
}

// ── Lãi suất áp dụng cho 1 kỳ cụ thể (có tính đến ưu đãi/thả nổi) ──
function laiSuatChoKy(hd: HopDongTinDung, ngayTraKy: Date): number {
  if (hd.laiSuatLoai !== 'tha-noi' || !hd.soThangUuDai || hd.laiSuatSauUuDai == null) {
    return hd.laiSuat
  }
  const soThangDaTrai = monthDiff(new Date(hd.ngayKy), ngayTraKy)
  return soThangDaTrai > hd.soThangUuDai ? hd.laiSuatSauUuDai : hd.laiSuat
}

// ── Đánh dấu kỳ đã trả VỚI gốc/lãi thực tế + tự tính lại các kỳ sau ──
export async function markKyDaTraThucTe(
  hopDong: HopDongTinDung,
  kyHienTai: KyTraNo,
  allKy: KyTraNo[],
  ngayThucTra: string,
  gocThucTra: number,
  laiThucTra: number,
): Promise<void> {
  await ensureTasksAuth()
  const batch = writeBatch(db())

  batch.set(doc(kyCol(hopDong.id), kyHienTai.id), {
    trangThai: 'da-tra',
    ngayThucTra,
    gocThucTra,
    laiThucTra,
    soTienThucTra: gocThucTra + laiThucTra,
    updatedAt: Date.now(),
  }, { merge: true })

  const duNoThucTeCuoiKy = Math.max(0, kyHienTai.dunNoDauKy - gocThucTra)
  const chenhLech = duNoThucTeCuoiKy - kyHienTai.dunNoCuoiKy

  const cacKySau = allKy
    .filter(k => k.soKy > kyHienTai.soKy && k.trangThai !== 'da-tra')
    .sort((a, b) => a.soKy - b.soKy)

  if (chenhLech !== 0 && cacKySau.length > 0) {
    const soKyConLai = cacKySau.length
    const gocKyMoi = hopDong.phuongThuc === 'giam-dan'
      ? Math.round(duNoThucTeCuoiKy / soKyConLai)
      : 0
    let dunNo = duNoThucTeCuoiKy

    cacKySau.forEach((k, idx) => {
      const isLast = idx === cacKySau.length - 1
      const lsKy   = laiSuatChoKy(hopDong, new Date(k.ngayTra)) / 100 / (hopDong.kyTra === 'monthly' ? 12 : 4)

      const laiTra = hopDong.phuongThuc === 'giam-dan'
        ? Math.round(dunNo * lsKy)
        : Math.round(duNoThucTeCuoiKy * lsKy)
      const gocTra = hopDong.phuongThuc === 'cuoi-ky'
        ? (isLast ? dunNo : 0)
        : (isLast ? dunNo : gocKyMoi)
      const dunNoCuoi = Math.max(0, dunNo - gocTra)

      batch.set(doc(kyCol(hopDong.id), k.id), {
        dunNoDauKy: dunNo,
        gocTra,
        laiTra,
        tongTra: gocTra + laiTra,
        dunNoCuoiKy: dunNoCuoi,
        updatedAt: Date.now(),
      }, { merge: true })

      if (hopDong.phuongThuc === 'giam-dan') dunNo = dunNoCuoi
    })
  }

  await batch.commit()
}

// ── Xóa hợp đồng (cascade) ──────────────────────────────────
export async function deleteHopDong(id: string, kyIds: string[]): Promise<void> {
  await ensureTasksAuth()
  const batch = writeBatch(db())
  kyIds.forEach(kid => batch.delete(doc(kyCol(id), kid)))
  batch.delete(doc(hdCol(), id))
  await batch.commit()
}

// ── Lưu phương án cơ cấu + rebuild lịch ─────────────────────
export async function saveCoCauNo(
  cc: Omit<CoCauNo, 'id' | 'createdAt'>,
  hd: HopDongTinDung,
  kyList: KyTraNo[],
): Promise<void> {
  await ensureTasksAuth()
  const ref    = doc(ccCol())
  const now    = Date.now()
  const ccData: CoCauNo = { ...cc, id: ref.id, createdAt: now }
  await setDoc(ref, ccData)

  const batch = writeBatch(db())
  kyList.filter(k => k.soKy >= cc.tuKy).forEach(k => {
    batch.set(doc(kyCol(hd.id), k.id), { trangThai: 'co-cau', coCauId: ref.id }, { merge: true })
  })
  const newHD       = applyCC(hd, ccData)
  const newSchedule = buildSchedule(newHD)
    .filter(k => k.soKy >= cc.tuKy)
    .map(k => ({ ...k, id: `ky-${k.soKy}-${hd.id}-cc` }))
  newSchedule.forEach(ky => batch.set(doc(kyCol(hd.id), ky.id), ky))
  await batch.commit()
}

// ── Tính lịch trả nợ (client-side) ─────────────────────────
export function buildSchedule(hd: HopDongTinDung): KyTraNo[] {
  const ngayKy     = new Date(hd.ngayKy)
  const ngayDaoHan = new Date(hd.ngayDaoHan)
  const diffM      = monthDiff(ngayKy, ngayDaoHan)
  const period     = hd.kyTra === 'monthly' ? 1 : 3
  const numKy      = Math.max(1, Math.floor(diffM / period))
  const todayD     = new Date()

  // Gốc mỗi kỳ: ưu tiên số NH làm tròn, fallback tự tính đều
  const gocCung = hd.gocTraCoDinh && hd.gocTraCoDinh > 0 ? hd.gocTraCoDinh : null
  const gocKy   = gocCung ?? Math.round(hd.soTienGiaiNgan / numKy)

  let dunNo = hd.soTienGiaiNgan
  const rows: KyTraNo[] = []

  for (let i = 1; i <= numKy; i++) {
    const ngayTra  = addMonths(ngayKy, i * period)
    const isLastKy = i === numKy
    const lsKy     = laiSuatChoKy(hd, ngayTra) / 100 / (hd.kyTra === 'monthly' ? 12 : 4)

    const laiTra = hd.phuongThuc === 'giam-dan'
      ? Math.round(dunNo * lsKy)
      : Math.round(hd.soTienGiaiNgan * lsKy)

    // Gốc kỳ này:
    // - cuoi-ky: 0 mọi kỳ, kỳ cuối = toàn bộ dư nợ
    // - giam-dan: kỳ cuối = dư nợ còn lại (xử lý sai số làm tròn)
    //             kỳ giữa = gocKy (cứng hoặc tự tính)
    let gocTra: number
    if (hd.phuongThuc === 'cuoi-ky') {
      gocTra = isLastKy ? dunNo : 0
    } else {
      gocTra = isLastKy ? dunNo : Math.min(gocKy, dunNo)
    }

    const tongTra   = gocTra + laiTra
    const dunNoCuoi = Math.max(0, dunNo - gocTra)
    const dLeft     = daysDiff(todayD, ngayTra)
    const trangThai: KyTraNo['trangThai'] =
      dLeft < 0 ? 'qua-han' : dLeft <= 7 ? 'gan-han' : 'chua-tra'

    rows.push({
      id: `ky-${i}-${hd.id}`, hopDongId: hd.id, soKy: i,
      ngayTra: ngayTra.toISOString().slice(0, 10),
      dunNoDauKy: dunNo, gocTra, laiTra, tongTra,
      dunNoCuoiKy: dunNoCuoi, trangThai,
    })

    if (hd.phuongThuc === 'giam-dan') dunNo = dunNoCuoi
  }
  return rows
}

function applyCC(hd: HopDongTinDung, cc: CoCauNo): HopDongTinDung {
  const r = { ...hd }
  if (cc.option === 'gia-han'     && cc.ngayDaoHanMoi) r.ngayDaoHan      = cc.ngayDaoHanMoi
  if (cc.option === 'giam-ls'     && cc.laiSuatMoi)    r.laiSuat          = cc.laiSuatMoi
  if (cc.option === 'von-hoa-lai' && cc.gocMoi)        r.soTienGiaiNgan   = cc.gocMoi
  return r
}

// ── Date helpers ─────────────────────────────────────────────
function monthDiff(a: Date, b: Date): number {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
}
function addMonths(d: Date, n: number): Date {
  const r = new Date(d); r.setMonth(r.getMonth() + n); return r
}
function daysDiff(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86400000)
}

export { buildSchedule as previewSchedule }

// ── Cập nhật gốc cứng + rebuild toàn bộ lịch trả nợ ────────
// gocMoi = null → xóa gốc cứng (trở về tự tính)
// gocMoi > 0   → set số NH làm tròn, rebuild, giữ kỳ da-tra
export async function setGocTraCoDinh(
  hopDongId: string,
  gocMoi: number | null,
): Promise<void> {
  await ensureTasksAuth()

  // 1. Lấy hợp đồng hiện tại
  const hdRef  = doc(hdCol(), hopDongId)
  const hdSnap = await getDoc(hdRef)
  if (!hdSnap.exists()) throw new Error('Hợp đồng không tồn tại')
  const hopDong = { id: hdSnap.id, ...hdSnap.data() } as HopDongTinDung

  // 2. Cập nhật field gocTraCoDinh
  if (gocMoi == null) {
    await updateDoc(hdRef, { gocTraCoDinh: deleteField() })
  } else {
    await updateDoc(hdRef, { gocTraCoDinh: gocMoi })
  }

  // 3. Rebuild lịch với gocTraCoDinh mới
  const hopDongMoi: HopDongTinDung = {
    ...hopDong,
    ...(gocMoi != null ? { gocTraCoDinh: gocMoi } : { gocTraCoDinh: undefined }),
  }
  const lichMoi = buildSchedule(hopDongMoi)

  // 4. Lấy các kỳ đã trả để merge lại (không ghi đè dữ liệu thực tế)
  const lichSnaps = await getDocs(query(kyCol(hopDongId), orderBy('soKy', 'asc')))
  const daTraMap: Record<number, Partial<KyTraNo>> = {}
  lichSnaps.forEach(d => {
    const data = d.data() as KyTraNo
    if (data.trangThai === 'da-tra') {
      daTraMap[data.soKy] = {
        trangThai:    data.trangThai,
        ngayThucTra:  data.ngayThucTra,
        gocThucTra:   data.gocThucTra,
        laiThucTra:   data.laiThucTra,
        soTienThucTra: data.soTienThucTra,
      }
    }
  })

  // 5. Batch write toàn bộ lịch mới (merge kỳ da-tra)
  const BATCH_SIZE = 400
  for (let i = 0; i < lichMoi.length; i += BATCH_SIZE) {
    const batch = writeBatch(db())
    lichMoi.slice(i, i + BATCH_SIZE).forEach(ky => {
      const kyRef  = doc(kyCol(hopDongId), ky.id)
      const merged = { ...ky, ...(daTraMap[ky.soKy] ?? {}) }
      batch.set(kyRef, merged)
    })
    await batch.commit()
  }
}