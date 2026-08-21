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
import { taoBoMaNganSach } from '@/lib/ma-ngan-sach'

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

// ── Lưu phương án cơ cấu nợ + cập nhật lịch trả nợ ──────────
// Nguyên tắc (đại ca đã chốt): GIỮ NGUYÊN số kỳ và ngày trả của
// các kỳ từ tuKy trở đi — chỉ tính lại SỐ TIỀN (dư nợ/gốc/lãi)
// theo phương án cơ cấu. Các kỳ trước tuKy (đã qua/đã trả) giữ
// nguyên, không đụng tới.
export async function saveCoCauNo(
  cc: Omit<CoCauNo, 'id'>,
  hopDong: HopDongTinDung,
  kyList: KyTraNo[],
): Promise<string> {
  await ensureTasksAuth()

  // 1) Ghi lại lịch sử phương án cơ cấu
  const ref = doc(ccCol())
  const ccData: CoCauNo = { ...cc, id: ref.id }
  await setDoc(ref, ccData)

  // 2) Cập nhật các field gốc trên hợp đồng (ngày đáo hạn / lãi suất / gốc)
  const hdMoi = applyCC(hopDong, ccData)
  const hdPatch: any = {}
  if (hdMoi.ngayDaoHan !== hopDong.ngayDaoHan) hdPatch.ngayDaoHan = hdMoi.ngayDaoHan
  if (hdMoi.laiSuat !== hopDong.laiSuat) hdPatch.laiSuat = hdMoi.laiSuat
  if (hdMoi.soTienGiaiNgan !== hopDong.soTienGiaiNgan) hdPatch.soTienGiaiNgan = hdMoi.soTienGiaiNgan
  if (Object.keys(hdPatch).length > 0) {
    hdPatch.updatedAt = Date.now()
    await setDoc(doc(hdCol(), hopDong.id), hdPatch, { merge: true })
  }

  // 3) Tính lại số tiền các kỳ từ tuKy trở đi (bỏ qua kỳ đã trả)
  const kyCanTinhLai = kyList
    .filter(k => k.soKy >= cc.tuKy && k.trangThai !== 'da-tra')
    .sort((a, b) => a.soKy - b.soKy)

  if (kyCanTinhLai.length === 0) return ref.id

  const kyThang = hopDong.kyTra === 'quarterly' ? 4 : 12
  const laiSuatApDung = cc.option === 'giam-ls' ? (cc.laiSuatMoi ?? hopDong.laiSuat) : hopDong.laiSuat

  // Tổng gốc còn phải trả sau cơ cấu (dư nợ tại kỳ mốc, đã gồm vốn hóa nếu có)
  const tongGocConLai = cc.dunNoSau
  // Giữ nguyên TỶ TRỌNG gốc trả cũ của từng kỳ để không xáo trộn cấu trúc
  // trả gốc gốc (đều/cuối kỳ/...) — chỉ scale lại theo dư nợ gốc mới.
  const tongGocCu = kyCanTinhLai.reduce((s, k) => s + k.gocTra, 0)

  const todayD = new Date()
  let dunNo = tongGocConLai
  let gocDaPhanBo = 0
  const batch = writeBatch(db())

  kyCanTinhLai.forEach((ky, idx) => {
    const isLast = idx === kyCanTinhLai.length - 1
    let gocTra: number
    if (isLast) {
      // Kỳ cuối hấp thụ chênh lệch làm tròn, đảm bảo tổng gốc khớp tuyệt đối
      gocTra = Math.max(0, tongGocConLai - gocDaPhanBo)
    } else if (tongGocCu > 0) {
      gocTra = Math.round(tongGocConLai * (ky.gocTra / tongGocCu))
    } else {
      gocTra = Math.round(tongGocConLai / kyCanTinhLai.length)
    }
    gocDaPhanBo += gocTra

    const laiTra = Math.round(dunNo * (laiSuatApDung / 100 / kyThang))
    const dunNoCuoiKy = Math.max(0, dunNo - gocTra)
    const dLeft = daysDiff(todayD, parseDate(ky.ngayTra))
    const trangThai: KyTraNo['trangThai'] =
      dLeft < 0 ? 'qua-han' : dLeft <= 7 ? 'gan-han' : 'chua-tra'

    batch.set(doc(kyCol(hopDong.id), ky.id), {
      dunNoDauKy: dunNo,
      gocTra,
      laiTra,
      tongTra: gocTra + laiTra,
      dunNoCuoiKy,
      trangThai,
      updatedAt: Date.now(),
    }, { merge: true })

    dunNo = dunNoCuoiKy
  })

  await batch.commit()
  return ref.id
}

