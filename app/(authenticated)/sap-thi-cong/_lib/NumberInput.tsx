'use client'
import { useState, useEffect, useRef } from 'react'

// Input hiển thị số có dấu chấm ngăn cách hàng nghìn (vd 300.000.000).
// value/onChange làm việc với chuỗi số thô theo chuẩn JS (dấu "." là phân cách thập phân, không
// có dấu nghìn) để Number(value) ở nơi gọi luôn ra đúng kết quả.
//
// `decimal`: bật cho các trường không nhất thiết là số nguyên (khối lượng vật tư m³, tấn, kg...).
// Khi bật, người dùng gõ dấu phẩy "," làm phân cách thập phân (đúng quy ước vi-VN, khác với dấu
// chấm dùng để hiển thị phân cách hàng nghìn) — vd gõ "3,5" ra 3.5 m³. `decimalDigits` giới hạn số
// chữ số thập phân hiển thị (mặc định 3, đủ cho hầu hết đơn vị đo trong xây dựng).
//
// Dùng `lastEmitted` để phân biệt: nếu prop `value` đổi do CHÍNH input này vừa emit ra (qua
// onChange) thì không format lại `display` — tránh trường hợp người dùng gõ dở dang "3," rồi bị
// tự động xoá mất dấu phẩy do formatDisplay("3") = "3" (không có phần thập phân) mỗi lần re-render.
export function NumberInput({
  value, onChange, placeholder, decimal = false, decimalDigits = 3,
}: {
  value: string
  onChange: (raw: string) => void
  placeholder?: string
  decimal?: boolean
  decimalDigits?: number
}) {
  const [display, setDisplay] = useState(() => formatDisplay(value, decimal, decimalDigits))
  const lastEmitted = useRef(value)

  useEffect(() => {
    if (value !== lastEmitted.current) {
      setDisplay(formatDisplay(value, decimal, decimalDigits))
      lastEmitted.current = value
    }
  }, [value, decimal, decimalDigits])

  function formatDisplay(v: string, dec: boolean, digits: number) {
    if (v === '' || v == null) return ''
    const n = Number(v)
    if (Number.isNaN(n)) return ''
    return dec
      ? n.toLocaleString('vi-VN', { maximumFractionDigits: digits })
      : Math.trunc(n).toLocaleString('vi-VN')
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (decimal) {
      // Bỏ mọi dấu chấm người dùng gõ (coi như phân cách nghìn, không có ý nghĩa lúc đang nhập),
      // chỉ giữ chữ số và tối đa 1 dấu phẩy thập phân.
      let raw = e.target.value.replace(/\./g, '').replace(/[^\d,]/g, '')
      const firstComma = raw.indexOf(',')
      if (firstComma !== -1) raw = raw.slice(0, firstComma + 1) + raw.slice(firstComma + 1).replace(/,/g, '')
      setDisplay(raw)
      const numeric = raw === '' ? '' : raw.replace(',', '.')
      lastEmitted.current = numeric
      onChange(numeric)
    } else {
      const digits = e.target.value.replace(/[^\d]/g, '')
      const display2 = digits ? Number(digits).toLocaleString('vi-VN') : ''
      setDisplay(display2)
      lastEmitted.current = digits
      onChange(digits)
    }
  }

  function handleBlur() {
    // Dọn các trạng thái dở dang khi rời ô nhập, vd gõ "3," rồi bấm ra ngoài luôn → chốt lại "3".
    if (decimal && display.endsWith(',')) {
      const cleaned = display.slice(0, -1)
      setDisplay(formatDisplay(cleaned, decimal, decimalDigits))
      lastEmitted.current = cleaned
      onChange(cleaned)
    }
  }

  return (
    <input
      type="text"
      inputMode={decimal ? 'decimal' : 'numeric'}
      value={display}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder={placeholder}
    />
  )
}
