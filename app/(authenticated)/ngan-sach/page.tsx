'use client'
import { useState, useEffect, useCallback } from 'react'
import { useUserSession } from '@/contexts/user-session'
import { useTopbarInfo } from '@/contexts/topbar-info'
import { getDb } from '@/lib/firebase'
import { ref, get } from 'firebase/database'
import { NganSachThang } from '@/lib/ngan-sach-types'
import { subscribeNganSach, saveNganSach, makeDefault } from '@/lib/ngan-sach-store'
import { buildKmcpActual, sumChiThang, sumThuThang } from '@/lib/ngan-sach-mapping'
import { TabTongHop } from './_tabs/TabTongHop'
import { TabKeHoach } from './_tabs/TabKeHoach'
import { TabGiaiPhap } from './_tabs/TabGiaiPhap'

type TabId = 'tong-hop' | 'ke-hoach' | 'giai-phap'

function curMonth() { return new Date().toISOString().slice(0, 7) }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toArr(snap: any): any[] {
  if (!snap.exists()) return []
  const val = snap.val()
  if (Array.isArray(val)) return val.filter(Boolean)
  if (typeof val === 'object' && val !== null)
    return Object.entries(val).map(([, v]) => (typeof v === 'object' && v !== null ? v : {}))
  return []
}

