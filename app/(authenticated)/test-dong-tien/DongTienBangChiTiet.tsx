// ============================================================
// BẢNG CHI TIẾT — danh sách khoản dòng tiền nhập tay (Phần 1)
// `rows` truyền vào đã được lọc sẵn (ngày + loại + trạng thái)
// từ TabDongTien — component này chỉ hiển thị + sort, không lọc
// riêng nữa (nguyên tắc: lọc 1 lần duy nhất ở trên cùng).
//
// GỘP DÒNG: các khoản cùng Ngày + Nhóm + Pháp nhân được gộp
// thành 1 dòng cha (đỡ rối khi 1 nhóm có nhiều kỳ lặp cùng
// ngày/tháng khác nhau nhưng trùng ngày cụ thể) — click để bung
// ra xem từng khoản con, giống cách làm ở DongTienNhomChiTiet
// (phần Tự động từ hạn mức). Khi dòng cha chỉ có 1 khoản, vẫn
// hiện Sửa/Xoá trực tiếp như cũ — chỉ ẩn khi đã gộp >1 khoản
// (lúc đó Sửa/Xoá chuyển xuống từng dòng con khi bung ra).
//
// Dùng đúng bộ class CSS hệ thống fire-portal — không Tailwind.
// ============================================================
'use client'

import { Fragment, useMemo, useState } from 'react'
import { KhoanDongTien, NHOM_LABEL, DO_TIN_CAY_LABEL, DoTinCay } from '@/lib/dong-tien-types'
import { deleteKhoanDongTien, deleteChuoiLap, markDongTienThucHien, unmarkDongTienThucHien } from '@/lib/dong-tien-store'

interface Props {
  rows:      KhoanDongTien[]
  onEdit:    (k: KhoanDongTien) => void
  onChanged: () => void
}

const VND = new Intl.NumberFormat('vi-VN')

// ── Gộp nhóm: cùng Ngày + Nhóm + Pháp nhân → 1 dòng cha ─────
interface NhapTayGroup {
  key:             string
  ngayDuKien:      string
  entity:          string
  nhom:            string
  loai:            'thu' | 'chi'
  soTien:          number   // tổng tiền cả nhóm (dùng số thực tế nếu đã thực hiện)
  soLuong:         number
  soDaThucHien:    number
  soDuKien:        number
  coLap:           boolean
  doTinCay?:       DoTinCay
  doTinCayMixed:   boolean
  moTaDauTien:     string
  items:           KhoanDongTien[]
}

function gomNhapTay(rows: KhoanDongTien[]): NhapTayGroup[] {
  const map = new Map<string, NhapTayGroup>()

  rows.forEach(k => {
    const key = `${k.ngayDuKien}|${k.entity}|${k.nhom}`
    if (!map.has(key)) {
      map.set(key, {
        key, ngayDuKien: k.ngayDuKien, entity: k.entity, nhom: k.nhom, loai: k.loai,
        soTien: 0, soLuong: 0, soDaThucHien: 0, soDuKien: 0,
        coLap: false, doTinCay: k.doTinCay, doTinCayMixed: false,
        moTaDauTien: k.moTa, items: [],
      })
    }
    const g = map.get(key)!
    g.soTien += k.daThucHien ? (k.soTienThucTe ?? k.soTien) : k.soTien
    g.soLuong += 1
    if (k.daThucHien) g.soDaThucHien += 1
    else g.soDuKien += 1
    if (k.lapNhomId) g.coLap = true
    if (g.doTinCay !== k.doTinCay) g.doTinCayMixed = true
    g.items.push(k)
  })

  // items trong mỗi nhóm sort theo ngày (tie-break ổn định)
  map.forEach(g => g.items.sort((a, b) => a.ngayDuKien.localeCompare(b.ngayDuKien)))

  return Array.from(map.values())
}

