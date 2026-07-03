// Format 1 giá trị (đơn vị gốc = tỷ) theo toggle Tỷ/Triệu/Đồng. Đồng = không thập phân.
export function fmtTyU(tyVal: number, donVi: 'ty'|'trieu'|'dong'): string {
  if (donVi === 'trieu') return (tyVal * 1000).toLocaleString('vi-VN', { maximumFractionDigits: 0 }) + ' tr'
  if (donVi === 'dong')  return Math.round(tyVal * 1e9).toLocaleString('vi-VN') + ' đ'
  return tyVal.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' tỷ'
}
// Chuyển chuỗi dạng "X tỷ" sang đơn vị đang chọn; giữ nguyên nếu không phải tiền (vd "45%", "0/1").
export function fmtMoneyStr(v: string, donVi: 'ty'|'trieu'|'dong'): string {
  const m = v.match(/^([\d.]+)\s*tỷ$/)
  return m ? fmtTyU(parseFloat(m[1]), donVi) : v
}

export const ctFmt = (n:number) => n.toLocaleString('vi-VN') + ' ₫'
