'use client'
import { useEffect } from 'react'
import { useUserSession } from '@/contexts/user-session'
import { useTopbarInfo } from '@/contexts/topbar-info'
import NhSharedStyles from '@/components/NhSharedStyles'
import TabDongTien from './TabDongTien'

export default function TestDongTienPage() {
  const { loading: sessLoading, can } = useUserSession()

  const { setLeft, setRight } = useTopbarInfo()
  useEffect(() => {
    setLeft(
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', lineHeight: 1.15 }}>
        <div style={{ fontSize: 11, color: '#6B7280' }}>Module › Test Dòng tiền</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#1C3557' }}>💵 Test Dòng tiền</div>
      </div>
    )
    setRight(null)
    return () => { setLeft(null); setRight(null) }
  }, [setLeft, setRight])

  if (sessLoading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Đang tải...</div>
  }

  if (!can('m:test-dong-tien')) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', gap: 12 }}>
        <div style={{ fontSize: 40 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#1C3557' }}>Không có quyền truy cập</div>
        <div style={{ fontSize: 13, color: '#9CA3AF', textAlign: 'center' }}>Module này được giới hạn theo phân quyền. Liên hệ quản trị viên.</div>
      </div>
    )
  }

  return (
    <>
      <NhSharedStyles />
      <div className="nh-main">
        <div className="nh-wrap">
          <div className="nh-content">
            <TabDongTien />
          </div>
        </div>
      </div>
    </>
  )
}
