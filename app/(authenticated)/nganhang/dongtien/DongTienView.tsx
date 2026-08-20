// ============================================================
// DONG TIEN VIEW — Component cha chứa toolbar + 3 kiểu hiển thị
//   Mặc định: Tổng hợp (tab đầu tiên)
//   Thứ tự:   Tổng hợp → Timeline → Chi tiết
// Phần 4.
// ============================================================
'use client'

import { useState, useMemo } from 'react'
import { DongTienItem } from '@/lib/dong-tien-types'
import { locTheoKhoangNgay, DonViThoiGian } from '@/lib/dong-tien-engine'
import DongTienTongHop  from './DongTienTongHop'
import DongTienTimeline from './DongTienTimeline'
import DongTienChiTiet  from './DongTienChiTiet'

interface Props {
  items:       DongTienItem[]   // đã hợp nhất nhập tay + tự động từ TabDongTien
  soDuBanDau?: number
}

type KieuView = 'tong-hop' | 'timeline' | 'chi-tiet'

const DON_VI_LABEL: Record<DonViThoiGian, string> = {
  ngay:  'Ngày',
  tuan:  'Tuần',
  thang: 'Tháng',
  quy:   'Quý',
}

// Shortcut khoảng ngày
function shortcutRange(key: string): { tu: string; den: string } {
  const now = new Date()
  const y   = now.getFullYear()
  const m   = now.getMonth()

  if (key === 'thang-nay') {
    return {
      tu:  `${y}-${String(m + 1).padStart(2, '0')}-01`,
      den: `${y}-${String(m + 1).padStart(2, '0')}-${new Date(y, m + 1, 0).getDate()}`,
    }
  }
  if (key === 'quy-nay') {
    const q     = Math.floor(m / 3)
    const tuM   = q * 3
    const denM  = tuM + 3
    return {
      tu:  `${y}-${String(tuM + 1).padStart(2, '0')}-01`,
      den: `${y}-${String(denM).padStart(2, '0')}-${new Date(y, denM, 0).getDate()}`,
    }
  }
  if (key === '6-thang') {
    const six = new Date(y, m - 5, 1)
    const end = new Date(y, m + 1, 0)
    return {
      tu:  `${six.getFullYear()}-${String(six.getMonth() + 1).padStart(2, '0')}-01`,
      den: `${y}-${String(m + 1).padStart(2, '0')}-${end.getDate()}`,
    }
  }
  if (key === 'nam-nay') {
    return { tu: `${y}-01-01`, den: `${y}-12-31` }
  }
  // 'tat-ca'
  return { tu: '', den: '' }
}

const SHORTCUTS = [
  { key: 'thang-nay', label: 'Tháng này' },
  { key: 'quy-nay',   label: 'Quý này'   },
  { key: '6-thang',   label: '6 tháng'   },
  { key: 'nam-nay',   label: 'Năm nay'   },
  { key: 'tat-ca',    label: 'Tất cả'    },
]

export default function DongTienView({ items, soDuBanDau }: Props) {
  const [kieu,    setKieu]    = useState<KieuView>('tong-hop')
  const [donVi,   setDonVi]   = useState<DonViThoiGian>('tuan')
  const [tuNgay,  setTuNgay]  = useState('')
  const [denNgay, setDenNgay] = useState('')
  const [shortcut, setShortcut] = useState('tat-ca')

  function applyShortcut(key: string) {
    setShortcut(key)
    const { tu, den } = shortcutRange(key)
    setTuNgay(tu)
    setDenNgay(den)
  }

  const itemsFiltered = useMemo(
    () => locTheoKhoangNgay(items, tuNgay || undefined, denNgay || undefined),
    [items, tuNgay, denNgay],
  )

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
      </div>

      {/* ── BỘ LỌC NGÀY ──────────────────────────────────────── */}
      <div style={{
        padding: '10px 20px',
        borderBottom: '1px solid var(--nh-border)',
        display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
        background: '#FAFBFC',
      }}>
        {/* Shortcut */}
        {SHORTCUTS.map(s => (
          <button
            key={s.key}
            onClick={() => applyShortcut(s.key)}
            style={{
              padding:    '4px 12px',
              borderRadius: 20,
              fontSize:   12,
              fontFamily: 'inherit',
              cursor:     'pointer',
              border:     '1px solid ' + (shortcut === s.key ? 'var(--nh-navy)' : '#E5E0D8'),
              background: shortcut === s.key ? 'var(--nh-navy)' : '#fff',
              color:      shortcut === s.key ? '#fff' : '#3D3D3D',
              fontWeight: shortcut === s.key ? 700 : 400,
              transition: 'all .12s',
            }}
          >
            {s.label}
          </button>
        ))}

        {/* Phân cách */}
        <span style={{ color: '#ddd' }}>|</span>

        {/* Nhập tay khoảng ngày */}
        <label className="nh-label" style={{ margin: 0 }}>Từ</label>
        <input
          type="date" className="nh-input" style={{ width: 145 }}
          value={tuNgay}
          onChange={e => { setTuNgay(e.target.value); setShortcut('') }}
        />
        <label className="nh-label" style={{ margin: 0 }}>đến</label>
        <input
          type="date" className="nh-input" style={{ width: 145 }}
          value={denNgay}
          onChange={e => { setDenNgay(e.target.value); setShortcut('') }}
        />
        {(tuNgay || denNgay) && (
          <button
            className="btn-ghost"
            style={{ padding: '4px 10px', fontSize: 12 }}
            onClick={() => { setTuNgay(''); setDenNgay(''); setShortcut('tat-ca') }}
          >
            ✕ Xoá lọc
          </button>
        )}

        <span style={{ marginLeft: 'auto', color: 'var(--nh-muted2)', fontSize: 12 }}>
          {itemsFiltered.length} khoản
        </span>
      </div>

      {/* ── NỘI DUNG VIEW ────────────────────────────────────── */}
      <div className="nh-card-body">
        {kieu === 'tong-hop' && (
          <DongTienTongHop items={itemsFiltered} donVi={donVi} soDuBanDau={soDuBanDau} />
        )}
        {kieu === 'timeline' && (
          <DongTienTimeline items={itemsFiltered} donVi={donVi} soDuBanDau={soDuBanDau} />
        )}
        {kieu === 'chi-tiet' && (
          <DongTienChiTiet items={itemsFiltered} />
        )}
      </div>
    </div>
  )
}