export default function DongTienBangChiTiet({ rows, onEdit, onChanged }: Props) {
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [moRong,    setMoRong]    = useState<Set<string>>(new Set())

  const sorted = useMemo(
    () => [...rows].sort((a, b) => a.ngayDuKien.localeCompare(b.ngayDuKien)),
    [rows],
  )

  const groups = useMemo(() => gomNhapTay(sorted), [sorted])

  const tongThu = sorted.filter(r => r.loai === 'thu').reduce((s, r) => s + (r.daThucHien ? r.soTienThucTe ?? r.soTien : r.soTien), 0)
  const tongChi = sorted.filter(r => r.loai === 'chi').reduce((s, r) => s + (r.daThucHien ? r.soTienThucTe ?? r.soTien : r.soTien), 0)

  function toggleMoRong(key: string) {
    setMoRong(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function handleDelete(k: KhoanDongTien) {
    if (k.lapNhomId) {
      const xoaCaChuoi = window.confirm(
        `Khoản này thuộc chuỗi lặp (${k.soKyLap} kỳ). OK = xoá cả chuỗi, Cancel = chỉ xoá kỳ này.`,
      )
      if (xoaCaChuoi) { await deleteChuoiLap(k.lapNhomId); onChanged(); return }
    } else if (!window.confirm('Xoá khoản này?')) {
      return
    }
    await deleteKhoanDongTien(k.id)
    onChanged()
  }

  async function handleToggleThucHien(k: KhoanDongTien) {
    setMarkingId(k.id)
    try {
      if (k.daThucHien) await unmarkDongTienThucHien(k.id)
      else await markDongTienThucHien(k.id, k.ngayDuKien, k.soTien)
      onChanged()
    } finally {
      setMarkingId(null)
    }
  }

  // ── Dòng 1 khoản đơn (dùng cho nhóm chỉ có 1 khoản, và cho từng dòng con khi bung nhóm) ──
  function renderItemRow(k: KhoanDongTien, thut: boolean) {
    return (
      <tr key={k.id} style={thut ? { background: '#FAFBFC' } : undefined}>
        <td></td>
        <td>{thut ? <span style={{ color: 'var(--nh-muted2)' }}>{k.ngayDuKien}</span> : k.ngayDuKien}</td>
        <td>{thut ? '' : k.entity}</td>
        <td>
          {thut ? <span style={{ paddingLeft: 20, color: '#555' }}>↳ {NHOM_LABEL[k.nhom] ?? k.nhom}</span> : (NHOM_LABEL[k.nhom] ?? k.nhom)}
          {k.doTinCay && <span className="nh-badge nh-b-amber" style={{ marginLeft: 6 }}>{DO_TIN_CAY_LABEL[k.doTinCay]}</span>}
          {k.lapNhomId && <span className="nh-badge nh-b-grey" style={{ marginLeft: 6 }}>lặp</span>}
        </td>
        <td>{k.moTa}</td>
        <td className="r" style={{ fontWeight: 700, color: k.loai === 'thu' ? 'var(--nh-green)' : 'var(--nh-red)' }}>
          {k.loai === 'thu' ? '+' : '−'}{VND.format(k.daThucHien ? k.soTienThucTe ?? k.soTien : k.soTien)}
        </td>
        <td>
          <button
            onClick={() => handleToggleThucHien(k)}
            disabled={markingId === k.id}
            className={`nh-badge ${k.daThucHien ? 'nh-b-green' : 'nh-b-amber'}`}
            style={{ cursor: 'pointer', border: '1px solid', fontFamily: 'inherit' }}
          >
            {k.daThucHien ? 'Đã thực hiện' : 'Dự kiến'}
          </button>
        </td>
        <td>
          <button onClick={() => onEdit(k)} className="btn-ghost" style={{ marginRight: 6, padding: '4px 10px' }}>Sửa</button>
          <button onClick={() => handleDelete(k)} className="btn-danger">Xoá</button>
        </td>
      </tr>
    )
  }

  return (
    <div>
      <div style={{ padding: '14px 20px 0' }}>
        <div className="nh-kpi-row" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 14 }}>
          <div className="nh-kpi">
            <span className="nh-kpi-label">Tổng thu</span>
            <span className="nh-kpi-val" style={{ color: 'var(--nh-green)' }}>{VND.format(tongThu)}</span>
          </div>
          <div className="nh-kpi">
            <span className="nh-kpi-label">Tổng chi</span>
            <span className="nh-kpi-val" style={{ color: 'var(--nh-red)' }}>{VND.format(tongChi)}</span>
          </div>
          <div className="nh-kpi">
            <span className="nh-kpi-label">Chênh lệch</span>
            <span className="nh-kpi-val">{VND.format(tongThu - tongChi)}</span>
          </div>
        </div>
      </div>

      <table className="nh-tbl">
        <thead>
          <tr>
            <th style={{ width: 20 }}></th>
            <th>Ngày</th>
            <th>Pháp nhân</th>
            <th>Nhóm</th>
            <th>Mô tả</th>
            <th className="r">Số tiền</th>
            <th>Trạng thái</th>
            <th>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(g => {
            const donLe = g.soLuong === 1
            const daMo  = !donLe && moRong.has(g.key)

            // Nhóm chỉ có 1 khoản: hiện y như dòng đơn cũ (cột đầu để trống), Sửa/Xoá vẫn hoạt động bình thường
            if (donLe) return renderItemRow(g.items[0], false)

            // Nhóm gộp nhiều khoản: dòng cha tổng hợp, click để bung — Sửa/Xoá chuyển xuống từng dòng con
            return (
              <Fragment key={g.key}>
                <tr
                  onClick={() => toggleMoRong(g.key)}
                  style={{ cursor: 'pointer', background: daMo ? '#EEF3FA' : undefined }}
                >
                  <td style={{ textAlign: 'center', color: 'var(--nh-muted2)' }}>{daMo ? '▲' : '▶'}</td>
                  <td>{g.ngayDuKien}</td>
                  <td>{g.entity}</td>
                  <td>
                    {NHOM_LABEL[g.nhom] ?? g.nhom}
                    {!g.doTinCayMixed && g.doTinCay && <span className="nh-badge nh-b-amber" style={{ marginLeft: 6 }}>{DO_TIN_CAY_LABEL[g.doTinCay]}</span>}
                    {g.coLap && <span className="nh-badge nh-b-grey" style={{ marginLeft: 6 }}>lặp</span>}
                  </td>
                  <td>
                    {g.moTaDauTien}
                    <span className="nh-badge nh-b-grey" style={{ marginLeft: 6 }}>{g.soLuong} khoản</span>
                  </td>
                  <td className="r" style={{ fontWeight: 700, color: g.loai === 'thu' ? 'var(--nh-green)' : 'var(--nh-red)' }}>
                    {g.loai === 'thu' ? '+' : '−'}{VND.format(g.soTien)}
                  </td>
                  <td>
                    {g.soDuKien === 0 ? (
                      <span className="nh-badge nh-b-green">Đã thực hiện</span>
                    ) : g.soDaThucHien === 0 ? (
                      <span className="nh-badge nh-b-amber">Dự kiến</span>
                    ) : (
                      <span className="nh-badge nh-b-amber">{g.soDaThucHien}/{g.soLuong} đã TH</span>
                    )}
                  </td>
                  <td style={{ color: 'var(--nh-muted2)', fontSize: 12 }}>Bung để sửa/xoá từng khoản</td>
                </tr>

                {daMo && g.items.map(k => renderItemRow(k, true))}
              </Fragment>
            )
          })}
          {groups.length === 0 && (
            <tr>
              <td colSpan={8} style={{ textAlign: 'center', color: 'var(--nh-muted2)', padding: 24 }}>Chưa có khoản nào khớp bộ lọc.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
