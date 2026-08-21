// ============================================================
// PHẦN 5 — BẢNG ĐỐI CHIẾU SỔ QUỸ vs. LỊCH TRẢ NỢ
//
// Dữ liệu nguồn: doiChieuTatCa() từ dong-tien-doi-chieu-engine.ts
// Đồng bộ:
//   dài hạn  → markKyDaTraThucTe(hopDong, kyHienTai, allKy, ...)
//   ngắn hạn → markKyThuDaThu(hanMucId, boHoSoId, kyId, ...)
//
// Tách 3 nhóm hiển thị riêng:
//   1. Khớp / Lệch / Chưa có dữ liệu Sheet   — chính
//   2. Sheet dư thừa (trả sớm/ngoài lịch)    — tự do nhưng xác định
//   3. Không xác định (NV_/Ngoai_/TTD_...)   — soát tay thủ công
//
// Dùng đúng bộ class CSS hệ thống fire-portal — không Tailwind.
// ============================================================
'use client'

import { useState, Fragment } from 'react'
import type { DoiChieuRow } from '@/lib/dong-tien-doi-chieu-engine'
import type { HopDongTinDung, KyTraNo }  from '@/lib/han-muc-types'
import { markKyDaTraThucTe }             from '@/lib/han-muc-store'
import { markKyThuDaThu }                from '@/lib/han-muc-ngan-han-store'

// ── Helpers ──────────────────────────────────────────────────
const VND = new Intl.NumberFormat('vi-VN')
function fmt(n: number | undefined) { return n != null ? VND.format(n) : '—' }

const TRANG_THAI_LABEL: Record<DoiChieuRow['trangThai'], string> = {
  'khop':                 'Khớp',
  'lech':                 'Lệch số',
  'chua-co-du-lieu-sheet':'Chưa có Sheet',
  'sheet-du-thua':        'Sheet dư thừa',
  'khong-xac-dinh':       'Không xác định',
}

const TRANG_THAI_COLOR: Record<DoiChieuRow['trangThai'], string> = {
  'khop':                 'var(--nh-green)',
  'lech':                 '#e07b00',
  'chua-co-du-lieu-sheet':'var(--nh-muted2)',
  'sheet-du-thua':        '#7c3aed',
  'khong-xac-dinh':       '#6b7280',
}

const LOAI_LABEL: Record<DoiChieuRow['loaiKhoan'], string> = {
  'lai':           'Lãi',
  'goc':           'Gốc',
  'thu-giai-ngan': 'Thu GN',
}

// ── Props ─────────────────────────────────────────────────────
interface Props {
  rows:        DoiChieuRow[]
  // Cần để gọi markKyDaTraThucTe (dài hạn) — truyền thẳng map để không phải fetch lại
  hopDongMap:  Map<string, HopDongTinDung>
  kyTraNoMap:  Map<string, KyTraNo[]>   // hopDongId → danh sách KyTraNo
  // Callback sau khi đồng bộ thành công (reload dữ liệu bên ngoài)
  onSynced?:   () => void
}

// ── Dialog xác nhận đồng bộ ──────────────────────────────────
interface SyncState {
  row:         DoiChieuRow
  ngayThucTe:  string
  gocThucTe:   string
  laiThucTe:   string
}