// ── Save hợp đồng + tự tạo lịch trả nợ ─────────────────────
//
// ⚠️ BREAKING CHANGE: return type đổi từ Promise<string>
//    sang Promise<{ id: string; canhBaoMa?: string }>
//    → cần sửa HopDongForm.tsx (xem patch-hop-dong-form.ts)
//
export async function saveHopDong(
  hd: Omit<HopDongTinDung, 'id' | 'createdAt' | 'updatedAt'>,
  id?: string,
): Promise<{ id: string; canhBaoMa?: string }> {
  await ensureTasksAuth()
  const ref  = id ? doc(hdCol(), id) : doc(hdCol())
  const now  = Date.now()

  // Lấy createdAt gốc nếu đang edit (không ghi đè)
  let createdAt = now
  if (id) {
    const existing = await getDoc(ref)
    if (existing.exists()) createdAt = (existing.data() as HopDongTinDung).createdAt ?? now
  }

  // ── Sinh mã ngân sách ─────────────────────────────────────
  // HĐ loại 'han-muc-khung' không giải ngân trực tiếp — không cần mã
  // vì không có kỳ trả nợ để đối chiếu data_quy.
  const kyHan = _kyHanCuaHopDong(hd)
  const boMa  = hd.loaiHD === 'han-muc-khung'
    ? {}
    : taoBoMaNganSach(hd.entity, kyHan, hd.nganHang, {
        nguoiVay:       hd.nguoiVay,
        soTienGiaiNgan: hd.soTienGiaiNgan,
      })

  const data: HopDongTinDung = {
    ...hd,
    ...boMa,                  // ghi đè maNganSachLai/Goc/Thu + canhBaoMa
    id: ref.id, createdAt, updatedAt: now,
  }

  const optionalFields: (keyof HopDongTinDung)[] = [
    'nguoiVay', 'chiNhanh', 'ghiChu', 'kyTraGoc',
    'ngayTraGocDauTien', 'soKyTraGoc', 'soKyAnHan',
    'gocTraCoDinh', 'soThangUuDai', 'laiSuatSauUuDai',
    // Mã ngân sách cũng là optional — xóa nếu undefined (VD: khung ko có mã Thu)
    'maNganSachLai', 'maNganSachGoc', 'maNganSachThu', 'canhBaoMa',
  ]

  if (id) {
    // EDIT: deleteField() xóa tường minh field bị bỏ trống khỏi Firestore
    const dataToWrite: any = { ...data }
    optionalFields.forEach(f => {
      if (dataToWrite[f] === undefined || dataToWrite[f] === null) dataToWrite[f] = deleteField()
    })
    await setDoc(ref, dataToWrite, { merge: true })
  } else {
    // TẠO MỚI: deleteField() không dùng được khi create — xóa key undefined khỏi object
    const dataToWrite: any = { ...data }
    optionalFields.forEach(f => {
      if (dataToWrite[f] === undefined || dataToWrite[f] === null) delete dataToWrite[f]
    })
    await setDoc(ref, dataToWrite)
  }

  // Build schedule mới
  const schedule = buildSchedule(data)

  // Nếu đang EDIT: lấy các kỳ đã trả để merge lại, không ghi đè dữ liệu thực tế
  const daTraMap: Record<number, Partial<KyTraNo>> = {}
  const oldKyIds: string[] = []
  if (id) {
    const lichSnaps = await getDocs(query(kyCol(id), orderBy('soKy', 'asc')))
    lichSnaps.forEach(d => {
      oldKyIds.push(d.id)
      const k = d.data() as KyTraNo
      if (k.trangThai === 'da-tra') {
        daTraMap[k.soKy] = {
          trangThai:     k.trangThai,
          ngayThucTra:   k.ngayThucTra,
          gocThucTra:    k.gocThucTra,
          laiThucTra:    k.laiThucTra,
          soTienThucTra: k.soTienThucTra,
        }
      }
    })
  }

  // Tập hợp id của lịch mới để biết kỳ nào đã bị xóa
  const newKyIds = new Set(schedule.map(k => k.id))
  // Kỳ cũ không còn trong lịch mới → cần xóa (VD: rút ngắn thời hạn)
  const kyIdsToDelete = oldKyIds.filter(kid => !newKyIds.has(kid))

  const BATCH_SIZE = 400

  // Xóa kỳ thừa (theo chunk, tránh vượt 500 ops/batch)
  for (let i = 0; i < kyIdsToDelete.length; i += BATCH_SIZE) {
    const batch = writeBatch(db())
    kyIdsToDelete.slice(i, i + BATCH_SIZE).forEach(kid => {
      batch.delete(doc(kyCol(ref.id), kid))
    })
    await batch.commit()
  }

  // Ghi lịch mới
  for (let i = 0; i < schedule.length; i += BATCH_SIZE) {
    const batch = writeBatch(db())
    schedule.slice(i, i + BATCH_SIZE).forEach(ky => {
      const merged = { ...ky, ...(daTraMap[ky.soKy] ?? {}) }
      batch.set(doc(kyCol(ref.id), ky.id), merged)
    })
    await batch.commit()
  }

  return { id: ref.id, canhBaoMa: boMa.canhBaoMa }
}

