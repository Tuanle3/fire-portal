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

  // Lấy createdAt gốc nếu đang edit (không ghi đè)
  let createdAt = now
  if (id) {
    const existing = await getDoc(ref)
    if (existing.exists()) createdAt = (existing.data() as HopDongTinDung).createdAt ?? now
  }

  const data: HopDongTinDung = { ...hd, id: ref.id, createdAt, updatedAt: now }
  await setDoc(ref, data)

  // Build schedule mới
  const schedule = buildSchedule(data)

  // Nếu đang EDIT: lấy các kỳ đã trả để merge lại, không ghi đè dữ liệu thực tế
  const daTraMap: Record<number, Partial<KyTraNo>> = {}
  if (id) {
    const lichSnaps = await getDocs(query(kyCol(id), orderBy('soKy', 'asc')))
    lichSnaps.forEach(d => {
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

  const BATCH_SIZE = 400
  for (let i = 0; i < schedule.length; i += BATCH_SIZE) {
    const batch = writeBatch(db())
    schedule.slice(i, i + BATCH_SIZE).forEach(ky => {
      const merged = { ...ky, ...(daTraMap[ky.soKy] ?? {}) }
      batch.set(doc(kyCol(ref.id), ky.id), merged)
    })
    await batch.commit()
  }

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
  const todayD     = new Date()

  // ── Trường hợp đặc biệt: lưu động ────────────────────────
  // kyTra='luu-dong': lãi trả HÀNG THÁNG, gốc trả 1 lần CUỐI KỲ
  if (hd.kyTra === 'luu-dong') {
    const numThang = Math.max(1, diffM)
    const rows: KyTraNo[] = []
    let dunNo = hd.soTienGiaiNgan
    for (let i = 1; i <= numThang; i++) {
      const ngayTra  = addMonths(ngayKy, i)
      const isLast   = i === numThang
      const lsThang  = laiSuatChoKy(hd, ngayTra) / 100 / 12
      const laiTra   = Math.round(dunNo * lsThang)
      const gocTra   = isLast ? dunNo : 0
      const dunNoCuoi = Math.max(0, dunNo - gocTra)
      const dLeft    = daysDiff(todayD, ngayTra)
      const trangThai: KyTraNo['trangThai'] =
        dLeft < 0 ? 'qua-han' : dLeft <= 7 ? 'gan-han' : 'chua-tra'
      rows.push({
        id: `ky-${i}-${hd.id}`, hopDongId: hd.id, soKy: i,
        ngayTra: ngayTra.toISOString().slice(0, 10),
        dunNoDauKy: dunNo, gocTra, laiTra, tongTra: gocTra + laiTra,
        dunNoCuoiKy: dunNoCuoi, trangThai,
      })
    }
    return rows
  }

  // ── Trường hợp: lãi hàng tháng, gốc theo quý (kyTraGoc riêng) ──
  // Điều kiện: kyTra='monthly' + kyTraGoc='quarterly'
  if (hd.kyTra === 'monthly' && hd.kyTraGoc === 'quarterly') {
    return buildScheduleLaiThangGocQuy(hd, diffM, todayD)
  }

  // ── Trường hợp thông thường (monthly / quarterly đồng nhất) ──
  const period = hd.kyTra === 'quarterly' ? 3 : 1
  const kyPerYear = hd.kyTra === 'quarterly' ? 4 : 12

  // Có kỳ lẻ ngày đầu: ngày trả gốc đầu tiên khác với chu kỳ đều đặn tính từ ngày ký
  // (VD: ký 02/12/2025 nhưng ngày neo = 25 → kỳ lẻ kết thúc 25/12/2025, các kỳ sau: 25/01, 25/02…)
  //
  // Logic neo ngày-trong-tháng (giống buildScheduleLaiThangGocQuy):
  //   1. Lấy ankerDay = ngày-trong-tháng của ngayTraGocDauTien (VD: 25)
  //   2. candidate = ankerDay trong CÙNG tháng ký
  //      - Nếu candidate == ngayKy  → không có kỳ lẻ, bắt đầu chu kỳ đều đặn từ ngày ký
  //      - Nếu candidate < ngayKy   → kỳ lẻ kéo dài đến ankerDay tháng SAU
  //      - Nếu candidate > ngayKy   → kỳ lẻ ngắn, kết thúc ngay trong tháng ký
  //   3. Các kỳ tiếp theo: addMonths(ankerDate, period), addMonths(ankerDate, 2*period), ...
  const coKyLe = !!hd.ngayTraGocDauTien
  const ngayGocDauTienRaw = coKyLe ? new Date(hd.ngayTraGocDauTien!) : null
  const ankerDay = coKyLe ? ngayGocDauTienRaw!.getDate() : ngayKy.getDate()

  // Xác định ankerDate (ngày kết thúc kỳ lẻ, đồng thời là neo cố định các kỳ sau)
  let ankerDate: Date = ngayKy
  let coKyLeThuc = false
  if (coKyLe) {
    const candidate = new Date(ngayKy.getFullYear(), ngayKy.getMonth(), ankerDay)
    if (candidate.getTime() === ngayKy.getTime()) {
      // Trùng đúng ngày ký — không có kỳ lẻ
      ankerDate = ngayKy
    } else if (candidate.getTime() < ngayKy.getTime()) {
      // Ngày neo đã qua trong tháng ký → kỳ lẻ kéo đến tháng sau
      ankerDate = addMonths(candidate, 1)
      coKyLeThuc = true
    } else {
      // Ngày neo còn phía trước trong tháng ký → kỳ lẻ ngắn
      ankerDate = candidate
      coKyLeThuc = true
    }
  }

  const numKySau = coKyLeThuc
    ? Math.max(1, Math.floor(monthDiff(ankerDate, ngayDaoHan) / period))
    : Math.max(1, Math.floor(diffM / period))
  const numKy = coKyLeThuc ? numKySau + 1 : numKySau

  const anHan    = hd.soKyAnHan && hd.soKyAnHan > 0 ? hd.soKyAnHan : 0
  // Số kỳ THỰC SỰ trả gốc = tổng kỳ thường - kỳ ân hạn (kỳ stub không tính)
  const numKyTraGoc = Math.max(1, numKySau - anHan)
  const gocCung  = hd.gocTraCoDinh && hd.gocTraCoDinh > 0 ? hd.gocTraCoDinh : null
  // Chia đều gốc theo SỐ KỲ THỰC SỰ TRẢ GỐC — kỳ lẻ ngày (stub) và kỳ ân hạn không trả gốc
  const gocKy    = gocCung ?? Math.round(hd.soTienGiaiNgan / numKyTraGoc)

  let dunNo = hd.soTienGiaiNgan
  const rows: KyTraNo[] = []

  for (let i = 1; i <= numKy; i++) {
    const isStub   = coKyLeThuc && i === 1
    const isLastKy = i === numKy
    // Chỉ số kỳ thường (bỏ stub): kỳ thường đầu tiên = 1, kỳ ân hạn cuối = anHan
    const kyThuong = coKyLeThuc ? i - 1 : i  // vị trí trong dãy kỳ thường (0-based: stub)
    const isAnHan  = !isStub && kyThuong <= anHan
    const ngayTra: Date = isStub
      ? ankerDate
      : addMonths(coKyLeThuc ? ankerDate : ngayKy, coKyLeThuc ? (i - 1) * period : i * period)

    const lsNam = laiSuatChoKy(hd, ngayTra) / 100

    const laiTra = isStub
      // Kỳ lẻ ngày: lãi = dư nợ × lãi suất năm × (số ngày thực / 365)
      ? Math.round(dunNo * lsNam * (daysDiff(ngayKy, ngayTra) / 365))
      : (hd.phuongThuc === 'giam-dan'
          ? Math.round(dunNo * lsNam / kyPerYear)
          : Math.round(hd.soTienGiaiNgan * lsNam / kyPerYear))

    let gocTra: number
    if (isStub || isAnHan) {
      // Kỳ lẻ ngày hoặc kỳ ân hạn: CHỈ trả lãi, không thu gốc
      gocTra = 0
    } else if (hd.phuongThuc === 'cuoi-ky') {
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

// ── Lãi trả hàng tháng, gốc trả hàng quý ───────────────────
// Mỗi tháng đều có 1 row trong lịch:
//   - Tháng không trả gốc: gocTra = 0, chỉ có laiTra
//   - Tháng trả gốc (tháng 3, 6, 9…): gocTra > 0
//
// Kỳ lẻ ngày (nếu có ngayTraGocDauTien):
//   - Ngày-trong-tháng của ngayTraGocDauTien = ngày thu lãi CỐ ĐỊNH hàng tháng,
//     áp dụng cho cả kỳ lẻ đầu và MỌI kỳ lãi hàng tháng sau đó.
//   - Kỳ 0 (soKy=1, hiển thị "Kỳ 0: tính lãi"): từ ngayKy → ngày thu lãi cố định
//     gần nhất sau ngayKy. Chỉ tính lãi theo số ngày thực/365, KHÔNG thu gốc.
//   - Các kỳ sau neo theo đúng ngày cố định đó, đều đặn mỗi tháng.
//
// Số kỳ trả gốc: ưu tiên hd.soKyTraGoc (NH quy định, nhập tay). Nếu không có,
// fallback tự suy ra theo diffM (tương thích hợp đồng cũ chưa nhập field này).
function buildScheduleLaiThangGocQuy(
  hd: HopDongTinDung,
  diffM: number,
  todayD: Date,
): KyTraNo[] {
  const ngayKy = new Date(hd.ngayKy)

  const coKyLe = !!hd.ngayTraGocDauTien
  const ngayGocDauTien = coKyLe ? new Date(hd.ngayTraGocDauTien!) : null
  const ankerDay = coKyLe ? ngayGocDauTien!.getDate() : ngayKy.getDate()

  // ── Ngày thu lãi cố định hàng tháng đầu tiên (mốc neo cho mọi kỳ sau) ──
  // Case biên: nếu ngày-trong-tháng của mốc neo TRÙNG ĐÚNG ngày ký (VD ký 25/12,
  // ngày trả gốc đầu tiên cũng nhập 25/12) → KHÔNG có kỳ lẻ nào cả (0 ngày lãi lẻ),
  // vào thẳng chu kỳ tháng bình thường — không được đẩy sang tháng sau rồi tính
  // "kỳ lẻ" ảo gần 1 tháng (lỗi cũ khiến ngày bị lùi 1 tháng và lãi bị thổi phồng).
  let ankerDate: Date
  let coKyLeThuc = false
  if (coKyLe) {
    const candidate = new Date(ngayKy.getFullYear(), ngayKy.getMonth(), ankerDay)
    if (candidate.getTime() === ngayKy.getTime()) {
      // Trùng đúng ngày ký — không có kỳ lẻ, bắt đầu chu kỳ tháng bình thường từ ngày ký
      ankerDate = ngayKy
    } else if (candidate.getTime() < ngayKy.getTime()) {
      // Ngày neo trong tháng ký đã trôi qua trước ngày ký — kỳ lẻ kéo dài đến ngày neo tháng sau
      ankerDate = addMonths(candidate, 1)
      coKyLeThuc = true
    } else {
      // Ngày neo còn ở phía sau trong cùng tháng ký — kỳ lẻ ngắn, gọn trong tháng ký
      ankerDate = candidate
      coKyLeThuc = true
    }
  } else {
    ankerDate = ngayKy
  }

  // ── Số kỳ trả gốc: ưu tiên nhập tay ──
  const numKyGocTotal = hd.soKyTraGoc && hd.soKyTraGoc > 0
    ? hd.soKyTraGoc
    : Math.max(1, Math.floor(diffM / 3))
  // Ân hạn: số quý đầu không trả gốc (tính theo kỳ quý — mỗi 3 tháng là 1 kỳ)
  const anHanQuy   = hd.soKyAnHan && hd.soKyAnHan > 0 ? hd.soKyAnHan : 0
  const numKyGoc   = Math.max(1, numKyGocTotal - anHanQuy)   // số quý THỰC SỰ trả gốc
  const numThangSau = numKyGocTotal * 3   // tổng số kỳ lãi hàng tháng SAU kỳ lẻ (giữ nguyên = tổng thời hạn)

  const gocCung = hd.gocTraCoDinh && hd.gocTraCoDinh > 0 ? hd.gocTraCoDinh : null
  const gocQuy  = gocCung ?? Math.round(hd.soTienGiaiNgan / numKyGoc)

  let dunNo = hd.soTienGiaiNgan
  let kyGocDaTra = 0
  let soKy = 1
  const rows: KyTraNo[] = []

  // ── Kỳ 0: tính lãi (kỳ lẻ ngày) ──
  if (coKyLeThuc) {
    const soNgayLe = daysDiff(ngayKy, ankerDate)
    const lsNam    = laiSuatChoKy(hd, ankerDate) / 100
    const laiTra   = Math.round(dunNo * lsNam * (soNgayLe / 365))
    const dLeft    = daysDiff(todayD, ankerDate)
    const trangThai: KyTraNo['trangThai'] =
      dLeft < 0 ? 'qua-han' : dLeft <= 7 ? 'gan-han' : 'chua-tra'

    rows.push({
      id: `ky-${soKy}-${hd.id}`, hopDongId: hd.id, soKy,
      ngayTra: ankerDate.toISOString().slice(0, 10),
      dunNoDauKy: dunNo, gocTra: 0, laiTra, tongTra: laiTra,
      dunNoCuoiKy: dunNo, trangThai,
    })
    soKy++
  }

  for (let i = 1; i <= numThangSau; i++) {
    const ngayTra      = addMonths(ankerDate, i)
    const isLastThang  = i === numThangSau
    // Trả gốc khi là tháng thứ 3, 6, 9... trong dãy kỳ lãi (sau kỳ lẻ), hoặc tháng cuối
    const laThangTraGoc = (i % 3 === 0) || isLastThang
    const lsThang   = laiSuatChoKy(hd, ngayTra) / 100 / 12
    const laiTra    = Math.round(dunNo * lsThang)

    // soQuyHienTai: quý thứ mấy (đếm từ 1, mỗi 3 tháng = 1 quý)
    const soQuyHienTai = Math.ceil(i / 3)
    // Kỳ quý nằm trong ân hạn → chỉ trả lãi, không thu gốc
    const isAnHanQuy   = laThangTraGoc && soQuyHienTai <= anHanQuy

    let gocTra = 0
    if (laThangTraGoc && !isAnHanQuy) {
      kyGocDaTra++
      const isLastGoc = kyGocDaTra === numKyGoc || isLastThang
      gocTra = isLastGoc ? dunNo : Math.min(gocQuy, dunNo)
    }

    const dunNoCuoi = Math.max(0, dunNo - gocTra)
    const dLeft     = daysDiff(todayD, ngayTra)
    const trangThai: KyTraNo['trangThai'] =
      dLeft < 0 ? 'qua-han' : dLeft <= 7 ? 'gan-han' : 'chua-tra'

    rows.push({
      id: `ky-${soKy}-${hd.id}`, hopDongId: hd.id, soKy,
      ngayTra: ngayTra.toISOString().slice(0, 10),
      dunNoDauKy: dunNo, gocTra, laiTra, tongTra: gocTra + laiTra,
      dunNoCuoiKy: dunNoCuoi, trangThai,
    })

    dunNo = dunNoCuoi
    soKy++
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