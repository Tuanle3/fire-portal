'use client'

/**
 * ImportBoHoSoExcel — Nhập nhanh nhiều "Bộ hồ sơ giải ngân" (khoản vay mới
 * phát sinh) của 1 hạn mức khung ngắn hạn từ file Excel, thay vì phải bấm
 * "+ Giải ngân mới" từng khoản một.
 * ─────────────────────────────────────────────────────────────
 * Cách dùng:
 *   import ImportBoHoSoExcel from '@/components/han-muc/ImportBoHoSoExcel'
 *   <ImportBoHoSoExcel
 *     open={importOpen}
 *     hanMuc={khung}
 *     boList={boList}
 *     khaDung={khaDung}
 *     onClose={() => setImportOpen(false)}
 *   />
 *
 * Yêu cầu: package "xlsx" (SheetJS) đã cài trong project
 *   npm install xlsx
 * ─────────────────────────────────────────────────────────────
 */

import { useMemo, useRef, useState } from 'react'
import { X, Upload, Download, FileSpreadsheet, AlertCircle, CheckCircle2 } from 'lucide-react'
import { saveBoHoSo } from '@/lib/han-muc-ngan-han-store'
import type { HanMucNganHan, BoHoSoGiaiNgan, KhaDungSnapshot, KyTraLaiNH } from '@/lib/han-muc-ngan-han-types'

// ─── Cấu hình cột nhận diện trong file Excel ───────────────────
// Tên cột trong file có thể viết khác nhau (có dấu / không dấu, hoa/thường,
// thừa khoảng trắng...) — hệ thống sẽ tự nhận diện theo các alias bên dưới.
const HEADER_ALIASES: Record<string, keyof RowInput> = {
  sobohoso: 'soBoHoSo', mahoso: 'soBoHoSo', sohoso: 'soBoHoSo', mahs: 'soBoHoSo',
  sotiengiaingan: 'soTienGiaiNgan', giaingan: 'soTienGiaiNgan', sotienvay: 'soTienGiaiNgan', sotien: 'soTienGiaiNgan',
  ngaygiaingan: 'ngayGiaiNgan', ngaygn: 'ngayGiaiNgan',
  ngaydaohan: 'ngayDaoHan', daohan: 'ngayDaoHan', ngayhethan: 'ngayDaoHan',
  laisuat: 'laiSuat', laisuatnam: 'laiSuat', laisuatnamphantram: 'laiSuat',
  kytralai: 'kyTraLai', chukytralai: 'kyTraLai', kylai: 'kyTraLai',
  ngaytralaidautien: 'ngayTraLaiDauTien', ngaythulaidautien: 'ngayTraLaiDauTien',
  mucdichvay: 'mucDichVay', mucdich: 'mucDichVay',
  taisandambao: 'taiSanDamBao', tsdb: 'taiSanDamBao',
  ghichu: 'ghiChu', note: 'ghiChu',
}

const TEMPLATE_HEADERS = [
  'Số bộ hồ sơ', 'Số tiền giải ngân', 'Ngày giải ngân', 'Ngày đáo hạn',
  'Lãi suất (%/năm)', 'Kỳ trả lãi', 'Ngày thu lãi đầu tiên', 'Mục đích vay', 'Tài sản đảm bảo', 'Ghi chú',
]
const TEMPLATE_SAMPLE = [
  'HSTN-001', 3000000000, '2026-09-25', '2026-12-25', 8.4, 'Hàng tháng', '', 'Bổ sung vốn lưu động', '', '',
]

interface RowInput {
  soBoHoSo: string
  soTienGiaiNgan: number
  ngayGiaiNgan: string
  ngayDaoHan: string
  laiSuat: number
  kyTraLai: KyTraLaiNH
  ngayTraLaiDauTien?: string
  mucDichVay?: string
  taiSanDamBao?: string
  ghiChu?: string
}

interface ParsedRow extends RowInput {
  rowIndex: number
  errors: string[]
  status: 'pending' | 'saving' | 'ok' | 'fail'
  errorMsg?: string
}

// ─── Helpers ────────────────────────────────────────────────
function normHeader(s: string): string {
  return s.toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '')
}

function parseAmount(v: any): number {
  if (typeof v === 'number') return Math.round(v)
  if (!v) return 0
  const digits = String(v).replace(/[^\d]/g, '')
  return digits ? Number(digits) : 0
}

