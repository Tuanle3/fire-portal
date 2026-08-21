// ============================================================
// MÃ NGÂN SÁCH — công thức sinh/parse DÙNG CHUNG giữa module
// Hạn mức tín dụng (gắn mã khi lưu hợp đồng) và Sổ quỹ thực tế
// (data_quy) — Phần 5 đối chiếu.
//
// 2 NHÁNH CÔNG THỨC (xác nhận từ Sheet thật của đại ca):
//
// NHÁNH A — Pháp nhân DOANH NGHIỆP (SAP/SAHS/ĐTSA/YANA/Sao Việt)
// vay trực tiếp từ ngân hàng:
//   Lãi/Gốc:  {ENTITY}_{NH|DH}_{BANK}_{Lai|Goc}
//   Thu:      T_VNH_{BANK}_{ENTITY}   (chỉ ngắn hạn — dài hạn
//             KHÔNG cần mã vì giải ngân cập nhật trực tiếp từ
//             hợp đồng, không qua Sheet đối chiếu)
//
// NHÁNH B — Pháp nhân "Cá nhân" đứng tên vay hộ (mỗi hợp đồng
// là 1 khoản riêng biệt, không gộp theo entity+bank như DN vì
// 1 người có thể vay nhiều khoản cùng lúc cùng ngân hàng):
//   Lãi/Gốc:  {NguoiVay}_{BANK}_{SoTienTy}_{Lai|Goc}
//   VD hợp đồng Vũ vay BIDV 4.5 tỷ → Vu_BIDV_4.5_Goc
//
// ⚠️ Các mã lịch sử dạng NV_{BANK}_{ngày}  (vay nhân viên) hoặc
// Ngoai_{ENTITY}_{TenNguoiChoVay} (DN vay ngoài NH) có pattern
// tự do, KHÔNG tự sinh khớp được — đối chiếu engine sẽ đánh dấu
// "không xác định", đại ca soát tay riêng.
// ============================================================

export type KyHanVay      = 'ngan-han' | 'dai-han'
export type LoaiKhoanVay  = 'lai' | 'goc' | 'thu-giai-ngan'
export type NhanhMa       = 'doanh-nghiep' | 'ca-nhan'

// ── Token entity DOANH NGHIỆP — đã xác nhận từ Sheet thật ──
// SADT (không phải DTSA) — xác nhận qua ảnh Data_Quỹ thực tế.
// YANA / SaoViet: CHƯA có khoản vay nào trên Sheet — token do Bi Nô
// đặt trước theo đúng quy luật, đại ca dùng đúng token này khi
// phát sinh khoản vay đầu tiên để Sheet khớp ngay từ đầu.
const ENTITY_TOKEN: Record<string, string> = {
  'SAP':      'SAP',
  'SAHS':     'SAHS',
  'ĐTSA':     'SADT',      // ⚠️ xác nhận thật — KHÔNG phải "DTSA"
  'YANA':     'YANA',      // chưa có ví dụ Sheet — token đặt trước
  'Sao Việt': 'SaoViet',   // chưa có ví dụ Sheet — token đặt trước
}
const ENTITY_TOKEN_REVERSE: Record<string, string> =
  Object.fromEntries(Object.entries(ENTITY_TOKEN).map(([k, v]) => [v, k]))

export function slugEntity(entity: string): string {
  return ENTITY_TOKEN[entity] ?? entity
}
export function unslugEntity(token: string): string {
  return ENTITY_TOKEN_REVERSE[token] ?? token
}

// ── Viết tắt ngân hàng — theo mã liên ngân hàng phổ biến tại VN.
// Các ngân hàng đã lưu sẵn dạng ngắn trong dropdown (ACB, BIDV, VIB,
// MSB, OCB, SHB, NCB...) không cần map — giữ nguyên. Chỉ map các
// tên đầy đủ. ⚠️ Chỉ "Vietinbank → VTB" đã được đại ca xác nhận khớp
// Sheet thật; các dòng còn lại theo quy ước phổ biến — đại ca kiểm
// tra lại khi phát sinh khoản vay đầu tiên ở ngân hàng đó, báo bi nô
// nếu Sheet ghi khác để sửa lại.
const BANK_TOKEN: Record<string, string> = {
  'Agribank':      'AGR',
  'Vietcombank':   'VCB',
  'Vietinbank':    'VTB',   // ⚠️ đã xác nhận đúng
  'MB Bank':       'MB',
  'Techcombank':   'TCB',
  'VPBank':        'VPB',
  'Sacombank':     'STB',
  'HDBank':        'HDB',
  'TPBank':        'TPB',
  'SeABank':       'SEAB',
  'LPBank':        'LPB',
  'Eximbank':      'EIB',
  'Nam A Bank':    'NAB',
  'ABBank':        'ABB',
  'BacABank':      'BAB',
  'BaoViet Bank':  'BVB',
  'CBBank':        'CBB',
  'PGBank':        'PGB',
  'VietBank':      'VBB',
  'VietABank':     'VAB',
  'KienlongBank':  'KLB',
  'Vikki Bank':    'VIKKI',
}