export default function DongTienDoiChieu({ rows, hopDongMap, kyTraNoMap, onSynced }: Props) {
  const [syncState,  setSyncState]  = useState<SyncState | null>(null)
  const [syncing,    setSyncing]    = useState(false)
  const [syncError,  setSyncError]  = useState('')
  const [moRaw,      setMoRaw]      = useState<Set<string>>(new Set())
  const [locNhom,    setLocNhom]    = useState<'chinh' | 'du-thua' | 'khong-xac-dinh'>('chinh')

  // ── Tách 3 nhóm ──────────────────────────────────────────
  const nhomChinh    = rows.filter(r => r.trangThai !== 'sheet-du-thua' && r.trangThai !== 'khong-xac-dinh')
  const nhomDuThua   = rows.filter(r => r.trangThai === 'sheet-du-thua')
  const nhomKhongXD  = rows.filter(r => r.trangThai === 'khong-xac-dinh')

  // ── Thống kê nhanh ───────────────────────────────────────
  const soKhop      = nhomChinh.filter(r => r.trangThai === 'khop').length
  const soLech      = nhomChinh.filter(r => r.trangThai === 'lech').length
  const soChuaSheet = nhomChinh.filter(r => r.trangThai === 'chua-co-du-lieu-sheet').length

  // ── Mở dialog Đồng bộ ───────────────────────────────────
  function moSync(row: DoiChieuRow) {
    setSyncError('')
    setSyncState({
      row,
      ngayThucTe: row.ngayThucTe ?? row.ngayKeHoach,
      gocThucTe:  row.loaiKhoan === 'goc' ? String(row.soTienThucTe ?? row.soTienKeHoach) : '0',
      laiThucTe:  row.loaiKhoan === 'lai' ? String(row.soTienThucTe ?? row.soTienKeHoach) : '0',
    })
  }

  // ── Thực hiện đồng bộ ────────────────────────────────────
  async function handleSync() {
    if (!syncState) return
    const { row, ngayThucTe, gocThucTe, laiThucTe } = syncState
    const goc = Number(gocThucTe.replace(/\D/g, ''))
    const lai = Number(laiThucTe.replace(/\D/g, ''))
    if (!ngayThucTe) { setSyncError('Vui lòng nhập ngày thực tế.'); return }
    if (isNaN(goc) || isNaN(lai)) { setSyncError('Số tiền không hợp lệ.'); return }

    setSyncing(true); setSyncError('')
    try {
      const { kyRef } = row

      if (kyRef.hopDongId) {
        // ── Dài hạn ──────────────────────────────────────────
        const hopDong = hopDongMap.get(kyRef.hopDongId)
        const allKy   = kyTraNoMap.get(kyRef.hopDongId) ?? []
        const kyHT    = allKy.find(k => k.id === kyRef.kyId)
        if (!hopDong || !kyHT) throw new Error('Không tìm thấy hợp đồng / kỳ trả nợ.')
        await markKyDaTraThucTe(hopDong, kyHT, allKy, ngayThucTe, goc, lai)

      } else if (kyRef.hanMucId && kyRef.boHoSoId && kyRef.kyId) {
        // ── Ngắn hạn ─────────────────────────────────────────
        await markKyThuDaThu(kyRef.hanMucId, kyRef.boHoSoId, kyRef.kyId, ngayThucTe, goc, lai)

      } else {
        throw new Error('Dòng này chưa đủ thông tin để đồng bộ (mã Thu / pattern lịch sử).')
      }

      setSyncState(null)
      onSynced?.()
    } catch (e: any) {
      setSyncError(e?.message ?? String(e))
    } finally {
      setSyncing(false)
    }
  }

  function toggleRaw(key: string) {
    setMoRaw(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s })
  }

  // ── Render 1 dòng ────────────────────────────────────────
  function renderRow(r: DoiChieuRow) {
    const coSync = (r.trangThai === 'lech' || r.trangThai === 'khop') && !!r.kyRef.kyId
    const moRawRow = moRaw.has(r.key)
    const lech = r.lech

    return (
      <Fragment key={r.key}>
        <tr>
          <td>
            <span style={{
              display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700,
              background: r.trangThai === 'khop' ? '#d1fae5' : r.trangThai === 'lech' ? '#fef3c7' : '#f3f4f6',
              color: TRANG_THAI_COLOR[r.trangThai],
            }}>
              {TRANG_THAI_LABEL[r.trangThai]}
            </span>
          </td>
          <td>
            <span className={`nh-badge ${r.kyHan === 'ngan-han' ? 'nh-b-blue' : 'nh-b-grey'}`}>
              {r.kyHan === 'ngan-han' ? 'NH' : 'DH'}
            </span>
          </td>
          <td style={{ fontWeight: 600 }}>{r.entity}</td>
          <td>{r.nganHang}</td>
          <td>
            <span className={`nh-badge ${r.loaiKhoan === 'lai' ? 'nh-b-amber' : r.loaiKhoan === 'goc' ? 'nh-b-blue' : 'nh-b-grey'}`}>
              {LOAI_LABEL[r.loaiKhoan]}
            </span>
          </td>
          <td style={{ fontSize: 12, color: 'var(--nh-muted2)' }}>{r.hopDongLabel}</td>
          <td>{r.ngayKeHoach || '—'}</td>
          <td className="r">{r.soTienKeHoach ? fmt(r.soTienKeHoach) : '—'}</td>
          <td>{r.ngayThucTe || '—'}</td>
          <td className="r">{r.soTienThucTe != null ? fmt(r.soTienThucTe) : '—'}</td>
          <td className="r" style={{
            fontWeight: 700,
            color: lech === 0 ? 'var(--nh-green)' : lech > 0 ? 'var(--nh-green)' : 'var(--nh-red)',
          }}>
            {lech === 0 ? '—' : (lech > 0 ? '+' : '') + fmt(lech)}
          </td>
          <td>
            <div style={{ display: 'flex', gap: 4 }}>
              {coSync && (
                <button
                  className="btn-primary"
                  style={{ padding: '3px 10px', fontSize: 11 }}
                  onClick={() => moSync(r)}
                >
                  Đồng bộ
                </button>
              )}
              {r.sheetRowRaw && (
                <button
                  className="btn-ghost"
                  style={{ padding: '3px 8px', fontSize: 11 }}
                  onClick={() => toggleRaw(r.key)}
                >
                  {moRawRow ? 'Ẩn' : 'Raw'}
                </button>
              )}
            </div>
          </td>
        </tr>
        {moRawRow && r.sheetRowRaw && (
          <tr>
            <td colSpan={12} style={{ background: '#f8fafc', padding: '8px 16px' }}>
              <pre style={{ fontSize: 11, color: '#555', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {JSON.stringify(r.sheetRowRaw, null, 2)}
              </pre>
            </td>
          </tr>
        )}
      </Fragment>
    )
  }

  // ── Chọn nhóm đang hiển thị ──────────────────────────────
  const rowsHienThi = locNhom === 'chinh' ? nhomChinh : locNhom === 'du-thua' ? nhomDuThua : nhomKhongXD

  return (
    <div className="nh-card" style={{ marginBottom: 14 }}>
      {/* ── HEADER ─────────────────────────────────────────── */}
      <div className="nh-card-head" style={{ flexWrap: 'wrap', gap: 8 }}>
        <span className="nh-card-title">⚖️ Đối chiếu Sổ quỹ vs. Lịch trả nợ</span>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', alignItems: 'center' }}>
          {/* Tab nhóm */}
          {[
            { k: 'chinh'         as const, label: `Chính (${nhomChinh.length})` },
            { k: 'du-thua'       as const, label: `Sheet dư (${nhomDuThua.length})` },
            { k: 'khong-xac-dinh'as const, label: `Không XĐ (${nhomKhongXD.length})` },
          ].map(({ k, label }) => (
            <button key={k} onClick={() => setLocNhom(k)} style={{
              padding: '4px 12px', borderRadius: 16, fontSize: 12,
              fontFamily: 'inherit', cursor: 'pointer',
              border:     '1px solid ' + (locNhom === k ? 'var(--nh-navy)' : '#E5E0D8'),
              background: locNhom === k ? 'var(--nh-navy)' : '#fff',
              color:      locNhom === k ? '#fff' : '#3D3D3D',
              fontWeight: locNhom === k ? 700 : 400,
              transition: 'all .12s',
            }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPI NHANH (chỉ hiện ở nhóm Chính) ──────────────── */}
      {locNhom === 'chinh' && (
        <div style={{ padding: '10px 20px 0' }}>
          <div className="nh-kpi-row" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 12 }}>
            <div className="nh-kpi">
              <span className="nh-kpi-label">✅ Khớp</span>
              <span className="nh-kpi-val" style={{ color: 'var(--nh-green)' }}>{soKhop}</span>
            </div>
            <div className="nh-kpi">
              <span className="nh-kpi-label">⚠️ Lệch số</span>
              <span className="nh-kpi-val" style={{ color: '#e07b00' }}>{soLech}</span>
            </div>
            <div className="nh-kpi">
              <span className="nh-kpi-label">❓ Chưa có Sheet</span>
              <span className="nh-kpi-val" style={{ color: 'var(--nh-muted2)' }}>{soChuaSheet}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── GHI CHÚ NHÓM ────────────────────────────────────── */}
      {locNhom === 'du-thua' && nhomDuThua.length > 0 && (
        <div style={{ padding: '8px 20px', background: '#f5f3ff', borderBottom: '1px solid #e9d5ff', fontSize: 12, color: '#5b21b6' }}>
          💜 Các dòng Sheet CÓ mã ngân sách hợp lệ nhưng không khớp được kỳ nào trong hệ thống — có thể là trả sớm, trả ngoài lịch, hoặc đã được đánh dấu qua kênh khác.
        </div>
      )}
      {locNhom === 'khong-xac-dinh' && nhomKhongXD.length > 0 && (
        <div style={{ padding: '8px 20px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: 12, color: '#374151' }}>
          🔍 Các dòng Sheet có mã dạng <code>NV_</code> / <code>Ngoai_</code> / <code>TTD_</code> — pattern lịch sử tự do, không tự động khớp được. Đại ca soát tay thủ công.
        </div>
      )}

      {/* ── BẢNG ─────────────────────────────────────────────── */}
      <div className="nh-card-body" style={{ padding: 0 }}>
        <table className="nh-tbl">
          <thead>
            <tr>
              <th>Trạng thái</th>
              <th>KH</th>
              <th>Pháp nhân</th>
              <th>Ngân hàng</th>
              <th>Loại</th>
              <th>Hợp đồng / Kỳ</th>
              <th>Ngày KH</th>
              <th className="r">Số KH</th>
              <th>Ngày TT</th>
              <th className="r">Số TT</th>
              <th className="r">Lệch</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rowsHienThi.map(renderRow)}
            {rowsHienThi.length === 0 && (
              <tr>
                <td colSpan={12} style={{ textAlign: 'center', color: 'var(--nh-muted2)', padding: 28 }}>
                  {locNhom === 'chinh'          && 'Chưa có dữ liệu đối chiếu. Cần kết nối nguồn data_quy.'}
                  {locNhom === 'du-thua'        && 'Không có dòng Sheet dư thừa.'}
                  {locNhom === 'khong-xac-dinh' && 'Không có mã lịch sử tự do nào.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ══════════════════════════════════════════════════════
          DIALOG ĐỒNG BỘ — hiện dạng overlay nhỏ trên card
      ══════════════════════════════════════════════════════ */}
      {syncState && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999,
        }}
          onClick={() => { if (!syncing) setSyncState(null) }}
        >
          <div
            style={{
              background: '#fff', borderRadius: 12, padding: '22px 26px', width: 420,
              boxShadow: '0 8px 32px rgba(0,0,0,.18)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--nh-navy)', marginBottom: 4 }}>
              Đồng bộ kỳ trả nợ
            </div>
            <div style={{ fontSize: 12, color: 'var(--nh-muted2)', marginBottom: 16 }}>
              {syncState.row.hopDongLabel} — {syncState.row.entity} / {syncState.row.nganHang}
              {' '}({LOAI_LABEL[syncState.row.loaiKhoan]})
            </div>

            {/* Ngày thực tế */}
            <label style={{ display: 'block', marginBottom: 10 }}>
              <span className="nh-label">Ngày thực hiện</span>
              <input
                type="date" className="nh-input"
                value={syncState.ngayThucTe}
                onChange={e => setSyncState(s => s ? { ...s, ngayThucTe: e.target.value } : s)}
              />
            </label>

            {/* Số tiền — hiện cả 2 field gốc/lãi, user có thể điều chỉnh */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <label style={{ display: 'block' }}>
                <span className="nh-label">Gốc thực tế (đ)</span>
                <input
                  type="text" inputMode="numeric" className="nh-input"
                  value={Number(syncState.gocThucTe) > 0
                    ? Number(syncState.gocThucTe).toLocaleString('vi-VN') : syncState.gocThucTe}
                  onChange={e => setSyncState(s => s ? { ...s, gocThucTe: e.target.value.replace(/\D/g, '') } : s)}
                  placeholder="0 nếu chỉ trả lãi"
                />
              </label>
              <label style={{ display: 'block' }}>
                <span className="nh-label">Lãi thực tế (đ)</span>
                <input
                  type="text" inputMode="numeric" className="nh-input"
                  value={Number(syncState.laiThucTe) > 0
                    ? Number(syncState.laiThucTe).toLocaleString('vi-VN') : syncState.laiThucTe}
                  onChange={e => setSyncState(s => s ? { ...s, laiThucTe: e.target.value.replace(/\D/g, '') } : s)}
                  placeholder="0 nếu chỉ trả gốc"
                />
              </label>
            </div>

            {/* Tóm tắt kế hoạch để so sánh */}
            <div style={{
              background: '#F7F9FC', borderRadius: 8, padding: '8px 12px',
              fontSize: 12, color: 'var(--nh-muted2)', marginBottom: 14,
            }}>
              Kế hoạch: <strong>{fmt(syncState.row.soTienKeHoach)}</strong> đ
              {syncState.row.soTienThucTe != null && (
                <> — Sheet: <strong>{fmt(syncState.row.soTienThucTe)}</strong> đ</>
              )}
              {syncState.row.lech !== 0 && (
                <span style={{ color: syncState.row.lech > 0 ? 'var(--nh-green)' : 'var(--nh-red)', marginLeft: 8 }}>
                  ({syncState.row.lech > 0 ? '+' : ''}{fmt(syncState.row.lech)})
                </span>
              )}
            </div>

            {syncError && (
              <div style={{ color: 'var(--nh-red)', fontSize: 12, marginBottom: 10 }}>{syncError}</div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn-ghost" onClick={() => setSyncState(null)} disabled={syncing}>Hủy</button>
              <button className="btn-primary" onClick={handleSync} disabled={syncing}>
                {syncing ? 'Đang lưu…' : 'Xác nhận đồng bộ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