function parseDecimal(v: any): number {
  if (typeof v === 'number') return v
  if (!v) return 0
  const s = String(v).trim().replace(',', '.').replace(/[^\d.]/g, '')
  const n = Number(s)
  return isNaN(n) ? 0 : n
}

function parseDateCell(v: any): string {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`
  }
  const s = String(v ?? '').trim()
  if (!s) return ''
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return ''
}

function parseKyTraLai(v: any): KyTraLaiNH {
  const s = normHeader(String(v ?? ''))
  if (s.includes('quy')) return 'quarterly'
  if (s.includes('cuoiky') || s.includes('cuoiki')) return 'cuoi-ky'
  return 'monthly'
}

const fmt = (n: number) => n.toLocaleString('vi-VN')

// ─── Component ──────────────────────────────────────────────
interface Props {
  open:    boolean
  hanMuc:  HanMucNganHan
  boList:  BoHoSoGiaiNgan[]
  khaDung: KhaDungSnapshot
  onClose: () => void
}

export default function ImportBoHoSoExcel({ open, hanMuc, boList, khaDung, onClose }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [rows, setRows]         = useState<ParsedRow[]>([])
  const [fileErr, setFileErr]   = useState('')
  const [fileName, setFileName] = useState('')
  const [importing, setImporting] = useState(false)
  const [done, setDone]           = useState(false)

  const existingSo = useMemo(() => new Set(boList.map(b => b.soBoHoSo.trim().toLowerCase())), [boList])

  const reset = () => {
    setRows([]); setFileErr(''); setFileName(''); setImporting(false); setDone(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleClose = () => { reset(); onClose() }

  if (!open) return null

  // ── Tải file mẫu ──
  const downloadTemplate = async () => {
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, TEMPLATE_SAMPLE])
    ws['!cols'] = TEMPLATE_HEADERS.map(() => ({ wch: 20 }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Import')
    XLSX.writeFile(wb, `Mau_import_giai_ngan_${hanMuc.soHopDong}.xlsx`)
  }

  // ── Đọc & phân tích file ──
  const handleFile = async (file: File) => {
    setFileErr(''); setDone(false); setFileName(file.name)
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', cellDates: true })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const raw: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { defval: '' })

      if (!raw.length) { setFileErr('File không có dữ liệu.'); setRows([]); return }

      // Map header → field theo alias
      const sampleKeys = Object.keys(raw[0])
      const keyMap: Record<string, keyof RowInput> = {}
      for (const k of sampleKeys) {
        const norm = normHeader(k)
        if (HEADER_ALIASES[norm]) keyMap[k] = HEADER_ALIASES[norm]
      }
      if (!Object.values(keyMap).includes('soBoHoSo')) {
        setFileErr('Không tìm thấy cột "Số bộ hồ sơ" trong file. Vui lòng dùng đúng file mẫu.')
        setRows([])
        return
      }

      const seenInFile = new Set<string>()
      const parsed: ParsedRow[] = raw.map((r, i) => {
        const get = (field: keyof RowInput) => {
          const key = Object.keys(keyMap).find(k => keyMap[k] === field)
          return key ? r[key] : ''
        }
        const soBoHoSo       = String(get('soBoHoSo') ?? '').trim()
        const soTienGiaiNgan = parseAmount(get('soTienGiaiNgan'))
        const ngayGiaiNgan   = parseDateCell(get('ngayGiaiNgan'))
        const ngayDaoHan     = parseDateCell(get('ngayDaoHan'))
        const laiSuat        = parseDecimal(get('laiSuat'))
        const kyTraLai        = parseKyTraLai(get('kyTraLai'))
        const ngayTraLaiRaw   = get('ngayTraLaiDauTien')
        const ngayTraLaiDauTien = ngayTraLaiRaw ? parseDateCell(ngayTraLaiRaw) || undefined : undefined
        const mucDichVay      = String(get('mucDichVay') ?? '').trim() || undefined
        const taiSanDamBao    = String(get('taiSanDamBao') ?? '').trim() || undefined
        const ghiChu          = String(get('ghiChu') ?? '').trim() || undefined

        const errors: string[] = []
        if (!soBoHoSo) errors.push('Thiếu số bộ hồ sơ')
        else if (existingSo.has(soBoHoSo.toLowerCase())) errors.push('Đã tồn tại trong hệ thống')
        else if (seenInFile.has(soBoHoSo.toLowerCase())) errors.push('Trùng trong file')
        if (soBoHoSo) seenInFile.add(soBoHoSo.toLowerCase())
        if (!soTienGiaiNgan) errors.push('Thiếu/sai số tiền giải ngân')
        if (!ngayGiaiNgan) errors.push('Thiếu/sai ngày giải ngân')
        if (!ngayDaoHan) errors.push('Thiếu/sai ngày đáo hạn')
        if (!laiSuat) errors.push('Thiếu/sai lãi suất')

        return {
          soBoHoSo, soTienGiaiNgan, ngayGiaiNgan, ngayDaoHan, laiSuat, kyTraLai,
          ngayTraLaiDauTien, mucDichVay, taiSanDamBao, ghiChu,
          rowIndex: i + 2, // +2 = tính cả dòng tiêu đề, khớp số dòng thật trong Excel
          errors,
          status: 'pending',
        }
      })
      setRows(parsed)
    } catch (e: any) {
      setFileErr('Không đọc được file. Kiểm tra định dạng .xlsx/.xls/.csv. Lỗi: ' + (e?.message ?? String(e)))
      setRows([])
    }
  }

  const validRows   = rows.filter(r => r.errors.length === 0)
  const invalidRows = rows.filter(r => r.errors.length > 0)
  const tongGiaiNganHopLe = validRows.reduce((s, r) => s + r.soTienGiaiNgan, 0)
  const vuotKhaDung = tongGiaiNganHopLe > khaDung.khaDung

  const doImport = async () => {
    if (!validRows.length) return
    if (vuotKhaDung && !confirm(
      `Tổng ${fmt(tongGiaiNganHopLe)} đ vượt hạn mức khả dụng hiện tại (${fmt(khaDung.khaDung)} đ).\nVẫn tiếp tục nhập?`
    )) return

    setImporting(true)
    setRows(prev => prev.map(r => r.errors.length === 0 ? { ...r, status: 'saving' } : r))

    // Nhập tuần tự từng dòng để tránh chạy đua khi hệ thống tự tính lại khả dụng/trạng thái
    for (const row of rows) {
      if (row.errors.length > 0) continue
      try {
        await saveBoHoSo({
          soBoHoSo:           row.soBoHoSo,
          soTienGiaiNgan:     row.soTienGiaiNgan,
          ngayGiaiNgan:       row.ngayGiaiNgan,
          ngayDaoHan:         row.ngayDaoHan,
          laiSuat:            row.laiSuat,
          kyTraLai:           row.kyTraLai,
          ngayTraLaiDauTien:  row.ngayTraLaiDauTien,
          mucDichVay:         row.mucDichVay,
          taiSanDamBao:       row.taiSanDamBao,
          ghiChu:             row.ghiChu,
          hanMucId:           hanMuc.id,
        } as any)
        setRows(prev => prev.map(r => r.rowIndex === row.rowIndex ? { ...r, status: 'ok' } : r))
      } catch (e: any) {
        setRows(prev => prev.map(r => r.rowIndex === row.rowIndex ? { ...r, status: 'fail', errorMsg: e?.message ?? String(e) } : r))
      }
    }
    setImporting(false)
    setDone(true)
  }

  const okCount   = rows.filter(r => r.status === 'ok').length
  const failCount = rows.filter(r => r.status === 'fail').length

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: '100%', maxWidth: 900, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px #0003' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--nh-navy)' }}>
            Nhập Excel — Bộ hồ sơ giải ngân ({hanMuc.soHopDong})
          </h3>
          <button onClick={handleClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6b7280' }}><X size={18} /></button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--nh-muted)', margin: '0 0 14px' }}>
          Tải file mẫu, điền các khoản vay mới phát sinh, rồi tải file lên để nhập hàng loạt thay vì nhập tay từng khoản.
        </p>

        {/* Bước 1: tải mẫu + chọn file */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          <button className="btn-ghost" onClick={downloadTemplate}>
            <Download size={13} style={{ marginRight: 4, verticalAlign: -2 }} />Tải file mẫu (.xlsx)
          </button>
          <button className="btn-primary" onClick={() => fileInputRef.current?.click()}>
            <Upload size={13} style={{ marginRight: 4, verticalAlign: -2 }} />Chọn file để nhập
          </button>
          <input
            ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
          />
          {fileName && <span style={{ fontSize: 12, color: 'var(--nh-muted)', alignSelf: 'center' }}><FileSpreadsheet size={13} style={{ verticalAlign: -2, marginRight: 3 }} />{fileName}</span>}
        </div>

        {fileErr && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '7px 12px', fontSize: 12.5, color: '#b91c1c', marginBottom: 12 }}>
            <AlertCircle size={13} /> {fileErr}
          </div>
        )}

        {/* Bước 2: preview */}
        {rows.length > 0 && (
          <>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12.5, marginBottom: 8 }}>
              <span>Tổng dòng: <b>{rows.length}</b></span>
              <span style={{ color: '#15803d' }}>Hợp lệ: <b>{validRows.length}</b></span>
              {invalidRows.length > 0 && <span style={{ color: '#b91c1c' }}>Lỗi: <b>{invalidRows.length}</b></span>}
              {done && <span style={{ color: '#15803d' }}>Đã nhập thành công: <b>{okCount}</b></span>}
              {done && failCount > 0 && <span style={{ color: '#b91c1c' }}>Nhập thất bại: <b>{failCount}</b></span>}
            </div>

            {vuotKhaDung && !done && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fffbeb', border: '1px solid #f5c542', borderRadius: 6, padding: '7px 12px', fontSize: 12.5, color: '#92600a', marginBottom: 10 }}>
                <AlertCircle size={13} /> Tổng giải ngân hợp lệ ({fmt(tongGiaiNganHopLe)} đ) vượt hạn mức khả dụng hiện tại ({fmt(khaDung.khaDung)} đ).
              </div>
            )}

            <div style={{ maxHeight: 340, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
              <table className="nh-tbl" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ position: 'sticky', top: 0, background: '#eef2f7' }}>Dòng</th>
                    <th style={{ position: 'sticky', top: 0, background: '#eef2f7' }}>Số bộ HS</th>
                    <th className="r" style={{ position: 'sticky', top: 0, background: '#eef2f7' }}>Giải ngân</th>
                    <th style={{ position: 'sticky', top: 0, background: '#eef2f7' }}>Ngày GN</th>
                    <th style={{ position: 'sticky', top: 0, background: '#eef2f7' }}>Đáo hạn</th>
                    <th style={{ position: 'sticky', top: 0, background: '#eef2f7' }}>Lãi suất</th>
                    <th style={{ position: 'sticky', top: 0, background: '#eef2f7' }}>Kỳ lãi</th>
                    <th style={{ position: 'sticky', top: 0, background: '#eef2f7' }}>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.rowIndex} style={{ background: r.errors.length ? '#fef2f2' : r.status === 'ok' ? '#f0fdf4' : r.status === 'fail' ? '#fef2f2' : undefined }}>
                      <td>{r.rowIndex}</td>
                      <td style={{ fontWeight: 600 }}>{r.soBoHoSo || '—'}</td>
                      <td className="r">{r.soTienGiaiNgan ? fmt(r.soTienGiaiNgan) : '—'}</td>
                      <td>{r.ngayGiaiNgan || '—'}</td>
                      <td>{r.ngayDaoHan || '—'}</td>
                      <td>{r.laiSuat ? `${r.laiSuat}%` : '—'}</td>
                      <td>{r.kyTraLai === 'monthly' ? 'Hàng tháng' : r.kyTraLai === 'quarterly' ? 'Hàng quý' : 'Cuối kỳ'}</td>
                      <td>
                        {r.status === 'ok' && <span style={{ color: '#15803d', fontWeight: 600 }}><CheckCircle2 size={12} style={{ verticalAlign: -2, marginRight: 2 }} />Đã nhập</span>}
                        {r.status === 'fail' && <span style={{ color: '#b91c1c', fontWeight: 600 }} title={r.errorMsg}>Lỗi: {r.errorMsg}</span>}
                        {r.status === 'saving' && <span style={{ color: '#6b7280' }}>Đang lưu…</span>}
                        {r.status === 'pending' && r.errors.length > 0 && <span style={{ color: '#b91c1c' }}>{r.errors.join('; ')}</span>}
                        {r.status === 'pending' && r.errors.length === 0 && <span style={{ color: '#6b7280' }}>Sẵn sàng</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button className="btn-ghost" onClick={handleClose}>{done ? 'Đóng' : 'Huỷ'}</button>
          {!done && (
            <button className="btn-primary" onClick={doImport} disabled={importing || validRows.length === 0}>
              {importing ? 'Đang nhập…' : `Nhập ${validRows.length} bộ hồ sơ hợp lệ`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