/** Suy kỳ hạn từ hợp đồng: nếu có hanMucKhungId → ngắn hạn (bộ hồ sơ con),
 *  ngược lại căn theo thời gian vay (<= 12 tháng → ngắn, > 12 → dài). */
function _kyHanCuaHopDong(
  hd: Omit<HopDongTinDung, 'id' | 'createdAt' | 'updatedAt'>,
): 'ngan-han' | 'dai-han' {
  if (hd.hanMucKhungId) return 'ngan-han'
  const start = new Date(hd.ngayKy)
  const end   = new Date(hd.ngayDaoHan)
  const thang = (end.getFullYear() - start.getFullYear()) * 12
    + (end.getMonth() - start.getMonth())
  return thang <= 12 ? 'ngan-han' : 'dai-han'
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
  const soThangDaTrai = monthDiff(parseDate(hd.ngayKy), ngayTraKy)
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

  // Tính lại các kỳ sau (dư nợ thay đổi nếu gốc thực khác kế hoạch)
  const gocLech = gocThucTra - kyHienTai.gocTra
  if (gocLech !== 0) {
    const cacKySau = allKy
      .filter(k => k.soKy > kyHienTai.soKy && k.trangThai !== 'da-tra')
      .sort((a, b) => a.soKy - b.soKy)

    let dunNo = kyHienTai.dunNoCuoiKy - gocLech
    cacKySau.forEach(ky => {
      const laiTra    = Math.round(dunNo * (laiSuatChoKy(hopDong, parseDate(ky.ngayTra)) / 100 / 12))
      const isLast    = ky.soKy === cacKySau[cacKySau.length - 1].soKy
      const gocTra    = isLast ? dunNo : ky.gocTra
      const dunNoCuoi = Math.max(0, dunNo - gocTra)
      batch.set(doc(kyCol(hopDong.id), ky.id), {
        dunNoDauKy: dunNo, gocTra, laiTra,
        tongTra: gocTra + laiTra, dunNoCuoiKy: dunNoCuoi,
      }, { merge: true })
      dunNo = dunNoCuoi
    })
  }

  await batch.commit()
}

// ── Xóa hợp đồng + toàn bộ lịch trả nợ ─────────────────────
export async function deleteHopDong(id: string): Promise<void> {
  await ensureTasksAuth()
  const lichSnaps = await getDocs(kyCol(id))
  const BATCH_SIZE = 400
  for (let i = 0; i < lichSnaps.docs.length; i += BATCH_SIZE) {
    const batch = writeBatch(db())
    lichSnaps.docs.slice(i, i + BATCH_SIZE).forEach(d => batch.delete(d.ref))
    await batch.commit()
  }
  await deleteDoc(doc(hdCol(), id))
}

