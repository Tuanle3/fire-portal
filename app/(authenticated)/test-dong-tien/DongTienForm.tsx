// ============================================================
// FORM — Nhập tay khoản thu/chi dòng tiền (Phần 1 + Bước B)
// Thêm trường loaiKhoan (Kế hoạch / Thực hiện) + nhomCha (nhóm cha)
// để link được khi đối chiếu ở Bước C.
// Dùng đúng bộ class CSS hệ thống fire-portal — không Tailwind.
// ============================================================
'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  KhoanDongTien, LoaiDongTien, NhomDongTien, DoTinCay, ChuKyLap, LoaiKhoan,
  NHOM_THEO_LOAI, NHOM_LABEL, DO_TIN_CAY_LABEL,
} from '@/lib/dong-tien-types'
import { saveKhoanDongTien, doiTenTruongKhoan } from '@/lib/dong-tien-store'
import { subscribeNhomTuyChinh, themNhomTuyChinh, NhomTuyChinh } from '@/lib/dong-tien-nhom-store'
import GoiYChon from './GoiYChon'
import type { EntityType } from '@/lib/han-muc-types'
// ── Bridge Kế hoạch: khi loaiKhoan='ke-hoach', dropdown "Nhóm/KMCP" phải
//    dùng đúng mã KMCP cũ (DT-CG, CP-BH, VAY-GOC-DN...) — KHÔNG dùng
//    NhomDongTien enum (cho-goi, sap, goc-vay-dn...) vì 2 bộ mã khác nhau
//    hoàn toàn, và kmcpActual/kmcpPlanned đối chiếu sổ quỹ theo mã KMCP cũ. ──
import { DEFAULT_ITEMS } from '@/lib/ngan-sach-types'

const ENTITIES: EntityType[] = ['SAP', 'SAHS', 'ĐTSA', 'YANA', 'Sao Việt', 'Cá nhân']
const NHOM_MOI = '__nhom_moi__'

// ── Gợi ý cho 4 trường của Tab "Kế hoạch dòng tiền" (lấy từ file template).
//    Vẫn cho gõ giá trị mới — chỉ là datalist gợi ý. ──
const GOI_Y_NGUON: string[] = [
  "NOXH -Quỹ - LD Sơn An",
  "Quỹ - SAHS",
  "Quỹ - SAP",
  "Quỹ - YANA",
  "Quỹ - ĐTSA",
  "Quỹ chung - SAG",
  "[HM mới] AGR_DAI_2.800",
  "[HM mới] AGR_SAP_6.400",
  "[HM mới] BIDV_DUONG_1.600",
  "[HM] ACB_SAHS_3.800",
  "[HM] ACB_SAP_13.000",
  "[HM] ACB_SHS_3.800",
  "[HM] BIDV_SAP_13.000",
]
const GOI_Y_NHOM_BC: string[] = [
  "1. Thu từ chợ Gôi",
  "2. Chi trả nhà thầu: NOXH Nguyễn Trãi",
  "3. Thu từ Đô Thị Sơn An",
  "6. Thu khác",
  "6. Trả ngân hàng: Gốc, lãi (cá nhân)",
  "6. Trả ngân hàng: Gốc, lãi (doanh nghiệp)",
  "8. Thu vay đáo hạn (ngân hàng)",
  "9. Lãi vay cá nhân",
  "9. Thu vay mới (hạn mức mới)",
  "11. CPHĐ - Lương & các khoản theo lương",
  "12. CPHĐ - Hành chính",
  "14. CPHĐ - Thuế, phí, lệ phí",
  "18. Chi khác",
]
const GOI_Y_LOAI_GD: string[] = [
  "Chi - Cá nhân - Chuyển mục đích SDĐ",
  "Chi - Cá nhân - Trả Gốc + Lãi",
  "Chi - SAG - Dự trù",
  "Chi - SAG - Lương & các khoản theo lương",
  "Chi - SAG - TT tiền điện",
  "Chi - SAG - Trả gốc lãi thẻ tín dụng",
  "Chi - SAG - Trả gốc lãi vay ngoài",
  "Chi - SAG - Trả tiền mượn",
  "Chi - SAHS - TT tiền điện",
  "Chi - SAHS - Thuế và các khoản phải nộp",
  "Chi - SAHS - Tiền nước NPC",
  "Chi - SAHS - Trả Gốc + Lãi",
  "Chi - SAHS - Trả Lãi",
  "Chi - SAP - Rút tiền mặt nhập quỹ",
  "Chi - SAP - Trả Gốc + Lãi",
  "Chi - SAP - Trả Lãi",
  "Chi - Yana - Lương & các khoản theo lương",
  "Chi - ĐTSA - TT tiền điện",
  "Chi - ĐTSA - Tiền thuê mặt bằng",
  "Chi - ĐTSA - Trả Gốc + Lãi",
  "Chi - ĐTSA - Trả gốc lãi vay ngoài",
  "NOXH - SAHS - Hạng mục",
  "NOXH - SAHS - Phí bảo lãnh",
  "NOXH - SAHS - Tiền thuê nhà",
  "NOXH - SAP thi công",
  "Thu - Cá nhân - Vay hạn mức mới",
  "Thu - SAG - Rút tiền nhập quỹ",
  "Thu - SAHS - Tiền MB, điện, nước",
  "Thu - SAHS - Tiền cho thuê xe",
  "Thu - SAHS - Vay đáo hạn",
  "Thu - SAP - Vay hạn mức mới",
  "Thu - SAP - Vay đáo hạn",
  "Thu - ĐTSA - Tiền MB, điện, nước",
]
const VND = new Intl.NumberFormat('vi-VN')

