// ============================================================
// FORM NHẬP KẾ HOẠCH THÁNG — Bước B
//
// Luồng:
//   1. Chọn tháng + pháp nhân
//   2. Nhập tồn quỹ đầu kỳ (từ sổ quỹ thật)
//   3. Bảng kế hoạch thu: chọn nhóm cha → nhập khoản con + số tiền
//   4. Bảng kế hoạch chi: tương tự
//   5. Lưu toàn bộ (sinh nhiều bản ghi KhoanDongTien loaiKhoan='ke-hoach')
//
// Mỗi dòng khoản con = 1 KhoanDongTien riêng với:
//   loaiKhoan = 'ke-hoach'
//   nhomCha   = key nhóm cha
//   nhomChaLabel = label nhóm cha
//   ngayDuKien = ngày 1 của tháng (KH cả tháng, không gán tuần cụ thể)
//   lap / soKyLap = nếu lặp lại hàng tháng/quý
// ============================================================
'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  KhoanDongTien, LoaiDongTien, NhomDongTien, DoTinCay, ChuKyLap,
  NHOM_THEO_LOAI, NHOM_LABEL, DO_TIN_CAY_LABEL, SoDuDauKy,
} from '@/lib/dong-tien-types'
import { saveKhoanDongTien } from '@/lib/dong-tien-store'
import { saveSoDuDauKy, danhSachThangGanDay, thangHienTai, labelThang } from '@/lib/dong-tien-ke-hoach-store'
import type { EntityType } from '@/lib/han-muc-types'

const ENTITIES: EntityType[] = ['SAP', 'SAHS', 'ĐTSA', 'YANA', 'Sao Việt', 'Cá nhân']
const VND = new Intl.NumberFormat('vi-VN')

function parseSoTien(raw: string): number {
  return Number(raw.replace(/\D/g, '')) || 0
}

// ── Một dòng khoản con trong bảng nhập kế hoạch ─────────────
interface DongKeHoach {
  id:           string   // id tạm (client-side)
  nhomCha:      string
  nhomChaLabel: string
  moTa:         string
  soTien:       number
  loai:         LoaiDongTien
  lap:          ChuKyLap
  soKyLap:      number
  doTinCay:     DoTinCay
}

function newDong(nhomCha: string, loai: LoaiDongTien): DongKeHoach {
  return {
    id: `${Date.now()}-${Math.random()}`,
    nhomCha,
    nhomChaLabel: NHOM_LABEL[nhomCha as NhomDongTien] ?? nhomCha,
    moTa: '',
    soTien: 0,
    loai,
    lap: 'mot-lan',
    soKyLap: 1,
    doTinCay: 'du-kien',
  }
}

interface Props {
  onSaved:  () => void
  onCancel: () => void
}