// ─────────────────────────────────────────────────────────────
// BUILD SCHEDULE — toàn bộ logic tính lịch trả nợ giữ nguyên
// (copy từ file gốc, không thay đổi)
// ─────────────────────────────────────────────────────────────
export function buildSchedule(hd: HopDongTinDung): KyTraNo[] {
  // HĐ hạn mức khung: không có lịch trả nợ riêng
  if (hd.loaiHD === 'han-muc-khung') return []

  const ngayKy     = parseDate(hd.ngayKy)
  const ngayDaoHan = parseDate(hd.ngayDaoHan)
  const todayD     = new Date()
  todayD.setHours(0, 0, 0, 0)

  if (hd.phuongThuc === 'cuoi-ky') {
    return _buildCuoiKy(hd, ngayKy, ngayDaoHan, todayD)
  }

  // Phương thức giảm dần
  const coKyLe  = !!hd.ngayTraGocDauTien
  let ankerDate = ngayKy
  let coKyLeThuc = false

  if (coKyLe) {
    const ankerDay  = parseDate(hd.ngayTraGocDauTien!).getDate()
    const candidate = new Date(ngayKy.getFullYear(), ngayKy.getMonth(), ankerDay)
    if (candidate.getTime() === ngayKy.getTime()) {
      ankerDate = ngayKy
    } else if (candidate.getTime() < ngayKy.getTime()) {
      ankerDate  = addMonths(candidate, 1)
      coKyLeThuc = true
    } else {
      ankerDate  = candidate
      coKyLeThuc = true
    }
  }

  if (hd.kyTra === 'luu-dong') {
    return _buildLuuDong(hd, ngayKy, ngayDaoHan, ankerDate, coKyLeThuc, todayD)
  }

  if (hd.kyTra === 'quarterly') {
    return _buildQuarterly(hd, ngayKy, ngayDaoHan, ankerDate, coKyLeThuc, todayD)
  }

  // monthly (giảm dần)
  return _buildMonthly(hd, ngayKy, ngayDaoHan, ankerDate, coKyLeThuc, todayD)
}

// ── Cuối kỳ (bullet) ─────────────────────────────────────────
function _buildCuoiKy(
  hd: HopDongTinDung, ngayKy: Date, ngayDaoHan: Date, todayD: Date,
): KyTraNo[] {
  const soNgay  = daysDiff(ngayKy, ngayDaoHan)
  const lsNam   = laiSuatChoKy(hd, ngayDaoHan) / 100
  const laiTra  = Math.round(hd.soTienGiaiNgan * lsNam * (soNgay / 365))
  const dLeft   = daysDiff(todayD, ngayDaoHan)
  const trangThai: KyTraNo['trangThai'] =
    dLeft < 0 ? 'qua-han' : dLeft <= 7 ? 'gan-han' : 'chua-tra'
  return [{
    id: `ky-1-${hd.id}`, hopDongId: hd.id, soKy: 1,
    ngayTra: fmtDate(ngayDaoHan),
    dunNoDauKy: hd.soTienGiaiNgan, gocTra: hd.soTienGiaiNgan,
    laiTra, tongTra: hd.soTienGiaiNgan + laiTra,
    dunNoCuoiKy: 0, trangThai,
  }]
}

// ── Monthly giảm dần ─────────────────────────────────────────
function _buildMonthly(
  hd: HopDongTinDung, ngayKy: Date, ngayDaoHan: Date,
  ankerDate: Date, coKyLeThuc: boolean, todayD: Date,
): KyTraNo[] {
  const anHanKy  = hd.soKyAnHan ?? 0
  const numThang = Math.max(1, monthDiff(ankerDate, ngayDaoHan))
  const numKyGoc = Math.max(1, numThang - anHanKy)
  const gocCung  = hd.gocTraCoDinh && hd.gocTraCoDinh > 0 ? hd.gocTraCoDinh : null
  const gocQuy   = gocCung ?? Math.round(hd.soTienGiaiNgan / numKyGoc)
  let dunNo      = hd.soTienGiaiNgan
  let kyGocDaTra = 0
  const rows: KyTraNo[] = []

  if (coKyLeThuc) {
    const soNgayLe = daysDiff(ngayKy, ankerDate)
    const laiTra   = Math.round(dunNo * (laiSuatChoKy(hd, ankerDate) / 100) * (soNgayLe / 365))
    const dLeft    = daysDiff(todayD, ankerDate)
    rows.push({
      id: `ky-0-${hd.id}`, hopDongId: hd.id, soKy: 0,
      ngayTra: fmtDate(ankerDate),
      dunNoDauKy: dunNo, gocTra: 0, laiTra, tongTra: laiTra,
      dunNoCuoiKy: dunNo,
      trangThai: dLeft < 0 ? 'qua-han' : dLeft <= 7 ? 'gan-han' : 'chua-tra',
    })
  }

  for (let i = 1; i <= numThang; i++) {
    const ngayTra  = addMonths(ankerDate, i)
    const isLast   = i === numThang
    const isAnHan  = i <= anHanKy
    const laiTra   = Math.round(dunNo * laiSuatChoKy(hd, ngayTra) / 100 / 12)
    let gocTra     = 0
    if (!isAnHan) {
      kyGocDaTra++
      const isLastGoc = kyGocDaTra === numKyGoc || isLast
      gocTra = isLastGoc ? dunNo : Math.min(gocQuy, dunNo)
    }
    const dunNoCuoi = Math.max(0, dunNo - gocTra)
    const dLeft     = daysDiff(todayD, ngayTra)
    rows.push({
      id: `ky-${i}-${hd.id}`, hopDongId: hd.id, soKy: i,
      ngayTra: fmtDate(ngayTra),
      dunNoDauKy: dunNo, gocTra, laiTra, tongTra: gocTra + laiTra,
      dunNoCuoiKy: dunNoCuoi,
      trangThai: dLeft < 0 ? 'qua-han' : dLeft <= 7 ? 'gan-han' : 'chua-tra',
    })
    dunNo = dunNoCuoi
  }
  return rows
}