export default function NganSachPage() {
  const { loading: sessLoading, can } = useUserSession()
  const { setLeft, setRight } = useTopbarInfo()

  const [tab, setTab]         = useState<TabId>('tong-hop')
  const [month, setMonth]     = useState(curMonth())
  const [localData, setLocalData] = useState<NganSachThang>(makeDefault(month))
  const [saving, setSaving]   = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  // data_quy aggregates
  const [tonQuy,      setTonQuy]      = useState(0)
  const [tonQuyLoading, setTonQuyLoading] = useState(true)
  const [chiThang,    setChiThang]    = useState(0)
  const [thuThang,    setThuThang]    = useState(0)
  const [kmcpActual,  setKmcpActual]  = useState<Record<string, number>>({})
  const [quyLoaded,   setQuyLoaded]   = useState(false)

  // Topbar
  useEffect(() => {
    setLeft(
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', lineHeight: 1.15 }}>
        <div style={{ fontSize: 11, color: '#6B7280' }}>Module › Ngân sách</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#1C3557' }}>💰 Ngân sách dòng tiền</div>
      </div>
    )
    setRight(
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', letterSpacing: '.03em', textTransform: 'uppercase' }}>Tháng:</span>
        <input
          type="month" value={month}
          onChange={e => setMonth(e.target.value)}
          style={{ fontFamily: 'inherit', fontSize: 12.5, color: '#1F2430', background: '#fff', border: '1px solid #D0CCC4', borderRadius: 7, padding: '5px 8px', width: 140 }}
        />
      </span>
    )
  }, [month, setLeft, setRight])
  useEffect(() => () => { setLeft(null); setRight(null) }, [setLeft, setRight])

  // Subscribe to Firestore budget doc for selected month
  useEffect(() => {
    setLocalData(makeDefault(month))
    const unsub = subscribeNganSach(month, d => setLocalData(d))
    return unsub
  }, [month])

  // Fetch ALL data_quy once, then derive everything from it (tồn quỹ + KMCP map)
  useEffect(() => {
    setTonQuyLoading(true)
    setQuyLoaded(false)
    get(ref(getDb(), 'data_quy')).then(snap => {
      const rows = toArr(snap)

      // Tồn quỹ = sum of latest balance per account
      const latestTon = new Map<string, number>()
      for (const r of rows) {
        const stk = String(r['Số_tài_khoản'] ?? '')
        const ton = Number(r['Tồn'] ?? 0)
        if (stk) latestTon.set(stk, ton)
      }
      let ton = 0; latestTon.forEach(v => { ton += v })
      setTonQuy(ton)

      // Monthly aggregates
      setChiThang(sumChiThang(rows, month))
      setThuThang(sumThuThang(rows, month))

      // KMCP-level actual from Nhóm_CP field
      setKmcpActual(buildKmcpActual(rows, month))
      setQuyLoaded(true)
    }).catch(() => {})
      .finally(() => setTonQuyLoading(false))
  }, [month])

  const handleSave = useCallback(async () => {
    setSaving(true); setSaveMsg('')
    try {
      await saveNganSach(localData)
      setSaveMsg('Đã lưu ✓')
      setTimeout(() => setSaveMsg(''), 3000)
    } catch (e: unknown) {
      setSaveMsg('Lỗi: ' + (e instanceof Error ? e.message : 'Lỗi'))
    } finally { setSaving(false) }
  }, [localData])

  if (sessLoading) return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Đang tải...</div>
  if (!can('m:ngan-sach')) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', gap: 12 }}>
      <div style={{ fontSize: 40 }}>🔒</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#1C3557' }}>Không có quyền truy cập</div>
    </div>
  )

  const TABS: { id: TabId; label: string }[] = [
    { id: 'tong-hop',  label: '📊 Tổng hợp' },
    { id: 'ke-hoach',  label: '✏️ Kế hoạch & Thực hiện' },
    { id: 'giai-phap', label: '💡 Giải pháp cân đối' },
  ]

  const [y, m] = month.split('-')
  const thangLabel = `T${parseInt(m)}.${y}`

  // Count how many KMCP codes have auto data
  const autoCount = Object.keys(kmcpActual).length

  return (
    <>
      <style>{`
        .ns-tab-bar { display:flex; gap:4px; border-bottom:2px solid #E5E7EB; margin-bottom:20px; }
        .ns-tab { padding:8px 16px; font-size:13px; font-weight:600; color:#6B7280; background:none; border:none;
          border-bottom:2px solid transparent; cursor:pointer; margin-bottom:-2px; transition:color .15s,border-color .15s; }
        .ns-tab:hover { color:#1C3557; }
        .ns-tab.active { color:#1C3557; border-bottom-color:#1C3557; }
      `}</style>

      {/* Reconciliation bar */}
      <div style={{
        display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap',
        background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 10, padding: '10px 16px',
        alignItems: 'center',
      }}>
        <RCard label="Tồn quỹ thực tế" val={tonQuy} loading={tonQuyLoading} color="#166534" />
        <div style={{ width: 1, height: 32, background: '#E5E7EB' }} />
        <RCard label={`Thu ${thangLabel} (Quỹ)`} val={thuThang} color="#1C3557" />
        <RCard label={`Chi ${thangLabel} (Quỹ)`} val={chiThang} color="#9A3412" />
        <div style={{ width: 1, height: 32, background: '#E5E7EB' }} />
        <div style={{ fontSize: 11.5, color: quyLoaded ? '#166534' : '#9CA3AF' }}>
          {quyLoaded
            ? `✓ Đã map ${autoCount} mục KMCP từ Quỹ`
            : tonQuyLoading ? '⏳ Đang tải data_quy…' : '—'}
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
          {saveMsg && <span style={{ fontSize: 12.5, color: saveMsg.startsWith('Lỗi') ? '#991B1B' : '#166534', fontWeight: 600 }}>{saveMsg}</span>}
        </div>
      </div>

      {/* Tab bar */}
      <div className="ns-tab-bar">
        {TABS.map(t => (
          <button key={t.id} className={`ns-tab${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'tong-hop' && (
        <TabTongHop
          data={localData}
          tonQuySoDu={tonQuy}
          tonQuySoDuLoading={tonQuyLoading}
          kmcpActual={kmcpActual}
          thuThang={thuThang}
          chiThang={chiThang}
        />
      )}
      {tab === 'ke-hoach' && (
        <TabKeHoach
          data={localData}
          onChange={setLocalData}
          onSave={handleSave}
          saving={saving}
          kmcpActual={kmcpActual}
        />
      )}
      {tab === 'giai-phap' && (
        <TabGiaiPhap data={localData} onChange={setLocalData} onSave={handleSave} saving={saving} />
      )}
    </>
  )
}

function RCard({ label, val, loading, color = '#1C3557' }: { label: string; val: number; loading?: boolean; color?: string }) {
  return (
    <div style={{ minWidth: 150 }}>
      <div style={{ fontSize: 10.5, color: '#9CA3AF', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color }}>
        {loading ? '…' : val.toLocaleString('vi-VN') + ' ₫'}
      </div>
    </div>
  )
}
