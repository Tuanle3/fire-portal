// ============================================================
// DONG TIEN VIEW — Component cha chứa toolbar + 3 kiểu hiển thị
//   Mặc định: Tổng hợp (tab đầu tiên), đơn vị mặc định: Tuần
//   Thứ tự:   Tổng hợp → Timeline → Chi tiết
//
//   ⚠️ KHÔNG tự lọc ngày ở đây nữa — `items` truyền vào đã được
//   lọc sẵn (ngày + loại + trạng thái) từ TabDongTien theo đúng
//   nguyên tắc "lọc 1 lần duy nhất ở trên cùng". Component này
//   chỉ chịu trách nhiệm HIỂN THỊ.
// ============================================================
'use client'

import { useState } from 'react'
import { DongTienItem } from '@/lib/dong-tien-types'
import { DonViThoiGian } from '@/lib/dong-tien-engine'
import DongTienTongHop  from './DongTienTongHop'
import DongTienTimeline from './DongTienTimeline'
import DongTienChiTiet  from './DongTienChiTiet'

interface Props {
  items:       DongTienItem[]   // đã lọc sẵn (ngày + loại + trạng thái) từ TabDongTien
  soDuBanDau?: number
}

type KieuView = 'tong-hop' | 'timeline' | 'chi-tiet'

const DON_VI_LABEL: Record<DonViThoiGian, string> = {
  ngay:  'Ngày',
  tuan:  'Tuần',
  thang: 'Tháng',
  quy:   'Quý',
}

export default function DongTienView({ items, soDuBanDau }: Props) {
  const [kieu,  setKieu]  = useState<KieuView>('tong-hop')
  const [donVi, setDonVi] = useState<DonViThoiGian>('tuan') // mặc định Tuần

  const showDonVi = kieu !== 'chi-tiet' // Kiểu Chi tiết không cần chọn đơn vị

  return (
    <div className="nh-card">
      {/* ── TOOLBAR ──────────────────────────────────────────── */}
      <div className="nh-card-head" style={{ flexWrap: 'wrap', gap: 10 }}>
        {/* Tab chọn kiểu hiển thị */}
        <div style={{ display: 'flex', gap: 0, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--nh-border)' }}>
          {([
            { k: 'tong-hop' as KieuView, label: '▤ Tổng hợp' },
            { k: 'timeline' as KieuView, label: '▦ Timeline'  },
            { k: 'chi-tiet' as KieuView, label: '☰ Chi tiết'  },
          ] as const).map(({ k, label }) => (
            <button
              key={k}
              onClick={() => setKieu(k)}
              style={{
                padding:     '6px 16px',
                fontSize:    12,
                fontWeight:  kieu === k ? 700 : 400,
                fontFamily:  'inherit',
                cursor:      'pointer',
                border:      'none',
                borderRight: '1px solid var(--nh-border)',
                background:  kieu === k ? 'var(--nh-navy)' : '#fff',
                color:       kieu === k ? '#fff' : '#3D3D3D',
                transition:  'all .12s',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Chọn đơn vị thời gian (ẩn ở kiểu Chi tiết) */}
        {showDonVi && (
          <div style={{ display: 'flex', gap: 0, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--nh-border)' }}>
            {(Object.keys(DON_VI_LABEL) as DonViThoiGian[]).map(dv => (
              <button
                key={dv}
                onClick={() => setDonVi(dv)}
                style={{
                  padding:    '6px 14px',
                  fontSize:   12,
                  fontWeight: donVi === dv ? 700 : 400,
                  fontFamily: 'inherit',
                  cursor:     'pointer',
                  border:     'none',
                  borderRight: '1px solid var(--nh-border)',
                  background: donVi === dv ? '#E8EDF5' : '#fff',
                  color:      donVi === dv ? 'var(--nh-navy)' : '#3D3D3D',
                  transition: 'all .12s',
                }}
              >
                {DON_VI_LABEL[dv]}
              </button>
            ))}
          </div>
        )}

        <span style={{ marginLeft: 'auto', color: 'var(--nh-muted2)', fontSize: 12 }}>
          {items.length} khoản
        </span>
      </div>

      {/* ── NỘI DUNG VIEW ────────────────────────────────────── */}
      <div className="nh-card-body">
        {kieu === 'tong-hop' && (
          <DongTienTongHop items={items} donVi={donVi} soDuBanDau={soDuBanDau} />
        )}
        {kieu === 'timeline' && (
          <DongTienTimeline items={items} donVi={donVi} soDuBanDau={soDuBanDau} />
        )}
        {kieu === 'chi-tiet' && (
          <DongTienChiTiet items={items} />
        )}
      </div>
    </div>
  )
}