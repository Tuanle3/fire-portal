'use client'

/**
 * FillLayout — tiện ích bố cục dùng chung cho module Hạn mức tín dụng
 * ─────────────────────────────────────────────────────────────
 * • useFillHeight : khung tự chiếm hết chiều cao còn lại của màn hình
 *                   → tiêu đề/toolbar đứng yên, chỉ vùng bảng cuộn.
 * • FillStyles    : CSS cho vùng cuộn `.nhp-stick` — mọi `.nh-tbl` bên trong
 *                   có tiêu đề cột dính trên (thead) & dòng tổng dính dưới (tfoot).
 * • MiniStat      : ô chỉ số gọn (nhãn nhỏ + giá trị đậm).
 * ─────────────────────────────────────────────────────────────
 */
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

export function useFillHeight(deps: unknown[] = [], slack = 20) {
  const ref = useRef<HTMLDivElement>(null)
  const [h, setH] = useState<number | undefined>(undefined)
  useEffect(() => {
    const calc = () => {
      if (!ref.current) return
      const top = ref.current.getBoundingClientRect().top
      setH(Math.max(420, window.innerHeight - top - slack))
    }
    calc()
    const t = setTimeout(calc, 60)   // đo lại sau khi layout ổn định
    window.addEventListener('resize', calc)
    return () => { clearTimeout(t); window.removeEventListener('resize', calc) }
  }, deps)  // eslint-disable-line react-hooks/exhaustive-deps
  return { ref, h }
}

/** Style inline cho ô tiêu đề / dòng tổng dính (dùng khi tự viết <table>) */
export const stickyTh: CSSProperties = { position: 'sticky', top: 0, zIndex: 3, background: '#eef2f7', boxShadow: '0 1px 0 #cbd5e1' }
export const stickyTf: CSSProperties = { position: 'sticky', bottom: 0, zIndex: 3, background: '#eef2f7', boxShadow: '0 -1px 0 #cbd5e1' }

/** Khung flex-column chiếm hết chiều cao: dùng cho thẻ chứa bảng */
export const fillCard: CSSProperties = {
  marginBottom: 0, flex: '1 1 0', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden',
}

const CSS = `
.nhp-stick .nh-tbl{border-collapse:separate;border-spacing:0;width:100%}
.nhp-stick .nh-tbl thead th{position:sticky;top:0;z-index:3;background:#eef2f7;box-shadow:0 1px 0 #cbd5e1}
.nhp-stick .nh-tbl tfoot td,.nhp-stick .nh-tbl tfoot th{position:sticky;bottom:0;z-index:3;background:#eef2f7;box-shadow:0 -1px 0 #cbd5e1;font-weight:700}
`
export function FillStyles() { return <style>{CSS}</style> }

export function MiniStat({ label, value, sub, color }: { label: string; value: ReactNode; sub?: string; color?: string }) {
  return (
    <div style={{ minWidth: 110 }}>
      <div style={{ fontSize: 10, color: 'var(--nh-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
      <div style={{ fontSize: 14.5, fontWeight: 700, color: color ?? 'var(--nh-txt)', lineHeight: 1.25 }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: 'var(--nh-muted)' }}>{sub}</div>}
    </div>
  )
}