// ── Danh sách mã KMCP cố định cũ, tách theo Thu (nhóm B)/Chi (nhóm C) —
//    đúng quy ước NganSachItem.nhom đang dùng ở TabGiaiPhap/TabTongHop.
//    Dùng làm option "Nhóm/KMCP" khi form ở chế độ Kế hoạch. ──────────
// Ẩn 5 mã vay NH (THU-VAY, VAY-GOC/LAI-DN/CN): hệ thống tự điền từ List ngân hàng, không nhập tay.
const KMCP_LABEL: Record<string, string> = Object.fromEntries(
  DEFAULT_ITEMS.filter(d => !d.is_section && !d.is_group && d.kmcp && (d.nhom === 'B' || d.nhom === 'C')).map(d => [d.kmcp as string, d.dien_giai]),
)
function parseSoTien(raw: string): number {
  return Number(raw.replace(/\D/g, '')) || 0
}

const emptyForm = (entityMacDinh?: EntityType) => ({
  entity:       entityMacDinh ?? 'SAP',
  loai:         'thu' as LoaiDongTien,
  loaiKhoan:    'thuc-hien' as LoaiKhoan,
  nhomCha:      NHOM_THEO_LOAI.thu[0] as string,  // nhóm cha = nhóm chính
  nhomChaLabel: NHOM_LABEL[NHOM_THEO_LOAI.thu[0]] ?? '',
  nhom:         NHOM_THEO_LOAI.thu[0] as NhomDongTien,
  ngayDuKien:   new Date().toISOString().slice(0, 10),
  soTien:       0,
  doTinCay:     'du-kien' as DoTinCay,
  moTa:         '',
  lap:          'mot-lan' as ChuKyLap,
  soKyLap:      1,
  ghiChu:       '',
  nguonThanhToan: '',
  doiTac:         '',
  loaiGiaoDich:   '',
  nhomBaoCao:     '',
})

// Nhóm THẬT của bảng Nhập Data (dòng "cả nhóm"). value = mã KMCP của nhóm, nhóm chưa có mã thì '@' + tên.
// con = mã KMCP các dòng con (để khoản cũ gắn vào dòng con tự quy về nhóm cha)
export interface NhomBang { value: string; label: string; ten: string; stt: string; loai: LoaiDongTien; nhomBC: string; con: string[] }

