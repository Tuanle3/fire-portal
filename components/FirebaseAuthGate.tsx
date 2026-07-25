'use client'
import { useEffect, useState } from 'react'
import { ensureAnonAuth } from '@/lib/firebase'

// Chờ đăng nhập ẩn danh Firebase xong mới render nội dung, để mọi trang đọc/ghi
// Realtime Database đều đã có auth != null (khớp với security rules mới).
export default function FirebaseAuthGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let alive = true
    ensureAnonAuth().finally(() => { if (alive) setReady(true) })
    return () => { alive = false }
  }, [])

  if (!ready) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#4B6A8A', fontSize: 14 }}>
        ⏳ Đang kết nối…
      </div>
    )
  }
  return <>{children}</>
}