export function slugBank(nganHang: string): string {
  return BANK_TOKEN[nganHang] ?? nganHang.replace(/\s+/g, '')
}

/** Slug tên người vay — bỏ dấu, bỏ khoảng trắng, giữ nguyên chữ hoa đầu
 *  (khớp cách Sheet ghi: "Vũ"→"Vu", "Sơn"→"Son", "Trang"→"Trang") */
export function slugNguoiVay(ten: string): string {
  const sach = ten.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd')
  return sach.split(/\s+/).pop() || sach // lấy từ cuối cùng (tên gọi, bỏ họ) — VD "Nguyễn Khắc Vũ" → "Vu"
}

/** Số tiền vay → hậu tố "tỷ" gọn (4.5, 0.7, 6.725...) khớp cách Sheet ghi */
function soTienThanhTy(soTien: number): string {
  const ty = soTien / 1_000_000_000
  // Bỏ số 0 thừa cuối: 4.500 → "4.5", 6.725 → "6.725", 0.700 → "0.7"
  return ty.toFixed(3).replace(/\.?0+$/, '')
}

// ── NHÁNH A: Doanh nghiệp vay trực tiếp NH ──────────────────
export function taoMaDoanhNghiep(
  entity: string, kyHan: KyHanVay, nganHang: string, loaiKhoan: 'lai' | 'goc',
): string {
  const kh = kyHan === 'ngan-han' ? 'NH' : 'DH'
  const lg = loaiKhoan === 'lai' ? 'Lai' : 'Goc'
  return `${slugEntity(entity)}_${kh}_${slugBank(nganHang)}_${lg}`
}
export function taoMaThuDoanhNghiep(entity: string, nganHang: string): string {
  // Chỉ áp dụng ngắn hạn — dài hạn không cần mã thu (xem ghi chú đầu file)
  return `T_VNH_${slugBank(nganHang)}_${slugEntity(entity)}`
}

// ── NHÁNH B: Cá nhân đứng tên vay ────────────────────────────
export interface KetQuaMaCaNhan {
  ok: boolean
  ma?: { lai: string; goc: string }
  canhBao?: string   // lý do không sinh được — hiển thị cho đại ca biết cần bổ sung
}

/** Sinh mã cho khoản vay đứng tên Cá nhân — CẦN nguoiVay + soTienGiaiNgan hợp lệ */
export function taoMaCaNhan(
  nguoiVay: string | undefined,
  nganHang: string,
  soTienGiaiNgan: number,
): KetQuaMaCaNhan {
  if (!nguoiVay || !nguoiVay.trim()) {
    return { ok: false, canhBao: 'Chưa nhập "Người vay" — không tự sinh được mã ngân sách, đối chiếu Sổ quỹ sẽ bỏ qua khoản này.' }
  }
  if (!soTienGiaiNgan || soTienGiaiNgan <= 0) {
    return { ok: false, canhBao: 'Chưa có số tiền giải ngân — không tính được mã ngân sách.' }
  }
  const nguoi = slugNguoiVay(nguoiVay)
  const bank  = slugBank(nganHang)
  const ty    = soTienThanhTy(soTienGiaiNgan)
  return {
    ok: true,
    ma: {
      lai: `${nguoi}_${bank}_${ty}_Lai`,
      goc: `${nguoi}_${bank}_${ty}_Goc`,
    },
  }
}

