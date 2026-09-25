'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  subscribeHanMucNganHan, subscribeBoHoSo, subscribeAllKyThuNH, subscribeKyThuNH, subscribeTraGocGiuaKy,
  saveHanMucNganHan, deleteHanMucNganHan,
  saveBoHoSo, deleteBoHoSo,
  markKyThuDaThu, unmarkKyThu,
  saveTraGocGiuaKy, deleteTraGocGiuaKy,
  tinhKhaDung, tinhGocDaTraBoHoSo, tinhTrangThaiBoHoSo, tinhTrangThaiKhung,
  filterKyThuTheoThang,
} from '@/lib/han-muc-ngan-han-store'
import type {
  HanMucNganHan, BoHoSoGiaiNgan, KyThuNH, TraGocGiuaKy,
  KhaDungSnapshot, TrangThaiBoHoSo, KyTraLaiNH,
} from '@/lib/han-muc-ngan-han-types'
import type { BankName, EntityType } from '@/lib/han-muc-types'
import {
  exportBoHoSoNganHanExcel, exportKhungNganHanExcel, exportDanhSachKhungNganHanExcel,
} from '@/lib/han-muc-excel-export'
import { useDonViTien } from '@/lib/don-vi-tien-context'
import EntitySelect from '@/components/han-muc/EntitySelect'
import { useFillHeight, stickyTh, stickyTf, fillCard, MiniStat } from '@/components/han-muc/FillLayout'
import { Pencil, Trash2, Plus, ChevronLeft, X, Check, AlertCircle, Calendar, FileSpreadsheet, Upload } from 'lucide-react'
import ImportBoHoSoExcel from '@/components/han-muc/ImportBoHoSoExcel'
import { useIsAdmin } from '@/lib/use-role'

// ─── Constants ────────────────────────────────────────────────
const ENTITY_TABS: ('all' | EntityType)[] = ['all', 'SAP', 'SAHS', 'ĐTSA', 'YANA', 'Sao Việt', 'Cá nhân']
const BANK_LIST: BankName[] = [
  'Agribank','Vietcombank','BIDV','Vietinbank','ACB','MB Bank','Techcombank',
  'VPBank','Sacombank','HDBank','VIB','TPBank','MSB','SeABank','LPBank',
  'OCB','SHB','Eximbank','Nam A Bank','NCB','ABBank','BacABank','BaoViet Bank',
  'CBBank','PGBank','VietBank','VietABank','KienlongBank','Vikki Bank','Chailease','Khác',
]

const BADGE_KHUNG: Record<HanMucNganHan['trangThai'], string> = {
  'con-hieu-luc': 'nh-b-green', 'gan-het-han': 'nh-b-amber',
  'het-han': 'nh-b-red', 'da-dong': 'nh-b-grey',
}
const LABEL_KHUNG: Record<HanMucNganHan['trangThai'], string> = {
  'con-hieu-luc': 'Còn hiệu lực', 'gan-het-han': 'Gần hết hạn',
  'het-han': 'Hết hạn', 'da-dong': 'Đã đóng',
}
const BADGE_BO: Record<TrangThaiBoHoSo, string> = {
  'dang-vay': 'nh-b-blue', 'gan-dao-han': 'nh-b-amber',
  'qua-han': 'nh-b-red', 'tat-toan': 'nh-b-grey',
}
const LABEL_BO: Record<TrangThaiBoHoSo, string> = {
  'dang-vay': 'Đang vay', 'gan-dao-han': 'Gần đáo hạn',
  'qua-han': 'Quá hạn', 'tat-toan': 'Tất toán',
}
const KY_TRA_LABEL: Record<KyTraLaiNH, string> = {
  'monthly': 'Hàng tháng', 'quarterly': 'Hàng quý', 'cuoi-ky': 'Cuối kỳ',
}

