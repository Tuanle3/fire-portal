// Tính dư nợ hiện tại từ module Hạn mức tín dụng, để gợi ý ô "Vay hiện có".
// Đổi đường dẫn import nếu han-muc-types.ts nằm chỗ khác.
import type { HopDongTinDung, KyTraNo } from '@/lib/han-muc-types'

export interface DuNoRow {
  hopDongId: string
  ten: string        // số bộ hồ sơ hoặc số hợp đồng
  entity: string
  nganHang: string
  luuDong: boolean   // kyTra === 'luu-dong' → gợi ý là vay lưu động
  duNo: number       // tỷ đồng
}

const TY = 1e9

export function tinhDuNoHienCo(hds: HopDongTinDung[], kys: KyTraNo[]): DuNoRow[] {
  const byHd = new Map<string, KyTraNo[]>()
  kys.forEach((k) => { const a = byHd.get(k.hopDongId) ?? []; a.push(k); byHd.set(k.hopDongId, a) })

  return hds
    // Bỏ HĐ đã tất toán, và HĐ hạn mức khung (đã tính qua các bộ hồ sơ con để không trùng)
    .filter((h) => h.trangThai !== 'tat-toan' && h.loaiHD !== 'han-muc-khung')
    .map((h) => {
      const ky = (byHd.get(h.id) ?? []).sort((a, b) => a.soKy - b.soKy)
      let duNo = h.soTienGiaiNgan
      if (ky.length) {
        const kyDau = ky.find((k) => k.trangThai !== 'da-tra')
        duNo = kyDau ? kyDau.dunNoDauKy : 0   // còn kỳ chưa trả → dư nợ đầu kỳ đó; trả hết → 0
      }
      return {
        hopDongId: h.id, ten: h.soBoHoSo || h.soHopDong, entity: String(h.entity),
        nganHang: h.nganHang, luuDong: h.kyTra === 'luu-dong', duNo: duNo / TY,
      }
    })
    .filter((r) => r.duNo > 0.0001)
    .sort((a, b) => a.entity.localeCompare(b.entity) || b.duNo - a.duNo)
}
