// ============================================================
// KẾ HOẠCH VAY TỰ ĐỘNG — List ngân hàng (Hạn mức tín dụng) → Kế hoạch dòng tiền
//
// Lấy các kỳ CHƯA TRẢ có hạn trong tháng `thang`, tạo thành khoản kế hoạch
// (dongTienItems, loaiKhoan='ke-hoach', nguonTuDong='vay-hm') để tab
// "Kế hoạch dòng tiền" đọc như các khoản khác.
//
//   • Dài hạn  (KyTraNo, trangThai ≠ da-tra/co-cau) → CHI gốc + CHI lãi
//   • Ngắn hạn (KyThuNH, trangThai ≠ da-thu)         → CHI gốc + CHI lãi
//                                                      + THU vay đáo hạn = 95% gốc
//   • Không lấy giải ngân (THU-VAY từ giải ngân HĐ / rút vốn bộ hồ sơ)
//
// Doc id cố định `autovay_{thang}_{loại}_{id kỳ}` → bấm cập nhật nhiều lần không
// bị nhân đôi; kỳ đã trả / đã đổi thì dòng cũ tự bị xoá.
// ============================================================
import { collection, doc, getDocs, query, where, writeBatch } from 'firebase/firestore'
import { tasksDb, ensureTasksAuth } from '@/lib/firebase-tasks'
import { subscribeHopDong, subscribeAllKyTraNo } from '@/lib/han-muc-store'
import { subscribeHanMucNganHan, subscribeBoHoSo, subscribeAllKyThuNH } from '@/lib/han-muc-ngan-han-store'
import type { HopDongTinDung, KyTraNo } from '@/lib/han-muc-types'
import type { HanMucNganHan, BoHoSoGiaiNgan, KyThuNH } from '@/lib/han-muc-ngan-han-types'
import type { KhoanDongTien } from './dong-tien-types'

// ── Quy tắc đáo hạn ─────────────────────────────────────────
export const TY_LE_DAO_HAN = 0.95
/** 'goc' = 95% × gốc ngắn hạn đến hạn;  'tong' = 95% × (gốc + lãi) */
export const DAO_HAN_TREN: 'goc' | 'tong' = 'goc'

export type KeHoachVayLine = Omit<KhoanDongTien, 'createdAt' | 'updatedAt'>

const NHOM_BC_DN = '6. Trả ngân hàng: Gốc, lãi (doanh nghiệp)'
const NHOM_BC_CN = '6. Trả ngân hàng: Gốc, lãi (cá nhân)'
const NHOM_BC_THU = '8. Thu vay đáo hạn (ngân hàng)'

const KMCP_LABEL: Record<string, string> = {
  'THU-VAY':    'Thu từ vay/đáo hạn ngân hàng',
  'VAY-GOC-DN': 'Trả gốc vay doanh nghiệp',
  'VAY-LAI-DN': 'Trả lãi vay doanh nghiệp',
  'VAY-GOC-CN': 'Gốc vay cá nhân',
  'VAY-LAI-CN': 'Lãi vay cá nhân',
}
/** Các mã KMCP do hệ thống tự điền — form nhập tay phải ẩn đi */
export const KMCP_VAY_TU_DONG = Object.keys(KMCP_LABEL)

