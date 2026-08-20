// ============================================================
// ADAPTER — Đọc tự động dòng tiền từ module Hạn mức tín dụng
// (Phần 2). KHÔNG lưu DB riêng — chỉ transform runtime từ dữ
// liệu đã có sẵn ở han-muc-store.ts / han-muc-ngan-han-store.ts,
// để không bao giờ lệch số liệu khi hợp đồng gốc thay đổi.
//
// Nguồn:
//   • HopDongTinDung + KyTraNo        (vay dài hạn, kể cả bộ hồ sơ
//                                       con của hạn mức khung dài hạn)
//   • HanMucNganHan + BoHoSoGiaiNgan + KyThuNH  (hạn mức ngắn hạn)
// ============================================================
import { subscribeHopDong, subscribeAllKyTraNo } from '@/lib/han-muc-store'
import { subscribeHanMucNganHan, subscribeBoHoSo, subscribeAllKyThuNH, tinhKhaDung } from '@/lib/han-muc-ngan-han-store'
import type { HopDongTinDung, KyTraNo } from '@/lib/han-muc-types'
import type { HanMucNganHan, BoHoSoGiaiNgan, KyThuNH, KhaDungSnapshot } from '@/lib/han-muc-ngan-han-types'
import type { DongTienItem } from '@/lib/dong-tien-types'

// ─────────────────────────────────────────────────────────
// TRANSFORM — 1 bản ghi nguồn → 1 DongTienItem
// ─────────────────────────────────────────────────────────

/** Kỳ trả nợ (vay dài hạn / bộ hồ sơ con của khung dài hạn) → dòng CHI */
export function tuKyTraNoRaDongTien(ky: KyTraNo, hd: HopDongTinDung): DongTienItem {
  const daTra = ky.trangThai === 'da-tra'
  const nhan  = hd.soBoHoSo ? hd.soBoHoSo : hd.soHopDong
  return {
    id:        `hm-kytra-${ky.id}`,
    entity:    hd.entity,
    loai:      'chi',
    ngay:      daTra && ky.ngayThucTra ? ky.ngayThucTra : ky.ngayTra,
    soTien:    daTra && ky.soTienThucTra != null ? ky.soTienThucTra : ky.tongTra,
    nguon:     'kytra-no',
    nhom:      'tra-no',
    nhanNhan:  `Trả nợ ${nhan} - ${hd.nganHang} (kỳ ${ky.soKy})`,
    trangThai: daTra ? 'thuc-te' : 'du-kien',
    refId:     hd.id,
  }
}

/** Kỳ thu lãi/gốc (hạn mức ngắn hạn) → dòng CHI */
export function tuKyThuNHRaDongTien(ky: KyThuNH, bo: BoHoSoGiaiNgan, hanMuc: HanMucNganHan): DongTienItem {
  const daThu = ky.trangThai === 'da-thu'
  return {
    id:        `hm-kythu-${ky.id}`,
    entity:    hanMuc.entity,
    loai:      'chi',
    ngay:      daThu && ky.ngayThucThu ? ky.ngayThucThu : ky.ngayThu,
    soTien:    daThu && ky.tongThucThu != null ? ky.tongThucThu : ky.tongThu,
    nguon:     'kythu-nh',
    nhom:      'tra-no',
    nhanNhan:  `Trả nợ NH ngắn hạn ${bo.soBoHoSo} - ${hanMuc.nganHang} (kỳ ${ky.soKy})`,
    trangThai: daThu ? 'thuc-te' : 'du-kien',
    refId:     bo.id,
  }
}

/** Giải ngân hợp đồng dài hạn (bỏ qua bản thân HĐ khung — không giữ tiền trực tiếp) → dòng THU */
export function tuGiaiNganHopDongRaDongTien(hd: HopDongTinDung): DongTienItem | null {
  if (hd.loaiHD === 'han-muc-khung') return null
  if (!hd.soTienGiaiNgan || hd.soTienGiaiNgan <= 0) return null
  const nhan = hd.soBoHoSo ? hd.soBoHoSo : hd.soHopDong
  return {
    id:        `hm-giaingan-${hd.id}`,
    entity:    hd.entity,
    loai:      'thu',
    ngay:      hd.ngayKy,
    soTien:    hd.soTienGiaiNgan,
    nguon:     'giai-ngan',
    nhom:      'giai-ngan',
    nhanNhan:  `Giải ngân ${nhan} - ${hd.nganHang}`,
    trangThai: 'thuc-te',
    refId:     hd.id,
  }
}