// ── Quarterly giảm dần ───────────────────────────────────────
function _buildQuarterly(
  hd: HopDongTinDung, ngayKy: Date, ngayDaoHan: Date,
  ankerDate: Date, coKyLeThuc: boolean, todayD: Date,
): KyTraNo[] {
  const kyTra     = hd.kyTra       // 'monthly' | 'quarterly'
  const kyTraGoc  = hd.kyTraGoc ?? 'quarterly'
  const anHanQuy  = hd.soKyAnHan ?? 0
  const numThang  = Math.max(1, monthDiff(ankerDate, ngayDaoHan))
  const numKyGoc  = hd.soKyTraGoc ?? Math.ceil(numThang / 3)

  // Offset tháng đến kỳ gốc đầu tiên (cách ankerDate bao nhiêu tháng)
  const gocOffset = anHanQuy * 3 + 3

  const gocCung = hd.gocTraCoDinh && hd.gocTraCoDinh > 0 ? hd.gocTraCoDinh : null
  const gocQuy  = gocCung ?? Math.round(hd.soTienGiaiNgan / numKyGoc)

  let dunNo      = hd.soTienGiaiNgan
  let kyGocDaTra = 0
  const rows: KyTraNo[] = []
  const numThangSau = Math.max(1, monthDiff(ankerDate, ngayDaoHan))

  if (coKyLeThuc) {
    const soNgayLe = daysDiff(ngayKy, ankerDate)
    const lsNam    = laiSuatChoKy(hd, ankerDate) / 100
    const laiTra   = Math.round(dunNo * lsNam * (soNgayLe / 365))
    const dLeft    = daysDiff(todayD, ankerDate)
    rows.push({
      id: `ky-0-${hd.id}`, hopDongId: hd.id, soKy: 0,
      ngayTra: fmtDate(ankerDate),
      dunNoDauKy: dunNo, gocTra: 0, laiTra, tongTra: laiTra,
      dunNoCuoiKy: dunNo,
      trangThai: dLeft < 0 ? 'qua-han' : dLeft <= 7 ? 'gan-han' : 'chua-tra',
    })
  }

  for (let i = 1; i <= numThangSau; i++) {
    const ngayTra     = addMonths(ankerDate, i)
    const isLastThang = i === numThangSau
    const distFromFirstGoc = i - gocOffset
    const laThangTraGoc    = (distFromFirstGoc >= 0 && distFromFirstGoc % 3 === 0) || isLastThang
    const lsThang = laiSuatChoKy(hd, ngayTra) / 100 / 12
    const laiTra  = Math.round(dunNo * lsThang)
    const soQuyHienTai = (laThangTraGoc && distFromFirstGoc >= 0)
      ? Math.floor(distFromFirstGoc / 3) + 1 : 0
    const isAnHanQuy = laThangTraGoc && soQuyHienTai <= anHanQuy
    let gocTra = 0
    if (laThangTraGoc && !isAnHanQuy) {
      kyGocDaTra++
      const isLastGoc = kyGocDaTra === numKyGoc || isLastThang
      gocTra = isLastGoc ? dunNo : Math.min(gocQuy, dunNo)
    }
    const dunNoCuoi = Math.max(0, dunNo - gocTra)
    const dLeft     = daysDiff(todayD, ngayTra)
    rows.push({
      id: `ky-${i}-${hd.id}`, hopDongId: hd.id, soKy: i,
      ngayTra: fmtDate(ngayTra),
      dunNoDauKy: dunNo, gocTra, laiTra, tongTra: gocTra + laiTra,
      dunNoCuoiKy: dunNoCuoi,
      trangThai: dLeft < 0 ? 'qua-han' : dLeft <= 7 ? 'gan-han' : 'chua-tra',
    })
    dunNo = dunNoCuoi
  }
  return rows
}

