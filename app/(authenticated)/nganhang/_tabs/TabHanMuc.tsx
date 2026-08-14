'use client'

import { useEffect, useMemo, useState } from 'react'
import { subscribeHopDong, subscribeLichTraNo, setGocTraCoDinh, tinhHanMucKhaDung, tinhDuNoHienTai } from '@/lib/han-muc-store'
import { HopDongTinDung, KyTraNo, EntityType } from '@/lib/han-muc-types'
import HopDongForm from '@/components/han-muc/HopDongForm'
import LichTraNoTable from '@/components/han-muc/LichTraNoTable'
import CoCauDialog from '@/components/han-muc/CoCauDialog'
import { Pencil, Check, X } from 'lucide-react'

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
const fmtInput = (v: string) => {
  const num = v.replace(/\D/g, '')
  return num ? Number(num).toLocaleString('vi-VN') : ''
}
const parseInput = (v: string) => v.replace(/\D/g, '')

// ── Tính tổng kỳ gốc / kỳ lãi từ hợp đồng + rows ──────────
function calcTongKy(hd: HopDongTinDung, rows: KyTraNo[]) {
  const isLaiThangGocQuy = hd.kyTra === 'monthly' && hd.kyTraGoc === 'quarterly'
  if (isLaiThangGocQuy) {
    // lãi: mỗi tháng 1 kỳ → tongKyLai = tổng rows
    // gốc: mỗi quý 1 kỳ  → tongKyGoc = rows có gocTra > 0
    const tongKyLai = rows.length
    const tongKyGoc = rows.filter(k => k.gocTra > 0).length
    return { tongKyGoc, tongKyLai }
  }
  // Chế độ bình thường: mỗi kỳ đều có gốc
  return { tongKyGoc: rows.length, tongKyLai: rows.length }
}

const getPayStats = (rows: KyTraNo[] | undefined, hd: HopDongTinDung) => {
  const list   = rows ?? []
  const daTra  = list.filter(k => k.trangThai === 'da-tra')
  const goc    = daTra.reduce((s, k) => s + (k.gocThucTra ?? k.gocTra), 0)
  const lai    = daTra.reduce((s, k) => s + (k.laiThucTra ?? k.laiTra), 0)
  const conLai = Math.max(0, hd.soTienGiaiNgan - goc)
  // Đếm kỳ đã trả: gốc (kỳ có gocTra > 0) và lãi (mọi kỳ da-tra)
  const soKyGocDaTra = daTra.filter(k => (k.gocThucTra ?? k.gocTra) > 0).length
  const soKyLaiDaTra = daTra.length
  const { tongKyGoc, tongKyLai } = calcTongKy(hd, list)
  return { soKyGocDaTra, soKyLaiDaTra, tongKyGoc, tongKyLai, tongKy: list.length, goc, lai, conLai }
}

