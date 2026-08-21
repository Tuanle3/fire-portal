// ============================================================
// TAB — Dòng tiền
//   Phần 1: khoản nhập tay (có thể thu gọn)
//   Phần 2: khoản tự động từ hạn mức tín dụng (có thể thu gọn)
//   Phần 3: Aggregation Engine
//   Phần 4: 3 kiểu hiển thị
//   Phần 5: Đối chiếu Sổ quỹ vs. Lịch trả nợ (có thể thu gọn)
//
//   ⚙️ NGUYÊN TẮC: LỌC 1 LẦN DUY NHẤT ở đây (ngày + loại + trạng
//   thái), mọi phần bên dưới dùng chung dữ liệu đã lọc.
//
// Dùng đúng bộ class CSS hệ thống fire-portal — không Tailwind.
// ============================================================
'use client'

import { useEffect, useState, useMemo } from 'react'
import { KhoanDongTien } from '@/lib/dong-tien-types'
import { subscribeDongTien } from '@/lib/dong-tien-store'
import { subscribeDongTienTuHanMuc, DongTienHanMucData } from '@/lib/dong-tien-hanmuc-adapter'
import { subscribeDongTienTuQuy, DongTienQuyData } from '@/lib/dong-tien-quy-adapter'
import { hopNhatDongTien, locTheoKhoangNgay } from '@/lib/dong-tien-engine'
import { doiChieuTatCa } from '@/lib/dong-tien-doi-chieu-engine'
import { subscribeHopDong, subscribeAllKyTraNo } from '@/lib/han-muc-store'
import { subscribeHanMucNganHan, subscribeBoHoSo, subscribeKyThu } from '@/lib/han-muc-ngan-han-store'
import DongTienForm        from './DongTienForm'
import DongTienBangChiTiet from './DongTienBangChiTiet'
import DongTienTuDong      from './DongTienTuDong'
import DongTienView        from './DongTienView'
import DongTienDoiChieu    from './DongTienDoiChieu'
import type { EntityType }          from '@/lib/han-muc-types'
import type { HopDongTinDung, KyTraNo } from '@/lib/han-muc-types'
import type { HanMucNganHan, BoHoSoGiaiNgan, KyThuNH } from '@/lib/han-muc-ngan-han-types'

const ENTITIES: (EntityType | 'all')[] = ['all', 'SAP', 'SAHS', 'ĐTSA', 'YANA', 'Sao Việt', 'Cá nhân']
const ENTITY_LABEL: Record<string, string> = { all: 'Toàn tập đoàn' }

// ── Shortcut khoảng ngày ─────────────────────────────────────
function shortcutRange(key: string): { tu: string; den: string } {
  const now = new Date()
  const y   = now.getFullYear()
  const m   = now.getMonth()
  const pad = (n: number) => String(n).padStart(2, '0')
  const homNay = `${y}-${pad(m + 1)}-${pad(now.getDate())}`
  const cuoiThangNay = `${y}-${pad(m + 1)}-${new Date(y, m + 1, 0).getDate()}`

  if (key === 'tu-hom-nay') return { tu: homNay, den: cuoiThangNay }
  if (key === 'thang-nay')  return { tu: `${y}-${pad(m + 1)}-01`, den: cuoiThangNay }
  if (key === 'quy-nay') {
    const q = Math.floor(m / 3); const t = q * 3
    return { tu: `${y}-${pad(t + 1)}-01`, den: `${y}-${pad(t + 3)}-${new Date(y, t + 3, 0).getDate()}` }
  }
  if (key === '6-thang') {
    const six = new Date(y, m - 5, 1)
    return { tu: `${six.getFullYear()}-${pad(six.getMonth() + 1)}-01`, den: cuoiThangNay }
  }
  if (key === 'nam-nay') return { tu: `${y}-01-01`, den: `${y}-12-31` }
  return { tu: '', den: '' }
}

const SHORTCUTS = [
  { key: 'tu-hom-nay', label: 'Từ hôm nay' },
  { key: 'thang-nay',  label: 'Tháng này'   },
  { key: 'quy-nay',    label: 'Quý này'     },
  { key: '6-thang',    label: '6 tháng'     },
  { key: 'nam-nay',    label: 'Năm nay'     },
  { key: 'tat-ca',     label: 'Tất cả'      },
]

