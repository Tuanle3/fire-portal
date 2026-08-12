'use client'

import { useEffect, useMemo, useState } from 'react'
import { subscribeHopDong, subscribeLichTraNo } from '@/lib/han-muc-store'
import { HopDongTinDung, KyTraNo, EntityType } from '@/lib/han-muc-types'
import HopDongForm from '@/components/han-muc/HopDongForm'
import LichTraNoTable from '@/components/han-muc/LichTraNoTable'
import CoCauDialog from '@/components/han-muc/CoCauDialog'

const ENTITY_TABS: ('all' | EntityType)[] = ['all', 'SAG', 'SAHS', 'ĐTSA', 'YANA', 'Cá nhân']

const HD_BADGE: Record<HopDongTinDung['trangThai'], string> = {
  'dang-vay': 'nh-b-blue', 'binh-thuong': 'nh-b-green', 'gan-dao-han': 'nh-b-amber',
  'qua-han': 'nh-b-red', 'tat-toan': 'nh-b-grey',
}
const HD_LABEL: Record<HopDongTinDung['trangThai'], string> = {
  'dang-vay': 'Đang vay', 'binh-thuong': 'Bình thường', 'gan-dao-han': 'Gần đáo hạn',
  'qua-han': 'Quá hạn', 'tat-toan': 'Tất toán',
}

const fmt = (n: number) => n.toLocaleString('vi-VN')

