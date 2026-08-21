// ============================================================
// ENGINE ĐỐI CHIẾU — So khớp dòng "trả lãi/gốc" (và thu giải
// ngân ngắn hạn) thực tế trên sổ quỹ (data_quy) với lịch trả
// nợ dự kiến từ module Hạn mức tín dụng, để phát hiện lệch số /
// lệch ngày.
//
// ⚠️ VIẾT LẠI (so bản nháp cũ) — MATCH TRỰC TIẾP THEO MÃ NGÂN
// SÁCH thay vì đoán theo entity+ngân hàng+kỳ hạn+ngày ±15.
//   Bản cũ: so `v.entity === hd.entity && v.nganHang === hd.nganHang
//            && v.loaiKhoan === loaiKhoan` rồi mới lọc theo ngày gần
//            nhất — dễ khớp NHẦM khi 2 hợp đồng khác nhau trùng
//            entity + ngân hàng (VD 2 HĐ SAP vay cùng Agribank).
//   Bản mới: so thẳng chuỗi "Mã ngân sách" trên Sheet với đúng
//            `hopDong.maNganSachLai` / `.maNganSachGoc` (hoặc
//            `khung.maNganSachLai/Goc/Thu` cho ngắn hạn) — mỗi mã
//            CHỈ ứng với đúng 1 hợp đồng/khung, không thể lẫn.
//            Ngày ±15 chỉ còn dùng để chọn ĐÚNG KỲ (kỳ nào trong
//            số nhiều kỳ của cùng 1 hợp đồng), không còn dùng để
//            đoán xem dòng Sheet thuộc hợp đồng nào nữa.
//
// Do dùng chung `parseMaNganSach()` ở tầng adapter, các dòng vay
// Nhánh B (Cá nhân) và pattern lịch sử tự do (NV_/Ngoai_/TTD_)
// giờ cũng được nhận diện đúng là "vay" (xem dong-tien-quy-adapter.ts)
// — engine này xử lý luôn cả Nhánh B, còn pattern tự do (xacDinh=false)
// không match được hợp đồng nào nên rơi vào nhóm "khong-xac-dinh" để
// đại ca soát tay riêng (không tự động khớp).
// ============================================================
import { KyTraNo, HopDongTinDung } from '@/lib/han-muc-types'
import type { HanMucNganHan, BoHoSoGiaiNgan, KyThuNH } from '@/lib/han-muc-ngan-han-types'
import type { VayNganSachRow } from './dong-tien-quy-adapter'

export interface DoiChieuRow {
  key:            string
  kyHan:          'ngan-han' | 'dai-han'
  entity:         string
  nganHang:       string
  loaiKhoan:      'lai' | 'goc' | 'thu-giai-ngan'
  hopDongLabel:   string           // số HĐ / số bộ hồ sơ để đại ca nhận diện
  ngayKeHoach:    string
  soTienKeHoach:  number
  ngayThucTe?:    string
  soTienThucTe?:  number
  lech:           number           // soTienThucTe - soTienKeHoach (0 nếu chưa khớp được dòng nào)
  trangThai:      'khop' | 'lech' | 'chua-co-du-lieu-sheet' | 'sheet-du-thua' | 'khong-xac-dinh'
  // ref để gọi hàm đồng bộ:
  //   dài hạn (HopDongTinDung / KyTraNo)     → dùng kyId + hopDongId
  //   ngắn hạn (HanMucNganHan / BoHoSoGiaiNgan / KyThuNH) → dùng kyId + hanMucId + boHoSoId
  kyRef: { kyId: string; hopDongId?: string; hanMucId?: string; boHoSoId?: string }
  sheetRowRaw?:   any
}

/** Ngưỡng chọn kỳ khi 1 mã ngân sách có nhiều dòng Sheet theo thời gian
 *  (VD mã Lãi lặp lại mỗi tháng) — KHÔNG dùng để đoán hợp đồng nữa,
 *  chỉ dùng để chọn đúng kỳ trong số các kỳ của CÙNG 1 hợp đồng đã
 *  xác định chắc chắn qua mã. */
const DIFF_NGAY_TOI_DA = 15

function diffNgay(a: string, b: string): number {
  const da = new Date(a).getTime()
  const db = new Date(b).getTime()
  return Math.abs(da - db) / 86400000
}

/** Lấy chuỗi "Mã ngân sách" thô từ 1 dòng Sheet (đã parse ở adapter,
 *  nhưng cần lại chuỗi gốc để so khớp CHÍNH XÁC với field lưu trên HĐ). */
function maNganSachCuaRow(v: VayNganSachRow): string {
  return String(v.raw['Mã ngân sách'] ?? v.raw['Ma_ngan_sach'] ?? '').trim()
}

