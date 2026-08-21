// ============================================================
// ADAPTER — Gom dữ liệu THÔ (không transform) từ module Hạn mức
// tín dụng (dài hạn + ngắn hạn) để đưa vào engine đối chiếu
// (dong-tien-doi-chieu-engine.ts).
//
// Khác với dong-tien-hanmuc-adapter.ts (transform ra DongTienItem
// phẳng cho Phần 3/4 — mất id gốc): adapter này GIỮ NGUYÊN object
// gốc (HopDongTinDung, KyTraNo, HanMucNganHan, BoHoSoGiaiNgan,
// KyThuNH) vì doiChieuTatCa() cần tra cứu theo id để build
// `kyRef` — và UI cần lại đúng các object đó để gọi
// markKyDaTraThucTe() / markKyThuDaThu() (2 hàm này nhận object
// đầy đủ, không chỉ id — xem chữ ký thật trong han-muc-store.ts /
// han-muc-ngan-han-store.ts).
//
// Cấu trúc subscribe lồng nhau copy nguyên từ
// dong-tien-hanmuc-adapter.ts (đã chứng minh đúng), chỉ đổi phần
// emit() để KHÔNG transform mà giữ nguyên object + gom vào Map.
// ============================================================
import { subscribeHopDong, subscribeAllKyTraNo } from '@/lib/han-muc-store'
import { subscribeHanMucNganHan, subscribeBoHoSo, subscribeAllKyThuNH } from '@/lib/han-muc-ngan-han-store'
import type { HopDongTinDung, KyTraNo } from '@/lib/han-muc-types'
import type { HanMucNganHan, BoHoSoGiaiNgan, KyThuNH } from '@/lib/han-muc-ngan-han-types'

export interface DoiChieuNguonData {
  hopDongMap:  Map<string, HopDongTinDung>   // key = hopDongId — cho đối chiếu dài hạn
  kyTraNoList: KyTraNo[]                     // toàn bộ kỳ trả nợ dài hạn (mọi hợp đồng, kể cả bộ hồ sơ con của khung dài hạn)
  khungMap:    Map<string, HanMucNganHan>    // key = hanMucId — cho đối chiếu ngắn hạn
  boHoSoMap:   Map<string, BoHoSoGiaiNgan>   // key = boHoSoId (KHÔNG phải hanMucId — engine cần tra theo boHoSoId)
  kyThuList:   KyThuNH[]                     // toàn bộ kỳ thu ngắn hạn (mọi bộ hồ sơ)
  dangTai:     boolean                       // true cho tới lần emit đầu tiên
}

export function subscribeDoiChieuNguonData(
  cb: (data: DoiChieuNguonData) => void,
  entityFilter?: string,
): () => void {
  const state = {
    hopDongList: [] as HopDongTinDung[],
    kyTraNoList: [] as KyTraNo[],
    khungList:   [] as HanMucNganHan[],
    boHoSoMap:   {} as Record<string, BoHoSoGiaiNgan[]>,           // hanMucId → bộ hồ sơ
    kyThuMap:    {} as Record<string, Record<string, KyThuNH[]>>, // hanMucId → boId → kỳ thu
    daNhanHopDong: false,
    daNhanKhung:   false,
  }

  function emit() {
    const hopDongMap = new Map(state.hopDongList.map(h => [h.id, h]))
    const khungMap    = new Map(state.khungList.map(k => [k.id, k]))

    // Gom boHoSoMap (key = boHoSoId) + kyThuList phẳng từ 2 tầng state lồng nhau
    const boHoSoMap = new Map<string, BoHoSoGiaiNgan>()
    const kyThuList: KyThuNH[] = []
    Object.entries(state.boHoSoMap).forEach(([hanMucId, boList]) => {
      boList.forEach(bo => {
        boHoSoMap.set(bo.id, bo)
        const kyList = state.kyThuMap[hanMucId]?.[bo.id] ?? []
        kyThuList.push(...kyList)
      })
    })

    cb({
      hopDongMap,
      kyTraNoList: state.kyTraNoList,
      khungMap,
      boHoSoMap,
      kyThuList,
      dangTai: !(state.daNhanHopDong && state.daNhanKhung),
    })
  }

  // ── Tầng 1: hợp đồng dài hạn + lịch trả nợ (giống dong-tien-hanmuc-adapter) ──
  let unsubKyTraNo: () => void = () => {}
  const unsubHopDong = subscribeHopDong(hds => {
    state.hopDongList = hds
    state.daNhanHopDong = true
    const idsCanhTinhChi = hds.filter(h => h.loaiHD !== 'han-muc-khung').map(h => h.id)
    unsubKyTraNo()
    unsubKyTraNo = subscribeAllKyTraNo(idsCanhTinhChi, kys => {
      state.kyTraNoList = kys
      emit()
    })
    emit()
  }, entityFilter)

  // ── Tầng 2: hạn mức ngắn hạn → bộ hồ sơ → kỳ thu ────────
  const boSubs    = new Map<string, () => void>()
  const kyThuSubs = new Map<string, () => void>()

  const unsubKhung = subscribeHanMucNganHan(khungListGoc => {
    const khungList = entityFilter && entityFilter !== 'all'
      ? khungListGoc.filter(k => k.entity === entityFilter)
      : khungListGoc
    state.khungList = khungList
    state.daNhanKhung = true

    const idsHienTai = new Set(khungList.map(k => k.id))
    // dọn subscription của hạn mức đã bị xoá/lọc ra
    Array.from(boSubs.keys()).forEach(id => {
      if (!idsHienTai.has(id)) {
        boSubs.get(id)?.(); boSubs.delete(id)
        kyThuSubs.get(id)?.(); kyThuSubs.delete(id)
        delete state.boHoSoMap[id]
        delete state.kyThuMap[id]
      }
    })
    // mở subscription cho hạn mức mới xuất hiện
    khungList.forEach(hanMuc => {
      if (boSubs.has(hanMuc.id)) return
      const unsubBo = subscribeBoHoSo(hanMuc.id, boList => {
        state.boHoSoMap[hanMuc.id] = boList
        const boIds = boList.map(b => b.id)
        kyThuSubs.get(hanMuc.id)?.()
        const unsubKy = subscribeAllKyThuNH(hanMuc.id, boIds, kyMap => {
          state.kyThuMap[hanMuc.id] = kyMap
          emit()
        })
        kyThuSubs.set(hanMuc.id, unsubKy)
        emit()
      })
      boSubs.set(hanMuc.id, unsubBo)
    })
    emit()
  })

  return () => {
    unsubHopDong()
    unsubKyTraNo()
    unsubKhung()
    boSubs.forEach(u => u())
    kyThuSubs.forEach(u => u())
  }
}