interface Props {
  editing?:       KhoanDongTien | null
  entityMacDinh?: EntityType
  // Các NHÓM thật của bảng Nhập Data — chế độ Kế hoạch chỉ cho chọn trong danh sách này
  // (không còn mã KMCP cũ). Muốn nhóm mới thì dùng onTaoNhom.
  bangNhom?:      NhomBang[]
  // Tạo nhóm mới NGAY trong bảng Nhập Data (có lưu luôn). Ném lỗi nếu trùng tên.
  onTaoNhom?:     (loai: LoaiDongTien, ten: string) => Promise<{ value: string; ten: string; nhomBC: string }>
  // Nhóm chưa có mã KMCP (value dạng '@Tên') → cấp mã cố định trong bảng, đổi mã các khoản cũ; trả về mã mới
  onCapMaNhom?:   (loai: LoaiDongTien, value: string) => Promise<string>
  loaiKhoanMacDinh?: LoaiKhoan   // Cho phép mở form sẵn ở chế độ KH hoặc TH
  khoaLoaiKhoan?:  boolean       // true = ẩn radio Kế hoạch/Thực hiện (ngữ cảnh đã rõ, VD mở từ Tab Kế hoạch)
  onSaved:        () => void
  onCancel:       () => void
}

export default function DongTienForm({ editing, entityMacDinh, bangNhom, onTaoNhom, onCapMaNhom, loaiKhoanMacDinh, khoaLoaiKhoan, onSaved, onCancel }: Props) {
  const [form,         setForm]         = useState(emptyForm(entityMacDinh))
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [nhomTuyChinh, setNhomTuyChinh] = useState<NhomTuyChinh[]>([])
  const [dangThemNhom, setDangThemNhom] = useState(false)
  const [tenNhomMoi,   setTenNhomMoi]   = useState('')
  const [luuNhomLoi,   setLuuNhomLoi]   = useState<string | null>(null)
  const [dangLuuNhom,  setDangLuuNhom]  = useState(false)
  const [canhBao,      setCanhBao]      = useState<string | null>(null)

  // Danh sách Nhóm/KMCP chế độ Kế hoạch: ưu tiên đúng dòng/nhóm đang có trong bảng Nhập Data
  // Chế độ Kế hoạch: CHỈ liệt kê nhóm thật của bảng (không còn mã KMCP cũ / nhóm tuỳ chỉnh cũ)
  const kmcpOpts = (loai: LoaiDongTien): { value: string; label: string }[] =>
    (bangNhom ?? []).filter(b => b.loai === loai).map(b => ({ value: b.value, label: b.label }))
  const kmcpTen = (value: string): string =>
    (bangNhom ?? []).find(b => b.value === value)?.ten ?? KMCP_LABEL[value] ?? value

  useEffect(() => {
    const unsub = subscribeNhomTuyChinh(setNhomTuyChinh)
    return () => unsub()
  }, [])

  useEffect(() => {
    if (editing) {
      const laKeHoach = (editing.loaiKhoan ?? 'thuc-hien') === 'ke-hoach'
      setForm({
        entity:       editing.entity,
        loai:         editing.loai,
        loaiKhoan:    editing.loaiKhoan ?? 'thuc-hien',
        nhomCha:      editing.nhomCha ?? editing.nhom,
        nhomChaLabel: editing.nhomChaLabel ?? (laKeHoach
          ? (KMCP_LABEL[editing.nhom as string] ?? editing.nhom)
          : (NHOM_LABEL[editing.nhom as NhomDongTien] ?? editing.nhom)),
        nhom:         editing.nhom as NhomDongTien,
        ngayDuKien:   editing.ngayDuKien,
        soTien:       editing.soTien,
        doTinCay:     editing.doTinCay ?? 'du-kien',
        moTa:         editing.moTa,
        lap:          'mot-lan',
        soKyLap:      1,
        ghiChu:       editing.ghiChu ?? '',
        nguonThanhToan: editing.nguonThanhToan ?? '',
        doiTac:         editing.doiTac ?? '',
        loaiGiaoDich:   editing.loaiGiaoDich ?? '',
        nhomBaoCao:     editing.nhomBaoCao ?? '',
      })
      // Khoản kế hoạch cũ: quy về nhóm thật của bảng — (1) đúng mã nhóm, (2) mã dòng con thuộc nhóm, (3) trùng tên "Nhóm (báo cáo)".
      // Không quy được (VD mã cũ THU-KD) → để trống, bắt chọn lại.
      setCanhBao(null)
      const ds = (bangNhom ?? []).filter(b => b.loai === editing.loai)
      if (laKeHoach && ds.length > 0) {
        const chuanTen = (v?: string) => (v ?? '').replace(/^\s*\d+\s*[.)]\s*/, '').normalize('NFC').trim().toLowerCase()
        const nhomCu = editing.nhom as string
        const hit = ds.find(b => b.value === nhomCu)
          ?? ds.find(b => b.con.includes(nhomCu))
          ?? (editing.nhomBaoCao ? ds.find(b => chuanTen(b.nhomBC) === chuanTen(editing.nhomBaoCao)) : undefined)
        if (hit) {
          setForm(f => ({ ...f, nhom: hit.value as NhomDongTien, nhomCha: hit.value, nhomChaLabel: hit.ten, nhomBaoCao: hit.nhomBC }))
        } else {
          setForm(f => ({ ...f, nhom: '' as NhomDongTien, nhomCha: '', nhomChaLabel: '' }))
          setCanhBao(`Khoản này đang mang mã cũ "${editing.nhom}" không thuộc nhóm nào trong bảng. Hãy chọn nhóm có sẵn hoặc tạo nhóm mới.`)
        }
      }
    } else {
      const base = emptyForm(entityMacDinh)
      if (loaiKhoanMacDinh) base.loaiKhoan = loaiKhoanMacDinh
      // Chế độ Kế hoạch: KHÔNG đoán nhóm mặc định — bắt buộc chọn nhóm có sẵn hoặc tạo mới
      if (loaiKhoanMacDinh === 'ke-hoach') {
        base.nhom = '' as NhomDongTien
        base.nhomCha = ''
        base.nhomChaLabel = ''
        base.nhomBaoCao = ''
      }
      setForm(base)
    }
    setDangThemNhom(false); setTenNhomMoi(''); setLuuNhomLoi(null)
  }, [editing, entityMacDinh, loaiKhoanMacDinh])

  const nhomOptions = useMemo(() => {
    // ── Chế độ KẾ HOẠCH: dùng mã KMCP cũ (DT-CG, CP-BH...) + custom, KHÔNG
    //    dùng NhomDongTien enum — xem ghi chú bridge ở đầu file. ──────────
    if (form.loaiKhoan === 'ke-hoach') return kmcpOpts(form.loai)
    const chuan = NHOM_THEO_LOAI[form.loai].map(v => ({ value: v, label: NHOM_LABEL[v] ?? v }))
    const tuy   = nhomTuyChinh.filter(n => n.loai === form.loai).map(n => ({ value: n.ten, label: n.ten }))
    const list  = [...chuan, ...tuy]
    if (form.nhom && !list.some(o => o.value === form.nhom))
      list.push({ value: form.nhom, label: `${NHOM_LABEL[form.nhom as NhomDongTien] ?? form.nhom} (cũ)` })
    return list
  }, [form.loai, form.nhom, form.loaiKhoan, nhomTuyChinh, bangNhom])

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  function chonLoaiKhoan(loaiKhoan: LoaiKhoan) {
    const laKeHoach = loaiKhoan === 'ke-hoach'
    const nhomMacDinh = laKeHoach ? '' : NHOM_THEO_LOAI[form.loai][0]
    setForm(f => ({
      ...f, loaiKhoan,
      nhom: nhomMacDinh as NhomDongTien,
      nhomCha: nhomMacDinh,
      nhomChaLabel: laKeHoach ? kmcpTen(nhomMacDinh) : (NHOM_LABEL[nhomMacDinh] ?? nhomMacDinh),
    }))
    setDangThemNhom(false)
  }

  function chonLoai(loai: LoaiDongTien) {
    const laKeHoach = form.loaiKhoan === 'ke-hoach'
    const nhomMacDinh = laKeHoach ? '' : NHOM_THEO_LOAI[loai][0]
    setForm(f => ({
      ...f, loai,
      nhom: nhomMacDinh as NhomDongTien,
      nhomCha: nhomMacDinh,
      nhomChaLabel: laKeHoach ? kmcpTen(nhomMacDinh) : (NHOM_LABEL[nhomMacDinh] ?? nhomMacDinh),
    }))
    setDangThemNhom(false)
  }

  function chonNhom(value: string) {
    if (value === NHOM_MOI) { setDangThemNhom(true); setTenNhomMoi(''); setLuuNhomLoi(null); return }
    const laKeHoach = form.loaiKhoan === 'ke-hoach'
    setCanhBao(null)
    setForm(f => {
      const b = laKeHoach ? (bangNhom ?? []).find(x => x.loai === f.loai && x.value === value) : undefined
      return {
        ...f,
        nhom: value as NhomDongTien,
        nhomCha: value,
        nhomChaLabel: laKeHoach ? kmcpTen(value) : (NHOM_LABEL[value as NhomDongTien] ?? value),
        nhomBaoCao: laKeHoach ? (b?.nhomBC ?? '') : f.nhomBaoCao,   // Nhóm (báo cáo) = chính nhóm đã chọn
      }
    })
  }

  async function luuNhomMoi() {
    setLuuNhomLoi(null)
    const ten = tenNhomMoi.trim()
    if (!ten) { setLuuNhomLoi('Vui lòng nhập tên nhóm.'); return }
    if (form.loaiKhoan === 'ke-hoach') {
      if (!onTaoNhom) { setLuuNhomLoi('Chức năng tạo nhóm chưa sẵn sàng ở màn hình này.'); return }
      setDangLuuNhom(true)
      try {
        const r = await onTaoNhom(form.loai, ten)
        setCanhBao(null)
        setForm(f => ({ ...f, nhom: r.value as NhomDongTien, nhomCha: r.value, nhomChaLabel: r.ten, nhomBaoCao: r.nhomBC }))
        setDangThemNhom(false); setTenNhomMoi('')
      } catch (err: any) {
        setLuuNhomLoi(err?.message ?? 'Có lỗi, thử lại.')
      } finally { setDangLuuNhom(false) }
      return
    }
    if (nhomOptions.some(o => o.label.toLowerCase() === ten.toLowerCase()))
      { setLuuNhomLoi('Nhóm này đã có, chọn lại trong danh sách.'); return }

    setDangLuuNhom(true)
    try {
      const tenDaLuu = await themNhomTuyChinh(form.loai, ten)
      setForm(f => ({ ...f, nhom: tenDaLuu as NhomDongTien, nhomCha: tenDaLuu, nhomChaLabel: tenDaLuu }))
      setDangThemNhom(false); setTenNhomMoi('')
    } catch (err: any) {
      setLuuNhomLoi(err?.message ?? 'Có lỗi, thử lại.')
    } finally { setDangLuuNhom(false) }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(null)
    if (editing?.nguonTuDong) { setError('Khoản này do hệ thống tự tạo từ List ngân hàng — không sửa tay. Dùng nút "Cập nhật kế hoạch vay" ở Tab Nhập Data.'); return }
    if (form.loaiKhoan === 'ke-hoach') {
      if (!form.nhom) { setError('Vui lòng chọn nhóm có sẵn hoặc tạo nhóm mới.'); return }
      if (!(bangNhom ?? []).some(b => b.loai === form.loai && b.value === (form.nhom as string))) {
        setError('Nhóm đã chọn không còn trong bảng. Hãy chọn lại nhóm.'); return
      }
    }
    if (!form.entity) { setError('Vui lòng chọn pháp nhân.'); return }
    if (!form.moTa.trim()) { setError('Vui lòng nhập mô tả khoản.'); return }
    if (!form.soTien || form.soTien <= 0) { setError('Số tiền phải lớn hơn 0.'); return }

    setSaving(true)
    try {
      // Nhóm chưa có mã → cấp mã cố định trước khi lưu, để sau này đổi tên nhóm khoản vẫn gắn đúng
      let nhomLuu = form.nhom as string
      let nhomChaLuu = form.nhomCha
      if (form.loaiKhoan === 'ke-hoach' && nhomLuu.startsWith('@') && onCapMaNhom) {
        nhomLuu = await onCapMaNhom(form.loai, nhomLuu)
        nhomChaLuu = nhomLuu
      }
      await saveKhoanDongTien(
        {
          entity: form.entity, loai: form.loai, nhom: nhomLuu as NhomDongTien,
          ngayDuKien: form.ngayDuKien, soTien: form.soTien,
          doTinCay: form.loai === 'thu' ? form.doTinCay : undefined,
          moTa: form.moTa.trim(), lap: form.lap,
          soKyLap: form.lap === 'mot-lan' ? undefined : form.soKyLap,
          ghiChu: form.ghiChu.trim() || undefined,
          // ── MỚI: loại khoản + nhóm cha ──
          loaiKhoan:    form.loaiKhoan,
          nhomCha:      nhomChaLuu,
          nhomChaLabel: form.nhomChaLabel,
          // ── MỚI: 4 trường cho Tab Kế hoạch dòng tiền (để trống = adapter tự suy ra) ──
          nguonThanhToan: form.nguonThanhToan.trim() || undefined,
          doiTac:         form.doiTac.trim() || undefined,
          loaiGiaoDich:   form.loaiGiaoDich.trim() || undefined,
          nhomBaoCao:     form.nhomBaoCao.trim() || undefined,
        },
        editing?.id,
      )
      onSaved()
    } catch (err: any) {
      setError(err?.message ?? 'Có lỗi khi lưu, thử lại.')
    } finally { setSaving(false) }
  }

  return (
    <div className="nh-card">
      <div className="nh-card-head">
        <span className="nh-card-title">
          {editing ? 'Sửa khoản dòng tiền' : form.loaiKhoan === 'ke-hoach' ? '📋 Thêm khoản KẾ HOẠCH' : '✏️ Thêm khoản THỰC HIỆN'}
        </span>
      </div>
      <div className="nh-card-body">
        <form onSubmit={handleSubmit}>

          {/* ── Kế hoạch hay Thực hiện ── */}
          {khoaLoaiKhoan ? (
            <div style={{ marginBottom: 10, fontSize: 12.5, fontWeight: 600, color: form.loaiKhoan === 'ke-hoach' ? 'var(--nh-navy)' : '#374151' }}>
              {form.loaiKhoan === 'ke-hoach' ? '📋 Khoản Kế hoạch' : '✏️ Khoản Thực hiện'}
            </div>
          ) : (
            <div className="nh-radio-row" style={{ marginBottom: 10 }}>
              <label>
                <input type="radio" name="loaiKhoan" checked={form.loaiKhoan === 'ke-hoach'}
                  onChange={() => chonLoaiKhoan('ke-hoach')} />
                <span style={{ color: 'var(--nh-navy)', fontWeight: 600 }}>📋 Kế hoạch</span>
              </label>
              <label>
                <input type="radio" name="loaiKhoan" checked={form.loaiKhoan === 'thuc-hien'}
                  onChange={() => chonLoaiKhoan('thuc-hien')} />
                <span>✏️ Thực hiện</span>
              </label>
            </div>
          )}

          {/* ── Thu / Chi ── */}
          <div className="nh-radio-row" style={{ marginBottom: 12 }}>
            <label>
              <input type="radio" name="loai" checked={form.loai === 'thu'} onChange={() => chonLoai('thu')} />
              <span style={{ color: form.loai === 'thu' ? 'var(--nh-green)' : undefined }}>Khoản THU</span>
            </label>
            <label>
              <input type="radio" name="loai" checked={form.loai === 'chi'} onChange={() => chonLoai('chi')} />
              <span style={{ color: form.loai === 'chi' ? 'var(--nh-red)' : undefined }}>Khoản CHI</span>
            </label>
          </div>

          <div className="nh-form-grid">
            <div>
              <label className="nh-label">Pháp nhân</label>
              <GoiYChon
                kieu="phapNhan" loai={form.loai}
                value={form.entity} onChange={v => set('entity', v as EntityType)}
                builtin={ENTITIES}
                giuThuTu chiSuaMucTuyChinh
                onDoiTen={(cu, moi) => doiTenTruongKhoan('entity', cu, moi)}
                emptyLabel="— Chọn pháp nhân —"
                moiLabel="➕ Thêm pháp nhân mới…"
                placeholderMoi="VD: Công ty CP ABC (tên ngắn dễ nhớ)"
              />
            </div>
            <div>
              <label className="nh-label">{form.loaiKhoan === 'ke-hoach' ? 'Nhóm' : 'Nhóm khoản mục'}</label>
              <select className="nh-select" value={form.nhom} onChange={e => chonNhom(e.target.value)}>
                {form.loaiKhoan === 'ke-hoach' && <option value="">— Chọn nhóm —</option>}
                {nhomOptions.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}
                <option value={NHOM_MOI}>{form.loaiKhoan === 'ke-hoach' ? '➕ Tạo nhóm mới…' : '+ Thêm nhóm mới…'}</option>
              </select>
              {canhBao && <div className="nh-err" style={{ marginTop: 4 }}>{canhBao}</div>}
            </div>
            <div>
              <label className="nh-label">Ngày {form.loaiKhoan === 'ke-hoach' ? 'kế hoạch' : 'dự kiến'}</label>
              <input type="date" className="nh-input" value={form.ngayDuKien} onChange={e => set('ngayDuKien', e.target.value)} />
            </div>
            <div>
              <label className="nh-label">Số tiền (VNĐ)</label>
              <input
                type="text" inputMode="numeric" className="nh-input"
                value={form.soTien ? VND.format(form.soTien) : ''} placeholder="0"
                onChange={e => set('soTien', parseSoTien(e.target.value))}
              />
            </div>
          </div>

          {dangThemNhom && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '4px 0 10px', background: '#F8FAFC', border: '1px solid var(--nh-border)', borderRadius: 8, padding: 10 }}>
              <input type="text" className="nh-input" style={{ flex: 1 }}
                placeholder={form.loaiKhoan === 'ke-hoach'
                  ? `Tên nhóm ${form.loai === 'thu' ? 'thu' : 'chi'} mới... (VD: Thu từ OBE)`
                  : `Tên nhóm ${form.loai === 'thu' ? 'thu' : 'chi'} mới...`}
                value={tenNhomMoi} onChange={e => setTenNhomMoi(e.target.value)} autoFocus />
              <button type="button" className="btn-save" disabled={dangLuuNhom} onClick={luuNhomMoi}>
                {dangLuuNhom ? 'Đang lưu...' : 'Lưu nhóm'}
              </button>
              <button type="button" className="btn-ghost" onClick={() => setDangThemNhom(false)}>Huỷ</button>
            </div>
          )}
          {luuNhomLoi && <div className="nh-err" style={{ marginBottom: 10 }}>{luuNhomLoi}</div>}

          {form.loai === 'thu' && (
            <div style={{ marginBottom: 10 }}>
              <label className="nh-label">Độ tin cậy</label>
              <div className="nh-radio-row">
                {(Object.keys(DO_TIN_CAY_LABEL) as DoTinCay[]).map(d => (
                  <label key={d}>
                    <input type="radio" name="doTinCay" checked={form.doTinCay === d} onChange={() => set('doTinCay', d)} />
                    {DO_TIN_CAY_LABEL[d]}
                  </label>
                ))}
              </div>
            </div>
          )}

          {form.loaiKhoan === 'ke-hoach' && (
            <div className="nh-form-grid" style={{ marginBottom: 10 }}>
              <div>
                <label className="nh-label">Nguồn thanh toán</label>
                <GoiYChon
                  kieu="nguonThanhToan" loai={form.loai}
                  value={form.nguonThanhToan} onChange={v => set('nguonThanhToan', v)}
                  builtin={GOI_Y_NGUON}
                  onDoiTen={(cu, moi) => doiTenTruongKhoan('nguonThanhToan', cu, moi)}
                  emptyLabel={`— Để trống = Quỹ - ${form.entity} —`}
                  moiLabel="➕ Thêm nguồn thanh toán mới…"
                  placeholderMoi="VD: [HM mới] ACB_ABC_5.000 hoặc Quỹ - ..."
                />
              </div>
              <div>
                <label className="nh-label">Đối tác / NCC / KH</label>
                <input type="text" className="nh-input" value={form.doiTac}
                  onChange={e => set('doiTac', e.target.value)} placeholder="VD: ACB_Đồng Nai" />
              </div>
              <div>
                <label className="nh-label">Loại giao dịch</label>
                <GoiYChon
                  kieu="loaiGiaoDich" loai={form.loai}
                  value={form.loaiGiaoDich} onChange={v => set('loaiGiaoDich', v)}
                  builtin={GOI_Y_LOAI_GD}
                  onDoiTen={(cu, moi) => doiTenTruongKhoan('loaiGiaoDich', cu, moi)}
                  locBuiltin={x => form.loai === 'thu' ? /^thu\b/i.test(x) : !/^thu\b/i.test(x)}
                  locCustomTheoLoai
                  emptyLabel="— Để trống (tự suy ra) —"
                  moiLabel="➕ Thêm loại giao dịch mới…"
                  placeholderMoi={`VD: ${form.loai === 'thu' ? 'Thu' : 'Chi'} - ${form.entity} - ...`}
                  prefillMoi={`${form.loai === 'thu' ? 'Thu' : 'Chi'} - ${form.entity} - `}
                />
              </div>
            </div>
          )}

          <div style={{ marginBottom: 10 }}>
            <label className="nh-label">Mô tả</label>
            <input type="text" className="nh-input" value={form.moTa}
              onChange={e => set('moTa', e.target.value)}
              placeholder={form.loaiKhoan === 'ke-hoach' ? 'VD: Thu tiền chợ T09/2026' : 'VD: Đã nhận tiền chợ ngày 15/9'} />
          </div>

          {!editing && (
            <div className="nh-form-grid" style={{ background: '#F8FAFC', padding: 10, borderRadius: 8, border: '1px solid var(--nh-border)' }}>
              <div>
                <label className="nh-label">Lặp lại</label>
                <select className="nh-select" value={form.lap} onChange={e => set('lap', e.target.value as ChuKyLap)}>
                  <option value="mot-lan">Một lần</option>
                  <option value="hang-thang">Hàng tháng</option>
                  <option value="hang-quy">Hàng quý</option>
                </select>
              </div>
              {form.lap !== 'mot-lan' && (
                <div>
                  <label className="nh-label">Số kỳ lặp</label>
                  <input type="number" min={1} max={60} className="nh-input"
                    value={form.soKyLap} onChange={e => set('soKyLap', Number(e.target.value))} />
                </div>
              )}
            </div>
          )}

          <div style={{ margin: '10px 0' }}>
            <label className="nh-label">Ghi chú (tuỳ chọn)</label>
            <input type="text" className="nh-input" value={form.ghiChu} onChange={e => set('ghiChu', e.target.value)} />
          </div>

          {error && <div className="nh-err">{error}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <button type="button" className="btn-ghost" onClick={onCancel}>Huỷ</button>
            <button type="submit" className="btn-save" disabled={saving}>
              {saving ? 'Đang lưu...' : editing ? 'Cập nhật' : form.loaiKhoan === 'ke-hoach' ? 'Lưu kế hoạch' : 'Thêm thực hiện'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}