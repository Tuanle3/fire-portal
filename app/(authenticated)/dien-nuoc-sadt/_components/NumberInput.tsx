'use client'
import { InputHTMLAttributes } from 'react'

/** Định dạng số nguyên theo vi-VN (dấu chấm ngăn cách hàng nghìn). 0/rỗng → chuỗi rỗng để hiện placeholder. */
function formatVN(n: number): string {
  if (!n) return ''
  return Math.round(n).toLocaleString('vi-VN')
}

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: number
  onValueChange: (n: number) => void
}

/**
 * Ô nhập số tiền/sản lượng tự thêm dấu ngăn cách hàng nghìn khi gõ (vd 4.729).
 * Lưu ra ngoài là số nguyên. Dùng type="text" + inputMode numeric vì input number không hiển thị dấu phân cách.
 */
export function NumberInput({ value, onValueChange, className = 'dn-input', ...rest }: Props) {
  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      className={className}
      value={formatVN(value)}
      onChange={e => {
        const digits = e.target.value.replace(/\D/g, '')
        onValueChange(digits ? Number(digits) : 0)
      }}
    />
  )
}
