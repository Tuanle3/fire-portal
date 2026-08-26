// ============================================================
// ADAPTER — Tự động tính cột "Kế hoạch" cho 5 dòng KMCP vay ngân
// hàng trong module Ngân sách (nay là Test Dòng tiền), lấy từ
// LỊCH TRẢ NỢ / GIẢI NGÂN của module Hạn mức tín dụng — cùng
// tinh thần "Thực hiện" đã tự động lấy từ sổ quỹ (kmcpActual).
//
// 5 mã KMCP tương ứng (khai báo ở DEFAULT_ITEMS — ngan-sach-types.ts):
//   THU-VAY      — Thu từ vay/đáo hạn ngân hàng          (Section B)
//   VAY-GOC-DN   — Trả gốc vay NH, pháp nhân Doanh nghiệp (Section C)
//   VAY-LAI-DN   — Trả lãi vay NH, pháp nhân Doanh nghiệp (Section C)
//   VAY-GOC-CN   — Trả gốc vay, Cá nhân đứng tên vay hộ   (Section C)
//   VAY-LAI-CN   — Trả lãi vay, Cá nhân đứng tên vay hộ   (Section C)
//
// Quy tắc DN/CN: theo `entity` của hợp đồng/hạn mức gốc — entity ===
// 'Cá nhân' → nhánh CN, còn lại → nhánh DN. Hạn mức ngắn hạn
// (HanMucNganHan) LUÔN là DN (xem ghi chú han-muc-ngan-han-types.ts —
// "HanMucNganHan luôn là pháp nhân DN"), nên toàn bộ kỳ thu ngắn hạn
// cộng vào VAY-GOC-DN / VAY-LAI-DN.
//
// ⚠️ Vay Cá nhân KHÔNG có mã Thu riêng trong sổ quỹ thực tế (xem
// ma-ngan-sach.ts — "Cá nhân không sinh mã Thu"), nên phần giải ngân
// Cá nhân gộp ở đây chỉ có ý nghĩa KẾ HOẠCH (dự kiến rút) — cột Thực
// hiện tương ứng (buildVayActual trong ngan-sach-mapping.ts) sẽ không
// có số khớp tự động cho phần này, đại ca cần đối chiếu thủ công.
//
// Cấu trúc subscribe lồng nhau copy nguyên từ dong-tien-hanmuc-adapter.ts
// (đã chứng minh đúng) — chỉ đổi phần emit() để gom theo THÁNG + mã KMCP
// thay vì phát ra DongTienItem[] phẳng.
// ============================================================
import { subscribeHopDong, subscribeAllKyTraNo } from '@/lib/han-muc-store'
import { subscribeHanMucNganHan, subscribeBoHoSo, subscribeAllKyThuNH } from '@/lib/han-muc-ngan-han-store'
import type { HopDongTinDung, KyTraNo } from '@/lib/han-muc-types'
import type { HanMucNganHan, BoHoSoGiaiNgan, KyThuNH } from '@/lib/han-muc-ngan-han-types'
import { findKey } from '@/lib/ngan-sach-mapping'
import { parseMaNganSach } from '@/lib/ma-ngan-sach'

export const VAY_KMCP = {
  THU:    'THU-VAY',
  GOC_DN: 'VAY-GOC-DN',
  LAI_DN: 'VAY-LAI-DN',
  GOC_CN: 'VAY-GOC-CN',
  LAI_CN: 'VAY-LAI-CN',
} as const

function trongThang(iso: string | undefined, thang: string): boolean {
  return !!iso && iso.startsWith(thang)
}

/**
 * Subscribe map "Kế hoạch tự động" cho 5 mã KMCP vay, theo đúng tháng `thang`
 * ('YYYY-MM') đang chọn ở topbar. Gọi lại `cb` mỗi khi bất kỳ tầng dữ liệu
 * hạn mức nào thay đổi (giống các adapter khác trong module Hạn mức).
 */