// ─────────────────────────────────────────────────────────────
// ĐỐI CHIẾU DÀI HẠN — hợp đồng thông thường (HopDongTinDung/KyTraNo),
// bất kể bản thân hợp đồng là ngắn hay dài hạn (đều dùng chung lịch
// KyTraNo qua han-muc-store.ts — khác với "hạn mức khung ngắn hạn"
// ở han-muc-ngan-han-store.ts, xử lý riêng ở doiChieuNganHan bên dưới).
//
// `daDung`: Set dùng CHUNG giữa doiChieuDaiHan + doiChieuNganHan (truyền
// vào từ doiChieuTatCa) để 1 dòng Sheet không bị 2 engine giành cùng lúc.
// ─────────────────────────────────────────────────────────────
export function doiChieuDaiHan(
  kyTraNoList:   KyTraNo[],
  hopDongMap:    Map<string, HopDongTinDung>,
  vayRows:       VayNganSachRow[],
  daDung:        Set<VayNganSachRow> = new Set(),
): DoiChieuRow[] {
  const result: DoiChieuRow[] = []

  const kyChuaXacNhan = kyTraNoList.filter(k => k.trangThai !== 'da-tra')

  kyChuaXacNhan.forEach(ky => {
    const hd = hopDongMap.get(ky.hopDongId)
    if (!hd) return
    const nhan = hd.soBoHoSo ? hd.soBoHoSo : hd.soHopDong

    ;(['lai', 'goc'] as const).forEach(loaiKhoan => {
      const soTienKH = loaiKhoan === 'lai' ? ky.laiTra : ky.gocTra
      if (!soTienKH) return

      const maCanTim = loaiKhoan === 'lai' ? hd.maNganSachLai : hd.maNganSachGoc

      // HĐ chưa có mã (VD chưa chạy migration, hoặc là 'han-muc-khung'
      // không sinh mã) → không thể đối chiếu tự động, báo thiếu dữ liệu
      // để đại ca biết cần migrate/bổ sung, KHÔNG cố đoán bằng entity/bank.
      if (!maCanTim) {
        result.push({
          key: `dh-${ky.id}-${loaiKhoan}`, kyHan: 'dai-han',
          entity: hd.entity, nganHang: hd.nganHang, loaiKhoan,
          hopDongLabel: `${nhan} (kỳ ${ky.soKy})`,
          ngayKeHoach: ky.ngayTra, soTienKeHoach: soTienKH,
          lech: 0, trangThai: 'chua-co-du-lieu-sheet',
          kyRef: { kyId: ky.id, hopDongId: hd.id },
        })
        return
      }

      const ungVien = vayRows.filter(v =>
        !daDung.has(v) &&
        maNganSachCuaRow(v) === maCanTim &&
        diffNgay(v.ngay, ky.ngayTra) <= DIFF_NGAY_TOI_DA,
      )
      // Nhiều dòng Sheet cùng mã (VD lặp hàng tháng) → chọn dòng gần
      // số tiền kế hoạch nhất trong số các dòng gần ngày nhất
      const chon = ungVien.sort((a, b) => Math.abs(a.soTien - soTienKH) - Math.abs(b.soTien - soTienKH))[0]
      if (chon) daDung.add(chon)

      result.push({
        key:           `dh-${ky.id}-${loaiKhoan}`,
        kyHan:         'dai-han',
        entity:        hd.entity,
        nganHang:      hd.nganHang,
        loaiKhoan,
        hopDongLabel:  `${nhan} (kỳ ${ky.soKy})`,
        ngayKeHoach:   ky.ngayTra,
        soTienKeHoach: soTienKH,
        ngayThucTe:    chon?.ngay,
        soTienThucTe:  chon?.soTien,
        lech:          chon ? chon.soTien - soTienKH : 0,
        trangThai:     !chon ? 'chua-co-du-lieu-sheet' : Math.abs(chon.soTien - soTienKH) < 1000 ? 'khop' : 'lech',
        kyRef:         { kyId: ky.id, hopDongId: hd.id },
        sheetRowRaw:   chon?.raw,
      })
    })
  })

  return result.sort((a, b) => (a.ngayKeHoach || a.ngayThucTe || '').localeCompare(b.ngayKeHoach || b.ngayThucTe || ''))
}

