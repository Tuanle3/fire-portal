'use client'
import { useState, useRef } from 'react'
import {
  MeterReading, Customer, CustomerUsage, MeterId, ServiceId,
  subFor, findUsage, subCharge, customerHasService, isActiveInMonth,
  managementFeeOf, primaryService, METER_SERVICE,
  resolveTimebandPoint, resolvePrice, FLOOR_BAND_KEYS, FloorBandKey,
} from '@/lib/dien-nuoc-types'

const fmtN = (n: number) => Math.round(n).toLocaleString('vi-VN')
const fmtD = (n: number, dec = 0) => n.toLocaleString('vi-VN', { maximumFractionDigits: dec, minimumFractionDigits: dec })

// ── Đọc số bằng chữ tiếng Việt ───────────────────────────────────────────────
function numberToWords(amount: number): string {
  const n = Math.round(amount)
  if (n === 0) return 'Không đồng'
  const ones = ['', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín']
  const readTriplet = (x: number, leading: boolean): string => {
    const h = Math.floor(x / 100), t = Math.floor((x % 100) / 10), u = x % 10
    let r = (h > 0 || leading) ? ones[h] + ' trăm' : ''
    if (t === 0 && u === 0) return r
    if (t === 0) return r + (r ? ' lẻ ' : '') + ones[u]
    if (t === 1) {
      r += (r ? ' mười' : 'mười')
      if (u === 5) r += ' lăm'; else if (u > 0) r += ' ' + ones[u]
      return r
    }
    r += (r ? ' ' : '') + ones[t] + ' mươi'
    if (u === 5) r += ' lăm'; else if (u > 0) r += ' ' + ones[u]
    return r
  }
  const B = Math.floor(n / 1_000_000_000)
  const M = Math.floor((n % 1_000_000_000) / 1_000_000)
  const T = Math.floor((n % 1_000_000) / 1_000)
  const R = n % 1_000
  let s = ''
  if (B > 0) s += readTriplet(B, false) + ' tỷ'
  if (M > 0) s += (s ? ' ' : '') + readTriplet(M, !!s) + ' triệu'
  if (T > 0) s += (s ? ' ' : '') + readTriplet(T, !!s) + ' nghìn'
  if (R > 0) s += (s ? ' ' : '') + readTriplet(R, !!s)
  return s.charAt(0).toUpperCase() + s.slice(1) + ' đồng chẵn'
}

// ── Logo Sơn An (SVG nội tuyến) ───────────────────────────────────────────────
const SONAN_LOGO_SVG = `<svg viewBox="0 0 120 60" xmlns="http://www.w3.org/2000/svg" width="120" height="60">
  <circle cx="28" cy="28" r="26" fill="#1A7A4A"/>
  <text x="28" y="38" font-family="Arial Black,Arial" font-weight="900" font-size="30" fill="white" text-anchor="middle">S</text>
  <text x="64" y="22" font-family="Arial Black,Arial" font-weight="900" font-size="13" fill="#1A7A4A">SONAN</text>
  <text x="64" y="38" font-family="Arial,sans-serif" font-weight="600" font-size="10" fill="#555" letter-spacing="1">GROUP</text>
</svg>`

// ── Kiểu dòng phiếu ───────────────────────────────────────────────────────────
type NoticeRow = {
  label: string
  dvt: string
  soLuong: string
  donGia: string
  preVAT: number  // chưa VAT
  socu: string
  somoi: string
}

function buildRows(
  customer: Customer,
  readings: MeterReading[],
  usages: CustomerUsage[],
  month: string,
  vatPercent: number,
): NoticeRow[] {
  const rows: NoticeRow[] = []
  const primary = primaryService(customer)

  const addElecRows = (meterId: MeterId) => {
    const service = METER_SERVICE[meterId]
    if (!customerHasService(customer, service) || !isActiveInMonth(customer, month)) return
    const reading = readings.find(r => r.meterId === meterId && r.month === month)
    if (!reading) return
    const cfg = subFor(customer, service)
    if (!cfg) return
    const usage = findUsage(usages, customer.id, service, month, primary)
    const svcSuffix = meterId === 2 ? ' (Máy lạnh)' : ''

    if (cfg.chargeType === 'timeband_excl_vat') {
      const pt = resolveTimebandPoint(cfg.timebandPriceHistory, month)
      const BAND_LABELS: Record<FloorBandKey, string> = {
        binhThuong: 'Tiện ích điện giờ bình thường',
        caoDiem: 'Tiện ích điện giờ cao điểm',
        thapDiem: 'Tiện ích điện giờ thấp điểm',
      }
      for (const band of ['binhThuong', 'caoDiem', 'thapDiem'] as FloorBandKey[]) {
        const kwh = (usage?.bandsKwh as Record<string, number> | undefined)?.[band] ?? 0
        if (kwh <= 0) continue
        const custPrice = pt?.[band] ?? 0
        const price = custPrice > 0 ? custPrice : (reading.bands[band]?.donGia ?? 0)
        const socu = (usage?.bandsIndexOld as Record<string, number> | undefined)?.[band]
        const somoi = (usage?.bandsIndexNew as Record<string, number> | undefined)?.[band]
        rows.push({
          label: BAND_LABELS[band] + svcSuffix,
          dvt: 'kWh', soLuong: fmtD(kwh, 0), donGia: fmtN(price),
          preVAT: kwh * price,
          socu: socu != null ? fmtD(socu, 1) : '',
          somoi: somoi != null ? fmtD(somoi, 1) : '',
        })
      }
    } else {
      const total = subCharge(cfg, usage, reading, month)
      const vat = reading.vatPercent ?? vatPercent
      const preVAT = total / (1 + vat / 100)
      if (preVAT > 0) {
        const price = resolvePrice(cfg.flatPriceHistory, cfg.flatUnitPrice ?? 0, month)
        rows.push({
          label: (meterId === 1 ? 'Tiền điện chiếu sáng' : 'Tiền điện máy lạnh') + svcSuffix,
          dvt: 'kWh',
          soLuong: usage?.totalUnit ? fmtD(usage.totalUnit, 0) : '',
          donGia: price ? fmtN(price) : '',
          preVAT,
          socu: usage?.indexOld != null ? fmtD(usage.indexOld, 1) : '',
          somoi: usage?.indexNew != null ? fmtD(usage.indexNew, 1) : '',
        })
      }
    }
  }

  const addWaterRows = () => {
    const service: ServiceId = 'nuoc'
    if (!customerHasService(customer, service)) return
    const reading = readings.find(r => r.meterId === 3 && r.month === month)
    if (!reading) return
    const cfg = subFor(customer, service)
    if (!cfg) return
    const usage = findUsage(usages, customer.id, service, month, primary)
    const vat = reading.vatPercent ?? vatPercent
    const price = resolvePrice(cfg.flatPriceHistory, cfg.flatUnitPrice ?? 0, month)
    const priceExclVat = price / (1 + vat / 100)
    const METER_LABELS: Record<FloorBandKey, string> = {
      caoDiem: 'Đồng hồ 1', thapDiem: 'Đồng hồ 2', binhThuong: 'Đồng hồ 3',
    }

    let hasAny = false
    for (const band of FLOOR_BAND_KEYS) {
      const m3 = (usage?.bandsKwh as Record<string, number> | undefined)?.[band] ?? 0
      if (m3 <= 0) continue
      hasAny = true
      const socu = (usage?.bandsIndexOld as Record<string, number> | undefined)?.[band]
      const somoi = (usage?.bandsIndexNew as Record<string, number> | undefined)?.[band]
      rows.push({
        label: `Nước ${METER_LABELS[band]}`,
        dvt: 'm³', soLuong: fmtD(m3, 0),
        donGia: priceExclVat ? fmtD(priceExclVat, 0) : '',
        preVAT: m3 * priceExclVat,
        socu: socu != null ? fmtD(socu, 1) : '',
        somoi: somoi != null ? fmtD(somoi, 1) : '',
      })
    }
    if (!hasAny) {
      const total = subCharge(cfg, usage, reading, month)
      const preVAT = total / (1 + vat / 100)
      if (preVAT > 0) {
        rows.push({
          label: 'Tiền nước',
          dvt: 'm³',
          soLuong: usage?.totalUnit ? fmtD(usage.totalUnit, 0) : '',
          donGia: priceExclVat ? fmtD(priceExclVat, 0) : '',
          preVAT,
          socu: usage?.indexOld != null ? fmtD(usage.indexOld, 1) : '',
          somoi: usage?.indexNew != null ? fmtD(usage.indexNew, 1) : '',
        })
      }
    }
  }

  addElecRows(1); addElecRows(2); addWaterRows()

  const fee = managementFeeOf(customer, month)
  if (fee > 0) {
    rows.push({
      label: 'Phí quản lý dịch vụ', dvt: 'Tháng', soLuong: '1',
      donGia: fmtN(fee), preVAT: fee, socu: '', somoi: '',
    })
  }

  return rows
}

// ── CSS để in ─────────────────────────────────────────────────────────────────
const PRINT_CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Times New Roman', Times, serif; font-size: 10.5pt; color: #000; padding: 12mm 14mm; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 0.5pt solid #444; padding: 3.5pt 5pt; vertical-align: middle; }
th { font-weight: bold; text-align: center; background: #f0f0f0; }
.nb td, .nb th { border: none; }
.r { text-align: right; } .c { text-align: center; } .b { font-weight: bold; }
.it { font-style: italic; } .red { color: #B00000; }
h1 { font-size: 14pt; font-weight: bold; margin: 3pt 0; }
h2 { font-size: 11.5pt; font-weight: bold; margin: 2pt 0; }
p { margin: 3pt 0; line-height: 1.5; }
`.trim()

// ── Modal chính ───────────────────────────────────────────────────────────────
export function PhieuThongBaoModal({ customer, readings, usages, month, onClose }: {
  customer: Customer; readings: MeterReading[]; usages: CustomerUsage[]
  month: string; onClose: () => void
}) {
  const [qrSrc, setQrSrc] = useState<string | null>(null)
  const printRef = useRef<HTMLDivElement>(null)

  const today = new Date()
  const ngayIn = `${today.getDate()}/${today.getMonth() + 1}/${today.getFullYear()}`
  const vatPercent = readings.find(r => r.month === month)?.vatPercent ?? 8
  const [yearStr, monthStr] = month.split('-')
  const nextMon = parseInt(monthStr) === 12 ? 1 : parseInt(monthStr) + 1
  const nextYear = parseInt(monthStr) === 12 ? parseInt(yearStr) + 1 : parseInt(yearStr)
  const dueDateStr = `05/${String(nextMon).padStart(2, '0')}/${nextYear}`

  const rows = buildRows(customer, readings, usages, month, vatPercent)
  const preVATTotal = rows.reduce((s, r) => s + r.preVAT, 0)
  const vatAmount = preVATTotal * vatPercent / 100
  const grandTotal = preVATTotal + vatAmount
  const bangChu = numberToWords(Math.round(grandTotal))

  const handleQrUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setQrSrc(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const handlePrint = () => {
    if (!printRef.current) return
    const w = window.open('', '_blank', 'width=900,height=720')
    if (!w) return
    w.document.write(`<!DOCTYPE html><html><head>
<meta charset="utf-8">
<title>Phiếu thông báo - ${customer.name} - ${month}</title>
<style>${PRINT_CSS}</style>
</head><body>${printRef.current.innerHTML}</body></html>`)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 500)
  }

  const displayMonth = `${parseInt(monthStr)}/${yearStr}`

  return (
    <>
      <div className="so-backdrop" onClick={onClose} />
      <div className="ex-modal" style={{ maxWidth: 860, maxHeight: '94vh', display: 'flex', flexDirection: 'column' }}>
        {/* Control bar */}
        <div style={{ padding: '8px 16px', background: '#EEF3FA', borderBottom: '1px solid var(--border3)', display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>🖨️ Phiếu thông báo — {customer.name} — {displayMonth}</span>
          <label style={{ marginLeft: 'auto', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '5px 10px', border: '1px solid var(--border2)', borderRadius: 7, background: '#fff', color: 'var(--navy)', fontWeight: 600 }}>
            📷 {qrSrc ? 'Đổi QR' : 'Thêm QR code'}
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleQrUpload} />
          </label>
          {qrSrc && (
            <button onClick={() => setQrSrc(null)} style={{ fontSize: 11, padding: '4px 10px', border: '1px solid var(--border2)', borderRadius: 7, background: '#fff', cursor: 'pointer', color: 'var(--muted)' }}>✕ Xóa QR</button>
          )}
          <button onClick={handlePrint} style={{ background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 18px', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
            In phiếu
          </button>
          <button className="so-close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Nội dung in */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '24px 32px', background: '#fff' }}>
          <div ref={printRef} style={{ fontFamily: "'Times New Roman', Times, serif", fontSize: 11, color: '#000', maxWidth: 760, margin: '0 auto' }}>

            {/* HEADER */}
            <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: 8 }}>
              <tbody><tr>
                <td style={{ border: 'none', width: '22%', verticalAlign: 'middle' }}>
                  <div dangerouslySetInnerHTML={{ __html: SONAN_LOGO_SVG }} />
                </td>
                <td style={{ border: 'none', textAlign: 'center', verticalAlign: 'middle' }}>
                  <div style={{ fontWeight: 900, fontSize: 15, letterSpacing: 1 }}>PHIẾU THÔNG BÁO PHÍ DỊCH VỤ</div>
                  <div style={{ fontWeight: 700, fontSize: 13, marginTop: 3 }}>Tháng {displayMonth}</div>
                </td>
                <td style={{ border: 'none', width: '22%', verticalAlign: 'top', textAlign: 'right', fontSize: 10, fontStyle: 'italic' }}>
                  <div>Ngày in: {ngayIn}</div>
                </td>
              </tr></tbody>
            </table>

            {/* KÍNH GỬI */}
            <div style={{ marginBottom: 6 }}>
              <span style={{ fontStyle: 'italic' }}>Kính gửi Ông/Bà: </span>
              <b style={{ fontSize: 12 }}>{customer.name}</b>
              {customer.tenantName && customer.tenantName !== customer.name && (
                <span style={{ marginLeft: 8, color: '#555', fontSize: 10.5 }}>({customer.tenantName})</span>
              )}
            </div>
            <div style={{ marginBottom: 10, fontStyle: 'italic', fontSize: 10.5, color: '#333' }}>
              Công ty CPĐT-PTĐT Sơn An xin thông báo phí Dịch vụ tháng {displayMonth} như sau:
            </div>

            {/* BẢNG PHÍ */}
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 10.5, marginBottom: 6 }}>
              <thead>
                <tr>
                  <th style={{ width: 32 }}>STT</th>
                  <th>Các khoản phí</th>
                  <th style={{ width: 38 }}>ĐVT</th>
                  <th style={{ width: 54 }}>Số lượng</th>
                  <th style={{ width: 78 }}>Đơn giá (đ)</th>
                  <th style={{ width: 90 }}>Thành tiền (đ)</th>
                  <th style={{ width: 54 }}>Số cũ</th>
                  <th style={{ width: 54 }}>Số mới</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={8} style={{ textAlign: 'center', fontStyle: 'italic', color: '#888', padding: 10 }}>Không có khoản phí nào trong tháng này</td></tr>
                )}
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td style={{ textAlign: 'center' }}>{i + 1}</td>
                    <td>{r.label}</td>
                    <td style={{ textAlign: 'center' }}>{r.dvt}</td>
                    <td style={{ textAlign: 'right' }}>{r.soLuong}</td>
                    <td style={{ textAlign: 'right', color: '#B00000' }}>{r.donGia}</td>
                    <td style={{ textAlign: 'right' }}>{fmtN(r.preVAT)}</td>
                    <td style={{ textAlign: 'right' }}>{r.socu}</td>
                    <td style={{ textAlign: 'right' }}>{r.somoi}</td>
                  </tr>
                ))}
                {/* Tổng cộng */}
                <tr>
                  <td colSpan={5} style={{ textAlign: 'right', fontStyle: 'italic', border: 'none', paddingRight: 8 }}>
                    Tổng cộng ({rows.map((_, i) => `(${i + 1})`).join('+')}):
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtN(preVATTotal)}</td>
                  <td colSpan={2} style={{ border: 'none' }}></td>
                </tr>
                <tr>
                  <td colSpan={5} style={{ textAlign: 'right', fontStyle: 'italic', border: 'none', paddingRight: 8 }}>Tiền thuế VAT {vatPercent}%:</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtN(vatAmount)}</td>
                  <td colSpan={2} style={{ border: 'none' }}></td>
                </tr>
                <tr style={{ background: '#FFFBE6' }}>
                  <td colSpan={5} style={{ textAlign: 'right', fontWeight: 700, paddingRight: 8 }}>Tổng thanh toán:</td>
                  <td style={{ textAlign: 'right', fontWeight: 900, color: '#B00000', fontSize: 12 }}>{fmtN(grandTotal)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tbody>
            </table>

            {/* BẰNG CHỮ */}
            <div style={{ marginBottom: 10, fontSize: 10.5 }}>
              <b>Bằng chữ:</b> <i><b>{bangChu}</b></i>
            </div>

            {/* GHI CHÚ */}
            <div style={{ fontSize: 10, lineHeight: 1.7, marginBottom: 10 }}>
              <div>* Đề nghị Quý khách vui lòng thanh toán trước ngày <b>{dueDateStr}</b>.</div>
              <div>* Thanh toán bằng tiền mặt tại VP Công ty Sơn An đặt tại Tầng 1 Block B11.</div>
              <div>* Nếu quá thời gian nêu trên, Công ty Sơn An sẽ tạm ngưng cung cấp dịch vụ. Phí mở lại: 50.000 đ.</div>
              <div style={{ color: '#B00000' }}>* Mọi thắc mắc vui lòng liên hệ Tú: <b>0378.661.831</b></div>
            </div>

            {/* CHỮ KÝ + QR */}
            <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: 6 }}>
              <tbody><tr>
                <td style={{ border: 'none', width: '42%', verticalAlign: 'top' }}>
                  <div style={{ fontStyle: 'italic', marginBottom: 8 }}>Trân trọng cảm ơn!</div>
                  {qrSrc && (
                    <div>
                      <img src={qrSrc} alt="QR chuyển khoản" style={{ width: 150, height: 150, display: 'block', border: '1px solid #ddd' }} />
                      <div style={{ fontSize: 9, marginTop: 3, color: '#666' }}>Quét mã QR để chuyển khoản</div>
                    </div>
                  )}
                </td>
                <td style={{ border: 'none', textAlign: 'center', verticalAlign: 'top' }}>
                  <div style={{ fontWeight: 700 }}>CÔNG TY CPĐT-PTĐT SƠN AN</div>
                  <div style={{ fontWeight: 700 }}>PHÒNG KẾ TOÁN</div>
                  <div style={{ fontSize: 9, fontStyle: 'italic', color: '#666' }}>(Ký, ghi rõ họ tên)</div>
                  <div style={{ marginTop: 48, fontWeight: 700 }}>LÊ ANH TÚ</div>
                </td>
              </tr></tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}