export function subscribeKmcpPlanned(
  thang: string,
  cb: (kmcpPlanned: Record<string, number>) => void,
): () => void {
  const state = {
    hopDongList: [] as HopDongTinDung[],
    kyTraNoList: [] as KyTraNo[],
    khungList:   [] as HanMucNganHan[],
    boHoSoMap:   {} as Record<string, BoHoSoGiaiNgan[]>,           // hanMucId → bộ hồ sơ
    kyThuMap:    {} as Record<string, Record<string, KyThuNH[]>>, // hanMucId → boId → kỳ thu
  }

  function emit() {
    const hdMap = new Map(state.hopDongList.map(h => [h.id, h]))
    const result: Record<string, number> = {}
    const add = (kmcp: string, val: number | undefined) => {
      if (!val) return
      result[kmcp] = (result[kmcp] ?? 0) + val
    }

    // ── Dài hạn: kỳ trả nợ (gốc/lãi theo kế hoạch, KHÔNG lấy số thực trả) ──
    state.kyTraNoList.forEach(ky => {
      if (!trongThang(ky.ngayTra, thang)) return
      const hd = hdMap.get(ky.hopDongId)
      if (!hd) return
      const isCN = hd.entity === 'Cá nhân'
      add(isCN ? VAY_KMCP.GOC_CN : VAY_KMCP.GOC_DN, ky.gocTra)
      add(isCN ? VAY_KMCP.LAI_CN : VAY_KMCP.LAI_DN, ky.laiTra)
    })

    // ── Dài hạn: giải ngân (bỏ qua bản thân HĐ khung — không giữ tiền trực tiếp) ──
    state.hopDongList.forEach(hd => {
      if (hd.loaiHD === 'han-muc-khung') return
      if (!trongThang(hd.ngayKy, thang)) return
      add(VAY_KMCP.THU, hd.soTienGiaiNgan)
    })

    // ── Ngắn hạn: rút vốn từng bộ hồ sơ (Thu) + kỳ thu gốc/lãi (Chi, luôn DN) ──
    Object.values(state.boHoSoMap).forEach(boList => {
      boList.forEach(bo => {
        if (trongThang(bo.ngayGiaiNgan, thang)) add(VAY_KMCP.THU, bo.soTienGiaiNgan)
      })
    })
    Object.values(state.kyThuMap).forEach(byBo => {
      Object.values(byBo).forEach(kyList => {
        kyList.forEach(ky => {
          if (!trongThang(ky.ngayThu, thang)) return
          add(VAY_KMCP.GOC_DN, ky.gocThu)
          add(VAY_KMCP.LAI_DN, ky.laiThu)
        })
      })
    })

    cb(result)
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
  })

  // ── Tầng 2: hạn mức ngắn hạn → bộ hồ sơ → kỳ thu ────────
  const boSubs    = new Map<string, () => void>()
  const kyThuSubs = new Map<string, () => void>()
  const unsubKhung = subscribeHanMucNganHan(khungList => {
    state.khungList = khungList
    const idsHienTai = new Set(khungList.map(k => k.id))
    Array.from(boSubs.keys()).forEach(id => {
      if (!idsHienTai.has(id)) {
        boSubs.get(id)?.(); boSubs.delete(id)
        kyThuSubs.get(id)?.(); kyThuSubs.delete(id)
        delete state.boHoSoMap[id]
        delete state.kyThuMap[id]
      }
    })
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
// Thực hiện riêng cho 5 dòng vay NH (gộp vào kmcpActual ở page.tsx)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildVayActual(rows: any[], month: string): Record<string, number> {
  const result: Record<string, number> = {}
  const maNSKey = findKey(rows, 'mangansach')
  const loaiKey = findKey(rows, 'loai')

  for (const r of rows) {
    const ngay = String(r['Ngày'] ?? r['Ngay'] ?? '')
    if (!ngay.startsWith(month)) continue
    if (loaiKey) {
      const loai = String(r[loaiKey] ?? '').trim()
      if (loai && loai !== 'Thực tế') continue
    }
    const maNS = maNSKey ? String(r[maNSKey] ?? '').trim() : ''
    if (!maNS) continue
    const parsed = parseMaNganSach(maNS)
    if (!parsed) continue

    const ps = Number(r['Số_tiền_PS'] ?? r['So_tien_PS'] ?? 0)
    let kmcp: string
    if (!parsed.xacDinh) {
      kmcp = 'VAY-KHAC'
    } else if (parsed.loaiKhoan === 'thu-giai-ngan') {
      kmcp = 'THU-VAY'
    } else if (parsed.nhanh === 'ca-nhan') {
      kmcp = parsed.loaiKhoan === 'lai' ? 'VAY-LAI-CN' : 'VAY-GOC-CN'
    } else {
      kmcp = parsed.loaiKhoan === 'lai' ? 'VAY-LAI-DN' : 'VAY-GOC-DN'
    }
    result[kmcp] = (result[kmcp] ?? 0) + Math.abs(ps)
  }

  return result
}