// ─────────────────────────────────────────────────────────────
// ĐỐI CHIẾU NGẮN HẠN — hạn mức khung (HanMucNganHan/BoHoSoGiaiNgan/KyThuNH).
//
// ⚠️ Lưu ý quan trọng: mã ngân sách Lãi/Gốc/Thu được gắn ở CẤP KHUNG
// (theo entity+nganHang), KHÔNG phải ở cấp từng bộ hồ sơ — vì nhiều bộ
// hồ sơ con của cùng 1 khung chia sẻ chung 1 mã. Do đó khi so khớp, ta
// gom TẤT CẢ kỳ thu (của mọi bộ hồ sơ thuộc khung đó) lại làm 1 nhóm
// ứng viên, rồi mới chọn theo ngày/số tiền gần nhất — không thể biết
// chắc chắn dòng Sheet thuộc bộ hồ sơ nào nếu khung có ≥2 bộ hồ sơ
// đang chạy song song cùng lúc (hạn chế cố hữu của cách Sheet ghi mã,
// đã ghi trong log — không phải lỗi code).
// ─────────────────────────────────────────────────────────────
export function doiChieuNganHan(
  kyThuList:   KyThuNH[],
  boHoSoMap:   Map<string, BoHoSoGiaiNgan>,
  khungMap:    Map<string, HanMucNganHan>,
  vayRows:     VayNganSachRow[],
  daDung:      Set<VayNganSachRow> = new Set(),
): DoiChieuRow[] {
  const result: DoiChieuRow[] = []

  const kyChuaXacNhan = kyThuList.filter(k => k.trangThai !== 'da-thu')

  kyChuaXacNhan.forEach(ky => {
    const bo    = boHoSoMap.get(ky.boHoSoId)
    const khung = bo ? khungMap.get(bo.hanMucId) : undefined
    if (!bo || !khung) return
    const nhan = bo.soBoHoSo

    ;(['lai', 'goc'] as const).forEach(loaiKhoan => {
      const soTienKH = loaiKhoan === 'lai' ? ky.laiThu : ky.gocThu
      if (!soTienKH) return

      const maCanTim = loaiKhoan === 'lai' ? khung.maNganSachLai : khung.maNganSachGoc
      if (!maCanTim) {
        result.push({
          key: `nh-${ky.id}-${loaiKhoan}`, kyHan: 'ngan-han',
          entity: khung.entity, nganHang: khung.nganHang, loaiKhoan,
          hopDongLabel: `${nhan} (kỳ ${ky.soKy})`,
          ngayKeHoach: ky.ngayThu, soTienKeHoach: soTienKH,
          lech: 0, trangThai: 'chua-co-du-lieu-sheet',
          kyRef: { kyId: ky.id, hanMucId: khung.id, boHoSoId: bo.id },
        })
        return
      }

      // Gom ứng viên theo mã CỦA CẢ KHUNG (không tách theo bộ hồ sơ —
      // xem lưu ý ở đầu hàm) rồi chọn gần ngày/số tiền nhất
      const ungVien = vayRows.filter(v =>
        !daDung.has(v) &&
        maNganSachCuaRow(v) === maCanTim &&
        diffNgay(v.ngay, ky.ngayThu) <= DIFF_NGAY_TOI_DA,
      )
      const chon = ungVien.sort((a, b) => Math.abs(a.soTien - soTienKH) - Math.abs(b.soTien - soTienKH))[0]
      if (chon) daDung.add(chon)

      result.push({
        key:           `nh-${ky.id}-${loaiKhoan}`,
        kyHan:         'ngan-han',
        entity:        khung.entity,
        nganHang:      khung.nganHang,
        loaiKhoan,
        hopDongLabel:  `${nhan} (kỳ ${ky.soKy})`,
        ngayKeHoach:   ky.ngayThu,
        soTienKeHoach: soTienKH,
        ngayThucTe:    chon?.ngay,
        soTienThucTe:  chon?.soTien,
        lech:          chon ? chon.soTien - soTienKH : 0,
        trangThai:     !chon ? 'chua-co-du-lieu-sheet' : Math.abs(chon.soTien - soTienKH) < 1000 ? 'khop' : 'lech',
        kyRef:         { kyId: ky.id, hanMucId: khung.id, boHoSoId: bo.id },
        sheetRowRaw:   chon?.raw,
      })
    })
  })

  // ── Mã Thu (giải ngân/đáo hạn ngắn hạn) — chỉ đối chiếu SỰ TỒN TẠI,
  // chưa khớp từng bộ hồ sơ cụ thể (cần dữ liệu ngày rút vốn thực tế
  // từng bộ hồ sơ để làm chính xác hơn — xem TODO cuối file). Hiện tại
  // liệt kê các dòng Sheet có mã Thu khớp 1 khung đang theo dõi, để đại
  // ca biết có phát sinh giải ngân/đáo hạn mới trên Sheet chưa được tạo
  // bộ hồ sơ tương ứng trong hệ thống.
  khungMap.forEach(khung => {
    if (!khung.maNganSachThu) return
    const rows = vayRows.filter(v => !daDung.has(v) && maNganSachCuaRow(v) === khung.maNganSachThu)
    rows.forEach(v => {
      daDung.add(v)
      result.push({
        key: `nh-thu-${khung.id}-${v.ngay}-${v.soTien}`,
        kyHan: 'ngan-han', entity: khung.entity, nganHang: khung.nganHang,
        loaiKhoan: 'thu-giai-ngan',
        hopDongLabel: `${khung.soHopDong} (mã Thu — chưa gắn bộ hồ sơ cụ thể)`,
        ngayKeHoach: '', soTienKeHoach: 0,
        ngayThucTe: v.ngay, soTienThucTe: v.soTien, lech: v.soTien,
        trangThai: 'chua-co-du-lieu-sheet',
        kyRef: { kyId: '', hanMucId: khung.id },
        sheetRowRaw: v.raw,
      })
    })
  })

  return result.sort((a, b) => (a.ngayKeHoach || a.ngayThucTe || '').localeCompare(b.ngayKeHoach || b.ngayThucTe || ''))
}