// ─── Formatters ───────────────────────────────────────────────
const fmt   = (n: number) => n.toLocaleString('vi-VN')
const fmtM  = (n: number) => {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(n % 1_000_000_000 === 0 ? 0 : 2)} tỷ`
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)} tr`
  return fmt(n)
}
const parseVnd    = (v: string) => Number(v.replace(/\D/g, '')) || 0
const fmtVndInput = (v: string) => {
  const n = v.replace(/\D/g, '')
  return n ? Number(n).toLocaleString('vi-VN') : ''
}
const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ─── Reusable UI atoms ────────────────────────────────────────
function Badge({ cls, label }: { cls: string; label: string }) {
  return <span className={`nh-badge ${cls}`}>{label}</span>
}

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{
      background: '#f8fafc', border: '1px solid #e2e8f0',
      borderRadius: 8, padding: '10px 14px',
    }}>
      <div style={{ fontSize: 10.5, color: 'var(--nh-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: color ?? 'var(--nh-txt)', lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--nh-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function ProgressBar({ pct, warn }: { pct: number; warn: boolean }) {
  return (
    <div style={{ height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
      <div style={{
        width: `${pct}%`, height: '100%', transition: 'width .3s',
        background: pct >= 90 ? '#b91c1c' : warn ? '#D4A64A' : '#15803d',
      }} />
    </div>
  )
}

function Alert({ msg }: { msg: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      background: '#fef2f2', border: '1px solid #fecaca',
      borderRadius: 6, padding: '7px 12px', fontSize: 12.5, color: '#b91c1c', marginBottom: 8,
    }}>
      <AlertCircle size={13} /> {msg}
    </div>
  )
}

const inputBaseCls = {
  width: '100%', padding: '7px 10px', fontSize: 13,
  border: '1px solid #cbd5e1', borderRadius: 6,
  background: '#fff', color: 'var(--nh-txt)',
  boxSizing: 'border-box' as const,
}

// ═════════════════════════════════════════════════════════════
// FORM — Hạn mức khung
// ═════════════════════════════════════════════════════════════
interface KhungFormProps {
  open:    boolean
  editing: HanMucNganHan | null
  onClose: () => void
}

function KhungForm({ open, editing, onClose }: KhungFormProps) {
  type F = Omit<HanMucNganHan, 'id' | 'createdAt' | 'updatedAt' | 'trangThai'>
  const blank: F = {
    soHopDong: '', entity: 'SAP', nganHang: 'Vietcombank',
    chiNhanh: '', nguoiVay: '', tongHanMuc: 0,
    ngayHieuLuc: '', ngayHetHan: '', laiSuatMacDinh: undefined, ghiChu: '',
  }
  const [f, setF]         = useState<F>(blank)
  const [hmStr, setHmStr] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')

  useEffect(() => {
    if (!open) return
    if (editing) {
      const { id, createdAt, updatedAt, trangThai, ...rest } = editing
      setF(rest)
      setHmStr(editing.tongHanMuc ? editing.tongHanMuc.toLocaleString('vi-VN') : '')
    } else {
      setF(blank); setHmStr('')
    }
    setErr('')
  }, [open, editing?.id])

  if (!open) return null

  const handleSave = async () => {
    if (!f.soHopDong)                   return setErr('Vui lòng nhập số hợp đồng')
    if (!f.ngayHieuLuc || !f.ngayHetHan) return setErr('Vui lòng nhập ngày hiệu lực và hết hạn')
    const hm = parseVnd(hmStr)
    if (!hm)                             return setErr('Vui lòng nhập tổng hạn mức')
    setSaving(true)
    try {
      await saveHanMucNganHan({ ...f, tongHanMuc: hm }, editing?.id)
      onClose()
    } catch (e: any) { setErr(e.message) }
    finally { setSaving(false) }
  }

  const fieldWrapper = (label: string, node: React.ReactNode, col?: number) => (
    <div style={{ gridColumn: col ? `span ${col}` : undefined }}>
      <label style={{ display: 'block', fontSize: 11.5, color: 'var(--nh-muted)', marginBottom: 3, fontWeight: 500 }}>{label}</label>
      {node}
    </div>
  )
  const textInput = (key: keyof F, ph?: string) => (
    <input value={(f[key] as string) ?? ''} onChange={e => setF(p => ({ ...p, [key]: e.target.value }))} placeholder={ph} style={inputBaseCls} />
  )

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, padding: 24, width: '100%', maxWidth: 560,
        maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px #0003',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--nh-navy)' }}>
            {editing ? 'Sửa hạn mức khung' : 'Thêm hạn mức khung mới'}
          </h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6b7280' }}><X size={18} /></button>
        </div>

        {err && <Alert msg={err} />}

        {editing && (editing.maNganSachLai || editing.maNganSachGoc || editing.maNganSachThu) && (
          <div style={{
            marginBottom: 14, background: '#f0fdf4', border: '1px solid #86efac88',
            borderRadius: 8, padding: '10px 14px',
          }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: '#166534', marginBottom: 6 }}>
              🔗 Mã ngân sách (dùng đối chiếu Sheet data_quy)
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 20px', fontSize: 12.5, color: '#166534' }}>
              {editing.maNganSachLai && <span>Lãi: <code style={{ background: '#dcfce7', padding: '1px 6px', borderRadius: 4 }}>{editing.maNganSachLai}</code></span>}
              {editing.maNganSachGoc && <span>Gốc: <code style={{ background: '#dcfce7', padding: '1px 6px', borderRadius: 4 }}>{editing.maNganSachGoc}</code></span>}
              {editing.maNganSachThu && <span>Thu: <code style={{ background: '#dcfce7', padding: '1px 6px', borderRadius: 4 }}>{editing.maNganSachThu}</code></span>}
            </div>
          </div>
        )}
        {editing && !editing.maNganSachLai && !editing.maNganSachGoc && !editing.maNganSachThu && (
          <div style={{
            marginBottom: 14, background: '#fffbeb', border: '1px solid #f5c54288',
            borderRadius: 8, padding: '10px 14px', fontSize: 12.5, color: '#92600a',
          }}>
            ⚠️ Chưa có mã ngân sách — có thể khung này tạo trước khi có tính năng này (cần chạy migration).
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {fieldWrapper('Số hợp đồng hạn mức *', textInput('soHopDong', 'VD: HMNH-2025-001'), 2)}
          {fieldWrapper('Pháp nhân *', (
            <EntitySelect value={f.entity} onChange={v => setF(p => ({ ...p, entity: v }))} style={inputBaseCls} />
          ))}
          {fieldWrapper('Ngân hàng *', (
            <select value={f.nganHang} onChange={e => setF(p => ({ ...p, nganHang: e.target.value as BankName }))} style={inputBaseCls}>
              {BANK_LIST.map(b => <option key={b}>{b}</option>)}
            </select>
          ))}
          {fieldWrapper('Chi nhánh', textInput('chiNhanh'))}
          {fieldWrapper('Người phụ trách', textInput('nguoiVay'))}
          {fieldWrapper('Tổng hạn mức (VNĐ) *', (
            <input
              value={hmStr} placeholder="VD: 20,000,000,000"
              onChange={e => setHmStr(fmtVndInput(e.target.value))}
              style={inputBaseCls}
            />
          ), 2)}
          {fieldWrapper('Ngày hiệu lực *', (
            <input type="date" value={f.ngayHieuLuc} onChange={e => setF(p => ({ ...p, ngayHieuLuc: e.target.value }))} style={inputBaseCls} />
          ))}
          {fieldWrapper('Ngày hết hạn *', (
            <input type="date" value={f.ngayHetHan} onChange={e => setF(p => ({ ...p, ngayHetHan: e.target.value }))} style={inputBaseCls} />
          ))}
          {fieldWrapper('Lãi suất gợi ý (%/năm)', (
            <input type="number" step=".01" value={f.laiSuatMacDinh ?? ''}
              onChange={e => setF(p => ({ ...p, laiSuatMacDinh: e.target.value ? Number(e.target.value) : undefined }))}
              placeholder="VD: 7.5" style={inputBaseCls} />
          ))}
          {fieldWrapper('Ghi chú', textInput('ghiChu'))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button className="btn-ghost" onClick={onClose}>Huỷ</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Thêm hạn mức'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════
// FORM — Bộ hồ sơ giải ngân
// ═════════════════════════════════════════════════════════════
interface BoFormProps {
  open:    boolean
  hanMuc:  HanMucNganHan
  khaDung: KhaDungSnapshot
  editing: BoHoSoGiaiNgan | null
  onClose: () => void
}

function BoHoSoForm({ open, hanMuc, khaDung, editing, onClose }: BoFormProps) {
  type F = Omit<BoHoSoGiaiNgan, 'id' | 'hanMucId' | 'createdAt' | 'updatedAt' | 'trangThai'>
  const blank: F = {
    soBoHoSo: '', soTienGiaiNgan: 0, ngayGiaiNgan: '',
    ngayDaoHan: '', laiSuat: hanMuc.laiSuatMacDinh ?? 0,
    kyTraLai: 'monthly', ngayTraLaiDauTien: '', mucDichVay: '', taiSanDamBao: '', ghiChu: '',
  }
  const [f, setF]         = useState<F>(blank)
  const [gnStr, setGnStr] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')

  useEffect(() => {
    if (!open) return
    if (editing) {
      const { id, hanMucId, createdAt, updatedAt, trangThai, ...rest } = editing
      setF(rest)
      setGnStr(editing.soTienGiaiNgan ? editing.soTienGiaiNgan.toLocaleString('vi-VN') : '')
    } else {
      setF(blank); setGnStr('')
    }
    setErr('')
  }, [open, editing?.id, hanMuc.id])

  if (!open) return null

  const handleSave = async () => {
    if (!f.soBoHoSo)     return setErr('Vui lòng nhập số bộ hồ sơ')
    if (!f.ngayGiaiNgan) return setErr('Vui lòng nhập ngày giải ngân')
    if (!f.ngayDaoHan)   return setErr('Vui lòng nhập ngày đáo hạn')
    if (!f.laiSuat)      return setErr('Vui lòng nhập lãi suất')
    const gn = parseVnd(gnStr)
    if (!gn)             return setErr('Vui lòng nhập số tiền giải ngân')
    if (!editing && gn > khaDung.khaDung) {
      return setErr(`Vượt hạn mức khả dụng (còn ${fmtM(khaDung.khaDung)} đ)`)
    }
    setSaving(true)
    try {
      await saveBoHoSo({
        ...f,
        soTienGiaiNgan:    gn,
        hanMucId:          hanMuc.id,
        ngayTraLaiDauTien: f.ngayTraLaiDauTien || undefined,
        mucDichVay:        f.mucDichVay || undefined,
        taiSanDamBao:      f.taiSanDamBao || undefined,
        ghiChu:            f.ghiChu || undefined,
      }, editing?.id)
      onClose()
    } catch (e: any) { setErr(e.message) }
    finally { setSaving(false) }
  }

  const fw = (label: string, node: React.ReactNode, col?: number, hint?: string) => (
    <div style={{ gridColumn: col ? `span ${col}` : undefined }}>
      <label style={{ display: 'block', fontSize: 11.5, color: 'var(--nh-muted)', marginBottom: 3, fontWeight: 500 }}>
        {label}{hint && <span style={{ color: '#94a3b8', fontWeight: 400 }}> — {hint}</span>}
      </label>
      {node}
    </div>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: '100%', maxWidth: 580, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px #0003' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--nh-navy)' }}>
            {editing ? 'Sửa bộ hồ sơ' : 'Giải ngân bộ hồ sơ mới'}
          </h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6b7280' }}><X size={18} /></button>
        </div>

        {/* Hạn mức khả dụng banner */}
        <div style={{
          background: khaDung.khaDung < khaDung.tongHanMuc * 0.1 ? '#fef2f2' : '#f0fdf4',
          border: `1px solid ${khaDung.khaDung < khaDung.tongHanMuc * 0.1 ? '#fecaca' : '#bbf7d0'}`,
          borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 12.5,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ color: '#374151' }}>Hạn mức khả dụng:</span>
          <strong style={{ color: khaDung.khaDung === 0 ? '#b91c1c' : '#15803d', fontSize: 14 }}>
            {fmtM(khaDung.khaDung)} đ / {fmtM(khaDung.tongHanMuc)} đ
          </strong>
        </div>

        {err && <Alert msg={err} />}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {fw('Số bộ hồ sơ *', (
            <input value={f.soBoHoSo} onChange={e => setF(p => ({ ...p, soBoHoSo: e.target.value }))} placeholder="VD: HSTN-001" style={inputBaseCls} />
          ), 2)}
          {fw('Số tiền giải ngân (VNĐ) *', (
            <input value={gnStr} onChange={e => setGnStr(fmtVndInput(e.target.value))} placeholder="VD: 3,000,000,000" style={inputBaseCls} />
          ), 2)}
          {fw('Ngày giải ngân *', (
            <input type="date" value={f.ngayGiaiNgan} onChange={e => setF(p => ({ ...p, ngayGiaiNgan: e.target.value }))} style={inputBaseCls} />
          ))}
          {fw('Ngày đáo hạn *', (
            <input type="date" value={f.ngayDaoHan} onChange={e => setF(p => ({ ...p, ngayDaoHan: e.target.value }))} style={inputBaseCls} />
          ))}
          {fw('Lãi suất (%/năm) *', (
            <input type="number" step=".01" value={f.laiSuat || ''} onChange={e => setF(p => ({ ...p, laiSuat: Number(e.target.value) }))} placeholder="VD: 7.5" style={inputBaseCls} />
          ))}
          {fw('Chu kỳ trả lãi *', (
            <select value={f.kyTraLai} onChange={e => setF(p => ({ ...p, kyTraLai: e.target.value as KyTraLaiNH }))} style={inputBaseCls}>
              <option value="monthly">Hàng tháng</option>
              <option value="quarterly">Hàng quý</option>
              <option value="cuoi-ky">Cuối kỳ cùng gốc</option>
            </select>
          ))}
          {f.kyTraLai !== 'cuoi-ky' && fw(
            'Ngày thu lãi đầu tiên',
            <input type="date" value={f.ngayTraLaiDauTien ?? ''} onChange={e => setF(p => ({ ...p, ngayTraLaiDauTien: e.target.value || undefined }))} style={inputBaseCls} />,
            2,
            'để trống nếu trùng ngày giải ngân',
          )}
          {fw('Mục đích vay', (
            <input value={f.mucDichVay ?? ''} onChange={e => setF(p => ({ ...p, mucDichVay: e.target.value }))} placeholder="VD: Bổ sung vốn lưu động" style={inputBaseCls} />
          ), 2)}
          {fw('Tài sản đảm bảo', (
            <input value={f.taiSanDamBao ?? ''} onChange={e => setF(p => ({ ...p, taiSanDamBao: e.target.value }))} style={inputBaseCls} />
          ), 2)}
          {fw('Ghi chú', (
            <input value={f.ghiChu ?? ''} onChange={e => setF(p => ({ ...p, ghiChu: e.target.value }))} style={inputBaseCls} />
          ), 2)}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button className="btn-ghost" onClick={onClose}>Huỷ</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : '+ Giải ngân'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════
// DIALOG — Thu lãi/gốc kỳ này
// ═════════════════════════════════════════════════════════════
interface ThuKyDialogProps {
  ky:      KyThuNH | null
  onClose: () => void
}
function ThuKyDialog({ ky, onClose }: ThuKyDialogProps) {
  const [ngay, setNgay]     = useState('')
  const [gocStr, setGocStr] = useState('')
  const [laiStr, setLaiStr] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')
  // Gốc & lãi thu khác ngày trong cùng kỳ — mặc định TẮT (gộp 1 ô ngày như cũ)
  const [khacNgay, setKhacNgay]     = useState(false)
  const [ngayGoc, setNgayGoc]       = useState('')
  const [ngayLai, setNgayLai]       = useState('')

  useEffect(() => {
    if (!ky) return
    const homNay = todayStr()
    setNgay(homNay)
    setGocStr(ky.gocThu ? ky.gocThu.toLocaleString('vi-VN') : '0')
    setLaiStr(ky.laiThu ? ky.laiThu.toLocaleString('vi-VN') : '0')
    const daTachNgay = !!ky.ngayThucThuGoc && !!ky.ngayThucThuLai && ky.ngayThucThuGoc !== ky.ngayThucThuLai
    setKhacNgay(daTachNgay)
    setNgayGoc(daTachNgay ? ky.ngayThucThuGoc! : homNay)
    setNgayLai(daTachNgay ? ky.ngayThucThuLai! : homNay)
    setErr('')
  }, [ky?.id])

  if (!ky) return null

  const handleSave = async () => {
    const coLech = khacNgay && ngayGoc && ngayLai && ngayGoc !== ngayLai
    if (!coLech && !ngay)            return setErr('Nhập ngày thu thực tế')
    if (coLech && (!ngayGoc || !ngayLai)) return setErr('Nhập đủ ngày thu gốc và ngày thu lãi')
    setSaving(true)
    try {
      await markKyThuDaThu(
        ky.hanMucId, ky.boHoSoId, ky.id,
        coLech ? ngayGoc : ngay,
        parseVnd(gocStr), parseVnd(laiStr),
        coLech ? { ngayThucThuGoc: ngayGoc, ngayThucThuLai: ngayLai } : undefined,
      )
      onClose()
    } catch (e: any) { setErr(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: '100%', maxWidth: 400, boxShadow: '0 20px 60px #0003' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--nh-navy)' }}>Xác nhận thu kỳ #{ky.soKy}</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6b7280' }}><X size={16} /></button>
        </div>

        <div style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 12px', marginBottom: 14, fontSize: 12.5 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
            <div><span style={{ color: '#6b7280' }}>Gốc KH:</span> <b>{fmt(ky.gocThu)} đ</b></div>
            <div><span style={{ color: '#6b7280' }}>Lãi KH:</span> <b>{fmt(ky.laiThu)} đ</b></div>
            <div><span style={{ color: '#6b7280' }}>Tổng KH:</span> <b>{fmt(ky.tongThu)} đ</b></div>
          </div>
        </div>

        {err && <Alert msg={err} />}

        <div style={{ display: 'grid', gap: 10 }}>
          {!khacNgay ? (
            <div>
              <label style={{ fontSize: 11.5, color: 'var(--nh-muted)', fontWeight: 500 }}>Ngày thu thực tế *</label>
              <input type="date" value={ngay} onChange={e => setNgay(e.target.value)} style={{ ...inputBaseCls, marginTop: 3 }} />
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <label style={{ fontSize: 11.5, color: '#1C3557', fontWeight: 600 }}>Ngày thu gốc *</label>
                <input type="date" value={ngayGoc} onChange={e => setNgayGoc(e.target.value)} style={{ ...inputBaseCls, marginTop: 3, border: '1px solid #1C355733' }} />
              </div>
              <div>
                <label style={{ fontSize: 11.5, color: '#b45309', fontWeight: 600 }}>Ngày thu lãi *</label>
                <input type="date" value={ngayLai} onChange={e => setNgayLai(e.target.value)} style={{ ...inputBaseCls, marginTop: 3, border: '1px solid #D4A64A55' }} />
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              const next = !khacNgay
              setKhacNgay(next)
              if (next) { setNgayGoc(ngay); setNgayLai(ngay) }
              else      { setNgay(ngayGoc || ngay) }
            }}
            style={{ fontSize: 11, color: '#2563eb', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline', textAlign: 'left' }}
          >
            {khacNgay ? '✕ Gộp lại 1 ngày' : 'Gốc & lãi thu khác ngày'}
          </button>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={{ fontSize: 11.5, color: 'var(--nh-muted)', fontWeight: 500 }}>Gốc thực thu (đ)</label>
              <input value={fmtVndInput(gocStr)} onChange={e => setGocStr(e.target.value)} style={{ ...inputBaseCls, marginTop: 3 }} />
            </div>
            <div>
              <label style={{ fontSize: 11.5, color: 'var(--nh-muted)', fontWeight: 500 }}>Lãi thực thu (đ)</label>
              <input value={fmtVndInput(laiStr)} onChange={e => setLaiStr(e.target.value)} style={{ ...inputBaseCls, marginTop: 3 }} />
            </div>
          </div>
          <div style={{ fontSize: 12, color: '#374151', background: '#f0fdf4', borderRadius: 6, padding: '6px 10px' }}>
            Tổng thực thu: <b>{fmt(parseVnd(gocStr) + parseVnd(laiStr))} đ</b>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button className="btn-ghost" onClick={onClose}>Huỷ</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            <Check size={13} style={{ marginRight: 4 }} />{saving ? 'Đang lưu…' : 'Xác nhận đã thu'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════
// DIALOG — Trả gốc giữa kỳ
// ═════════════════════════════════════════════════════════════
interface TraGocDialogProps {
  open:        boolean
  bo:          BoHoSoGiaiNgan | null
  duNoConLai:  number
  onClose:     () => void
}
function TraGocDialog({ open, bo, duNoConLai, onClose }: TraGocDialogProps) {
  const [ngay, setNgay]     = useState('')
  const [sotStr, setSotStr] = useState('')
  const [ghiChu, setGhiChu] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')

  useEffect(() => {
    if (!open) return
    setNgay(todayStr())
    setSotStr(''); setGhiChu(''); setErr('')
  }, [open])

  if (!open || !bo) return null

  const handleSave = async () => {
    const sot = parseVnd(sotStr)
    if (!ngay) return setErr('Nhập ngày trả')
    if (!sot)  return setErr('Nhập số tiền gốc trả')
    if (sot > duNoConLai) return setErr(`Số tiền vượt dư nợ còn lại (${fmtM(duNoConLai)} đ)`)
    setSaving(true)
    try {
      await saveTraGocGiuaKy({ boHoSoId: bo.id, hanMucId: bo.hanMucId, ngayTra: ngay, soTienGoc: sot, ghiChu: ghiChu || undefined })
      onClose()
    } catch (e: any) { setErr(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: '100%', maxWidth: 380, boxShadow: '0 20px 60px #0003' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--nh-navy)' }}>Trả gốc giữa kỳ</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6b7280' }}><X size={16} /></button>
        </div>
        <div style={{ fontSize: 12.5, color: '#374151', background: '#f8fafc', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
          Dư nợ còn lại: <b style={{ color: '#b91c1c' }}>{fmt(duNoConLai)} đ</b>
          <span style={{ color: '#94a3b8', marginLeft: 8 }}>→ Hạn mức sẽ tăng ngay sau khi lưu</span>
        </div>
        {err && <Alert msg={err} />}
        <div style={{ display: 'grid', gap: 10 }}>
          <div>
            <label style={{ fontSize: 11.5, color: 'var(--nh-muted)', fontWeight: 500 }}>Ngày trả *</label>
            <input type="date" value={ngay} onChange={e => setNgay(e.target.value)} style={{ ...inputBaseCls, marginTop: 3 }} />
          </div>
          <div>
            <label style={{ fontSize: 11.5, color: 'var(--nh-muted)', fontWeight: 500 }}>Số tiền gốc trả (đ) *</label>
            <input value={fmtVndInput(sotStr)} onChange={e => setSotStr(e.target.value)} placeholder={`Tối đa ${fmtM(duNoConLai)}`} style={{ ...inputBaseCls, marginTop: 3 }} />
          </div>
          <div>
            <label style={{ fontSize: 11.5, color: 'var(--nh-muted)', fontWeight: 500 }}>Ghi chú</label>
            <input value={ghiChu} onChange={e => setGhiChu(e.target.value)} style={{ ...inputBaseCls, marginTop: 3 }} />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button className="btn-ghost" onClick={onClose}>Huỷ</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Đang lưu…' : 'Xác nhận trả gốc'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════
// VIEW — Chi tiết 1 bộ hồ sơ
// ═════════════════════════════════════════════════════════════
interface ChiTietBoHoSoProps {
  bo:     BoHoSoGiaiNgan
  khung:  HanMucNganHan
  onBack: () => void
}
function ChiTietBoHoSo({ bo, khung, onBack }: ChiTietBoHoSoProps) {
  const { fmtTien } = useDonViTien()
  const [kyList, setKyList]         = useState<KyThuNH[]>([])
  const [traGocList, setTraGocList] = useState<TraGocGiuaKy[]>([])
  const [thuKy, setThuKy]           = useState<KyThuNH | null>(null)
  const [traGocOpen, setTraGocOpen] = useState(false)
  const [editOpen, setEditOpen]     = useState(false)
  const [khaDung, setKhaDung]       = useState<KhaDungSnapshot>({
    tongHanMuc: khung.tongHanMuc, tongGiaiNgan: 0, tongGocDaTra: 0,
    duNoHienTai: 0, khaDung: khung.tongHanMuc, phanTramSuDung: 0, soBoDangVay: 0,
  })

  useEffect(() => subscribeKyThuNH(khung.id, bo.id, setKyList), [khung.id, bo.id])
  useEffect(() => subscribeTraGocGiuaKy(khung.id, setTraGocList), [khung.id])

  const boTraGoc   = traGocList.filter(t => t.boHoSoId === bo.id)
  const gocDaTra   = useMemo(() => tinhGocDaTraBoHoSo(bo.id, kyList, boTraGoc), [bo.id, kyList, boTraGoc])
  const duNoConLai = Math.max(0, bo.soTienGiaiNgan - gocDaTra)
  const tongLaiDaThu = kyList.filter(k => k.trangThai === 'da-thu').reduce((s, k) => s + (k.laiThucThu ?? k.laiThu), 0)

  // Simplified khaDung cho form sửa
  useEffect(() => {
    setKhaDung(prev => ({ ...prev, khaDung: khung.tongHanMuc - duNoConLai }))
  }, [khung.tongHanMuc, duNoConLai])

  const sortedKy = useMemo(() => [...kyList].sort((a, b) => a.ngayThu.localeCompare(b.ngayThu)), [kyList])
  const { ref: fillRef, h: fillH } = useFillHeight([boTraGoc.length])

  return (
    <div ref={fillRef} style={{ display: 'flex', flexDirection: 'column', height: fillH, gap: 8, minHeight: 0 }}>
      {/* ── Header cố định ── */}
      <div className="nh-card" style={{ marginBottom: 0, flex: '0 0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', flexWrap: 'wrap' }}>
          <button className="btn-ghost" onClick={onBack} style={{ fontSize: 12, padding: '4px 10px' }}>
            <ChevronLeft size={13} style={{ marginRight: 3 }} />Quay lại
          </button>
          <span className="nh-card-title">{bo.soBoHoSo}</span>
          <Badge cls={BADGE_BO[bo.trangThai]} label={LABEL_BO[bo.trangThai]} />
          <span style={{ fontSize: 11.5, color: 'var(--nh-muted)' }}>
            🏦 {khung.soHopDong} · {khung.entity} · {khung.nganHang}{khung.chiNhanh ? ` · ${khung.chiNhanh}` : ''}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {bo.trangThai !== 'tat-toan' && duNoConLai > 0 && (
              <button className="btn-ghost" onClick={() => setTraGocOpen(true)} style={{ fontSize: 12, padding: '4px 10px' }}>💳 Trả gốc giữa kỳ</button>
            )}
            <button className="btn-ghost" style={{ padding: '4px 10px' }} onClick={() => setEditOpen(true)}>Sửa bộ hồ sơ</button>
            <button className="btn-ghost" style={{ padding: '4px 10px' }} onClick={() => exportBoHoSoNganHanExcel(bo, khung, kyList, boTraGoc)}>
              <FileSpreadsheet size={13} style={{ marginRight: 4, verticalAlign: -2 }} />Xuất Excel
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 28px', padding: '8px 12px', borderTop: '1px solid #e2e8f0' }}>
          <MiniStat label="Giải ngân" value={fmtTien(bo.soTienGiaiNgan)} sub={bo.ngayGiaiNgan} />
          <MiniStat label="Dư nợ còn lại" value={fmtTien(duNoConLai)}
            sub={`${((gocDaTra / bo.soTienGiaiNgan) * 100 || 0).toFixed(1)}% đã trả`} color={duNoConLai > 0 ? '#b91c1c' : '#15803d'} />
          <MiniStat label="Lãi suất" value={`${bo.laiSuat}%/năm`} sub={KY_TRA_LABEL[bo.kyTraLai]} />
          <MiniStat label="Đáo hạn" value={bo.ngayDaoHan}
            color={bo.trangThai === 'qua-han' ? '#b91c1c' : bo.trangThai === 'gan-dao-han' ? '#D4A64A' : undefined} />
          <MiniStat label="Lãi đã thu" value={fmtTien(tongLaiDaThu)} sub="Lũy kế" color="#b45309" />
          <MiniStat label="Gốc đã trả" value={fmtTien(gocDaTra)} sub={`${boTraGoc.length} lần giữa kỳ + kỳ thu`} />
        </div>

        {(bo.mucDichVay || bo.taiSanDamBao || bo.ghiChu || boTraGoc.length > 0) && (
          <div style={{ display: 'flex', gap: '4px 16px', fontSize: 12, color: '#374151', padding: '6px 12px', borderTop: '1px solid #e2e8f0', flexWrap: 'wrap', alignItems: 'center', maxHeight: 84, overflow: 'auto' }}>
            {bo.mucDichVay   && <span><b>Mục đích:</b> {bo.mucDichVay}</span>}
            {bo.taiSanDamBao && <span><b>TSĐB:</b> {bo.taiSanDamBao}</span>}
            {bo.ghiChu       && <span><b>Ghi chú:</b> {bo.ghiChu}</span>}
            {boTraGoc.map(t => (
              <span key={t.id} style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                💳 {t.ngayTra} · <b style={{ color: '#15803d' }}>{fmtM(t.soTienGoc)} đ</b>{t.ghiChu && <span style={{ color: '#6b7280' }}>({t.ghiChu})</span>}
                <button
                  onClick={async () => {
                    if (!confirm('Xoá khoản trả gốc này?')) return
                    await deleteTraGocGiuaKy(t.id, t.hanMucId, t.boHoSoId)
                  }}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626', padding: 0 }}
                ><X size={11} /></button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Lịch kỳ thu: chỉ vùng bảng cuộn ── */}
      <div className="nh-card" style={fillCard}>
        <div className="nh-card-head" style={{ flex: '0 0 auto' }}>
          <span className="nh-card-title" style={{ fontSize: 14 }}>Lịch thu lãi & gốc</span>
          <span style={{ fontSize: 12, color: 'var(--nh-muted)' }}>
            {kyList.length} kỳ · Đã thu {kyList.filter(k => k.trangThai === 'da-thu').length}/{kyList.length}
          </span>
        </div>
        <div style={{ flex: '1 1 0', minHeight: 0, overflow: 'auto' }}>
          <table className="nh-tbl" style={{ minWidth: 700, borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}>
            <thead>
              <tr>
                <th style={stickyTh}>Kỳ</th>
                <th style={stickyTh}>Ngày thu</th>
                <th style={stickyTh}>Loại</th>
                <th className="r" style={stickyTh}>Dư nợ đầu kỳ</th>
                <th className="r" style={stickyTh}>Gốc thu</th>
                <th className="r" style={stickyTh}>Lãi thu</th>
                <th className="r" style={stickyTh}>Tổng thu</th>
                <th className="r" style={stickyTh}>Dư nợ cuối kỳ</th>
                <th style={stickyTh}>Trạng thái</th>
                <th style={stickyTh}></th>
              </tr>
            </thead>
            <tbody>
              {sortedKy.map(k => {
                const isDaThu  = k.trangThai === 'da-thu'
                const isQuaHan = k.trangThai === 'qua-han'
                return (
                  <tr key={k.id} style={{ background: isDaThu ? '#f0fdf4' : isQuaHan ? '#fff5f5' : undefined }}>
                    <td style={{ fontWeight: 700, color: 'var(--nh-navy)' }}>#{k.soKy}</td>
                    <td>
                      {k.ngayThu}
                      {isDaThu && k.ngayThucThuGoc && k.ngayThucThuLai && k.ngayThucThuGoc !== k.ngayThucThuLai ? (
                        <div style={{ fontSize: 10, color: '#6b7280' }}>
                          <span style={{ color: '#1C3557' }}>G:{k.ngayThucThuGoc}</span> · <span style={{ color: '#b45309' }}>L:{k.ngayThucThuLai}</span>
                        </div>
                      ) : isDaThu && k.ngayThucThu && k.ngayThucThu !== k.ngayThu && (
                        <div style={{ fontSize: 10, color: '#6b7280' }}>thực: {k.ngayThucThu}</div>
                      )}
                    </td>
                    <td>
                      <span style={{
                        fontSize: 11, padding: '2px 6px', borderRadius: 4, fontWeight: 600,
                        background: k.loai === 'goc-va-lai' ? '#fef3c7' : k.loai === 'goc' ? '#fee2e2' : '#eff6ff',
                        color:      k.loai === 'goc-va-lai' ? '#92400e' : k.loai === 'goc' ? '#b91c1c' : '#1d4ed8',
                      }}>
                        {k.loai === 'goc-va-lai' ? 'Gốc + Lãi' : k.loai === 'goc' ? 'Gốc' : 'Lãi'}
                      </span>
                    </td>
                    <td className="r">{fmt(k.dunNoDauKy)}</td>
                    <td className="r" style={{ fontWeight: k.gocThu > 0 ? 700 : undefined, color: k.gocThu > 0 ? '#b91c1c' : '#94a3b8' }}>
                      {k.gocThu > 0 ? fmt(k.gocThu) : '—'}
                      {isDaThu && k.gocThucThu !== undefined && k.gocThucThu !== k.gocThu && (
                        <div style={{ fontSize: 10, color: '#6b7280' }}>thực: {fmt(k.gocThucThu)}</div>
                      )}
                    </td>
                    <td className="r" style={{ color: '#b45309', fontWeight: 600 }}>
                      {fmt(k.laiThu)}
                      {isDaThu && k.laiThucThu !== undefined && k.laiThucThu !== k.laiThu && (
                        <div style={{ fontSize: 10, color: '#6b7280' }}>thực: {fmt(k.laiThucThu)}</div>
                      )}
                    </td>
                    <td className="r" style={{ fontWeight: 700 }}>{fmt(k.tongThu)}</td>
                    <td className="r">{fmt(k.dunNoCuoiKy)}</td>
                    <td>
                      {isDaThu      ? <span className="nh-badge nh-b-green">Đã thu</span>
                        : k.trangThai === 'gan-han' ? <span className="nh-badge nh-b-amber">Gần hạn</span>
                        : isQuaHan  ? <span className="nh-badge nh-b-red">Quá hạn</span>
                        : <span className="nh-badge nh-b-grey">Chưa thu</span>}
                    </td>
                    <td>
                      {isDaThu ? (
                        <button
                          onClick={() => unmarkKyThu(k.hanMucId, k.boHoSoId, k.id, k.ngayThu)}
                          style={{ fontSize: 11, padding: '3px 8px', border: '1px solid #d1d5db', borderRadius: 4, background: '#fff', cursor: 'pointer', color: '#6b7280' }}
                          title="Huỷ xác nhận"
                        >
                          <X size={11} />
                        </button>
                      ) : (
                        <button
                          onClick={() => setThuKy(k)}
                          style={{ fontSize: 11, padding: '3px 8px', border: 'none', borderRadius: 4, background: '#1C3557', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
                        >
                          Thu
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
              {kyList.length === 0 && (
                <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--nh-muted2)', padding: 24 }}>Chưa có kỳ thu</td></tr>
              )}
            </tbody>
            {sortedKy.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={4} style={{ ...stickyTf, textAlign: 'right', color: 'var(--nh-muted)', paddingRight: 12 }}>Tổng cộng ({sortedKy.length} kỳ):</td>
                  <td className="r" style={{ ...stickyTf, color: '#b91c1c' }}>{fmt(sortedKy.reduce((a, k) => a + k.gocThu, 0))}</td>
                  <td className="r" style={{ ...stickyTf, color: '#b45309' }}>{fmt(sortedKy.reduce((a, k) => a + k.laiThu, 0))}</td>
                  <td className="r" style={{ ...stickyTf, color: 'var(--nh-navy)' }}>{fmt(sortedKy.reduce((a, k) => a + k.tongThu, 0))}</td>
                  <td colSpan={3} style={stickyTf}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <ThuKyDialog ky={thuKy} onClose={() => setThuKy(null)} />
      <TraGocDialog open={traGocOpen} bo={bo} duNoConLai={duNoConLai} onClose={() => setTraGocOpen(false)} />
      <BoHoSoForm open={editOpen} hanMuc={khung} khaDung={khaDung} editing={bo} onClose={() => setEditOpen(false)} />
    </div>
  )
}

// ═════════════════════════════════════════════════════════════
// VIEW — Chi tiết hạn mức khung (danh sách bộ hồ sơ + calendar)
// ═════════════════════════════════════════════════════════════
interface ChiTietKhungProps {
  khung:  HanMucNganHan
  onBack: () => void
}
function ChiTietKhung({ khung, onBack }: ChiTietKhungProps) {
  const { fmtTien } = useDonViTien()
  const [boList, setBoList]         = useState<BoHoSoGiaiNgan[]>([])
  const [kyThuMap, setKyThuMap]     = useState<Record<string, KyThuNH[]>>({})
  const [traGocList, setTraGocList] = useState<TraGocGiuaKy[]>([])
  const [selectedBo, setSelectedBo] = useState<BoHoSoGiaiNgan | null>(null)
  const [boFormOpen, setBoFormOpen] = useState(false)
  const [editingBo, setEditingBo]   = useState<BoHoSoGiaiNgan | null>(null)
  const [calMonth, setCalMonth]     = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [view, setView] = useState<'list' | 'calendar'>('list')
  const [thuKy, setThuKy]                 = useState<KyThuNH | null>(null)
  const [selKy, setSelKy]                 = useState<Set<string>>(new Set())
  const [ngayThuChung, setNgayThuChung]   = useState(todayStr())
  const [showQuaHanCu, setShowQuaHanCu]   = useState(true)
  const [bulkSaving, setBulkSaving]       = useState(false)
  const [importOpen, setImportOpen]       = useState(false)
  const isAdmin = useIsAdmin()

  useEffect(() => subscribeBoHoSo(khung.id, setBoList), [khung.id])
  useEffect(() => subscribeTraGocGiuaKy(khung.id, setTraGocList), [khung.id])
  useEffect(() => {
    const boIds = boList.map(b => b.id)
    if (!boIds.length) { setKyThuMap({}); return }
    return subscribeAllKyThuNH(khung.id, boIds, setKyThuMap)
  }, [khung.id, boList.map(b => b.id).join(',')])  // eslint-disable-line react-hooks/exhaustive-deps

  const khaDung = useMemo(
    () => tinhKhaDung(khung, boList, kyThuMap, traGocList),
    [khung, boList, kyThuMap, traGocList],
  )
  const boMap   = useMemo(() => Object.fromEntries(boList.map(b => [b.id, b])), [boList])
  // Kỳ tháng đang chọn + (tuỳ chọn) các kỳ tháng trước chưa thu (bỏ qua bộ hồ sơ đã tất toán)
  const kyThang = useMemo(() => {
    const trongThang = filterKyThuTheoThang(kyThuMap, calMonth)
    if (!showQuaHanCu) return trongThang
    const cu = Object.values(kyThuMap).flat()
      .filter(k => k.ngayThu < `${calMonth}-01` && k.trangThai !== 'da-thu' && boMap[k.boHoSoId]?.trangThai !== 'tat-toan')
      .sort((a, b) => a.ngayThu.localeCompare(b.ngayThu))
    return [...cu, ...trongThang]
  }, [kyThuMap, calMonth, showQuaHanCu, boMap])
  const kyChuaThu = kyThang.filter(k => k.trangThai !== 'da-thu')
  const kyDaChon  = kyChuaThu.filter(k => selKy.has(k.id))
  const tongDaChon = kyDaChon.reduce((s, k) => s + k.tongThu, 0)
  const toggleKy  = (id: string) => setSelKy(prev => {
    const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n
  })
  const toggleAll = () => setSelKy(kyDaChon.length === kyChuaThu.length ? new Set() : new Set(kyChuaThu.map(k => k.id)))
  const thuNhieuKy = async () => {
    if (!kyDaChon.length) return
    if (!ngayThuChung) return alert('Nhập ngày thu thực tế')
    if (!confirm(`Xác nhận đã thu ${kyDaChon.length} kỳ, tổng ${fmt(tongDaChon)} đ (ngày ${ngayThuChung})?\nSố tiền lấy theo kế hoạch.`)) return
    setBulkSaving(true)
    try {
      for (const k of kyDaChon) {  // tuần tự để _syncTrangThaiBoHoSo không bị chạy đua
        await markKyThuDaThu(k.hanMucId, k.boHoSoId, k.id, ngayThuChung, k.gocThu, k.laiThu)
      }
      setSelKy(new Set())
    } catch (e: any) { alert(e.message) }
    finally { setBulkSaving(false) }
  }

  const { ref: fillRef, h: fillH } = useFillHeight([view, !!selectedBo])
  const boRows = useMemo(() => boList.map(bo => {
    const kyList   = kyThuMap[bo.id] ?? []
    const tgList   = traGocList.filter(t => t.boHoSoId === bo.id)
    const gocDaTra = tinhGocDaTraBoHoSo(bo.id, kyList, tgList)
    return { bo, gocDaTra, duNo: Math.max(0, bo.soTienGiaiNgan - gocDaTra), kyQuaHan: kyList.filter(k => k.trangThai === 'qua-han').length }
  }), [boList, kyThuMap, traGocList])
  const tongGN   = boRows.reduce((s, r) => s + r.bo.soTienGiaiNgan, 0)
  const tongGoc  = boRows.reduce((s, r) => s + r.gocDaTra, 0)
  const tongDuNo = boRows.reduce((s, r) => s + r.duNo, 0)
  const tongConPhaiThu = kyChuaThu.reduce((s, k) => s + k.tongThu, 0)
  const tongDaThu      = kyThang.filter(k => k.trangThai === 'da-thu').reduce((s, k) => s + (k.tongThucThu ?? k.tongThu), 0)

  if (selectedBo) {
    return <ChiTietBoHoSo bo={selectedBo} khung={khung} onBack={() => setSelectedBo(null)} />
  }

  const prevMonth = () => {
    const [y, m] = calMonth.split('-').map(Number)
    const d = new Date(y, m - 2, 1)
    setCalMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const nextMonth = () => {
    const [y, m] = calMonth.split('-').map(Number)
    const d = new Date(y, m, 1)
    setCalMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const tabBtn = (active: boolean): React.CSSProperties => ({
    border: 'none', background: 'none', cursor: 'pointer', padding: '7px 14px', fontSize: 13,
    fontWeight: active ? 700 : 500, color: active ? 'var(--nh-navy)' : '#6b7280',
    borderBottom: active ? '2px solid var(--nh-navy)' : '2px solid transparent', marginBottom: -1,
    display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
  })
  const cardFlex: React.CSSProperties = { marginBottom: 0 }

  return (
    <div ref={fillRef} style={{ display: 'flex', flexDirection: 'column', height: fillH, gap: 8, minHeight: 0 }}>
      {/* ── Header gọn: 1 dòng thông tin + 1 dải chỉ số ── */}
      <div className="nh-card" style={{ ...cardFlex, flex: '0 0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', flexWrap: 'wrap' }}>
          <button className="btn-ghost" onClick={onBack} style={{ fontSize: 12, padding: '4px 10px' }}>
            <ChevronLeft size={13} style={{ marginRight: 3 }} />Quay lại
          </button>
          <span className="nh-card-title">{khung.soHopDong}</span>
          <Badge cls={BADGE_KHUNG[khung.trangThai]} label={LABEL_KHUNG[khung.trangThai]} />
          <span style={{ fontSize: 11.5, color: 'var(--nh-muted)' }}>
            {khung.entity} · {khung.nganHang}{khung.chiNhanh ? ` · ${khung.chiNhanh}` : ''}
            {khung.nguoiVay ? ` · ${khung.nguoiVay}` : ''}
            {' · '}{khung.ngayHieuLuc} → {khung.ngayHetHan}
            {khung.laiSuatMacDinh ? ` · LS gợi ý ${khung.laiSuatMacDinh}%` : ''}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="btn-ghost" style={{ padding: '4px 10px' }} disabled={boList.length === 0}
              onClick={() => exportKhungNganHanExcel(khung, boList, kyThuMap, traGocList, tinhGocDaTraBoHoSo)}>
              <FileSpreadsheet size={13} style={{ marginRight: 4, verticalAlign: -2 }} />Xuất Excel
            </button>
            <button className="btn-ghost" style={{ padding: '4px 10px' }} onClick={() => setImportOpen(true)}>
              <Upload size={13} style={{ marginRight: 4, verticalAlign: -2 }} />Nhập Excel
            </button>
            <button className="btn-primary" style={{ padding: '4px 12px' }} onClick={() => { setEditingBo(null); setBoFormOpen(true) }}>
              <Plus size={13} style={{ marginRight: 4 }} />Giải ngân mới
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 28, padding: '6px 12px 8px', borderTop: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
          <MiniStat label="Tổng hạn mức" value={fmtTien(khaDung.tongHanMuc)} color="#1C3557" />
          <MiniStat label="Dư nợ hiện tại" value={fmtTien(khaDung.duNoHienTai)} sub={`${khaDung.soBoDangVay} bộ hồ sơ đang vay`} color="#b45309" />
          <MiniStat label="Khả dụng" value={fmtTien(khaDung.khaDung)} color={khaDung.phanTramSuDung >= 90 ? '#b91c1c' : '#15803d'} />
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: 10, color: 'var(--nh-muted)', fontWeight: 600, marginBottom: 3 }}>
              SỬ DỤNG {khaDung.phanTramSuDung}%{khaDung.phanTramSuDung >= 90 ? ' ⚠️ gần chạm hạn mức' : ''}
            </div>
            <ProgressBar pct={khaDung.phanTramSuDung} warn={khaDung.phanTramSuDung >= 70} />
          </div>
        </div>
      </div>

      {/* ── Khối chính: tab + toolbar cố định, bảng cuộn ── */}
      <div className="nh-card" style={{ ...cardFlex, flex: '1 1 0', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Tab + toolbar */}
        <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 12, padding: '0 12px', borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap', background: '#fff' }}>
          <button style={tabBtn(view === 'list')} onClick={() => setView('list')}>Danh sách bộ hồ sơ ({boList.length})</button>
          <button style={tabBtn(view === 'calendar')} onClick={() => setView('calendar')}>
            <Calendar size={13} />Lịch thu tổng hợp
          </button>

          {view === 'calendar' && (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', flexWrap: 'wrap' }}>
              <button className="btn-ghost" onClick={prevMonth} style={{ padding: '3px 9px' }}>‹</button>
              <input type="month" value={calMonth} onChange={e => e.target.value && setCalMonth(e.target.value)}
                style={{ ...inputBaseCls, width: 140 }} />
              <button className="btn-ghost" onClick={nextMonth} style={{ padding: '3px 9px' }}>›</button>
              <label style={{ fontSize: 12, color: 'var(--nh-muted)', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                <input type="checkbox" checked={showQuaHanCu} onChange={e => setShowQuaHanCu(e.target.checked)} />
                Kèm kỳ chưa thu tháng trước
              </label>
              <span style={{ fontSize: 12.5, color: 'var(--nh-muted)' }}>
                {kyThang.length} kỳ · Còn phải thu <b style={{ color: '#b91c1c' }}>{fmtM(tongConPhaiThu)} đ</b>
                {' · '}Đã thu <b style={{ color: '#15803d' }}>{fmtM(tongDaThu)} đ</b>
              </span>
            </div>
          )}
        </div>

        {/* Thanh thu hàng loạt (cố định, không cuộn) */}
        {view === 'calendar' && kyChuaThu.length > 0 && (
          <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', background: kyDaChon.length ? '#eff6ff' : '#f8fafc', borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap', fontSize: 12.5 }}>
            <span>Đã chọn <b>{kyDaChon.length}</b>/{kyChuaThu.length} kỳ · <b>{fmt(tongDaChon)} đ</b></span>
            <span style={{ marginLeft: 'auto', color: 'var(--nh-muted)' }}>Ngày thu:</span>
            <input type="date" value={ngayThuChung} onChange={e => setNgayThuChung(e.target.value)} style={{ ...inputBaseCls, width: 140 }} />
            <button className="btn-primary" style={{ padding: '4px 12px' }} disabled={!kyDaChon.length || bulkSaving} onClick={thuNhieuKy}>
              <Check size={13} style={{ marginRight: 4 }} />{bulkSaving ? 'Đang lưu…' : `Xác nhận đã thu ${kyDaChon.length} kỳ`}
            </button>
          </div>
        )}

        {/* Vùng bảng — chỉ vùng này cuộn; tiêu đề & dòng tổng dính (sticky) */}
        <div style={{ flex: '1 1 0', minHeight: 0, overflow: 'auto' }}>
          {view === 'list' && (
            <table className="nh-tbl" style={{ minWidth: 820, borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}>
              <thead>
                <tr>
                  <th style={stickyTh}>Bộ hồ sơ</th>
                  <th style={stickyTh}>Ngày GN</th>
                  <th style={stickyTh}>Đáo hạn</th>
                  <th className="r" style={stickyTh}>Giải ngân</th>
                  <th className="r" style={stickyTh}>Gốc đã trả</th>
                  <th className="r" style={stickyTh}>Dư nợ còn</th>
                  <th style={stickyTh}>Lãi suất</th>
                  <th style={stickyTh}>Kỳ lãi</th>
                  <th style={stickyTh}>Trạng thái</th>
                  <th style={stickyTh}></th>
                </tr>
              </thead>
              <tbody>
                {boRows.map(({ bo, gocDaTra, duNo, kyQuaHan }) => (
                  <tr key={bo.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedBo(bo)}>
                    <td style={{ fontWeight: 700, color: 'var(--nh-navy)' }}>
                      {bo.soBoHoSo}
                      {kyQuaHan > 0 && <span style={{ marginLeft: 5, fontSize: 10, color: '#b91c1c' }}>⚠️ {kyQuaHan} kỳ QH</span>}
                    </td>
                    <td>{bo.ngayGiaiNgan}</td>
                    <td style={{ color: bo.trangThai === 'qua-han' ? '#b91c1c' : bo.trangThai === 'gan-dao-han' ? '#D4A64A' : undefined }}>{bo.ngayDaoHan}</td>
                    <td className="r">{fmtTien(bo.soTienGiaiNgan)}</td>
                    <td className="r" style={{ color: '#15803d' }}>{gocDaTra > 0 ? fmtTien(gocDaTra) : '—'}</td>
                    <td className="r" style={{ fontWeight: 700, color: duNo > 0 ? '#b91c1c' : '#15803d' }}>{fmtTien(duNo)}</td>
                    <td>{bo.laiSuat}%</td>
                    <td>{KY_TRA_LABEL[bo.kyTraLai]}</td>
                    <td><Badge cls={BADGE_BO[bo.trangThai]} label={LABEL_BO[bo.trangThai]} /></td>
                    <td onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          onClick={() => { setEditingBo(bo); setBoFormOpen(true) }}
                          style={{ border: '1px solid #cbd5e1', borderRadius: 4, background: '#fff', cursor: 'pointer', color: '#6b7280', padding: '3px 6px' }}
                          title="Sửa bộ hồ sơ"
                        ><Pencil size={12} /></button>
                        {isAdmin && (
                          <button
                            onClick={async () => {
                              if (!confirm(`Xoá bộ hồ sơ ${bo.soBoHoSo}?`)) return
                              try { await deleteBoHoSo(khung.id, bo.id) } catch (e: any) { alert(e.message) }
                            }}
                            style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626', padding: 4 }}
                          ><Trash2 size={13} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {boList.length === 0 && (
                  <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--nh-muted2)', padding: 28 }}>
                    Chưa có bộ hồ sơ giải ngân nào. Bấm "+ Giải ngân mới" để bắt đầu.
                  </td></tr>
                )}
              </tbody>
              {boList.length > 0 && (
                <tfoot>
                  <tr style={{ fontWeight: 700 }}>
                    <td colSpan={3} style={{ ...stickyTf, textAlign: 'right', color: 'var(--nh-muted)', paddingRight: 12 }}>Tổng cộng ({boList.length} bộ):</td>
                    <td className="r" style={stickyTf}>{fmtTien(tongGN)}</td>
                    <td className="r" style={{ ...stickyTf, color: '#15803d' }}>{fmtTien(tongGoc)}</td>
                    <td className="r" style={{ ...stickyTf, color: '#b91c1c' }}>{fmtTien(tongDuNo)}</td>
                    <td colSpan={4} style={stickyTf}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}

          {view === 'calendar' && (
            kyThang.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 32, color: 'var(--nh-muted2)', fontSize: 13 }}>
                Không có kỳ thu nào trong tháng này
              </div>
            ) : (
              <table className="nh-tbl" style={{ minWidth: 780, borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ ...stickyTh, width: 28 }}>
                      <input type="checkbox" checked={kyChuaThu.length > 0 && kyDaChon.length === kyChuaThu.length} onChange={toggleAll} disabled={!kyChuaThu.length} />
                    </th>
                    <th style={stickyTh}>Ngày thu</th>
                    <th style={stickyTh}>Bộ hồ sơ</th>
                    <th style={stickyTh}>Loại</th>
                    <th className="r" style={stickyTh}>Gốc</th>
                    <th className="r" style={stickyTh}>Lãi</th>
                    <th className="r" style={stickyTh}>Tổng thu</th>
                    <th style={stickyTh}>Trạng thái</th>
                    <th style={stickyTh}></th>
                  </tr>
                </thead>
                <tbody>
                  {kyThang.map(k => {
                    const bo       = boMap[k.boHoSoId]
                    const isDaThu  = k.trangThai === 'da-thu'
                    const isQuaHan = k.trangThai === 'qua-han'
                    return (
                      <tr key={k.id} style={{ background: isDaThu ? '#f0fdf4' : isQuaHan ? '#fff5f5' : undefined }}>
                        <td>{!isDaThu && <input type="checkbox" checked={selKy.has(k.id)} onChange={() => toggleKy(k.id)} />}</td>
                        <td style={{ fontWeight: 600 }}>{k.ngayThu}</td>
                        <td>
                          <button onClick={() => bo && setSelectedBo(bo)}
                            style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--nh-navy)', fontWeight: 700, padding: 0, fontSize: 13 }}>
                            {bo?.soBoHoSo ?? k.boHoSoId}
                          </button>
                        </td>
                        <td>
                          <span style={{
                            fontSize: 11, padding: '2px 6px', borderRadius: 4, fontWeight: 600,
                            background: k.loai === 'lai' ? '#eff6ff' : '#fef3c7',
                            color:      k.loai === 'lai' ? '#1d4ed8' : '#92400e',
                          }}>
                            {k.loai === 'goc-va-lai' ? 'Gốc + Lãi' : k.loai === 'goc' ? 'Gốc' : 'Lãi'}
                          </span>
                        </td>
                        <td className="r" style={{ color: k.gocThu > 0 ? '#b91c1c' : '#94a3b8', fontWeight: k.gocThu > 0 ? 700 : undefined }}>
                          {k.gocThu > 0 ? fmt(k.gocThu) : '—'}
                        </td>
                        <td className="r" style={{ color: '#b45309' }}>{fmt(k.laiThu)}</td>
                        <td className="r" style={{ fontWeight: 700 }}>{fmt(k.tongThu)}</td>
                        <td>
                          {isDaThu ? <span className="nh-badge nh-b-green">Đã thu</span>
                            : k.trangThai === 'gan-han' ? <span className="nh-badge nh-b-amber">Gần hạn</span>
                            : isQuaHan ? <span className="nh-badge nh-b-red">Quá hạn</span>
                            : <span className="nh-badge nh-b-grey">Chưa thu</span>}
                        </td>
                        <td>
                          {!isDaThu && (
                            <button onClick={() => setThuKy(k)}
                              style={{ fontSize: 11, padding: '3px 10px', border: 'none', borderRadius: 4, background: '#1C3557', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
                              Thu
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ fontWeight: 700 }}>
                    <td colSpan={4} style={{ ...stickyTf, textAlign: 'right', fontSize: 12.5, color: 'var(--nh-muted)', paddingRight: 12 }}>Tổng cộng ({kyThang.length} kỳ):</td>
                    <td className="r" style={{ ...stickyTf, color: '#b91c1c' }}>{fmt(kyThang.reduce((s, k) => s + k.gocThu, 0))}</td>
                    <td className="r" style={{ ...stickyTf, color: '#b45309' }}>{fmt(kyThang.reduce((s, k) => s + k.laiThu, 0))}</td>
                    <td className="r" style={{ ...stickyTf, color: 'var(--nh-navy)', fontSize: 14 }}>{fmt(kyThang.reduce((s, k) => s + k.tongThu, 0))}</td>
                    <td colSpan={2} style={stickyTf}></td>
                  </tr>
                </tfoot>
              </table>
            )
          )}
        </div>
      </div>

      <BoHoSoForm
        open={boFormOpen}
        hanMuc={khung}
        khaDung={khaDung}
        editing={editingBo}
        onClose={() => { setBoFormOpen(false); setEditingBo(null) }}
      />
      <ThuKyDialog ky={thuKy} onClose={() => setThuKy(null)} />
      <ImportBoHoSoExcel
        open={importOpen}
        hanMuc={khung}
        boList={boList}
        khaDung={khaDung}
        onClose={() => setImportOpen(false)}
      />
    </div>
  )
}

// ─── Dòng hạn mức khung trong bảng danh sách (dạng bảng, gọn) ─
interface KhungRowProps {
  khung:    HanMucNganHan
  onSelect: () => void
  onEdit:   () => void
  onDelete: () => void
  onStats?: (id: string, k: KhaDungSnapshot) => void
}
function KhungRow({ khung, onSelect, onEdit, onDelete, onStats }: KhungRowProps) {
  const { fmtTien } = useDonViTien()
  const isAdmin = useIsAdmin()
  const [boList, setBoList]         = useState<BoHoSoGiaiNgan[]>([])
  const [kyThuMap, setKyThuMap]     = useState<Record<string, KyThuNH[]>>({})
  const [traGocList, setTraGocList] = useState<TraGocGiuaKy[]>([])

  useEffect(() => subscribeBoHoSo(khung.id, setBoList), [khung.id])
  useEffect(() => subscribeTraGocGiuaKy(khung.id, setTraGocList), [khung.id])
  useEffect(() => {
    const boIds = boList.map(b => b.id)
    if (!boIds.length) { setKyThuMap({}); return }
    return subscribeAllKyThuNH(khung.id, boIds, setKyThuMap)
  }, [khung.id, boList.map(b => b.id).join(',')])  // eslint-disable-line react-hooks/exhaustive-deps

  const khaDung  = useMemo(() => tinhKhaDung(khung, boList, kyThuMap, traGocList), [khung, boList, kyThuMap, traGocList])
  useEffect(() => { onStats?.(khung.id, khaDung) }, [khaDung])  // eslint-disable-line react-hooks/exhaustive-deps
  const kyQuaHan = useMemo(() => Object.values(kyThuMap).flat().filter(k => k.trangThai === 'qua-han' || k.trangThai === 'gan-han').length, [kyThuMap])
  const pctColor = khaDung.phanTramSuDung >= 90 ? '#b91c1c' : khaDung.phanTramSuDung >= 70 ? '#D4A64A' : '#15803d'

  return (
    <tr style={{ cursor: 'pointer' }} onClick={onSelect}>
      <td style={{ fontWeight: 700, color: 'var(--nh-navy)', whiteSpace: 'nowrap' }}>
        🏦 {khung.soHopDong}
        {kyQuaHan > 0 && (
          <span style={{ marginLeft: 6, fontSize: 10, color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '1px 5px' }}>
            ⚠ {kyQuaHan} kỳ
          </span>
        )}
      </td>
      <td>{khung.entity}</td>
      <td>{khung.nganHang}{khung.chiNhanh ? ` · ${khung.chiNhanh}` : ''}</td>
      <td style={{ whiteSpace: 'nowrap', fontSize: 11.5, color: 'var(--nh-muted)' }}>
        {khung.ngayHieuLuc} → {khung.ngayHetHan}
      </td>
      <td className="r" style={{ fontWeight: 700, color: 'var(--nh-navy)', whiteSpace: 'nowrap' }}>
        {fmtTien(khaDung.tongHanMuc)}
      </td>
      <td className="r" style={{ whiteSpace: 'nowrap' }}>
        <div style={{ fontWeight: 700, color: '#b45309' }}>{fmtTien(khaDung.duNoHienTai)}</div>
        <div style={{ fontSize: 10.5, color: '#6b7280' }}>{khaDung.soBoDangVay} bộ hồ sơ</div>
      </td>
      <td className="r" style={{ fontWeight: 700, whiteSpace: 'nowrap', color: khaDung.khaDung <= 0 ? '#b91c1c' : '#15803d' }}>
        {fmtTien(khaDung.khaDung)}
      </td>
      <td style={{ minWidth: 110 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ flex: 1, height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(khaDung.phanTramSuDung, 100)}%`, height: '100%', background: pctColor }} />
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: pctColor, minWidth: 30, textAlign: 'right' }}>
            {khaDung.phanTramSuDung}%
          </span>
        </div>
      </td>
      <td><Badge cls={BADGE_KHUNG[khung.trangThai]} label={LABEL_KHUNG[khung.trangThai]} /></td>
      <td onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn-ghost" onClick={onEdit} style={{ padding: '4px 8px' }}><Pencil size={12} /></button>
          {isAdmin && (
            <button onClick={onDelete} style={{ border: '1px solid #fecaca', borderRadius: 5, background: '#fff', cursor: 'pointer', color: '#dc2626', padding: '4px 8px' }}>
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

// ═════════════════════════════════════════════════════════════
// MAIN TAB — Export
// ═════════════════════════════════════════════════════════════
export function TabHanMucNganHan() {
  const { fmtTien } = useDonViTien()
  const [khungList, setKhungList]       = useState<HanMucNganHan[]>([])
  const [selectedKhung, setSelectedKhung] = useState<HanMucNganHan | null>(null)
  const [khungFormOpen, setKhungFormOpen] = useState(false)
  const [editingKhung, setEditingKhung]   = useState<HanMucNganHan | null>(null)
  const [entityFilter, setEntityFilter]   = useState<'all' | EntityType>('all')
  const [statsMap, setStatsMap]           = useState<Record<string, KhaDungSnapshot>>({})
  const { ref: fillRef, h: fillH }         = useFillHeight([!!selectedKhung, khungList.length === 0])

  useEffect(() => subscribeHanMucNganHan(setKhungList, entityFilter), [entityFilter])

  // Cập nhật selectedKhung khi data thay đổi (VD sau khi sửa)
  useEffect(() => {
    if (!selectedKhung) return
    const fresh = khungList.find(k => k.id === selectedKhung.id)
    if (fresh) setSelectedKhung(fresh)
  }, [khungList])  // eslint-disable-line react-hooks/exhaustive-deps

  if (selectedKhung) {
    return (
      <div>
        <ChiTietKhung khung={selectedKhung} onBack={() => setSelectedKhung(null)} />
        <KhungForm
          open={khungFormOpen}
          editing={editingKhung}
          onClose={() => { setKhungFormOpen(false); setEditingKhung(null) }}
        />
      </div>
    )
  }

  // KPI tổng quan
  const tongHanMuc   = khungList.reduce((s, k) => s + k.tongHanMuc, 0)
  const soConHieuLuc = khungList.filter(k => k.trangThai === 'con-hieu-luc' || k.trangThai === 'gan-het-han').length
  const soGanHetHan  = khungList.filter(k => k.trangThai === 'gan-het-han').length

  const tongDuNo = khungList.reduce((x, k) => x + (statsMap[k.id]?.duNoHienTai ?? 0), 0)
  const tongKha  = khungList.reduce((x, k) => x + (statsMap[k.id]?.khaDung ?? 0), 0)
  const pctChung = tongHanMuc > 0 ? Math.round((tongDuNo / tongHanMuc) * 100) : 0

  return (
    <div ref={fillRef} style={{ display: 'flex', flexDirection: 'column', height: fillH, gap: 8, minHeight: 0 }}>
      {/* ── Chỉ số tổng quan (1 dải gọn) ── */}
      <div className="nh-card" style={{ marginBottom: 0, flex: '0 0 auto' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 36px', padding: '8px 14px', alignItems: 'center' }}>
          <MiniStat label="Số hạn mức khung" value={khungList.length} sub={`${soConHieuLuc} còn hiệu lực`} />
          <MiniStat label="Tổng hạn mức" value={fmtTien(tongHanMuc)} color="#1C3557" />
          <MiniStat label="Đang sử dụng" value={fmtTien(tongDuNo)} sub={`${pctChung}% tổng hạn mức`} color="#b45309" />
          <MiniStat label="Khả dụng" value={fmtTien(tongKha)} color="#15803d" />
          {soGanHetHan > 0 && <MiniStat label="⚠️ Gần hết hạn" value={soGanHetHan} sub="Còn ≤ 30 ngày" color="#D4A64A" />}
        </div>
      </div>

      {/* ── Danh sách hạn mức khung: toolbar cố định, bảng cuộn ── */}
      <div className="nh-card" style={fillCard}>
        <div className="nh-card-head" style={{ flex: '0 0 auto' }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {ENTITY_TABS.map(t => (
              <button
                key={t}
                onClick={() => setEntityFilter(t)}
                className="btn-ghost"
                style={entityFilter === t ? { background: 'var(--nh-navy)', color: '#fff', borderColor: 'var(--nh-navy)' } : undefined}
              >
                {t === 'all' ? 'Tất cả' : t}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-ghost" disabled={khungList.length === 0} onClick={() => exportDanhSachKhungNganHanExcel(khungList)}>
              <FileSpreadsheet size={13} style={{ marginRight: 4, verticalAlign: -2 }} />Xuất Excel
            </button>
            <button className="btn-primary" onClick={() => { setEditingKhung(null); setKhungFormOpen(true) }}>
              <Plus size={13} style={{ marginRight: 4 }} />Thêm hạn mức khung
            </button>
          </div>
        </div>

        {khungList.length === 0 ? (
          <div className="nh-card-body" style={{ textAlign: 'center', padding: 40, color: 'var(--nh-muted2)' }}>
            Chưa có hạn mức ngắn hạn nào. Bấm "+ Thêm hạn mức khung" để bắt đầu.
          </div>
        ) : (
          <div style={{ flex: '1 1 0', minHeight: 0, overflow: 'auto' }}>
            <table className="nh-tbl" style={{ minWidth: 1080, borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}>
              <thead>
                <tr>
                  <th style={stickyTh}>Hợp đồng</th>
                  <th style={stickyTh}>Pháp nhân</th>
                  <th style={stickyTh}>Ngân hàng</th>
                  <th style={stickyTh}>Hiệu lực</th>
                  <th className="r" style={stickyTh}>Tổng hạn mức</th>
                  <th className="r" style={stickyTh}>Đang sử dụng</th>
                  <th className="r" style={stickyTh}>Khả dụng</th>
                  <th style={stickyTh}>Mức dùng</th>
                  <th style={stickyTh}>Trạng thái</th>
                  <th style={stickyTh}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {khungList.map(khung => (
                  <KhungRow
                    key={khung.id}
                    khung={khung}
                    onSelect={() => setSelectedKhung(khung)}
                    onEdit={() => { setEditingKhung(khung); setKhungFormOpen(true) }}
                    onStats={(id, k) => setStatsMap(prev => (prev[id] === k ? prev : { ...prev, [id]: k }))}
                    onDelete={async () => {
                      if (!confirm(`Xoá hạn mức ${khung.soHopDong}?`)) return
                      try { await deleteHanMucNganHan(khung.id) }
                      catch (e: any) { alert(e.message) }
                    }}
                  />
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} style={{ ...stickyTf, textAlign: 'right', color: 'var(--nh-muted)', paddingRight: 12, fontWeight: 700 }}>Tổng cộng ({khungList.length} hạn mức):</td>
                  <td className="r" style={{ ...stickyTf, fontWeight: 700, color: 'var(--nh-navy)', whiteSpace: 'nowrap' }}>{fmtTien(tongHanMuc)}</td>
                  <td className="r" style={{ ...stickyTf, fontWeight: 700, color: '#b45309', whiteSpace: 'nowrap' }}>{fmtTien(tongDuNo)}</td>
                  <td className="r" style={{ ...stickyTf, fontWeight: 700, color: '#15803d', whiteSpace: 'nowrap' }}>{fmtTien(tongKha)}</td>
                  <td style={{ ...stickyTf, fontWeight: 700 }}>{pctChung}%</td>
                  <td colSpan={2} style={stickyTf}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <KhungForm
        open={khungFormOpen}
        editing={editingKhung}
        onClose={() => { setKhungFormOpen(false); setEditingKhung(null) }}
      />
    </div>
  )
}