/** Rút vốn từ hạn mức khung ngắn hạn (1 bộ hồ sơ) → dòng THU */
export function tuGiaiNganBoHoSoRaDongTien(bo: BoHoSoGiaiNgan, hanMuc: HanMucNganHan): DongTienItem {
  return {
    id:        `hm-boho-giaingan-${bo.id}`,
    entity:    hanMuc.entity,
    loai:      'thu',
    ngay:      bo.ngayGiaiNgan,
    soTien:    bo.soTienGiaiNgan,
    nguon:     'giai-ngan',
    nhom:      'giai-ngan',
    nhanNhan:  `Rút vốn ${bo.soBoHoSo} - hạn mức ${hanMuc.soHopDong} (${hanMuc.nganHang})`,
    trangThai: 'thuc-te',
    refId:     bo.id,
  }
}

// ─────────────────────────────────────────────────────────
// Kha dụng hạn mức khung ngắn hạn kèm entity — dùng cho Phần 5
// (gap analysis gợi ý "rút thêm hạn mức nào") sau này.
// ─────────────────────────────────────────────────────────
export interface KhaDungHanMucNganHan extends KhaDungSnapshot {
  hanMucId:   string
  entity:     string
  soHopDong:  string
  nganHang:   string
  trangThai:  HanMucNganHan['trangThai']
}

// ─────────────────────────────────────────────────────────
// SUBSCRIBE TỔNG HỢP — gộp cả 2 nguồn, tự quản lý toàn bộ
// subscription lồng nhau (hạn mức → bộ hồ sơ → kỳ thu) và
// gọi lại callback mỗi khi bất kỳ tầng nào thay đổi.
// ─────────────────────────────────────────────────────────
export interface DongTienHanMucData {
  items:       DongTienItem[]
  khaDungList: KhaDungHanMucNganHan[]
}

export function subscribeDongTienTuHanMuc(
  cb: (data: DongTienHanMucData) => void,
  entityFilter?: string,
): () => void {
  // ── state dùng chung, cập nhật dần theo từng tầng subscribe ──
  const state = {
    hopDongList:  [] as HopDongTinDung[],
    kyTraNoList:  [] as KyTraNo[],
    khungList:    [] as HanMucNganHan[],
    boHoSoMap:    {} as Record<string, BoHoSoGiaiNgan[]>,          // hanMucId → bộ hồ sơ
    kyThuMap:     {} as Record<string, Record<string, KyThuNH[]>>, // hanMucId → boId → kỳ thu
    traGocMap:    {} as Record<string, number>,                    // hanMucId → tổng trả giữa kỳ (bỏ qua ở Phần 2, dùng ở Phần 5)
  }

  function emit() {
    const hdMap = new Map(state.hopDongList.map(h => [h.id, h]))
    const items: DongTienItem[] = []

    // 1) Dòng CHI: kỳ trả nợ dài hạn (kể cả bộ hồ sơ con của khung dài hạn)
    state.kyTraNoList.forEach(ky => {
      const hd = hdMap.get(ky.hopDongId)
      if (hd) items.push(tuKyTraNoRaDongTien(ky, hd))
    })

    // 2) Dòng THU: giải ngân hợp đồng dài hạn
    state.hopDongList.forEach(hd => {
      const item = tuGiaiNganHopDongRaDongTien(hd)
      if (item) items.push(item)
    })

    // 3) Dòng CHI + THU: hạn mức ngắn hạn
    const khungMap = new Map(state.khungList.map(k => [k.id, k]))
    Object.entries(state.boHoSoMap).forEach(([hanMucId, boList]) => {
      const hanMuc = khungMap.get(hanMucId)
      if (!hanMuc) return
      boList.forEach(bo => {
        items.push(tuGiaiNganBoHoSoRaDongTien(bo, hanMuc))
        const kyList = state.kyThuMap[hanMucId]?.[bo.id] ?? []
        kyList.forEach(ky => items.push(tuKyThuNHRaDongTien(ky, bo, hanMuc)))
      })
    })

    // 4) Khả dụng từng hạn mức khung ngắn hạn (chuẩn bị cho Phần 5)
    const khaDungList: KhaDungHanMucNganHan[] = state.khungList.map(hanMuc => {
      const boList   = state.boHoSoMap[hanMuc.id] ?? []
      const kyThuMap = state.kyThuMap[hanMuc.id] ?? {}
      const snap     = tinhKhaDung(hanMuc, boList, kyThuMap, [])
      return { ...snap, hanMucId: hanMuc.id, entity: hanMuc.entity, soHopDong: hanMuc.soHopDong, nganHang: hanMuc.nganHang, trangThai: hanMuc.trangThai }
    })

    cb({ items, khaDungList })
  }

  // ── Tầng 1: hợp đồng dài hạn + lịch trả nợ ──────────────
  let unsubKyTraNo: () => void = () => {}
  const unsubHopDong = subscribeHopDong(hds => {
    state.hopDongList = hds
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
