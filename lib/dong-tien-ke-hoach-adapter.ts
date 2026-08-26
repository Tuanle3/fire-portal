// ============================================================
// ADAPTER — Gom khoản KẾ HOẠCH (dongTienItems, loaiKhoan='ke-hoach')
// thành map KMCP → tổng kế hoạch, để merge vào `kmcpPlanned` dùng
// chung ở page.tsx (đưa xuống cả TabKeHoach lẫn TabTongHop).
//
// Nguồn dữ liệu: subscribeKeHoachThang(thang, cb, entityFilter)
// (lib/dong-tien-ke-hoach-store.ts, đã có sẵn) — đã lọc theo
// ngayDuKien trong khoảng đầu–cuối tháng, nên mỗi tháng chỉ nhận
// đúng 1 kỳ của các khoản lặp (hàng tháng/hàng quý).
//
// KMCP = field `nhom` trên KhoanDongTien (string tự do, không còn
// giới hạn enum 'A'|'B'|'C'|'D' như ngan-sach-types cũ) — giữ
// nguyên các mã cũ (DT-CG, CP-BH, VAY-GOC-DN...) để không phá vỡ
// cơ chế đối chiếu tự động kmcpActual đang chạy (ngan-sach-mapping.ts
// + ngan-sach-vay-mapping.ts).
//
// Xem HUONG-DAN-PATCH.md / phiên làm việc trước để biết vị trí gọi
// hàm này trong page.tsx (Bước A trong bản kế hoạch refactor).
// ============================================================
import type { KhoanDongTien } from '@/lib/dong-tien-types'

export interface KeHoachPlannedResult {
  /** KMCP → tổng kế hoạch của tháng đang chọn (đã cộng dồn nếu nhiều dòng cùng mã) */
  planned: Record<string, number>
  /** Giữ lại danh sách gốc theo từng KMCP — dùng khi cần hiển thị chi tiết
   *  (VD: tooltip, hoặc soát lỗi khi số AUTO trông bất thường) */
  itemsByKmcp: Record<string, KhoanDongTien[]>
}

/**
 * Gom danh sách khoản kế hoạch (đã lọc theo tháng + entity ở tầng store
 * subscribeKeHoachThang) thành map KMCP → tổng tiền.
 *
 * Thu và Chi đều gom chung theo `nhom` — không cần tách ở đây vì mã KMCP
 * tự phân biệt Thu/Chi qua tiền tố (DT-* / THU-* cho Thu, CP-* / VAY-* cho
 * Chi), đúng quy ước đang dùng ở kmcpActual.
 */
export function buildKeHoachPlanned(items: KhoanDongTien[]): KeHoachPlannedResult {
  const planned: Record<string, number> = {}
  const itemsByKmcp: Record<string, KhoanDongTien[]> = {}

  for (const it of items) {
    if (it.loaiKhoan !== 'ke-hoach') continue   // an toàn — dù store đã lọc sẵn
    const kmcp = it.nhom
    if (!kmcp) continue

    planned[kmcp] = (planned[kmcp] ?? 0) + (it.soTien || 0)
    if (!itemsByKmcp[kmcp]) itemsByKmcp[kmcp] = []
    itemsByKmcp[kmcp].push(it)
  }

  return { planned, itemsByKmcp }
}

/**
 * Merge kế hoạch từ dongTienItems vào kmcpPlanned đã có sẵn (hiện tại chỉ
 * gồm 5 dòng vay NH tự động từ ngan-sach-vay-mapping.ts / subscribeKmcpPlanned).
 *
 * Cộng dồn nếu trùng mã thay vì ghi đè — 2 nguồn về nguyên tắc không trùng
 * mã (vay NH luôn dùng VAY-GOC-DN/VAY-LAI-DN/VAY-GOC-CN/VAY-LAI-CN/THU-VAY,
 * còn lại dùng DT-*/CP-*/THU-*), nhưng cộng dồn vẫn an toàn hơn ghi đè nếu
 * sau này có mã trùng ngoài ý muốn — không bao giờ làm mất số đã có.
 */
export function mergeKeHoachPlanned(
  base: Record<string, number>,
  fromDongTien: Record<string, number>,
): Record<string, number> {
  const out = { ...base }
  for (const [kmcp, val] of Object.entries(fromDongTien)) {
    out[kmcp] = (out[kmcp] ?? 0) + val
  }
  return out
}
