'use client'
import { useUserSession } from '@/contexts/user-session'

/** Tên tài khoản duy nhất được phép xoá dữ liệu trong module List ngân hàng. */
export const TAI_KHOAN_DUOC_XOA = 'admin'

/**
 * true chỉ khi phiên đã tải xong VÀ tên đăng nhập = "admin".
 * (Không dựa vào vai trò: tài khoản admin hiện mang vai trò CEO, dùng vai trò sẽ cho cả CEO khác xoá.)
 */
export function useCanDelete(): boolean {
  const { username, loading } = useUserSession()
  return !loading && (username ?? '').trim().toLowerCase() === TAI_KHOAN_DUOC_XOA
}