export function TabHanMuc() {
  const [entityFilter, setEntityFilter] = useState<'all' | EntityType>('all')
  const [hopDongs, setHopDongs]         = useState<HopDongTinDung[]>([])
  const [selected, setSelected]         = useState<HopDongTinDung | null>(null)
  const [kyList, setKyList]             = useState<KyTraNo[]>([])
  const [formOpen, setFormOpen]         = useState(false)
  const [editing, setEditing]           = useState<HopDongTinDung | null>(null)
  const [coCauOpen, setCoCauOpen]       = useState(false)

  useEffect(() => subscribeHopDong(setHopDongs, entityFilter), [entityFilter])

  useEffect(() => {
    if (!selected) { setKyList([]); return }
    return subscribeLichTraNo(selected.id, setKyList)
  }, [selected])

  useEffect(() => {
    if (!selected) return
    const fresh = hopDongs.find(h => h.id === selected.id)
    if (fresh) setSelected(fresh)
  }, [hopDongs]) // eslint-disable-line react-hooks/exhaustive-deps

  const tongHanMuc = useMemo(() => hopDongs.reduce((s, h) => s + h.hanMuc, 0), [hopDongs])
  const tongDuNo    = useMemo(() => hopDongs.reduce((s, h) => s + h.soTienGiaiNgan, 0), [hopDongs])
  const laiSuatBQ   = useMemo(() => {
    if (!hopDongs.length) return 0
    return hopDongs.reduce((s, h) => s + h.laiSuat, 0) / hopDongs.length
  }, [hopDongs])
  const soQuaHan = hopDongs.filter(h => h.trangThai === 'qua-han').length

  // ── Thống kê kỳ đã trả ─────────────────────────────────────
  const kyDaTra   = kyList.filter(k => k.trangThai === 'da-tra')
  const soKyDaTra = kyDaTra.length
  const tongGocDaTra = kyDaTra.reduce((s, k) => s + (k.gocThucTra ?? k.gocTra), 0)
  const tongLaiDaTra = kyDaTra.reduce((s, k) => s + (k.laiThucTra ?? k.laiTra), 0)
  const kyConLai  = kyList.filter(k => k.trangThai !== 'da-tra').length

  if (selected) {
    return (
      <div>
        <button className="btn-ghost" style={{ marginBottom: 14 }} onClick={() => setSelected(null)}>
          ← Quay lại danh sách
        </button>

        <div className="nh-card">
          <div className="nh-card-head">
            <span className="nh-card-title">{selected.soHopDong}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-ghost" onClick={() => { setEditing(selected); setFormOpen(true) }}>Sửa hợp đồng</button>
              <button className="btn-primary" onClick={() => setCoCauOpen(true)}>↻ Cơ cấu nợ</button>
            </div>
          </div>
          <div className="nh-card-body">
            <div style={{ fontSize: 11.5, color: 'var(--nh-muted)', marginBottom: 10 }}>
              {selected.entity} · {selected.nganHang}{selected.chiNhanh ? ` · ${selected.chiNhanh}` : ''}
              {selected.nguoiVay ? ` · ${selected.nguoiVay}` : ''}
            </div>
            <div className="nh-form-grid" style={{ marginBottom: 0 }}>
              <Stat label="Hạn mức" value={`${fmt(selected.hanMuc)} đ`} />
              <Stat label="Giải ngân" value={`${fmt(selected.soTienGiaiNgan)} đ`} />
              {selected.laiSuatLoai === 'tha-noi' ? (
             <>
            <Stat label="Lãi ưu đãi" value={`${selected.laiSuat}%/năm`} />
            <Stat label="Số tháng ưu đãi" value={`${selected.soThangUuDai} tháng`} />
           <Stat label="Lãi sau ưu đãi" value={`${selected.laiSuatSauUuDai}%/năm (thả nổi)`} />
          </>
) : (
  <Stat label="Lãi suất" value={`${selected.laiSuat}%/năm (cố định)`} />
)}
              <Stat label="Kỳ trả" value={selected.kyTra === 'monthly' ? 'Hàng tháng' : 'Hàng quý'} />
              <Stat label="Đáo hạn" value={selected.ngayDaoHan} />
              <Stat label="Trạng thái" badge={<span className={`nh-badge ${HD_BADGE[selected.trangThai]}`}>{HD_LABEL[selected.trangThai]}</span>} />
            </div>

            {/* ── Tóm tắt thanh toán ── */}
            {kyList.length > 0 && (
              <div style={{
                marginTop: 14,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: 8,
              }}>
                <PayStat
                  label="Số kỳ đã trả"
                  value={`${soKyDaTra} / ${kyList.length} kỳ`}
                  sub={kyConLai > 0 ? `Còn ${kyConLai} kỳ` : 'Đã trả hết'}
                  color="#1C3557"
                />
                <PayStat
                  label="Gốc đã trả"
                  value={`${fmt(tongGocDaTra)} đ`}
                  sub={`Còn: ${fmt(Math.max(0, selected.soTienGiaiNgan - tongGocDaTra))} đ`}
                  color="#1C3557"
                />
                <PayStat
                  label="Lãi đã trả"
                  value={`${fmt(tongLaiDaTra)} đ`}
                  sub={`Tổng đã trả: ${fmt(tongGocDaTra + tongLaiDaTra)} đ`}
                  color="#b45309"
                />
              </div>
            )}
          </div>
        </div>

        <div className="nh-card">
          <div className="nh-card-head"><span className="nh-card-title">Lịch trả nợ</span></div>
          <div className="nh-card-body" style={{ padding: 0 }}>
            <LichTraNoTable hopDong={selected} rows={kyList} />
          </div>
        </div>

        <HopDongForm key={editing?.id ?? 'new'} open={formOpen} onClose={() => { setFormOpen(false); setEditing(null) }} editing={editing} />
        <CoCauDialog open={coCauOpen} onClose={() => setCoCauOpen(false)} hopDong={selected} kyList={kyList} />
      </div>
    )
  }

  return (
    <div>
      <div className="nh-kpi-row">
        <div className="nh-kpi">
          <span className="nh-kpi-label">Số hợp đồng</span>
          <span className="nh-kpi-val">{hopDongs.length}</span>
          <span className="nh-kpi-sub">Đang theo dõi</span>
        </div>
        <div className="nh-kpi">
          <span className="nh-kpi-label">Tổng hạn mức</span>
          <span className="nh-kpi-val">{fmt(tongHanMuc)}<span style={{ fontSize: 12 }}> đồng</span></span>
          <span className="nh-kpi-sub">Trên các hợp đồng</span>
        </div>
        <div className="nh-kpi">
          <span className="nh-kpi-label">Tổng dư nợ giải ngân</span>
          <span className="nh-kpi-val">{fmt(tongDuNo)}<span style={{ fontSize: 12 }}> đồng</span></span>
          <span className="nh-kpi-sub">Đã giải ngân</span>
        </div>
        <div className="nh-kpi">
          <span className="nh-kpi-label">Lãi suất bình quân</span>
          <span className="nh-kpi-val" style={{ color: soQuaHan > 0 ? '#8C1F1F' : undefined }}>
            {laiSuatBQ.toFixed(2)}%
          </span>
          <span className="nh-kpi-sub">{soQuaHan > 0 ? `${soQuaHan} hợp đồng quá hạn` : 'Trung bình các HĐ'}</span>
        </div>
      </div>

      <div className="nh-card">
        <div className="nh-card-head">
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
          <button className="btn-primary" onClick={() => { setEditing(null); setFormOpen(true) }}>+ Thêm hợp đồng</button>
        </div>
        <div className="nh-card-body">
          <table className="nh-tbl">
            <thead>
              <tr>
                <th>Số hợp đồng</th>
                <th>Pháp nhân</th>
                <th>Ngân hàng</th>
                <th className="r">Hạn mức</th>
                <th className="r">Giải ngân</th>
                <th className="r">Lãi suất</th>
                <th>Đáo hạn</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {hopDongs.map(h => (
                <tr key={h.id} style={{ cursor: 'pointer' }} onClick={() => setSelected(h)}>
                  <td style={{ fontWeight: 700, color: 'var(--nh-navy)' }}>{h.soHopDong}</td>
                  <td>{h.entity}</td>
                  <td>{h.nganHang}{h.chiNhanh ? ` · ${h.chiNhanh}` : ''}</td>
                  <td className="r">{fmt(h.hanMuc)}</td>
                  <td className="r">{fmt(h.soTienGiaiNgan)}</td>
                  <td className="r">
  {h.laiSuat}%
  {h.laiSuatLoai === 'tha-noi' && h.laiSuatSauUuDai != null && (
    <div style={{ fontSize: 10, color: 'var(--nh-muted)', whiteSpace: 'nowrap' }}>
      → {h.laiSuatSauUuDai}% sau {h.soThangUuDai}th
    </div>
  )}
</td>
                  <td>{h.ngayDaoHan}</td>
                  <td><span className={`nh-badge ${HD_BADGE[h.trangThai]}`}>{HD_LABEL[h.trangThai]}</span></td>
                </tr>
              ))}
              {hopDongs.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--nh-muted2)', padding: 24 }}>Chưa có hợp đồng tín dụng nào.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <HopDongForm key={editing?.id ?? 'new'} open={formOpen} onClose={() => { setFormOpen(false); setEditing(null) }} editing={editing} />
    </div>
  )
}

function Stat({ label, value, badge }: { label: string; value?: string; badge?: React.ReactNode }) {
  return (
    <div>
      <span className="nh-label">{label}</span>
      {badge ?? <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--nh-txt)' }}>{value}</div>}
    </div>
  )
}

function PayStat({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div style={{
      background: '#f8fafc',
      border: '1px solid #e2e8f0',
      borderRadius: 8,
      padding: '10px 14px',
    }}>
      <div style={{ fontSize: 10.5, color: 'var(--nh-muted)', marginBottom: 3, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color, lineHeight: 1.3 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--nh-muted)', marginTop: 2 }}>{sub}</div>
    </div>
  )
}