/** Mã pháp nhân trong mã KMCP chi tiết của bảng Nhập Data */
const ENT_CODE: Record<string, string> = { 'SAP': 'SAP', 'SAHS': 'SAHS', 'ĐTSA': 'SADT' }
/** Chuẩn hoá tên ngân hàng → mã viết tắt dùng trong KMCP (ACB, BIDV, HDB...) */
const bankCode = (s: string) => {
  const u = (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd')
    .toUpperCase().replace(/[^A-Z0-9]/g, '')
  return u === 'HDBANK' ? 'HDB' : u
}

/**
 * Vay CÁ NHÂN: bảng Nhập Data đặt mã theo TỪNG KHOẢN VAY = số hợp đồng + _Goc/_Lai
 * (VD hợp đồng "TPB_SON_2.500" → "TPB_SON_2.500_Lai"). Khi số hợp đồng trống → mã theo ngân hàng như cũ.
 * (Phía bảng còn so khớp "mềm" — không phân biệt hoa/thường, thứ tự, cách viết số — nên lệch nhẹ vẫn khớp.)
 */
function maKmcpCaNhan(soHopDong: string | undefined, loai: 'Goc' | 'Lai'): string | null {
  const so = (soHopDong ?? '').trim()
  return so ? `${so}_${loai}` : null
}

const trongThang = (iso: string | undefined, thang: string) => !!iso && iso.startsWith(thang)
const chiNhanhTxt = (nganHang: string, chiNhanh?: string) => chiNhanh ? `${nganHang}_${chiNhanh}` : nganHang

function lineChi(p: {
  thang: string; refId: string; entity: string; isCN: boolean; ngay: string
  goc: number; lai: number; nguon: string; doiTac: string; nhan: string
  hanh: 'NH' | 'DH'; nganHang: string; soHopDong?: string
}): KeHoachVayLine[] {
  const out: KeHoachVayLine[] = []
  const kind = p.goc > 0 && p.lai > 0 ? 'Trả Gốc + Lãi' : p.lai > 0 ? 'Trả Lãi' : 'Trả Gốc'
  const mk = (loai: 'goc' | 'lai', soTien: number): KeHoachVayLine => {
    const kmcp = p.isCN ? (loai === 'goc' ? 'VAY-GOC-CN' : 'VAY-LAI-CN') : (loai === 'goc' ? 'VAY-GOC-DN' : 'VAY-LAI-DN')
    return {
      id: `autovay_${p.thang}_${loai}_${p.refId}`,
      entity: p.entity, loai: 'chi', nhom: kmcp, ngayDuKien: p.ngay, soTien,
      moTa: `${loai === 'goc' ? 'Trả gốc' : 'Trả lãi'} ${p.nhan}`,
      loaiKhoan: 'ke-hoach', nhomCha: kmcp, nhomChaLabel: KMCP_LABEL[kmcp],
      nguonThanhToan: p.nguon, doiTac: p.doiTac,
      loaiGiaoDich: `Chi - ${p.entity} - ${kind}`,
      nhomBaoCao: p.isCN ? NHOM_BC_CN : NHOM_BC_DN,
      nguonTuDong: 'vay-hm', autoThang: p.thang,
      kmcpChiTiet: (p.isCN ? maKmcpCaNhan(p.soHopDong, loai === 'goc' ? 'Goc' : 'Lai') : null)
        ?? `${ENT_CODE[p.entity] ?? p.entity}_${p.hanh}_${bankCode(p.nganHang)}_${loai === 'goc' ? 'Goc' : 'Lai'}`,
    }
  }
  if (p.goc > 0) out.push(mk('goc', Math.round(p.goc)))
  if (p.lai > 0) out.push(mk('lai', Math.round(p.lai)))
  return out
}

/**
 * Subscribe danh sách khoản kế hoạch vay của tháng `thang` ('YYYY-MM').
 * Cấu trúc subscribe lồng nhau copy từ ngan-sach-vay-mapping.ts.
 */
export function subscribeKeHoachVay(thang: string, cb: (lines: KeHoachVayLine[]) => void): () => void {
  const state = {
    hopDongList: [] as HopDongTinDung[],
    kyTraNoList: [] as KyTraNo[],
    khungList:   [] as HanMucNganHan[],
    boHoSoMap:   {} as Record<string, BoHoSoGiaiNgan[]>,
    kyThuMap:    {} as Record<string, Record<string, KyThuNH[]>>,
  }

  function emit() {
    const lines: KeHoachVayLine[] = []
    const hdMap = new Map(state.hopDongList.map(h => [h.id, h]))

    // ── Dài hạn: kỳ chưa trả trong tháng ──
    state.kyTraNoList.forEach(ky => {
      if (ky.trangThai === 'da-tra' || ky.trangThai === 'co-cau') return
      if (!trongThang(ky.ngayTra, thang)) return
      const hd = hdMap.get(ky.hopDongId)
      if (!hd) return
      const nhan = hd.soBoHoSo ? hd.soBoHoSo : hd.soHopDong
      lines.push(...lineChi({
        thang, refId: ky.id, entity: hd.entity, isCN: hd.entity === 'Cá nhân', ngay: ky.ngayTra,
        goc: ky.gocTra, lai: ky.laiTra,
        nguon: `[HM] ${hd.soHopDong}`, doiTac: chiNhanhTxt(hd.nganHang, hd.chiNhanh),
        nhan: `${nhan} - ${hd.nganHang} (kỳ ${ky.soKy})`,
        hanh: 'DH', nganHang: hd.nganHang, soHopDong: hd.soHopDong,
      }))
    })

    // ── Ngắn hạn: kỳ thu chưa thu trong tháng (luôn nhánh DN) + đáo hạn 95% ──
    const daoHan = new Map<string, { hanMuc: HanMucNganHan; ngay: string; soTien: number; nguon: string; doiTac: string }>()
    state.khungList.forEach(hanMuc => {
      const boList = state.boHoSoMap[hanMuc.id] ?? []
      const byBo = state.kyThuMap[hanMuc.id] ?? {}
      boList.forEach(bo => {
        ;(byBo[bo.id] ?? []).forEach(ky => {
          if (ky.trangThai === 'da-thu') return
          if (!trongThang(ky.ngayThu, thang)) return
          const nguon = `[HM] ${hanMuc.soHopDong}`
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const doiTac = chiNhanhTxt(hanMuc.nganHang, (hanMuc as any).chiNhanh)
          const nhan = `bộ hồ sơ ${bo.soBoHoSo} - hạn mức ${hanMuc.soHopDong} (${hanMuc.nganHang}, kỳ ${ky.soKy})`
          const goc = ky.gocThu ?? 0, lai = ky.laiThu ?? 0
          lines.push(...lineChi({
            thang, refId: ky.id, entity: hanMuc.entity, isCN: false, ngay: ky.ngayThu,
            goc, lai, nguon, doiTac, nhan,
            hanh: 'NH', nganHang: hanMuc.nganHang,
          }))
          const co = Math.round((DAO_HAN_TREN === 'goc' ? goc : goc + lai) * TY_LE_DAO_HAN)
          if (co > 0) {
            // Gộp THU đáo hạn: 1 dòng / hạn mức / ngày (không tách từng bộ hồ sơ)
            const kg = `${hanMuc.id}|${ky.ngayThu}`
            const cur = daoHan.get(kg)
            if (cur) cur.soTien += co
            else daoHan.set(kg, { hanMuc, ngay: ky.ngayThu, soTien: co, nguon, doiTac })
          }
        })
      })
    })

    daoHan.forEach(d => lines.push({
      id: `autovay_${thang}_thu_${d.hanMuc.id}_${d.ngay}`,
      entity: d.hanMuc.entity, loai: 'thu', nhom: 'THU-VAY', ngayDuKien: d.ngay, soTien: d.soTien,
      moTa: `Thu vay đáo hạn - Hạn mức ${d.hanMuc.soHopDong}`,
      loaiKhoan: 'ke-hoach', nhomCha: 'THU-VAY', nhomChaLabel: KMCP_LABEL['THU-VAY'],
      doTinCay: 'du-kien',
      nguonThanhToan: d.nguon, doiTac: d.doiTac,
      loaiGiaoDich: `Thu - ${d.hanMuc.entity} - Vay đáo hạn`,
      nhomBaoCao: NHOM_BC_THU,
      nguonTuDong: 'vay-hm', autoThang: thang,
      // Tách theo công ty + ngân hàng → khớp dòng "Thu từ đáo hạn {NH} {CÔNG TY}" của bảng Nhập Data
      // VD hạn mức ACB của SAP → T_VNH_ACB_SAP,  ACB của SAHS → T_VNH_ACB_SAHS,  BIDV của SAP → T_VNH_BIDV_SAP
      kmcpChiTiet: `T_VNH_${bankCode(d.hanMuc.nganHang)}_${ENT_CODE[d.hanMuc.entity] ?? d.hanMuc.entity}`,
    }))

    lines.sort((a, b) => a.ngayDuKien.localeCompare(b.ngayDuKien) || a.id.localeCompare(b.id))
    cb(lines)
  }

  let unsubKyTraNo: () => void = () => {}
  const unsubHopDong = subscribeHopDong(hds => {
    state.hopDongList = hds
    const ids = hds.filter(h => h.loaiHD !== 'han-muc-khung').map(h => h.id)
    unsubKyTraNo()
    unsubKyTraNo = subscribeAllKyTraNo(ids, kys => { state.kyTraNoList = kys; emit() })
    emit()
  })

  const boSubs = new Map<string, () => void>()
  const kyThuSubs = new Map<string, () => void>()
  const unsubKhung = subscribeHanMucNganHan(khungList => {
    state.khungList = khungList
    const idsHienTai = new Set(khungList.map(k => k.id))
    Array.from(boSubs.keys()).forEach(id => {
      if (!idsHienTai.has(id)) {
        boSubs.get(id)?.(); boSubs.delete(id)
        kyThuSubs.get(id)?.(); kyThuSubs.delete(id)
        delete state.boHoSoMap[id]; delete state.kyThuMap[id]
      }
    })
    khungList.forEach(hanMuc => {
      if (boSubs.has(hanMuc.id)) return
      const unsubBo = subscribeBoHoSo(hanMuc.id, boList => {
        state.boHoSoMap[hanMuc.id] = boList
        kyThuSubs.get(hanMuc.id)?.()
        kyThuSubs.set(hanMuc.id, subscribeAllKyThuNH(hanMuc.id, boList.map(b => b.id), kyMap => {
          state.kyThuMap[hanMuc.id] = kyMap; emit()
        }))
        emit()
      })
      boSubs.set(hanMuc.id, unsubBo)
    })
    emit()
  })

  return () => {
    unsubHopDong(); unsubKyTraNo(); unsubKhung()
    boSubs.forEach(u => u()); kyThuSubs.forEach(u => u())
  }
}

/**
 * Ghi `lines` vào dongTienItems cho tháng `thang`: thêm/cập nhật các dòng mới,
 * xoá các dòng AUTO cũ của tháng không còn trong danh sách (kỳ đã trả…).
 * Khoản nhập tay / dòng AUTO của tháng khác không bị đụng tới.
 */
export async function capNhatKeHoachVay(thang: string, lines: KeHoachVayLine[]) {
  await ensureTasksAuth()
  const col = collection(tasksDb, 'dongTienItems')
  const cu = await getDocs(query(col, where('nguonTuDong', '==', 'vay-hm'), where('autoThang', '==', thang)))
  const moi = new Set(lines.map(l => l.id))
  const xoa = cu.docs.filter((d: any) => !moi.has(d.id))
  const now = Date.now()
  const daCo = new Map<string, KhoanDongTien>(cu.docs.map((d: any) => [d.id, d.data() as KhoanDongTien] as [string, KhoanDongTien]))

  const ops: ((b: ReturnType<typeof writeBatch>) => void)[] = []
  lines.forEach(l => {
    // Giữ lại phần người dùng đã quản trị (dời ngày, pending) — set() ghi đè cả doc nên phải đưa lại
    const e = daCo.get(l.id)
    const giu: Record<string, unknown> = {}
    if (e?.pending) { giu.pending = true; if (e.ngayPending) giu.ngayPending = e.ngayPending; if (e.lyDoPending) giu.lyDoPending = e.lyDoPending }
    // Chỉ giữ ngày đã dời khi lịch trả nợ gốc KHÔNG đổi; lịch gốc đổi → bỏ dời, theo lịch mới
    if (e?.lichSuDoiNgay?.length && e.ngayGoc === l.ngayDuKien) {
      giu.ngayDuKien = e.ngayDuKien; giu.ngayGoc = e.ngayGoc; giu.lichSuDoiNgay = e.lichSuDoiNgay
    }
    ops.push(b => b.set(doc(col, l.id), { ...l, ...giu, createdAt: e?.createdAt ?? now, updatedAt: now }))
  })
  xoa.forEach((d: any) => ops.push(b => b.delete(d.ref)))
  for (let i = 0; i < ops.length; i += 400) {
    const b = writeBatch(tasksDb)
    ops.slice(i, i + 400).forEach(f => f(b))
    await b.commit()
  }
  return { ghi: lines.length, xoa: xoa.length }
}
