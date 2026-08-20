// ============================================================
// XEM TRƯỚC ROLLUP — demo Aggregation Engine (Phần 3)
// Bản đầy đủ 3 kiểu hiển thị (timeline/chi tiết/tổng hợp) sẽ
// làm ở Phần 4 — đây chỉ là bảng tổng hợp theo kỳ để xác nhận
// engine tính đúng trước khi xây UI đầy đủ.
// ============================================================
'use client'

import { useMemo, useState } from 'react'
import { DongTienItem } from '@/lib/dong-tien-types'
import { rollupTheoDonVi, DonViThoiGian } from '@/lib/dong-tien-engine'

interface Props {
  items: DongTienItem[]
}

const VND = new Intl.NumberFormat('vi-VN')
const DON_VI_LABEL: Record<DonViThoiGian, string> = {
  ngay: 'Ngày', tuan: 'Tuần', thang: 'Tháng', quy: 'Quý',
}

export default function DongTienRollupPreview({ items }: Props) {
  const [donVi, setDonVi] = useState<DonViThoiGian>('tuan')
  const [mocRong, setMocRong] = useState<string | null>(null)

  const buckets = useMemo(() => rollupTheoDonVi(items, donVi), [items, donVi])

  return (
    <div className="nh-card">
      <div className="nh-card-head">
        <span className="nh-card-title">Tổng hợp dòng tiền theo kỳ (xem trước)</span>
        <div className="nh-radio-row" style={{ padding: 0 }}>
          {(Object.keys(DON_VI_LABEL) as DonViThoiGian[]).map(dv => (
            <label key={dv}>
              <input type="radio" name="donVi" checked={donVi === dv} onChange={() => setDonVi(dv)} />
              {DON_VI_LABEL[dv]}
            </label>
          ))}
        </div>
      </div>

      <div className="nh-card-body">
        <p className="nh-hint" style={{ marginTop: -4, marginBottom: 10 }}>
          Tồn quỹ đang tính tương đối (cộng dồn chênh lệch thu-chi từ mốc 0) — chưa có số dư quỹ thật
          làm mốc. Khi có số liệu từ bảng tính, tồn quỹ sẽ ra số thật.
        </p>

        <table className="nh-tbl">
          <thead>
            <tr>
              <th>Kỳ</th>
              <th>Từ ngày</th>
              <th>Đến ngày</th>
              <th className="r">Tổng thu</th>
              <th className="r">Tổng chi</th>
              <th className="r">Chênh lệch</th>
              <th className="r">Tồn quỹ cuối kỳ*</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map(b => {
              const daXem = mocRong === b.key
              return (
                <>
                  <tr
                    key={b.key}
                    onClick={() => setMocRong(daXem ? null : b.key)}
                    style={{ cursor: 'pointer', background: daXem ? '#EEF3FA' : undefined }}
                  >
                    <td style={{ fontWeight: 700 }}>{b.kyLabel}</td>
                    <td>{b.tuNgay}</td>
                    <td>{b.denNgay}</td>
                    <td className="r" style={{ color: 'var(--nh-green)' }}>{VND.format(b.tongThu)}</td>
                    <td className="r" style={{ color: 'var(--nh-red)' }}>{VND.format(b.tongChi)}</td>
                    <td className="r" style={{ fontWeight: 700, color: b.chenhLech >= 0 ? 'var(--nh-green)' : 'var(--nh-red)' }}>
                      {b.chenhLech >= 0 ? '+' : ''}{VND.format(b.chenhLech)}
                    </td>
                    <td className="r" style={{ fontWeight: 700, color: b.tonQuyCuoiKy >= 0 ? 'var(--nh-navy)' : 'var(--nh-red)' }}>
                      {VND.format(b.tonQuyCuoiKy)}
                    </td>
                  </tr>
                  {daXem && (
                    <tr key={`${b.key}-detail`}>
                      <td colSpan={7} style={{ background: '#FAFAFA', padding: '10px 16px' }}>
                        {b.chiTiet.map(it => (
                          <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', borderBottom: '1px solid #eee' }}>
                            <span>{it.ngay} — {it.entity} — {it.nhanNhan}</span>
                            <span style={{ fontWeight: 700, color: it.loai === 'thu' ? 'var(--nh-green)' : 'var(--nh-red)' }}>
                              {it.loai === 'thu' ? '+' : '−'}{VND.format(it.soTien)}
                            </span>
                          </div>
                        ))}
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
            {buckets.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--nh-muted2)', padding: 24 }}>Chưa có dữ liệu.</td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="nh-hint" style={{ marginTop: 8 }}>* Click vào 1 dòng để xem chi tiết các khoản trong kỳ đó.</p>
      </div>
    </div>
  )
}
