'use client'

import { useDonViTien, DON_VI_LABEL, DON_VI_OPTIONS } from '@/lib/don-vi-tien-context'

/**
 * Segmented control chọn đơn vị tính: tỷ đ / tr đ / đ.
 * Đặt ở góc trên bên phải, cùng hàng với các tab chính.
 */
export default function DonViTienSelect() {
  const { donVi, setDonVi } = useDonViTien()

  return (
    <div
      style={{
        display: 'inline-flex',
        border: '1px solid #dbe2ea',
        borderRadius: 8,
        overflow: 'hidden',
        flexShrink: 0,
      }}
      title="Đơn vị tính hiển thị số liệu"
    >
      {DON_VI_OPTIONS.map(o => {
        const active = donVi === o
        return (
          <button
            key={o}
            type="button"
            onClick={() => setDonVi(o)}
            style={{
              border: 'none',
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              background: active ? 'var(--nh-navy)' : '#fff',
              color: active ? '#fff' : '#6b7280',
              transition: 'all .15s',
            }}
          >
            {DON_VI_LABEL[o]}
          </button>
        )
      })}
    </div>
  )
}
