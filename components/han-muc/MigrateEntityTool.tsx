'use client'

/**
 * MigrateEntityTool — CÔNG CỤ TẠM, CHẠY 1 LẦN
 * ─────────────────────────────────────────────────────────────
 * Đổi toàn bộ bản ghi entity="SAG" → "SAP" (cả HĐ dài hạn và hạn mức
 * khung ngắn hạn). Gắn tạm 1 dòng <MigrateEntityTool /> vào
 * TabHanMucWrapper.tsx, deploy, bấm nút 1 LẦN DUY NHẤT, kiểm tra kết
 * quả, rồi GỠ BỎ dòng đó khỏi TabHanMucWrapper.tsx và deploy lại.
 *
 * Sử dụng tạm thời:
 *   import { MigrateEntityTool } from '@/components/han-muc/MigrateEntityTool'
 *   <MigrateEntityTool />
 * ─────────────────────────────────────────────────────────────
 */

import { useState } from 'react'
import { migrateEntitySAGtoSAP } from '@/lib/han-muc-store'
import { migrateEntitySAGtoSAPNganHan } from '@/lib/han-muc-ngan-han-store'

export function MigrateEntityTool() {
  const [running, setRunning] = useState(false)
  const [done, setDone]       = useState<{ daiHan: number; nganHan: number } | null>(null)
  const [error, setError]     = useState('')

  const run = async () => {
    if (!confirm('Đổi toàn bộ bản ghi entity="SAG" thành "SAP" (dài hạn + ngắn hạn)? Hành động này ghi thẳng vào Firestore, không hoàn tác tự động.')) return
    setRunning(true)
    setError('')
    try {
      const [r1, r2] = await Promise.all([
        migrateEntitySAGtoSAP(),
        migrateEntitySAGtoSAPNganHan(),
      ])
      setDone({ daiHan: r1.updated, nganHan: r2.updated })
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div style={{
      margin: '0 0 16px', padding: '12px 16px', borderRadius: 10,
      background: '#fff7ed', border: '1px solid #fdba74', fontSize: 12.5,
    }}>
      <div style={{ fontWeight: 700, color: '#9a3412', marginBottom: 6 }}>
        ⚠️ Công cụ tạm: Migrate pháp nhân SAG → SAP
      </div>
      <div style={{ color: '#7c2d12', marginBottom: 10 }}>
        Chạy 1 lần duy nhất, sau đó gỡ component này khỏi code.
      </div>
      <button
        onClick={run}
        disabled={running}
        style={{
          border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12.5, fontWeight: 700,
          background: running ? '#93aec8' : '#c2410c', color: '#fff',
          cursor: running ? 'not-allowed' : 'pointer',
        }}
      >
        {running ? 'Đang chạy…' : 'Chạy migrate ngay'}
      </button>
      {done && (
        <div style={{ marginTop: 10, color: '#15803d', fontWeight: 600 }}>
          ✅ Đã cập nhật {done.daiHan} HĐ dài hạn + {done.nganHan} hạn mức khung ngắn hạn.
        </div>
      )}
      {error && (
        <div style={{ marginTop: 10, color: '#b91c1c', fontWeight: 600 }}>
          ❌ Lỗi: {error}
        </div>
      )}
    </div>
  )
}