const DEFAULT_SHORTCUT = 'tu-hom-nay'

export default function TabDongTien() {
  const [entity,     setEntity]    = useState<EntityType | 'all'>('all')
  const [rows,       setRows]      = useState<KhoanDongTien[]>([])
  const [hanMucData, setHanMucData]= useState<DongTienHanMucData>({ items: [], khaDungList: [] })
  const [showForm,   setShowForm]  = useState(false)
  const [editing,    setEditing]   = useState<KhoanDongTien | null>(null)

  // ── BỘ LỌC HỢP NHẤT ─────────────────────────────────────────
  const initRange = shortcutRange(DEFAULT_SHORTCUT)
  const [tuNgay,       setTuNgay]       = useState(initRange.tu)
  const [denNgay,      setDenNgay]      = useState(initRange.den)
  const [shortcut,     setShortcut]     = useState(DEFAULT_SHORTCUT)
  const [locLoai,      setLocLoai]      = useState<'all' | 'thu' | 'chi'>('all')
  const [locTrangThai, setLocTrangThai] = useState<'all' | 'du-kien' | 'thuc-te'>('all')

  // ── Thu gọn card ────────────────────────────────────────────
  const [moNhapTay,   setMoNhapTay]   = useState(false)
  const [moTuDong,    setMoTuDong]    = useState(false)
  const [moDoiChieu,  setMoDoiChieu]  = useState(false)

  // ── DATA SỔ QUỸ (Phần 5) ────────────────────────────────────
  const emptyQuy: DongTienQuyData = { hoatDong: [], vayRows: [], khongXacDinh: [], tonQuyRealtime: 0 }
  const [quyData, setQuyData] = useState<DongTienQuyData>(emptyQuy)

  // ── DATA HỢP ĐỒNG + KỲ TRẢ NỢ (dài hạn) — cho engine đối chiếu ──
  const [hopDongList,  setHopDongList]  = useState<HopDongTinDung[]>([])
  const [kyTraNoAll,   setKyTraNoAll]   = useState<KyTraNo[]>([])

  // ── DATA HẠN MỨC NGẮN HẠN — cho engine đối chiếu ────────────
  const [khungList,    setKhungList]    = useState<HanMucNganHan[]>([])
  // boHoSoAll + kyThuAll: gom từ tất cả khung (subscribe theo từng khung)
  const [boHoSoAll,    setBoHoSoAll]    = useState<BoHoSoGiaiNgan[]>([])
  const [kyThuAll,     setKyThuAll]     = useState<KyThuNH[]>([])

  function applyShortcut(key: string) {
    setShortcut(key)
    const { tu, den } = shortcutRange(key)
    setTuNgay(tu); setDenNgay(den)
  }

  // ── Subscribe: nhập tay ──────────────────────────────────────
  useEffect(() => {
    return subscribeDongTien(setRows, entity === 'all' ? undefined : entity)
  }, [entity])

  // ── Subscribe: hạn mức tín dụng (Phần 2) ────────────────────
  useEffect(() => {
    return subscribeDongTienTuHanMuc(setHanMucData, entity === 'all' ? undefined : entity)
  }, [entity])

  // ── Subscribe: sổ quỹ RTDB (Phần 5) ─────────────────────────
  useEffect(() => {
    return subscribeDongTienTuQuy(setQuyData, entity === 'all' ? undefined : entity)
  }, [entity])

  // ── Subscribe: hợp đồng dài hạn (cho engine đối chiếu) ──────
  useEffect(() => {
    return subscribeHopDong(setHopDongList, entity === 'all' ? undefined : entity)
  }, [entity])

  // ── Subscribe: toàn bộ kỳ trả nợ dài hạn ───────────────────
  useEffect(() => {
    if (!hopDongList.length) { setKyTraNoAll([]); return }
    const ids = hopDongList.map(h => h.id)
    return subscribeAllKyTraNo(ids, setKyTraNoAll)
  }, [hopDongList])

  // ── Subscribe: hạn mức khung ngắn hạn ───────────────────────
  useEffect(() => {
    return subscribeHanMucNganHan(setKhungList, entity === 'all' ? undefined : entity)
  }, [entity])

  // ── Subscribe: bộ hồ sơ + kỳ thu của từng khung ─────────────
  // Khi khungList thay đổi: subscribe lại toàn bộ bộ hồ sơ + kỳ thu
  useEffect(() => {
    if (!khungList.length) { setBoHoSoAll([]); setKyThuAll([]); return }

    const boMap   = new Map<string, BoHoSoGiaiNgan[]>()
    const kyMap   = new Map<string, KyThuNH[]>()
    const unsubs: (() => void)[] = []

    function rebuild() {
      setBoHoSoAll(Array.from(boMap.values()).flat())
      setKyThuAll(Array.from(kyMap.values()).flat())
    }

    khungList.forEach(khung => {
      // subscribe bộ hồ sơ của khung này
      const unsubBo = subscribeBoHoSo(khung.id, bos => {
        boMap.set(khung.id, bos)
        rebuild()

        // subscribe kỳ thu của từng bộ hồ sơ
        bos.forEach(bo => {
          const unsubKy = subscribeKyThu(khung.id, bo.id, kys => {
            kyMap.set(bo.id, kys)
            rebuild()
          })
          unsubs.push(unsubKy)
        })
      })
      unsubs.push(unsubBo)
    })

    return () => unsubs.forEach(u => u())
  }, [khungList])

  function openNew()  { setEditing(null); setShowForm(true); setMoNhapTay(true) }
  function openEdit(k: KhoanDongTien) { setEditing(k); setShowForm(true); setMoNhapTay(true) }
  function closeForm() { setShowForm(false); setEditing(null) }

  // ── Lọc nhập tay ─────────────────────────────────────────────
  const rowsFiltered = useMemo(() => rows
    .filter(r => !tuNgay  || r.ngayDuKien >= tuNgay)
    .filter(r => !denNgay || r.ngayDuKien <= denNgay)
    .filter(r => locLoai === 'all' || r.loai === locLoai)
    .filter(r => {
      if (locTrangThai === 'all') return true
      return (r.daThucHien ? 'thuc-te' : 'du-kien') === locTrangThai
    }),
  [rows, tuNgay, denNgay, locLoai, locTrangThai])

  // ── Lọc hạn mức tín dụng ─────────────────────────────────────
  const hanMucFiltered = useMemo(() => {
    let list = locTheoKhoangNgay(hanMucData.items, tuNgay || undefined, denNgay || undefined)
    if (locLoai !== 'all')      list = list.filter(it => it.loai === locLoai)
    if (locTrangThai !== 'all') list = list.filter(it => it.trangThai === locTrangThai)
    return list
  }, [hanMucData.items, tuNgay, denNgay, locLoai, locTrangThai])

  // ── Hợp nhất ─────────────────────────────────────────────────
  const itemsHopNhat = useMemo(
    () => hopNhatDongTien(rowsFiltered, hanMucFiltered),
    [rowsFiltered, hanMucFiltered],
  )

  // ── Build Map cho engine đối chiếu ───────────────────────────
  const hopDongMap = useMemo(
    () => new Map(hopDongList.map(h => [h.id, h])),
    [hopDongList],
  )
  const boHoSoMap = useMemo(
    () => new Map(boHoSoAll.map(b => [b.id, b])),
    [boHoSoAll],
  )
  const khungMap = useMemo(
    () => new Map(khungList.map(k => [k.id, k])),
    [khungList],
  )
  const kyTraNoMap = useMemo(() => {
    const m = new Map<string, KyTraNo[]>()
    kyTraNoAll.forEach(k => {
      if (!m.has(k.hopDongId)) m.set(k.hopDongId, [])
      m.get(k.hopDongId)!.push(k)
    })
    return m
  }, [kyTraNoAll])

  // ── Chạy engine đối chiếu (chỉ khi Phần 5 đang mở — tiết kiệm CPU) ──
  const doiChieuRows = useMemo(() => {
    if (!moDoiChieu) return []
    return doiChieuTatCa({
      kyTraNoList: kyTraNoAll,
      hopDongMap,
      kyThuList:   kyThuAll,
      boHoSoMap,
      khungMap,
      vayRows:     quyData.vayRows,
    })
  }, [moDoiChieu, kyTraNoAll, hopDongMap, kyThuAll, boHoSoMap, khungMap, quyData.vayRows])

  // ── Đếm lệch để hiện badge ngay cả khi Phần 5 đang đóng ─────
  // Chạy tách biệt (không phụ thuộc moDoiChieu) — nhẹ vì chỉ đếm
  const soLechBadge = useMemo(() => {
    if (!quyData.vayRows.length) return 0
    return doiChieuTatCa({
      kyTraNoList: kyTraNoAll,
      hopDongMap,
      kyThuList:   kyThuAll,
      boHoSoMap,
      khungMap,
      vayRows:     quyData.vayRows,
    }).filter(r => r.trangThai === 'lech').length
  }, [kyTraNoAll, hopDongMap, kyThuAll, boHoSoMap, khungMap, quyData.vayRows])

  const dangLoc = !!(shortcut !== DEFAULT_SHORTCUT || locLoai !== 'all' || locTrangThai !== 'all')

  function scBtn(key: string) {
    const active = shortcut === key
    return {
      padding: '4px 12px', borderRadius: 20, fontSize: 12,
      fontFamily: 'inherit', cursor: 'pointer',
      border: '1px solid ' + (active ? 'var(--nh-navy)' : '#E5E0D8'),
      background: active ? 'var(--nh-navy)' : '#fff',
      color:      active ? '#fff' : '#3D3D3D',
      fontWeight: active ? 700 : 400,
      transition: 'all .12s',
    } as React.CSSProperties
  }

  return (
    <div>
      {/* ── THANH CHỌN PHÁP NHÂN ────────────────────────────── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        {ENTITIES.map(e => {
          const active = entity === e
          return (
            <button key={e} onClick={() => setEntity(e)} style={{
              padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
              fontFamily: 'inherit', cursor: 'pointer',
              border:     '1px solid ' + (active ? 'var(--nh-navy)' : '#E5E0D8'),
              background: active ? 'var(--nh-navy)' : '#fff',
              color:      active ? '#fff' : '#3D3D3D',
              transition: 'all .15s',
            }}>
              {ENTITY_LABEL[e as string] ?? e}
            </button>
          )
        })}
      </div>

      {/* ── BỘ LỌC HỢP NHẤT ─────────────────────────────────── */}
      <div style={{
        background: '#F7F9FC', border: '1px solid var(--nh-border)',
        borderRadius: 10, padding: '10px 16px', marginBottom: 14,
        display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--nh-navy)', marginRight: 4 }}>🗓 Lọc:</span>
        {SHORTCUTS.map(s => (
          <button key={s.key} onClick={() => applyShortcut(s.key)} style={scBtn(s.key)}>{s.label}</button>
        ))}
        <span style={{ color: '#ddd' }}>|</span>
        <label style={{ fontSize: 12, color: 'var(--nh-muted2)', margin: 0 }}>Từ</label>
        <input type="date" className="nh-input" style={{ width: 145 }} value={tuNgay}
          onChange={e => { setTuNgay(e.target.value); setShortcut('') }} />
        <label style={{ fontSize: 12, color: 'var(--nh-muted2)', margin: 0 }}>Đến</label>
        <input type="date" className="nh-input" style={{ width: 145 }} value={denNgay}
          onChange={e => { setDenNgay(e.target.value); setShortcut('') }} />
        <span style={{ color: '#ddd' }}>|</span>
        <select className="nh-select" style={{ width: 130 }} value={locLoai}
          onChange={e => setLocLoai(e.target.value as any)}>
          <option value="all">Tất cả loại</option>
          <option value="thu">Chỉ khoản THU</option>
          <option value="chi">Chỉ khoản CHI</option>
        </select>
        <select className="nh-select" style={{ width: 150 }} value={locTrangThai}
          onChange={e => setLocTrangThai(e.target.value as any)}>
          <option value="all">Tất cả trạng thái</option>
          <option value="du-kien">Dự kiến</option>
          <option value="thuc-te">Đã thực hiện</option>
        </select>
        {dangLoc && (
          <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }}
            onClick={() => { applyShortcut(DEFAULT_SHORTCUT); setLocLoai('all'); setLocTrangThai('all') }}>
            ✕ Xoá lọc
          </button>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--nh-muted2)' }}>
          {rowsFiltered.length + hanMucFiltered.length} khoản (nhập tay {rowsFiltered.length} + tự động {hanMucFiltered.length})
        </span>
      </div>

      {/* ── FORM THÊM/SỬA ────────────────────────────────────── */}
      {showForm && (
        <div style={{ marginBottom: 14 }}>
          <DongTienForm
            editing={editing}
            entityMacDinh={entity === 'all' ? undefined : entity}
            onSaved={closeForm}
            onCancel={closeForm}
          />
        </div>
      )}

      {/* ── PHẦN 1: NHẬP TAY ─────────────────────────────────── */}
      <div className="nh-card" style={{ marginBottom: 14 }}>
        <div className="nh-card-head" style={{ flexWrap: 'wrap', gap: 8 }}>
          <span className="nh-card-title" onClick={() => setMoNhapTay(v => !v)}
            style={{ cursor: 'pointer', userSelect: 'none' }}>
            {moNhapTay ? '▲' : '▶'} Danh sách khoản nhập tay
            <span className="nh-badge nh-b-grey" style={{ marginLeft: 8 }}>{rowsFiltered.length} khoản</span>
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span onClick={() => setMoNhapTay(v => !v)}
              style={{ cursor: 'pointer', fontSize: 12, color: 'var(--nh-muted2)' }}>
              {moNhapTay ? 'Thu gọn' : 'Mở rộng'}
            </span>
            <button className="btn-primary" onClick={openNew}>+ Thêm khoản</button>
          </div>
        </div>
        {moNhapTay && (
          <div className="nh-card-body" style={{ padding: 0 }}>
            <DongTienBangChiTiet rows={rowsFiltered} onEdit={openEdit} onChanged={() => {}} />
          </div>
        )}
      </div>

      {/* ── PHẦN 2: TỰ ĐỘNG TỪ HẠN MỨC ─────────────────────── */}
      <div className="nh-card" style={{ marginBottom: 14 }}>
        <div className="nh-card-head" onClick={() => setMoTuDong(v => !v)}
          style={{ cursor: 'pointer', userSelect: 'none' }}>
          <span className="nh-card-title">
            {moTuDong ? '▲' : '▶'} Tự động từ hạn mức tín dụng
            <span className="nh-badge nh-b-blue" style={{ marginLeft: 8 }}>{hanMucFiltered.length} khoản</span>
          </span>
          <span style={{ fontSize: 12, color: 'var(--nh-muted2)' }}>{moTuDong ? 'Thu gọn' : 'Mở rộng'}</span>
        </div>
        {moTuDong && (
          <div className="nh-card-body" style={{ padding: 0 }}>
            <DongTienTuDong items={hanMucFiltered} />
          </div>
        )}
      </div>

      {/* ── PHẦN 3+4: ENGINE ROLLUP + 3 KIỂU HIỂN THỊ ──────── */}
      <DongTienView items={itemsHopNhat} />

      {/* ── PHẦN 5: ĐỐI CHIẾU SỔ QUỸ (có thể thu gọn) ──────── */}
      <div className="nh-card" style={{ marginTop: 14, marginBottom: 14 }}>
        <div className="nh-card-head" onClick={() => setMoDoiChieu(v => !v)}
          style={{ cursor: 'pointer', userSelect: 'none' }}>
          <span className="nh-card-title">
            {moDoiChieu ? '▲' : '▶'} Đối chiếu Sổ quỹ vs. Lịch trả nợ
            {soLechBadge > 0 && (
              <span className="nh-badge nh-b-amber" style={{ marginLeft: 8 }}>
                {soLechBadge} lệch
              </span>
            )}
            {quyData.vayRows.length > 0 && soLechBadge === 0 && (
              <span className="nh-badge nh-b-green" style={{ marginLeft: 8 }}>Khớp</span>
            )}
          </span>
          <span style={{ fontSize: 12, color: 'var(--nh-muted2)' }}>
            {moDoiChieu ? 'Thu gọn' : 'Mở rộng'}
          </span>
        </div>

        {moDoiChieu && (
          <div className="nh-card-body" style={{ padding: 0 }}>
            <DongTienDoiChieu
              rows={doiChieuRows}
              hopDongMap={hopDongMap}
              kyTraNoMap={kyTraNoMap}
              onSynced={() => {
                // vayRows tự cập nhật qua RTDB listener — không cần reload thủ công
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}