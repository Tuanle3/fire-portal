'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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
import type { EntityType, BankName } from '@/lib/han-muc-types'
import { Pencil, Trash2, Plus, ChevronLeft, X, Check, AlertCircle, Calendar } from 'lucide-react'

// ─── Constants ────────────────────────────────────────────────
const ENTITY_LIST: EntityType[] = ['SAG', 'SAHS', 'ĐTSA', 'YANA', 'Cá nhân']
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
    soHopDong: '', entity: 'SAG', nganHang: 'Vietcombank',
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
      const trangThai = tinhTrangThaiKhung(f.ngayHetHan)
      await saveHanMucNganHan({ ...f, tongHanMuc: hm, trangThai }, editing?.id)
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
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
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

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {fieldWrapper('Số hợp đồng hạn mức *', textInput('soHopDong', 'VD: HMNH-2025-001'), 2)}
          {fieldWrapper('Pháp nhân *', (
            <select value={f.entity} onChange={e => setF(p => ({ ...p, entity: e.target.value as EntityType }))} style={inputBaseCls}>
              {ENTITY_LIST.map(e => <option key={e}>{e}</option>)}
            </select>
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
        trangThai:         'dang-vay',
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
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
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

  useEffect(() => {
    if (!ky) return
    setNgay(todayStr())
    setGocStr(ky.gocThu ? ky.gocThu.toLocaleString('vi-VN') : '0')
    setLaiStr(ky.laiThu ? ky.laiThu.toLocaleString('vi-VN') : '0')
    setErr('')
  }, [ky?.id])

  if (!ky) return null

  const handleSave = async () => {
    if (!ngay) return setErr('Nhập ngày thu thực tế')
    setSaving(true)
    try {
      await markKyThuDaThu(ky.hanMucId, ky.boHoSoId, ky.id, ngay, parseVnd(gocStr), parseVnd(laiStr))
      onClose()
    } catch (e: any) { setErr(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
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
          <div>
            <label style={{ fontSize: 11.5, color: 'var(--nh-muted)', fontWeight: 500 }}>Ngày thu thực tế *</label>
            <input type="date" value={ngay} onChange={e => setNgay(e.target.value)} style={{ ...inputBaseCls, marginTop: 3 }} />
          </div>
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
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
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

  return (
    <div>
      <div className="nh-card">
        <div className="nh-card-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn-ghost" onClick={onBack} style={{ fontSize: 12, padding: '5px 10px' }}>
              <ChevronLeft size={13} style={{ marginRight: 3 }} />Quay lại
            </button>
            <span className="nh-card-title">{bo.soBoHoSo}</span>
            <Badge cls={BADGE_BO[bo.trangThai]} label={LABEL_BO[bo.trangThai]} />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {bo.trangThai !== 'tat-toan' && duNoConLai > 0 && (
              <button className="btn-ghost" onClick={() => setTraGocOpen(true)} style={{ fontSize: 12 }}>
                💳 Trả gốc giữa kỳ
              </button>
            )}
            <button className="btn-ghost" onClick={() => setEditOpen(true)}>Sửa bộ hồ sơ</button>
          </div>
        </div>

        <div className="nh-card-body">
          <div style={{ fontSize: 11.5, color: 'var(--nh-muted)', marginBottom: 12 }}>
            🏦 {khung.soHopDong} · {khung.entity} · {khung.nganHang}
            {khung.chiNhanh ? ` · ${khung.chiNhanh}` : ''}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: 8, marginBottom: 14 }}>
            <KpiCard label="Giải ngân" value={`${fmtM(bo.soTienGiaiNgan)} đ`} sub={bo.ngayGiaiNgan} />
            <KpiCard label="Dư nợ còn lại" value={`${fmtM(duNoConLai)} đ`}
              sub={`${((gocDaTra / bo.soTienGiaiNgan) * 100 || 0).toFixed(1)}% đã trả`}
              color={duNoConLai > 0 ? '#b91c1c' : '#15803d'} />
            <KpiCard label="Lãi suất" value={`${bo.laiSuat}%/năm`} sub={KY_TRA_LABEL[bo.kyTraLai]} />
            <KpiCard label="Đáo hạn" value={bo.ngayDaoHan}
              color={bo.trangThai === 'qua-han' ? '#b91c1c' : bo.trangThai === 'gan-dao-han' ? '#D4A64A' : undefined} />
            <KpiCard label="Lãi đã thu" value={`${fmtM(tongLaiDaThu)} đ`} sub="Lũy kế" color="#b45309" />
            <KpiCard label="Gốc đã trả" value={`${fmtM(gocDaTra)} đ`} sub={`${boTraGoc.length} lần giữa kỳ + kỳ thu`} />
          </div>

          {(bo.mucDichVay || bo.taiSanDamBao) && (
            <div style={{ display: 'flex', gap: 16, fontSize: 12.5, color: '#374151', marginBottom: 14, flexWrap: 'wrap' }}>
              {bo.mucDichVay   && <span><b>Mục đích:</b> {bo.mucDichVay}</span>}
              {bo.taiSanDamBao && <span><b>TSĐB:</b> {bo.taiSanDamBao}</span>}
              {bo.ghiChu       && <span><b>Ghi chú:</b> {bo.ghiChu}</span>}
            </div>
          )}

          {/* Lịch trả gốc giữa kỳ */}
          {boTraGoc.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--nh-muted)', marginBottom: 6 }}>
                Trả gốc giữa kỳ ({boTraGoc.length} lần)
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {boTraGoc.map(t => (
                  <div key={t.id} style={{
                    fontSize: 12, background: '#f0fdf4', border: '1px solid #bbf7d0',
                    borderRadius: 6, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <span>{t.ngayTra}</span>
                    <b style={{ color: '#15803d' }}>{fmtM(t.soTienGoc)} đ</b>
                    {t.ghiChu && <span style={{ color: '#6b7280' }}>({t.ghiChu})</span>}
                    <button
                      onClick={async () => {
                        if (!confirm('Xoá khoản trả gốc này?')) return
                        await deleteTraGocGiuaKy(t.id, t.hanMucId, t.boHoSoId)
                      }}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626', padding: 0 }}
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Lịch kỳ thu */}
      <div className="nh-card">
        <div className="nh-card-head">
          <span className="nh-card-title" style={{ fontSize: 14 }}>Lịch thu lãi & gốc</span>
          <span style={{ fontSize: 12, color: 'var(--nh-muted)' }}>{kyList.length} kỳ</span>
        </div>
        <div className="nh-card-body" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="nh-tbl" style={{ minWidth: 660 }}>
            <thead>
              <tr>
                <th>Kỳ</th>
                <th>Ngày thu</th>
                <th>Loại</th>
                <th className="r">Dư nợ đầu kỳ</th>
                <th className="r">Gốc thu</th>
                <th className="r">Lãi thu</th>
                <th className="r">Tổng thu</th>
                <th className="r">Dư nợ cuối kỳ</th>
                <th>Trạng thái</th>
                <th></th>
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
                      {isDaThu && k.ngayThucThu && k.ngayThucThu !== k.ngayThu && (
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
  const kyThang = useMemo(() => filterKyThuTheoThang(kyThuMap, calMonth), [kyThuMap, calMonth])
  const boMap   = useMemo(() => Object.fromEntries(boList.map(b => [b.id, b])), [boList])

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

  return (
    <div>
      {/* Header card */}
      <div className="nh-card">
        <div className="nh-card-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn-ghost" onClick={onBack} style={{ fontSize: 12, padding: '5px 10px' }}>
              <ChevronLeft size={13} style={{ marginRight: 3 }} />Quay lại
            </button>
            <span className="nh-card-title">{khung.soHopDong}</span>
            <Badge cls={BADGE_KHUNG[khung.trangThai]} label={LABEL_KHUNG[khung.trangThai]} />
          </div>
          <button className="btn-primary" onClick={() => { setEditingBo(null); setBoFormOpen(true) }}>
            <Plus size={13} style={{ marginRight: 4 }} />Giải ngân bộ hồ sơ mới
          </button>
        </div>

        <div className="nh-card-body">
          <div style={{ fontSize: 11.5, color: 'var(--nh-muted)', marginBottom: 12 }}>
            {khung.entity} · {khung.nganHang}{khung.chiNhanh ? ` · ${khung.chiNhanh}` : ''}
            {khung.nguoiVay ? ` · ${khung.nguoiVay}` : ''}
            {' · Hiệu lực: '}{khung.ngayHieuLuc} → {khung.ngayHetHan}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: 8, marginBottom: 12 }}>
            <KpiCard label="Tổng hạn mức"     value={`${fmtM(khaDung.tongHanMuc)} đ`}   sub="Hiện tại sau điều chỉnh" color="#1C3557" />
            <KpiCard label="Dư nợ hiện tại"   value={`${fmtM(khaDung.duNoHienTai)} đ`}  sub={`${khaDung.soBoDangVay} bộ hồ sơ đang vay`} color="#b45309" />
            <KpiCard label="Hạn mức khả dụng" value={`${fmtM(khaDung.khaDung)} đ`}
              sub={khaDung.phanTramSuDung >= 90 ? '⚠️ Gần chạm hạn mức' : 'Có thể giải ngân tiếp'}
              color={khaDung.phanTramSuDung >= 90 ? '#b91c1c' : '#15803d'} />
            <KpiCard label="Sử dụng"          value={`${khaDung.phanTramSuDung}%`} />
          </div>
          <ProgressBar pct={khaDung.phanTramSuDung} warn={khaDung.phanTramSuDung >= 70} />

          {khung.laiSuatMacDinh && (
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>
              Lãi suất gợi ý: <b>{khung.laiSuatMacDinh}%/năm</b>
            </div>
          )}
        </div>
      </div>

      {/* Toggle view */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <button
          className="btn-ghost" onClick={() => setView('list')}
          style={view === 'list' ? { background: 'var(--nh-navy)', color: '#fff', borderColor: 'var(--nh-navy)' } : undefined}
        >
          Danh sách bộ hồ sơ
        </button>
        <button
          className="btn-ghost" onClick={() => setView('calendar')}
          style={view === 'calendar' ? { background: 'var(--nh-navy)', color: '#fff', borderColor: 'var(--nh-navy)' } : undefined}
        >
          <Calendar size={13} style={{ marginRight: 4 }} />Lịch thu tổng hợp
        </button>
      </div>

      {/* ── DANH SÁCH BỘ HỒ SƠ ── */}
      {view === 'list' && (
        <div className="nh-card">
          <div className="nh-card-body" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="nh-tbl" style={{ minWidth: 820 }}>
              <thead>
                <tr>
                  <th>Bộ hồ sơ</th>
                  <th>Ngày GN</th>
                  <th>Đáo hạn</th>
                  <th className="r">Giải ngân</th>
                  <th className="r">Gốc đã trả</th>
                  <th className="r">Dư nợ còn</th>
                  <th>Lãi suất</th>
                  <th>Kỳ lãi</th>
                  <th>Trạng thái</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {boList.map(bo => {
                  const kyList   = kyThuMap[bo.id] ?? []
                  const tgList   = traGocList.filter(t => t.boHoSoId === bo.id)
                  const gocDaTra = tinhGocDaTraBoHoSo(bo.id, kyList, tgList)
                  const duNo     = Math.max(0, bo.soTienGiaiNgan - gocDaTra)
                  const kyQuaHan = kyList.filter(k => k.trangThai === 'qua-han').length
                  return (
                    <tr key={bo.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedBo(bo)}>
                      <td style={{ fontWeight: 700, color: 'var(--nh-navy)' }}>
                        {bo.soBoHoSo}
                        {kyQuaHan > 0 && <span style={{ marginLeft: 5, fontSize: 10, color: '#b91c1c' }}>⚠️ {kyQuaHan} kỳ QH</span>}
                      </td>
                      <td>{bo.ngayGiaiNgan}</td>
                      <td style={{ color: bo.trangThai === 'qua-han' ? '#b91c1c' : bo.trangThai === 'gan-dao-han' ? '#D4A64A' : undefined }}>
                        {bo.ngayDaoHan}
                      </td>
                      <td className="r">{fmtM(bo.soTienGiaiNgan)} đ</td>
                      <td className="r" style={{ color: '#15803d' }}>{gocDaTra > 0 ? `${fmtM(gocDaTra)} đ` : '—'}</td>
                      <td className="r" style={{ fontWeight: 700, color: duNo > 0 ? '#b91c1c' : '#15803d' }}>
                        {fmtM(duNo)} đ
                      </td>
                      <td>{bo.laiSuat}%</td>
                      <td>{KY_TRA_LABEL[bo.kyTraLai]}</td>
                      <td><Badge cls={BADGE_BO[bo.trangThai]} label={LABEL_BO[bo.trangThai]} /></td>
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            onClick={() => { setEditingBo(bo); setBoFormOpen(true) }}
                            style={{ border: '1px solid #cbd5e1', borderRadius: 4, background: '#fff', cursor: 'pointer', color: '#6b7280', padding: '3px 6px' }}
                            title="Sửa bộ hồ sơ"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            onClick={async () => {
                              if (!confirm(`Xoá bộ hồ sơ ${bo.soBoHoSo}?`)) return
                              try { await deleteBoHoSo(khung.id, bo.id) }
                              catch (e: any) { alert(e.message) }
                            }}
                            style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626', padding: 4 }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {boList.length === 0 && (
                  <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--nh-muted2)', padding: 28 }}>
                    Chưa có bộ hồ sơ giải ngân nào. Bấm "+ Giải ngân bộ hồ sơ mới" để bắt đầu.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── LỊCH THU TỔNG HỢP ── */}
      {view === 'calendar' && (
        <div className="nh-card">
          <div className="nh-card-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button className="btn-ghost" onClick={prevMonth} style={{ padding: '4px 10px' }}>‹</button>
              <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--nh-navy)', minWidth: 110, textAlign: 'center' }}>
                {calMonth.replace(/(\d{4})-(\d{2})/, 'Tháng $2/$1')}
              </span>
              <button className="btn-ghost" onClick={nextMonth} style={{ padding: '4px 10px' }}>›</button>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--nh-muted)' }}>
              {kyThang.length} kỳ thu · tổng:{' '}
              <b style={{ color: 'var(--nh-navy)' }}>
                {fmtM(kyThang.reduce((s, k) => s + k.tongThu, 0))} đ
              </b>
            </div>
          </div>
          <div className="nh-card-body" style={{ padding: 0, overflowX: 'auto' }}>
            {kyThang.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 32, color: 'var(--nh-muted2)', fontSize: 13 }}>
                Không có kỳ thu nào trong tháng này
              </div>
            ) : (
              <table className="nh-tbl" style={{ minWidth: 720 }}>
                <thead>
                  <tr>
                    <th>Ngày thu</th>
                    <th>Bộ hồ sơ</th>
                    <th>Loại</th>
                    <th className="r">Gốc</th>
                    <th className="r">Lãi</th>
                    <th className="r">Tổng thu</th>
                    <th>Trạng thái</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {kyThang.map(k => {
                    const bo       = boMap[k.boHoSoId]
                    const isDaThu  = k.trangThai === 'da-thu'
                    const isQuaHan = k.trangThai === 'qua-han'
                    return (
                      <tr key={k.id} style={{ background: isDaThu ? '#f0fdf4' : isQuaHan ? '#fff5f5' : undefined }}>
                        <td style={{ fontWeight: 600 }}>{k.ngayThu}</td>
                        <td>
                          <button
                            onClick={() => bo && setSelectedBo(bo)}
                            style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--nh-navy)', fontWeight: 700, padding: 0, fontSize: 13 }}
                          >
                            {bo?.soBoHoSo ?? k.boHoSoId}
                          </button>
                        </td>
                        <td>
                          <span style={{
                            fontSize: 11, padding: '2px 6px', borderRadius: 4, fontWeight: 600,
                            background: k.loai === 'goc-va-lai' ? '#fef3c7' : '#eff6ff',
                            color:      k.loai === 'goc-va-lai' ? '#92400e' : '#1d4ed8',
                          }}>
                            {k.loai === 'goc-va-lai' ? 'Gốc + Lãi' : 'Lãi'}
                          </span>
                        </td>
                        <td className="r" style={{ color: k.gocThu > 0 ? '#b91c1c' : '#94a3b8', fontWeight: k.gocThu > 0 ? 700 : undefined }}>
                          {k.gocThu > 0 ? fmt(k.gocThu) : '—'}
                        </td>
                        <td className="r" style={{ color: '#b45309' }}>{fmt(k.laiThu)}</td>
                        <td className="r" style={{ fontWeight: 700 }}>{fmt(k.tongThu)}</td>
                        <td>
                          {isDaThu      ? <span className="nh-badge nh-b-green">Đã thu</span>
                            : k.trangThai === 'gan-han' ? <span className="nh-badge nh-b-amber">Gần hạn</span>
                            : isQuaHan  ? <span className="nh-badge nh-b-red">Quá hạn</span>
                            : <span className="nh-badge nh-b-grey">Chưa thu</span>}
                        </td>
                        <td>
                          {!isDaThu && (
                            <button
                              onClick={() => bo && setSelectedBo(bo)}
                              style={{ fontSize: 11, padding: '3px 8px', border: 'none', borderRadius: 4, background: '#1C3557', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
                            >
                              Xem
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                    <td colSpan={3} style={{ textAlign: 'right', fontSize: 12.5, color: 'var(--nh-muted)', paddingRight: 12 }}>Tổng tháng:</td>
                    <td className="r" style={{ color: '#b91c1c' }}>{fmt(kyThang.reduce((s, k) => s + k.gocThu, 0))}</td>
                    <td className="r" style={{ color: '#b45309' }}>{fmt(kyThang.reduce((s, k) => s + k.laiThu, 0))}</td>
                    <td className="r" style={{ color: 'var(--nh-navy)', fontSize: 14 }}>{fmt(kyThang.reduce((s, k) => s + k.tongThu, 0))}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>
      )}

      <BoHoSoForm
        open={boFormOpen}
        hanMuc={khung}
        khaDung={khaDung}
        editing={editingBo}
        onClose={() => { setBoFormOpen(false); setEditingBo(null) }}
      />
    </div>
  )
}

// ─── Card hạn mức khung (summary trên list) ──────────────────
interface KhungCardProps {
  khung:    HanMucNganHan
  onSelect: () => void
  onEdit:   () => void
  onDelete: () => void
}
function KhungCard({ khung, onSelect, onEdit, onDelete }: KhungCardProps) {
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
  const kyQuaHan = useMemo(() => Object.values(kyThuMap).flat().filter(k => k.trangThai === 'qua-han' || k.trangThai === 'gan-han').length, [kyThuMap])

  return (
    <div style={{
      border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px',
      cursor: 'pointer', transition: 'box-shadow .15s',
    }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 12px #0001')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
      onClick={onSelect}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--nh-navy)' }}>🏦 {khung.soHopDong}</span>
            <Badge cls={BADGE_KHUNG[khung.trangThai]} label={LABEL_KHUNG[khung.trangThai]} />
            {kyQuaHan > 0 && (
              <span style={{ fontSize: 11, color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '1px 6px' }}>
                ⚠️ {kyQuaHan} kỳ cần thu
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--nh-muted)' }}>
            {khung.entity} · {khung.nganHang}{khung.chiNhanh ? ` · ${khung.chiNhanh}` : ''}
            {' · '}{khung.ngayHieuLuc} → {khung.ngayHetHan}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
          <button className="btn-ghost" onClick={onEdit} style={{ padding: '4px 8px' }}><Pencil size={12} /></button>
          <button onClick={onDelete} style={{ border: '1px solid #fecaca', borderRadius: 5, background: '#fff', cursor: 'pointer', color: '#dc2626', padding: '4px 8px' }}>
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 10.5, color: 'var(--nh-muted)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '.04em' }}>Tổng hạn mức</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--nh-navy)' }}>{fmtM(khaDung.tongHanMuc)} đ</div>
        </div>
        <div>
          <div style={{ fontSize: 10.5, color: 'var(--nh-muted)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '.04em' }}>Đang sử dụng</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#b45309' }}>{fmtM(khaDung.duNoHienTai)} đ</div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>{khaDung.soBoDangVay} bộ hồ sơ · {khaDung.phanTramSuDung}%</div>
        </div>
        <div>
          <div style={{ fontSize: 10.5, color: 'var(--nh-muted)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '.04em' }}>Khả dụng</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: khaDung.phanTramSuDung >= 90 ? '#b91c1c' : '#15803d' }}>
            {fmtM(khaDung.khaDung)} đ
          </div>
        </div>
      </div>
      <ProgressBar pct={khaDung.phanTramSuDung} warn={khaDung.phanTramSuDung >= 70} />
    </div>
  )
}

// ═════════════════════════════════════════════════════════════
// MAIN TAB — Export
// ═════════════════════════════════════════════════════════════
export function TabHanMucNganHan() {
  const [khungList, setKhungList]       = useState<HanMucNganHan[]>([])
  const [selectedKhung, setSelectedKhung] = useState<HanMucNganHan | null>(null)
  const [khungFormOpen, setKhungFormOpen] = useState(false)
  const [editingKhung, setEditingKhung]   = useState<HanMucNganHan | null>(null)

  useEffect(() => subscribeHanMucNganHan(setKhungList), [])

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

  return (
    <div>
      {/* KPI */}
      <div className="nh-kpi-row">
        <div className="nh-kpi">
          <span className="nh-kpi-label">Số hạn mức khung</span>
          <span className="nh-kpi-val">{khungList.length}</span>
          <span className="nh-kpi-sub">{soConHieuLuc} còn hiệu lực</span>
        </div>
        <div className="nh-kpi">
          <span className="nh-kpi-label">Tổng hạn mức</span>
          <span className="nh-kpi-val">{fmtM(tongHanMuc)}<span style={{ fontSize: 12 }}> đồng</span></span>
          <span className="nh-kpi-sub">Toàn bộ hạn mức khung</span>
        </div>
        {soGanHetHan > 0 && (
          <div className="nh-kpi" style={{ borderColor: '#fde68a' }}>
            <span className="nh-kpi-label" style={{ color: '#D4A64A' }}>⚠️ Gần hết hạn</span>
            <span className="nh-kpi-val" style={{ color: '#D4A64A' }}>{soGanHetHan}</span>
            <span className="nh-kpi-sub">Còn ≤ 30 ngày</span>
          </div>
        )}
      </div>

      {/* Danh sách hạn mức khung */}
      <div className="nh-card">
        <div className="nh-card-head">
          <span className="nh-card-title">Hạn mức tín dụng ngắn hạn</span>
          <button className="btn-primary" onClick={() => { setEditingKhung(null); setKhungFormOpen(true) }}>
            <Plus size={13} style={{ marginRight: 4 }} />Thêm hạn mức khung
          </button>
        </div>

        {khungList.length === 0 ? (
          <div className="nh-card-body" style={{ textAlign: 'center', padding: 40, color: 'var(--nh-muted2)' }}>
            Chưa có hạn mức ngắn hạn nào. Bấm "+ Thêm hạn mức khung" để bắt đầu.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10, padding: 14 }}>
            {khungList.map(khung => (
              <KhungCard
                key={khung.id}
                khung={khung}
                onSelect={() => setSelectedKhung(khung)}
                onEdit={() => { setEditingKhung(khung); setKhungFormOpen(true) }}
                onDelete={async () => {
                  if (!confirm(`Xoá hạn mức ${khung.soHopDong}?`)) return
                  try { await deleteHanMucNganHan(khung.id) }
                  catch (e: any) { alert(e.message) }
                }}
              />
            ))}
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