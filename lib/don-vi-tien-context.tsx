'use client'

/**
 * don-vi-tien-context.tsx
 * ─────────────────────────────────────────────────────────────
 * Context chia sẻ đơn vị tính hiển thị (đ / tr đ / tỷ đ) cho các
 * số liệu tổng hợp trong module Hạn mức tín dụng — dùng chung cho
 * cả tab "Hạn mức ngắn hạn" và "Tín dụng dài hạn" (bọc Provider ở
 * TabHanMucWrapper để 2 tab con chia sẻ đúng 1 trạng thái).
 *
 * Lưu lựa chọn vào localStorage để giữ nguyên khi tải lại trang.
 * ─────────────────────────────────────────────────────────────
 */

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

export type DonViTien = 'd' | 'tr' | 'ty'

const STORAGE_KEY = 'nh-don-vi-tien'

const DIVISOR: Record<DonViTien, number> = { d: 1, tr: 1_000_000, ty: 1_000_000_000 }
export const DON_VI_LABEL: Record<DonViTien, string> = { d: 'đ', tr: 'tr đ', ty: 'tỷ đ' }
export const DON_VI_OPTIONS: DonViTien[] = ['ty', 'tr', 'd']

interface FmtOptions {
  /** Số chữ số thập phân. Mặc định: 0 cho "đ", 2 cho "tr đ"/"tỷ đ" */
  decimals?: number
  /** false = chỉ trả về số, không kèm nhãn đơn vị. Mặc định true */
  withUnit?: boolean
}

interface Ctx {
  donVi: DonViTien
  setDonVi: (v: DonViTien) => void
  /** Định dạng 1 số tiền (đơn vị gốc: đồng) theo đơn vị tính đang chọn */
  fmtTien: (n: number | null | undefined, opts?: FmtOptions) => string
}

const DonViTienContext = createContext<Ctx | null>(null)

export function DonViTienProvider({ children }: { children: ReactNode }) {
  const [donVi, setDonViState] = useState<DonViTien>('d')

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as DonViTien | null
      if (saved && DIVISOR[saved] != null) setDonViState(saved)
    } catch { /* localStorage không khả dụng (SSR) — bỏ qua */ }
  }, [])

  const setDonVi = (v: DonViTien) => {
    setDonViState(v)
    try { localStorage.setItem(STORAGE_KEY, v) } catch { /* ignore */ }
  }

  const fmtTien = (n: number | null | undefined, opts?: FmtOptions) => {
    if (n == null || isNaN(n)) return '—'
    const divisor  = DIVISOR[donVi]
    const decimals = opts?.decimals ?? (donVi === 'd' ? 0 : 2)
    const val      = n / divisor
    const rounded  = decimals > 0 ? Number(val.toFixed(decimals)) : Math.round(val)
    const text     = rounded.toLocaleString('vi-VN', { maximumFractionDigits: decimals })
    return opts?.withUnit === false ? text : `${text} ${DON_VI_LABEL[donVi]}`
  }

  return (
    <DonViTienContext.Provider value={{ donVi, setDonVi, fmtTien }}>
      {children}
    </DonViTienContext.Provider>
  )
}

export function useDonViTien() {
  const ctx = useContext(DonViTienContext)
  if (!ctx) throw new Error('useDonViTien() phải được gọi bên trong <DonViTienProvider>')
  return ctx
}
