// ============================================================
// CHI TIẾT — Bảng flat tất cả DongTienItem (nhập tay + tự động)
// sau khi hợp nhất + lọc ngày. Phần 4.
// ============================================================
'use client'

import { useMemo, useState } from 'react'
import { DongTienItem } from '@/lib/dong-tien-types'

interface Props {
  items: DongTienItem[]
}

const VND = new Intl.NumberFormat('vi-VN')

const NGUON_LABEL: Record<string, string> = {
  'nhap-tay':  'Nhập tay',
  'kytra-no':  'Vay dài hạn',
  'kythu-nh':  'Hạn mức NH',
  'giai-ngan': 'Giải ngân',
}
const NGUON_BADGE: Record<string, string> = {
  'nhap-tay':  'nh-b-grey',
  'kytra-no':  'nh-b-purple',
  'kythu-nh':  'nh-b-purple',
  'giai-ngan': 'nh-b-blue',
}

type SortField = 'ngay' | 'soTien'
type SortDir   = 'asc' | 'desc'

export default function DongTienChiTiet({ items }: Props) {
  const [locLoai,   setLocLoai]   = useState<'all' | 'thu' | 'chi'>('all')
  const [locNguon,  setLocNguon]  = useState<'all' | string>('all')
  const [locTrang,  setLocTrang]  = useState<'all' | 'du-kien' | 'thuc-te'>('all')
  const [sortField, setSortField] = useState<SortField>('ngay')
  const [sortDir,   setSortDir]   = useState<SortDir>('asc')

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const filtered = useMemo(() => {
    let result = items
      .filter(it => locLoai  === 'all' || it.loai    === locLoai)
      .filter(it => locNguon === 'all' || it.nguon   === locNguon)
      .filter(it => locTrang === 'all' || it.trangThai === locTrang)

    result = [...result].sort((a, b) => {
      let cmp = 0
      if (sortField === 'ngay')    cmp = a.ngay.localeCompare(b.ngay)
      if (sortField === 'soTien')  cmp = a.soTien - b.soTien
      return sortDir === 'asc' ? cmp : -cmp
    })
    return result
  }, [items, locLoai, locNguon, locTrang, sortField, sortDir])

  const tongThu = filtered.filter(it => it.loai === 'thu').reduce((s, it) => s + it.soTien, 0)
  const tongChi = filtered.filter(it => it.loai === 'chi').reduce((s, it) => s + it.soTien, 0)

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <span style={{ color: '#ccc', marginLeft: 4 }}>⇅</span>
    return <span style={{ marginLeft: 4 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  return (
    <div>
      {/* Bộ lọc */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        <select className="nh-select" style={{ width: 145 }} value={locLoai} onChange={e => setLocLoai(e.target.value as any)}>
          <option value="all">Tất cả loại</option>
          <option value="thu">Chỉ khoản THU</option>
          <option value="chi">Chỉ khoản CHI</option>
        </select>
        <select className="nh-select" style={{ width: 165 }} value={locNguon} onChange={e => setLocNguon(e.target.value)}>
          <option value="all">Tất cả nguồn</option>
          <option value="nhap-tay">Nhập tay</option>
          <option value="kytra-no">Vay dài hạn</option>
          <option value="kythu-nh">Hạn mức ngắn hạn</option>
          <option value="giai-ngan">Giải ngân</option>
        </select>
        <select className="nh-select" style={{ width: 165 }} value={locTrang} onChange={e => setLocTrang(e.target.value as any)}>
          <option value="all">Tất cả trạng thái</option>
          <option value="du-kien">Dự kiến</option>
          <option value="thuc-te">Đã thực hiện</option>
        </select>
        <span style={{ marginLeft: 'auto', color: 'var(--nh-muted2)', fontSize: 12, alignSelf: 'center' }}>
          {filtered.length} khoản
        </span>
      </div>

      {/* KPI nhanh */}
      <div className="nh-kpi-row" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 14 }}>
        <div className="nh-kpi">
          <span className="nh-kpi-label">Tổng thu</span>
          <span className="nh-kpi-val" style={{ color: 'var(--nh-green)' }}>+{VND.format(tongThu)}</span>
        </div>
        <div className="nh-kpi">
          <span className="nh-kpi-label">Tổng chi</span>
          <span className="nh-kpi-val" style={{ color: 'var(--nh-red)' }}>−{VND.format(tongChi)}</span>
        </div>
        <div className="nh-kpi">
          <span className="nh-kpi-label">Chênh lệch</span>
          <span className="nh-kpi-val" style={{ color: tongThu - tongChi >= 0 ? 'var(--nh-green)' : 'var(--nh-red)' }}>
            {tongThu - tongChi >= 0 ? '+' : ''}{VND.format(tongThu - tongChi)}
          </span>
        </div>
      </div>

      {/* Bảng */}
      <table className="nh-tbl">
        <thead>
          <tr>
            <th
              onClick={() => toggleSort('ngay')}
              style={{ cursor: 'pointer', userSelect: 'none' }}
            >
              Ngày <SortIcon field="ngay" />
            </th>
            <th>Pháp nhân</th>
            <th>Nguồn</th>
            <th>Diễn giải</th>
            <th
              className="r"
              onClick={() => toggleSort('soTien')}
              style={{ cursor: 'pointer', userSelect: 'none' }}
            >
              Số tiền <SortIcon field="soTien" />
            </th>
            <th>Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(it => (
            <tr key={it.id}>
              <td style={{ whiteSpace: 'nowrap' }}>{it.ngay}</td>
              <td>{it.entity}</td>
              <td>
                <span className={`nh-badge ${NGUON_BADGE[it.nguon] ?? 'nh-b-grey'}`}>
                  {NGUON_LABEL[it.nguon] ?? it.nguon}
                </span>
              </td>
              <td>{it.nhanNhan}</td>
              <td className="r" style={{ fontWeight: 700, color: it.loai === 'thu' ? 'var(--nh-green)' : 'var(--nh-red)' }}>
                {it.loai === 'thu' ? '+' : '−'}{VND.format(it.soTien)}
              </td>
              <td>
                <span className={`nh-badge ${it.trangThai === 'thuc-te' ? 'nh-b-green' : 'nh-b-amber'}`}>
                  {it.trangThai === 'thuc-te' ? 'Đã thực hiện' : 'Dự kiến'}
                </span>
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={6} style={{ textAlign: 'center', color: 'var(--nh-muted2)', padding: 32 }}>
                Không có khoản nào khớp bộ lọc.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