// ── Widget chỉnh gốc cứng inline ─────────────────────────────
function GocCungEditor({ hopDong, onSaved }: { hopDong: HopDongTinDung; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal]         = useState(hopDong.gocTraCoDinh ? String(hopDong.gocTraCoDinh) : '')
  const [saving, setSaving]   = useState(false)

  // Tính gốc lý thuyết
  const gocLyThuyet = useMemo(() => {
    const d1 = new Date(hopDong.ngayKy)
    const d2 = new Date(hopDong.ngayDaoHan)
    const months = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth())
    if (months <= 0) return null
    const n = hopDong.kyTra === 'quarterly' ? Math.ceil(months / 3) : months
    return Math.floor(hopDong.soTienGiaiNgan / n)
  }, [hopDong])

  const handleSave = async () => {
    setSaving(true)
    try {
      const num = Number(val) || null
      await setGocTraCoDinh(hopDong.id, num)
      setEditing(false)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        background: hopDong.gocTraCoDinh ? '#fffbf0' : '#f8fafc',
        border: `1px solid ${hopDong.gocTraCoDinh ? '#D4A64A' : '#e2e8f0'}`,
        borderRadius: 6, padding: '4px 10px', fontSize: 12,
      }}>
        <span style={{ color: '#6b7280' }}>Gốc/kỳ (NH):</span>
        <span style={{ fontWeight: 700, color: hopDong.gocTraCoDinh ? '#92600a' : '#94a3b8' }}>
          {hopDong.gocTraCoDinh ? `${fmt(hopDong.gocTraCoDinh)} đ` : 'Tự tính'}
        </span>
        <button
          onClick={() => { setVal(hopDong.gocTraCoDinh ? String(hopDong.gocTraCoDinh) : ''); setEditing(true) }}
          style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6b7280', padding: 0, display: 'flex', alignItems: 'center' }}
          title="Chỉnh gốc cứng theo NH"
        >
          <Pencil size={12} />
        </button>
      </div>
    )
  }

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: '#fffbf0', border: '1px solid #D4A64A',
      borderRadius: 6, padding: '4px 10px',
    }}>
      <span style={{ fontSize: 11, color: '#6b7280', whiteSpace: 'nowrap' }}>Gốc/kỳ (NH):</span>
      <input
        autoFocus
        value={fmtInput(val)}
        onChange={e => setVal(parseInput(e.target.value))}
        placeholder={gocLyThuyet ? `LT: ${fmt(gocLyThuyet)}` : 'nhập số tiền'}
        style={{
          width: 140, fontSize: 12, padding: '3px 6px',
          border: '1px solid #D4A64A77', borderRadius: 4,
          background: '#fff', color: '#92600a', fontWeight: 600,
        }}
      />
      {gocLyThuyet && val && (
        <span style={{ fontSize: 10, color: '#6b7280', whiteSpace: 'nowrap' }}>
          {(Number(val) - gocLyThuyet > 0 ? '+' : '')}{fmt(Number(val) - gocLyThuyet)}
        </span>
      )}
      <button
        onClick={() => { setEditing(false) }}
        style={{ border: '1px solid #d1d5db', borderRadius: 4, background: '#fff', cursor: 'pointer', padding: '2px 6px', display: 'flex', alignItems: 'center' }}
      >
        <X size={11} />
      </button>
      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          border: 'none', borderRadius: 4,
          background: saving ? '#93aec8' : '#1C3557',
          color: '#fff', cursor: saving ? 'not-allowed' : 'pointer',
          padding: '2px 8px', fontSize: 11, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 3,
        }}
      >
        <Check size={11} /> {saving ? '…' : 'Lưu & tính lại'}
      </button>
    </div>
  )
}

