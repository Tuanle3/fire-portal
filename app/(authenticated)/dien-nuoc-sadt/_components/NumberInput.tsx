'use client'
import { useState, useEffect, InputHTMLAttributes } from 'react'

/** Số → chuỗi vi-VN (chấm ngăn nghìn, phẩy thập phân). 0/rỗng → '' để hiện placeholder. */
function fromValue(n: number): string {
  if (!n) return ''
  return n.toLocaleString('vi-VN', { maximumFractionDigits: 20 })
}

/** Chuẩn hoá text người dùng gõ: chỉ giữ chữ số + 1 dấu phẩy, nhóm nghìn phần nguyên, giữ nguyên phần thập phân đang gõ. */
function normalize(raw: string): { display: string; value: number } {
  let s = raw.replace(/[^\d,]/g, '')
  const firstComma = s.indexOf(',')
  if (firstComma !== -1) {
    s = s.slice(0, firstComma + 1) + s.slice(firstComma + 1).replace(/,/g, '')
  }
  if (s === '') return { display: '', value: 0 }

  const [intRaw = '', decRaw] = s.split(',')
  const intDigits = intRaw.replace(/^0+(?=\d)/, '')          // bỏ số 0 vô nghĩa đầu
  const grouped = intDigits ? Number(intDigits).toLocaleString('vi-VN') : ''
  const hasComma = s.includes(',')

  const display = hasComma ? `${grouped || '0'},${decRaw ?? ''}` : grouped
  const value = Number(`${intDigits || '0'}.${decRaw || '0'}`)
  return { display, value }
}

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: number
  onValueChange: (n: number) => void
}

/**
 * Ô nhập số tiền/sản lượng/đơn giá tự thêm dấu ngăn cách hàng nghìn khi gõ (vd 4.136,4).
 * Cho nhập số lẻ bằng dấu phẩy. Dùng type="text" + inputMode decimal vì input number không hiển thị dấu phân cách.
 */
export function NumberInput({ value, onValueChange, className = 'dn-input', ...rest }: Props) {
  const [text, setText] = useState<string>(() => fromValue(value))

  // Đồng bộ khi value bên ngoài đổi (vd mở khách hàng khác), nhưng không phá text đang gõ.
  useEffect(() => {
    if (normalize(text).value !== value) setText(fromValue(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      className={className}
      value={text}
      onChange={e => {
        const { display, value: v } = normalize(e.target.value)
        setText(display)
        onValueChange(v)
      }}
    />
  )
}