export default function DongTienKeHoachForm({ onSaved, onCancel }: Props) {
  const [thang,    setThang]    = useState(thangHienTai())
  const [entity,   setEntity]   = useState<EntityType>('SAP')
  const [tonQuy,   setTonQuy]   = useState(0)
  const [dongsThu, setDongsThu] = useState<DongKeHoach[]>([])
  const [dongsChi, setDongsChi] = useState<DongKeHoach[]>([])
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  const thangList = useMemo(() => danhSachThangGanDay(24), [])

  // Thêm dòng khoản con mới vào nhóm cha
  function themDong(nhomCha: string, loai: LoaiDongTien) {
    const dong = newDong(nhomCha, loai)
    if (loai === 'thu') setDongsThu(ds => [...ds, dong])
    else setDongsChi(ds => [...ds, dong])
  }

  // Xoá dòng
  function xoaDong(id: string, loai: LoaiDongTien) {
    if (loai === 'thu') setDongsThu(ds => ds.filter(d => d.id !== id))
    else setDongsChi(ds => ds.filter(d => d.id !== id))
  }

  // Cập nhật dòng
  function capNhatDong(id: string, loai: LoaiDongTien, patch: Partial<DongKeHoach>) {
    const update = (ds: DongKeHoach[]) => ds.map(d => d.id === id ? { ...d, ...patch } : d)
    if (loai === 'thu') setDongsThu(update)
    else setDongsChi(update)
  }

  async function handleSave() {
    setError(null)
    const tatCa = [...dongsThu, ...dongsChi]

    if (tatCa.length === 0) { setError('Chưa có khoản nào, thêm ít nhất 1 khoản.'); return }
    const loi = tatCa.find(d => !d.moTa.trim())
    if (loi) { setError(`Dòng "${loi.nhomChaLabel}" chưa có mô tả khoản.`); return }
    const loiTien = tatCa.find(d => d.soTien <= 0)
    if (loiTien) { setError(`Dòng "${loiTien.moTa || loiTien.nhomChaLabel}" chưa có số tiền.`); return }

    setSaving(true)
    try {
      // 1. Lưu tồn quỹ đầu kỳ
      await saveSoDuDauKy({ thang, entity, tonQuy })

      // 2. Lưu từng khoản kế hoạch
      const ngayDuKien = `${thang}-01`
      await Promise.all(tatCa.map(d =>
        saveKhoanDongTien({
          entity,
          loai:         d.loai,
          nhom:         d.nhomCha as NhomDongTien,
          ngayDuKien,
          soTien:       d.soTien,
          moTa:         d.moTa.trim(),
          doTinCay:     d.loai === 'thu' ? d.doTinCay : undefined,
          lap:          d.lap,
          soKyLap:      d.lap === 'mot-lan' ? undefined : d.soKyLap,
          // ── MỚI: đánh dấu đây là kế hoạch ──
          loaiKhoan:    'ke-hoach',
          nhomCha:      d.nhomCha,
          nhomChaLabel: d.nhomChaLabel,
        }),
      ))
      onSaved()
    } catch (err: any) {
      setError(err?.message ?? 'Có lỗi khi lưu, thử lại.')
    } finally {
      setSaving(false)
    }
  }

  // ── Tổng kế hoạch ────────────────────────────────────────────
  const tongKHThu = dongsThu.reduce((s, d) => s + d.soTien, 0)
  const tongKHChi = dongsChi.reduce((s, d) => s + d.soTien, 0)

  return (
    <div className="nh-card">
      <div className="nh-card-head">
        <span className="nh-card-title">📋 Nhập kế hoạch dòng tiền tháng</span>
      </div>
      <div className="nh-card-body">

        {/* ── Chọn tháng + pháp nhân ── */}
        <div className="nh-form-grid" style={{ marginBottom: 16 }}>
          <div>
            <label className="nh-label">Tháng kế hoạch</label>
            <select className="nh-select" value={thang} onChange={e => setThang(e.target.value)}>
              {thangList.map(t => <option key={t} value={t}>{labelThang(t)}</option>)}
            </select>
          </div>
          <div>
            <label className="nh-label">Pháp nhân</label>
            <select className="nh-select" value={entity} onChange={e => setEntity(e.target.value as EntityType)}>
              {ENTITIES.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div>
            <label className="nh-label">Tồn quỹ đầu kỳ (từ sổ quỹ, VNĐ)</label>
            <input
              type="text" inputMode="numeric" className="nh-input"
              value={tonQuy ? VND.format(tonQuy) : ''}
              placeholder="0"
              onChange={e => setTonQuy(parseSoTien(e.target.value))}
            />
          </div>
        </div>

        {/* ── BẢNG KẾ HOẠCH THU ── */}
        <BangKeHoach
          loai="thu"
          dongs={dongsThu}
          tongTien={tongKHThu}
          onThem={themDong}
          onXoa={xoaDong}
          onCapNhat={capNhatDong}
        />

        {/* ── BẢNG KẾ HOẠCH CHI ── */}
        <BangKeHoach
          loai="chi"
          dongs={dongsChi}
          tongTien={tongKHChi}
          onThem={themDong}
          onXoa={xoaDong}
          onCapNhat={capNhatDong}
        />

        {/* ── Tóm tắt nhanh ── */}
        <div className="nh-kpi-row" style={{ gridTemplateColumns: 'repeat(3,1fr)', margin: '16px 0' }}>
          <div className="nh-kpi">
            <span className="nh-kpi-label">KH Thu</span>
            <span className="nh-kpi-val" style={{ color: 'var(--nh-green)' }}>+{VND.format(tongKHThu)}</span>
          </div>
          <div className="nh-kpi">
            <span className="nh-kpi-label">KH Chi</span>
            <span className="nh-kpi-val" style={{ color: 'var(--nh-red)' }}>−{VND.format(tongKHChi)}</span>
          </div>
          <div className="nh-kpi">
            <span className="nh-kpi-label">KH Chênh lệch</span>
            <span className="nh-kpi-val" style={{ color: tongKHThu - tongKHChi >= 0 ? 'var(--nh-green)' : 'var(--nh-red)' }}>
              {tongKHThu - tongKHChi >= 0 ? '+' : ''}{VND.format(tongKHThu - tongKHChi)}
            </span>
          </div>
        </div>

        {error && <div className="nh-err" style={{ marginBottom: 12 }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn-ghost" onClick={onCancel}>Huỷ</button>
          <button className="btn-save" disabled={saving} onClick={handleSave}>
            {saving ? 'Đang lưu...' : `Lưu kế hoạch ${labelThang(thang)}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Sub-component: bảng nhập kế hoạch 1 chiều (thu hoặc chi) ──
interface BangProps {
  loai:       LoaiDongTien
  dongs:      DongKeHoach[]
  tongTien:   number
  onThem:     (nhomCha: string, loai: LoaiDongTien) => void
  onXoa:      (id: string, loai: LoaiDongTien) => void
  onCapNhat:  (id: string, loai: LoaiDongTien, patch: Partial<DongKeHoach>) => void
}

const VND2 = new Intl.NumberFormat('vi-VN')
function parseSo(raw: string): number { return Number(raw.replace(/\D/g, '')) || 0 }

function BangKeHoach({ loai, dongs, tongTien, onThem, onXoa, onCapNhat }: BangProps) {
  const nhomList = NHOM_THEO_LOAI[loai]
  const mauSac   = loai === 'thu' ? 'var(--nh-green)' : 'var(--nh-red)' 
  const tieuDe   = loai === 'thu' ? 'I. KẾ HOẠCH THU' : 'II. KẾ HOẠCH CHI'

  // Nhóm dongs theo nhomCha để hiển thị phân nhóm
  const nhomMap = useMemo(() => {
    const map = new Map<string, DongKeHoach[]>()
    dongs.forEach(d => {
      if (!map.has(d.nhomCha)) map.set(d.nhomCha, [])
      map.get(d.nhomCha)!.push(d)
    })
    return map
  }, [dongs])

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontWeight: 700, color: mauSac, fontSize: 13 }}>{tieuDe}</span>
        <span style={{ fontSize: 12, color: 'var(--nh-muted2)' }}>
          Tổng KH: <strong style={{ color: mauSac }}>{VND2.format(tongTien)}</strong>
        </span>
      </div>

      <table className="nh-tbl" style={{ fontSize: 12 }}>
        <thead>
          <tr>
            <th style={{ width: 160 }}>Nhóm khoản mục</th>
            <th>Mô tả khoản</th>
            <th style={{ width: 150 }}>Số tiền KH (VNĐ)</th>
            {loai === 'thu' && <th style={{ width: 110 }}>Độ tin cậy</th>}
            <th style={{ width: 110 }}>Lặp lại</th>
            <th style={{ width: 60 }}></th>
          </tr>
        </thead>
        <tbody>
          {nhomList.map(nhomCha => {
            const dongNhom = nhomMap.get(nhomCha) ?? []
            const tongNhom = dongNhom.reduce((s, d) => s + d.soTien, 0)
            return (
              <>
                {/* Dòng nhóm cha */}
                <tr key={`nhom-${nhomCha}`} style={{ background: '#F4F6FA' }}>
                  <td colSpan={loai === 'thu' ? 5 : 4} style={{ fontWeight: 700, color: 'var(--nh-navy)', padding: '6px 12px' }}>
                    {NHOM_LABEL[nhomCha as NhomDongTien] ?? nhomCha}
                    {tongNhom > 0 && (
                      <span style={{ fontWeight: 400, color: mauSac, marginLeft: 10 }}>
                        {VND2.format(tongNhom)}
                      </span>
                    )}
                  </td>
                  <td style={{ background: '#F4F6FA' }}>
                    <button
                      className="btn-ghost"
                      style={{ padding: '2px 10px', fontSize: 11 }}
                      onClick={() => onThem(nhomCha, loai)}
                    >
                      + Thêm khoản
                    </button>
                  </td>
                </tr>

                {/* Các dòng khoản con */}
                {dongNhom.map(d => (
                  <tr key={d.id}>
                    <td style={{ paddingLeft: 20, color: 'var(--nh-muted2)', fontSize: 11 }}>
                      └ {NHOM_LABEL[d.nhomCha as NhomDongTien] ?? d.nhomCha}
                    </td>
                    <td>
                      <input
                        type="text" className="nh-input"
                        value={d.moTa}
                        placeholder="VD: Tiền chợ tháng 8"
                        onChange={e => onCapNhat(d.id, loai, { moTa: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="text" inputMode="numeric" className="nh-input"
                        value={d.soTien ? VND2.format(d.soTien) : ''}
                        placeholder="0"
                        onChange={e => onCapNhat(d.id, loai, { soTien: parseSo(e.target.value) })}
                      />
                    </td>
                    {loai === 'thu' && (
                      <td>
                        <select
                          className="nh-select"
                          value={d.doTinCay}
                          onChange={e => onCapNhat(d.id, loai, { doTinCay: e.target.value as DoTinCay })}
                        >
                          {(Object.keys(DO_TIN_CAY_LABEL) as DoTinCay[]).map(k => (
                            <option key={k} value={k}>{DO_TIN_CAY_LABEL[k]}</option>
                          ))}
                        </select>
                      </td>
                    )}
                    <td>
                      <select
                        className="nh-select"
                        value={d.lap}
                        style={{ width: 100 }}
                        onChange={e => onCapNhat(d.id, loai, { lap: e.target.value as ChuKyLap })}
                      >
                        <option value="mot-lan">1 lần</option>
                        <option value="hang-thang">Hàng tháng</option>
                        <option value="hang-quy">Hàng quý</option>
                      </select>
                      {d.lap !== 'mot-lan' && (
                        <input
                          type="number" min={1} max={60} className="nh-input"
                          style={{ width: 50, marginTop: 4 }}
                          value={d.soKyLap}
                          title="Số kỳ lặp"
                          onChange={e => onCapNhat(d.id, loai, { soKyLap: Number(e.target.value) })}
                        />
                      )}
                    </td>
                    <td>
                      <button
                        className="btn-danger"
                        style={{ padding: '2px 8px' }}
                        onClick={() => onXoa(d.id, loai)}
                      >✕</button>
                    </td>
                  </tr>
                ))}
              </>
            )
          })}

          {dongs.length === 0 && (
            <tr>
              <td colSpan={loai === 'thu' ? 6 : 5} style={{ textAlign: 'center', color: 'var(--nh-muted2)', padding: 16 }}>
                Chưa có khoản nào — bấm "+ Thêm khoản" ở dòng nhóm phù hợp.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