export function TabHanMuc() {
  const [entityFilter, setEntityFilter] = useState<'all' | EntityType>('all')
  const [hopDongs, setHopDongs]         = useState<HopDongTinDung[]>([])
  const [selected, setSelected]         = useState<HopDongTinDung | null>(null)
  const [kyList, setKyList]             = useState<KyTraNo[]>([])
  const [formOpen, setFormOpen]         = useState(false)
  const [editing, setEditing]           = useState<HopDongTinDung | null>(null)
  const [coCauOpen, setCoCauOpen]       = useState(false)
  const [kyMap, setKyMap]               = useState<Record<string, KyTraNo[]>>({})
  const [presetKhungId, setPresetKhungId] = useState<string | undefined>(undefined)

  useEffect(() => subscribeHopDong(setHopDongs, entityFilter), [entityFilter])

  useEffect(() => {
    const unsubs = hopDongs.map(h =>
      subscribeLichTraNo(h.id, rows => setKyMap(prev => ({ ...prev, [h.id]: rows })))
    )
    return () => unsubs.forEach(u => u && u())
  }, [hopDongs])

  useEffect(() => {
    if (!selected) { setKyList([]); return }
    return subscribeLichTraNo(selected.id, setKyList)
  }, [selected])

  useEffect(() => {
    if (!selected) return
    const fresh = hopDongs.find(h => h.id === selected.id)
    if (fresh) setSelected(fresh)
  }, [hopDongs]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Hạn mức khung: tách riêng, không tính lẫn vào các KPI/bảng của HĐ vay thông thường ──
  const khungList    = useMemo(() => hopDongs.filter(h => h.loaiHD === 'han-muc-khung'), [hopDongs])
  const nonKhungList = useMemo(() => hopDongs.filter(h => h.loaiHD !== 'han-muc-khung'), [hopDongs])
  // khungId → hạn mức khả dụng (tổng / đã dùng / còn lại)
  const khaDungMap = useMemo(() => {
    const map: Record<string, ReturnType<typeof tinhHanMucKhaDung>> = {}
    khungList.forEach(k => {
      const conCua = hopDongs.filter(h => h.hanMucKhungId === k.id)
      map[k.id] = tinhHanMucKhaDung(k, conCua, kyMap)
    })
    return map
  }, [khungList, hopDongs, kyMap])

  // Hạn mức tổng = HĐ vay độc lập + hạn mức khung (KHÔNG cộng thêm các bộ hồ sơ con — đã nằm trong khung)
  const tongHanMuc = useMemo(
    () => hopDongs.filter(h => !h.hanMucKhungId).reduce((s, h) => s + h.hanMuc, 0),
    [hopDongs],
  )
  const tongDuNo       = useMemo(() => nonKhungList.reduce((s, h) => s + h.soTienGiaiNgan, 0), [nonKhungList])
  const tongDuNoConLai = useMemo(
    () => nonKhungList.reduce((s, h) => s + getPayStats(kyMap[h.id], h).conLai, 0),
    [nonKhungList, kyMap],
  )
  const laiSuatBQ = useMemo(() => {
    if (!nonKhungList.length) return 0
    return nonKhungList.reduce((s, h) => s + h.laiSuat, 0) / nonKhungList.length
  }, [nonKhungList])
  const soQuaHan = nonKhungList.filter(h => h.trangThai === 'qua-han').length

  const kyDaTra        = kyList.filter(k => k.trangThai === 'da-tra')
  const soKyLaiDaTra   = kyDaTra.length
  const soKyGocDaTra   = kyDaTra.filter(k => (k.gocThucTra ?? k.gocTra) > 0).length
  const tongGocDaTra   = kyDaTra.reduce((s, k) => s + (k.gocThucTra ?? k.gocTra), 0)
  const tongLaiDaTra   = kyDaTra.reduce((s, k) => s + (k.laiThucTra ?? k.laiTra), 0)
  const kyConLai       = kyList.filter(k => k.trangThai !== 'da-tra').length
  const dunNoGocConLai = selected ? Math.max(0, selected.soTienGiaiNgan - tongGocDaTra) : 0
  const { tongKyGoc: detailTongKyGoc, tongKyLai: detailTongKyLai } =
    selected ? calcTongKy(selected, kyList) : { tongKyGoc: 0, tongKyLai: 0 }

  if (selected) {
    return (
      <div>
        <div className="nh-card">
          <div className="nh-card-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button className="btn-ghost" onClick={() => setSelected(null)} style={{ fontSize: 12, padding: '5px 10px' }}>
                ← Quay lại
              </button>
              <span className="nh-card-title">{selected.soHopDong}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {/* ── Widget gốc cứng ── */}
              <GocCungEditor
                hopDong={selected}
                onSaved={() => {/* Firestore listener tự refresh */}}
              />
              <button className="btn-ghost" onClick={() => { setEditing(selected); setFormOpen(true) }}>Sửa hợp đồng</button>
              <button className="btn-primary" onClick={() => setCoCauOpen(true)}>↻ Cơ cấu nợ</button>
            </div>
          </div>
          <div className="nh-card-body">
            <div style={{ fontSize: 11.5, color: 'var(--nh-muted)', marginBottom: 10 }}>
              {selected.entity} · {selected.nganHang}{selected.chiNhanh ? ` · ${selected.chiNhanh}` : ''}
              {selected.nguoiVay ? ` · ${selected.nguoiVay}` : ''}
            </div>

            {selected.hanMucKhungId && (() => {
              const khung = hopDongs.find(h => h.id === selected.hanMucKhungId)
              const kd    = khung ? khaDungMap[khung.id] : null
              return khung ? (
                <div style={{
                  fontSize: 11.5, color: '#92600a', background: '#fffbf0',
                  border: '1px solid #D4A64A55', borderRadius: 6, padding: '6px 10px', marginBottom: 10,
                }}>
                  🏦 Bộ hồ sơ giải ngân thuộc hạn mức khung <b>{khung.soHopDong}</b>
                  {kd && ` · khả dụng hiện tại: ${fmt(kd.khaDung)} đ / ${fmt(kd.tongHanMuc)} đ`}
                </div>
              ) : null
            })()}
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
              {selected.gocTraCoDinh && (
                <Stat label="Gốc cứng/kỳ (NH)" value={`${fmt(selected.gocTraCoDinh)} đ`} />
              )}
            </div>

            {kyList.length > 0 && (
              <div style={{
                marginTop: 14,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: 8,
              }}>
                <PayStat
                  label="Số kỳ đã trả"
                  value={`Gốc: ${soKyGocDaTra} / ${detailTongKyGoc}`}
                  sub={`Lãi: ${soKyLaiDaTra} / ${detailTongKyLai} kỳ${kyConLai > 0 ? ` · còn ${kyConLai}` : ' · hết'}`}
                  color="#1C3557"
                />
                <PayStat
                  label="Gốc đã trả"
                  value={`${fmt(tongGocDaTra)} đ`}
                  sub={`${((tongGocDaTra / selected.soTienGiaiNgan) * 100 || 0).toFixed(1)}% dư nợ gốc`}
                  color="#1C3557"
                />
                <PayStat
                  label="Dư nợ gốc còn lại"
                  value={`${fmt(dunNoGocConLai)} đ`}
                  sub={`Trên tổng ${fmt(selected.soTienGiaiNgan)} đ`}
                  color="#b91c1c"
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
          <div className="nh-card-body" style={{ padding: 0 }}>
            <LichTraNoTable hopDong={selected} rows={kyList} />
          </div>
        </div>

        <HopDongForm
          key={editing?.id ?? 'new'} open={formOpen}
          onClose={() => { setFormOpen(false); setEditing(null); setPresetKhungId(undefined) }}
          editing={editing} khungList={khungList} khaDungMap={khaDungMap} presetHanMucKhungId={presetKhungId}
        />
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
          <span className="nh-kpi-label">Dư nợ gốc còn lại</span>
          <span className="nh-kpi-val" style={{ color: '#b91c1c' }}>{fmt(tongDuNoConLai)}<span style={{ fontSize: 12 }}> đồng</span></span>
          <span className="nh-kpi-sub">Sau khi trừ gốc đã trả</span>
        </div>
        <div className="nh-kpi">
          <span className="nh-kpi-label">Lãi suất bình quân</span>
          <span className="nh-kpi-val" style={{ color: soQuaHan > 0 ? '#8C1F1F' : undefined }}>
            {laiSuatBQ.toFixed(2)}%
          </span>
          <span className="nh-kpi-sub">{soQuaHan > 0 ? `${soQuaHan} hợp đồng quá hạn` : 'Trung bình các HĐ'}</span>
        </div>
      </div>

      {/* ══════════════════════════════════════════
          HẠN MỨC KHUNG — giải ngân theo bộ hồ sơ
      ══════════════════════════════════════════ */}
      {khungList.length > 0 && (
        <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
          {khungList.map(k => {
            const kd = khaDungMap[k.id] ?? { tongHanMuc: k.hanMuc, daSuDung: 0, khaDung: k.hanMuc, soBoDangVay: 0 }
            const pct = kd.tongHanMuc > 0 ? Math.min(100, Math.round((kd.daSuDung / kd.tongHanMuc) * 100)) : 0
            const conCua = hopDongs.filter(h => h.hanMucKhungId === k.id)
            return (
              <div key={k.id} className="nh-card">
                <div className="nh-card-head">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 16 }}>🏦</span>
                    <span className="nh-card-title">{k.soHopDong} — Hạn mức khung</span>
                    <span style={{ fontSize: 11.5, color: 'var(--nh-muted)' }}>
                      {k.entity} · {k.nganHang}{k.chiNhanh ? ` · ${k.chiNhanh}` : ''}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn-ghost" onClick={() => { setEditing(k); setFormOpen(true) }}>Sửa hạn mức</button>
                    <button
                      className="btn-primary"
                      onClick={() => { setPresetKhungId(k.id); setEditing(null); setFormOpen(true) }}
                    >
                      + Giải ngân bộ hồ sơ mới
                    </button>
                  </div>
                </div>
                <div className="nh-card-body">
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, marginBottom: 10 }}>
                    <PayStat label="Tổng hạn mức" value={`${fmt(kd.tongHanMuc)} đ`} sub={`Hết hiệu lực: ${k.ngayDaoHan}`} color="#1C3557" />
                    <PayStat label="Đã sử dụng" value={`${fmt(kd.daSuDung)} đ`} sub={`${kd.soBoDangVay} bộ hồ sơ đang vay`} color="#b45309" />
                    <PayStat
                      label="Khả dụng"
                      value={`${fmt(kd.khaDung)} đ`}
                      sub={pct >= 90 ? '⚠️ Gần chạm hạn mức' : 'Có thể giải ngân tiếp'}
                      color={pct >= 90 ? '#b91c1c' : '#15803d'}
                    />
                  </div>
                  <div style={{ height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden', marginBottom: 12 }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: pct >= 90 ? '#b91c1c' : '#D4A64A', transition: 'width .3s' }} />
                  </div>
                  {conCua.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--nh-muted2)', padding: '8px 0' }}>
                      Chưa có bộ hồ sơ giải ngân nào — bấm “+ Giải ngân bộ hồ sơ mới” để bắt đầu rút vốn.
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table className="nh-tbl" style={{ minWidth: 640 }}>
                        <thead>
                          <tr>
                            <th>Bộ hồ sơ</th>
                            <th>Ngày giải ngân</th>
                            <th>Ngày đáo hạn</th>
                            <th className="r">Giải ngân</th>
                            <th className="r">Dư nợ hiện tại</th>
                            <th>Trạng thái</th>
                          </tr>
                        </thead>
                        <tbody>
                          {conCua.map(bo => {
                            const duNo = tinhDuNoHienTai(kyMap[bo.id] ?? [])
                            return (
                              <tr key={bo.id} style={{ cursor: 'pointer' }} onClick={() => setSelected(bo)}>
                                <td style={{ fontWeight: 700, color: 'var(--nh-navy)' }}>{bo.soBoHoSo || bo.soHopDong}</td>
                                <td>{bo.ngayKy}</td>
                                <td>{bo.ngayDaoHan}</td>
                                <td className="r">{fmt(bo.soTienGiaiNgan)}</td>
                                <td className="r" style={{ fontWeight: 700, color: duNo > 0 ? '#b91c1c' : '#15803d' }}>
                                  {fmt(duNo)}
                                </td>
                                <td><span className={`nh-badge ${HD_BADGE[bo.trangThai]}`}>{HD_LABEL[bo.trangThai]}</span></td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

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
        <div className="nh-card-body" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="nh-tbl" style={{ minWidth: 1100 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 20 }}>
              <tr>
                <th>Số hợp đồng</th>
                <th>Pháp nhân</th>
                <th>Ngân hàng</th>
                <th className="r">Hạn mức</th>
                <th className="r">Giải ngân</th>
                <th className="r">Lãi suất</th>
                <th className="r" style={{ whiteSpace: 'nowrap' }}>
                  <div>Kỳ gốc đã trả</div>
                  <div style={{ fontWeight: 400, opacity: 0.7, fontSize: 10 }}>/ Kỳ lãi đã trả</div>
                </th>
                <th className="r">Gốc đã trả</th>
                <th className="r">Lãi đã trả</th>
                <th className="r">Dư nợ gốc còn lại</th>
                <th>Đáo hạn</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {hopDongs.map(h => {
                const ps = getPayStats(kyMap[h.id], h)
                return (
                  <tr key={h.id} style={{ cursor: 'pointer' }} onClick={() => setSelected(h)}>
                    <td style={{ fontWeight: 700, color: 'var(--nh-navy)' }}>
                      {h.soHopDong}
                      {h.gocTraCoDinh && (
                        <span style={{ marginLeft: 4, fontSize: 10, color: '#92600a', background: '#fffbf0', border: '1px solid #D4A64A55', borderRadius: 4, padding: '1px 4px' }}>
                          🏦 cứng
                        </span>
                      )}
                    </td>
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
                    <td className="r" style={{ whiteSpace: 'nowrap' }}>
                      {ps.tongKy > 0 ? (
                        <>
                          <div style={{ fontWeight: 700, color: '#1C3557', fontSize: 12 }}>
                            {ps.soKyGocDaTra} / {ps.tongKyGoc}
                          </div>
                          <div style={{ fontSize: 10.5, color: '#6b7280' }}>
                            lãi: {ps.soKyLaiDaTra} / {ps.tongKyLai}
                          </div>
                        </>
                      ) : '—'}
                    </td>
                    <td className="r" style={{ whiteSpace: 'nowrap', color: '#1C3557', fontWeight: 600 }}>
                      {ps.soKyGocDaTra > 0 ? fmt(ps.goc) : '—'}
                    </td>
                    <td className="r" style={{ whiteSpace: 'nowrap', color: '#b45309', fontWeight: 600 }}>
                      {ps.soKyLaiDaTra > 0 ? fmt(ps.lai) : '—'}
                    </td>
                    <td className="r" style={{ whiteSpace: 'nowrap', color: '#b91c1c', fontWeight: 700 }}>
                      {fmt(ps.conLai)}
                    </td>
                    <td>{h.ngayDaoHan}</td>
                    <td><span className={`nh-badge ${HD_BADGE[h.trangThai]}`}>{HD_LABEL[h.trangThai]}</span></td>
                  </tr>
                )
              })}
              {hopDongs.length === 0 && (
                <tr><td colSpan={12} style={{ textAlign: 'center', color: 'var(--nh-muted2)', padding: 24 }}>Chưa có hợp đồng tín dụng nào.</td></tr>
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