// ── Lưu động (trả lãi tháng, gốc cuối kỳ — VD: hạn mức khung dài hạn) ──
function _buildLuuDong(
  hd: HopDongTinDung, ngayKy: Date, ngayDaoHan: Date,
  ankerDate: Date, coKyLeThuc: boolean, todayD: Date,
): KyTraNo[] {
  const numThang = Math.max(1, monthDiff(ankerDate, ngayDaoHan))
  let dunNo      = hd.soTienGiaiNgan
  const rows: KyTraNo[] = []

  if (coKyLeThuc) {
    const soNgayLe = daysDiff(ngayKy, ankerDate)
    const laiTra   = Math.round(dunNo * (laiSuatChoKy(hd, ankerDate) / 100) * (soNgayLe / 365))
    const dLeft    = daysDiff(todayD, ankerDate)
    rows.push({
      id: `ky-0-${hd.id}`, hopDongId: hd.id, soKy: 0,
      ngayTra: fmtDate(ankerDate),
      dunNoDauKy: dunNo, gocTra: 0, laiTra, tongTra: laiTra,
      dunNoCuoiKy: dunNo,
      trangThai: dLeft < 0 ? 'qua-han' : dLeft <= 7 ? 'gan-han' : 'chua-tra',
    })
  }

  for (let i = 1; i <= numThang; i++) {
    const ngayTra = addMonths(ankerDate, i)
    const isLast  = i === numThang
    const laiTra  = Math.round(dunNo * laiSuatChoKy(hd, ngayTra) / 100 / 12)
    const gocTra  = isLast ? dunNo : 0
    const dunNoCuoi = Math.max(0, dunNo - gocTra)
    const dLeft   = daysDiff(todayD, ngayTra)
    rows.push({
      id: `ky-${i}-${hd.id}`, hopDongId: hd.id, soKy: i,
      ngayTra: fmtDate(ngayTra),
      dunNoDauKy: dunNo, gocTra, laiTra, tongTra: gocTra + laiTra,
      dunNoCuoiKy: dunNoCuoi,
      trangThai: dLeft < 0 ? 'qua-han' : dLeft <= 7 ? 'gan-han' : 'chua-tra',
    })
    dunNo = dunNoCuoi
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
function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function fmtDate(d: Date): string {
  const y  = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${dd}`
}
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

// ─────────────────────────────────────────────────────────────
// MIGRATE 1 LẦN: đổi pháp nhân "SAG" → "SAP" cho toàn bộ HĐ dài hạn
// ─────────────────────────────────────────────────────────────
export async function migrateEntitySAGtoSAP(): Promise<{ updated: number }> {
  await ensureTasksAuth()
  const snap_ = await getDocs(query(hdCol(), where('entity', '==', 'SAG')))
  const ids   = snap_.docs.map(d => d.id)
  const BATCH = 400
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = writeBatch(db())
    ids.slice(i, i + BATCH).forEach(id => batch.update(doc(hdCol(), id), { entity: 'SAP' }))
    await batch.commit()
  }
  return { updated: ids.length }
}

// ─────────────────────────────────────────────────────────────
// MIGRATE 1 LẦN: gắn mã ngân sách cho toàn bộ HĐ dài hạn đã có sẵn
// (chạy 1 lần duy nhất — HĐ nào đã có maNganSachLai thì bỏ qua)
// ─────────────────────────────────────────────────────────────
export async function migrateMaNganSachDaiHan(): Promise<{ updated: number; skipped: number; warn: number }> {
  await ensureTasksAuth()
  const snap_ = await getDocs(query(hdCol(), orderBy('createdAt', 'asc')))
  const BATCH = 400
  let updated = 0, skipped = 0, warn = 0

  const toWrite: Array<{ id: string; fields: Partial<HopDongTinDung> }> = []

  snap_.docs.forEach(d => {
    const hd = { id: d.id, ...d.data() } as HopDongTinDung
    // Đã có mã → bỏ qua (không ghi đè)
    if (hd.maNganSachLai) { skipped++; return }
    // HĐ hạn mức khung → không cần mã
    if (hd.loaiHD === 'han-muc-khung') { skipped++; return }

    const kyHan = _kyHanCuaHopDong(hd)
    const boMa  = taoBoMaNganSach(hd.entity, kyHan, hd.nganHang, {
      nguoiVay:       hd.nguoiVay,
      soTienGiaiNgan: hd.soTienGiaiNgan,
    })
    if (boMa.canhBaoMa) warn++
    toWrite.push({ id: hd.id, fields: boMa })
  })

  for (let i = 0; i < toWrite.length; i += BATCH) {
    const batch = writeBatch(db())
    toWrite.slice(i, i + BATCH).forEach(({ id, fields }) => {
      const upd: any = {}
      if (fields.maNganSachLai) upd.maNganSachLai = fields.maNganSachLai
      if (fields.maNganSachGoc) upd.maNganSachGoc = fields.maNganSachGoc
      if (fields.maNganSachThu) upd.maNganSachThu = fields.maNganSachThu
      if (fields.canhBaoMa)    upd.canhBaoMa     = fields.canhBaoMa
      batch.update(doc(hdCol(), id), upd)
      updated++
    })
    await batch.commit()
  }

  return { updated, skipped, warn }
}

// ─────────────────────────────────────────────────────────────
// HẠN MỨC KHUNG (dài hạn) — tính dư nợ hiện tại của 1 bộ hồ sơ
// và hạn mức khả dụng của 1 HĐ đóng vai trò "khung".
// ─────────────────────────────────────────────────────────────

export function tinhDuNoHienTai(kyList: KyTraNo[]): number {
  if (!kyList.length) return 0
  const sorted = [...kyList].sort((a, b) => a.soKy - b.soKy)
  const daTra  = sorted.filter(k => k.trangThai === 'da-tra')
  if (daTra.length === 0) return sorted[0].dunNoDauKy
  return daTra[daTra.length - 1].dunNoCuoiKy
}

export function tinhHanMucKhaDung(
  khung:   HopDongTinDung,
  conCua:  HopDongTinDung[],
  kyMap:   Record<string, KyTraNo[]>,
): { tongHanMuc: number; daSuDung: number; khaDung: number; soBoDangVay: number } {
  let daSuDung    = 0
  let soBoDangVay = 0

  conCua.forEach(bo => {
    if (bo.trangThai === 'tat-toan') return
    const duNo = tinhDuNoHienTai(kyMap[bo.id] ?? [])
    if (duNo > 0) {
      daSuDung += duNo
      soBoDangVay++
    }
  })

  const tongHanMuc = khung.hanMuc
  const khaDung     = Math.max(0, tongHanMuc - daSuDung)
  return { tongHanMuc, daSuDung, khaDung, soBoDangVay }
}

// ── Cập nhật gốc cứng + rebuild toàn bộ lịch trả nợ ────────
export async function setGocTraCoDinh(
  hopDongId: string,
  gocMoi: number | null,
): Promise<void> {
  await ensureTasksAuth()
  const hdRef  = doc(hdCol(), hopDongId)
  const hdSnap = await getDoc(hdRef)
  if (!hdSnap.exists()) throw new Error('Hợp đồng không tồn tại')
  const hopDong = { id: hdSnap.id, ...hdSnap.data() } as HopDongTinDung

  if (gocMoi == null) {
    await updateDoc(hdRef, { gocTraCoDinh: deleteField() })
  } else {
    await updateDoc(hdRef, { gocTraCoDinh: gocMoi })
  }

  const hopDongMoi: HopDongTinDung = {
    ...hopDong,
    ...(gocMoi != null ? { gocTraCoDinh: gocMoi } : { gocTraCoDinh: undefined }),
  }
  const lichMoi = buildSchedule(hopDongMoi)

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