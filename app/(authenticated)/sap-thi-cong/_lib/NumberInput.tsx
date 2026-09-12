'use client'
import { useState, useEffect } from 'react'

// Input hiển thị số có dấu chấm ngăn cách hàng nghìn (vd 300.000.000).
// value/onChange làm việc với chuỗi số thô (không dấu chấm) để Number(value) luôn đúng.
export function NumberInput({
  value, onChange, placeholder,
}: {
  value: string
  onChange: (raw: string) => void
  placeholder?: string
}) {
  const [display, setDisplay] = useState(() => formatDisplay(value))

  useEffect(() => { setDisplay(formatDisplay(value)) }, [value])

  function formatDisplay(v: string) {
    const digits = (v || '').replace(/[^\d]/g, '')
    if (!digits) return ''
    return Number(digits).toLocaleString('vi-VN')
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/[^\d]/g, '')
    setDisplay(digits ? Number(digits).toLocaleString('vi-VN') : '')
    onChange(digits)
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      value={display}
      onChange={handleChange}
      placeholder={placeholder}
    />
  )
}