// ─────────────────────────────────────────────────────────────
// HÀM TỔNG HỢP — chạy cả 2 engine với 1 Set `daDung` DÙNG CHUNG,
// rồi tính phần dư thừa THẬT SỰ (không dòng nào trong 2 engine dùng tới).
// Đây là hàm nên gọi từ UI Phần 5 thay vì gọi riêng lẻ từng engine.
// ─────────────────────────────────────────────────────────────
export function doiChieuTatCa(params: {
  kyTraNoList:  KyTraNo[]
  hopDongMap:   Map<string, HopDongTinDung>
  kyThuList:    KyThuNH[]
  boHoSoMap:    Map<string, BoHoSoGiaiNgan>
  khungMap:     Map<string, HanMucNganHan>
  vayRows:      VayNganSachRow[]
}): DoiChieuRow[] {
  const daDung = new Set<VayNganSachRow>()

  const daiHan  = doiChieuDaiHan(params.kyTraNoList, params.hopDongMap, params.vayRows, daDung)
  const nganHan = doiChieuNganHan(params.kyThuList, params.boHoSoMap, params.khungMap, params.vayRows, daDung)

  // Dòng Sheet dư thừa thật sự — không khớp được kỳ/mã nào ở cả 2 engine.
  // `parsed.xacDinh === false` (pattern lịch sử NV_/Ngoai_/TTD_) → nhóm
  // riêng 'khong-xac-dinh' vì không tự động khớp được, đại ca soát tay.
  const duThua: DoiChieuRow[] = params.vayRows
    .filter(v => !daDung.has(v))
    .map(v => {
      const p = v.parsed
      const label = p.nhanh === 'ca-nhan' && p.nguoiVay ? p.nguoiVay : (p.entity ?? '(?)')
      return {
        key:           `du-thua-${v.ngay}-${maNganSachCuaRow(v)}-${v.soTien}`,
        kyHan:         (p.kyHan ?? 'dai-han') as 'ngan-han' | 'dai-han',
        entity:        label,
        nganHang:      p.nganHang,
        loaiKhoan:     p.loaiKhoan === 'thu-giai-ngan' ? 'thu-giai-ngan' : p.loaiKhoan === 'goc' ? 'goc' : 'lai',
        hopDongLabel:  p.xacDinh ? '(không rõ kỳ — có thể trả sớm/ngoài lịch)' : '(mã lịch sử tự do — cần soát tay)',
        ngayKeHoach:   '',
        soTienKeHoach: 0,
        ngayThucTe:    v.ngay,
        soTienThucTe:  v.soTien,
        lech:          v.soTien,
        trangThai:     (p.xacDinh ? 'sheet-du-thua' : 'khong-xac-dinh') as DoiChieuRow['trangThai'],
        kyRef:         { kyId: '' },
        sheetRowRaw:   v.raw,
      }
    })

  return [...daiHan, ...nganHan, ...duThua]
    .sort((a, b) => (a.ngayKeHoach || a.ngayThucTe || '').localeCompare(b.ngayKeHoach || b.ngayThucTe || ''))
}

// ─────────────────────────────────────────────────────────────
// TODO (bước sau, cần thêm dữ liệu):
//   Khớp CHÍNH XÁC mã Thu (giải ngân ngắn hạn) với từng BoHoSoGiaiNgan
//   cụ thể (hiện chỉ liệt kê theo khung, xem đoạn "Mã Thu" ở trên) —
//   cần so ngày giải ngân thực tế (bo.ngayGiaiNgan) + số tiền
//   (bo.soTienGiaiNgan) với dòng Sheet mã Thu, tương tự cách đối
//   chiếu lãi/gốc phía trên.
// ─────────────────────────────────────────────────────────────