// ── BỘ MÃ TỔNG HỢP — dùng khi lưu hợp đồng/hạn mức ──────────
export interface BoMaNganSach {
  maNganSachLai?: string
  maNganSachGoc?: string
  maNganSachThu?: string
  canhBaoMa?: string   // set khi nhánh Cá nhân thiếu dữ liệu để sinh mã
}

export function taoBoMaNganSach(
  entity: string, kyHan: KyHanVay, nganHang: string,
  opts?: { nguoiVay?: string; soTienGiaiNgan?: number },
): BoMaNganSach {
  const nhanh: NhanhMa = entity === 'Cá nhân' ? 'ca-nhan' : 'doanh-nghiep'

  if (nhanh === 'ca-nhan') {
    const kq = taoMaCaNhan(opts?.nguoiVay, nganHang, opts?.soTienGiaiNgan ?? 0)
    if (!kq.ok) return { canhBaoMa: kq.canhBao }
    return { maNganSachLai: kq.ma!.lai, maNganSachGoc: kq.ma!.goc } // Cá nhân không sinh mã Thu
  }

  return {
    maNganSachLai: taoMaDoanhNghiep(entity, kyHan, nganHang, 'lai'),
    maNganSachGoc: taoMaDoanhNghiep(entity, kyHan, nganHang, 'goc'),
    ...(kyHan === 'ngan-han' ? { maNganSachThu: taoMaThuDoanhNghiep(entity, nganHang) } : {}),
  }
}

// ── PARSE ngược — dùng khi đọc data_quy để phân loại + chống trùng ──
export interface MaNganSachParsed {
  nhanh:      NhanhMa
  entity?:    string    // unslug — chỉ có ở nhánh doanh nghiệp
  entityToken?: string
  nguoiVay?:  string    // slug gốc — chỉ có ở nhánh cá nhân
  nganHang:   string
  kyHan?:     KyHanVay  // không xác định được ở 1 số case cá nhân cũ
  loaiKhoan:  LoaiKhoanVay
  xacDinh:    boolean   // false nếu rơi vào pattern lịch sử tự do (NV_/Ngoai_...)
}

export function parseMaNganSach(ma: string): MaNganSachParsed | null {
  if (!ma) return null
  const parts = ma.split('_')

  // T_VNH_{BANK}_{ENTITY}
  if (parts.length === 4 && parts[0] === 'T' && parts[1] === 'VNH') {
    return {
      nhanh: 'doanh-nghiep', entityToken: parts[3], entity: unslugEntity(parts[3]),
      nganHang: parts[2], kyHan: 'ngan-han', loaiKhoan: 'thu-giai-ngan', xacDinh: true,
    }
  }

  // {ENTITY}_{NH|DH}_{BANK}_{Lai|Goc} — entity phải là token DN đã biết
  if (parts.length === 4 && (parts[1] === 'NH' || parts[1] === 'DH') && (parts[3] === 'Lai' || parts[3] === 'Goc')
      && ENTITY_TOKEN_REVERSE[parts[0]]) {
    return {
      nhanh: 'doanh-nghiep', entityToken: parts[0], entity: unslugEntity(parts[0]),
      nganHang: parts[2], kyHan: parts[1] === 'NH' ? 'ngan-han' : 'dai-han',
      loaiKhoan: parts[3] === 'Lai' ? 'lai' : 'goc', xacDinh: true,
    }
  }

  // {NguoiVay}_{BANK}_{SoTien}_{Lai|Goc} — nhánh Cá nhân (số ở giữa phải parse được là số)
  if (parts.length === 4 && (parts[3] === 'Lai' || parts[3] === 'Goc') && !isNaN(Number(parts[2]))) {
    return {
      nhanh: 'ca-nhan', nguoiVay: parts[0], nganHang: parts[1],
      loaiKhoan: parts[3] === 'Lai' ? 'lai' : 'goc', xacDinh: true,
    }
  }

  // Pattern lịch sử tự do: NV_..., Ngoai_..., TTD_... — nhận diện là "liên quan vay"
  // nhưng KHÔNG map được cụ thể → đối chiếu engine loại khỏi tổng chính (an toàn,
  // tránh đếm trùng) nhưng đánh dấu xacDinh=false để hiện cảnh báo riêng.
  if (/^(NV|Ngoai|TTD)_/.test(ma)) {
    return { nhanh: 'ca-nhan', nganHang: '', loaiKhoan: 'lai', xacDinh: false }
  }

  return null
}