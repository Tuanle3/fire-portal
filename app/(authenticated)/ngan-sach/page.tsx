'use client'
import { useState, useEffect, useCallback } from 'react'
import { useUserSession } from '@/contexts/user-session'
import { useTopbarInfo } from '@/contexts/topbar-info'
import { getDb } from '@/lib/firebase'
import { ref, get } from 'firebase/database'
import { NganSachThang } from '@/lib/ngan-sach-types'
import { subscribeNganSach, saveNganSach, makeDefault } from '@/lib/ngan-sach-store'
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

  const [tab, setTab] = useState<TabId>('tong-hop')
  const [month, setMonth] = useState(curMonth())

  const [data, setData] = useState<NganSachThang>(makeDefault(month))
  const [localData, setLocalData] = useState<NganSachThang>(makeDefault(month))
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  // Realtime DB: fetch tồn quỹ (latest balance)
  const [tonQuy, setTonQuy] = useState(0)
  const [tonQuyLoading, setTonQuyLoading] = useState(true)

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
    const unsub = subscribeNganSach(month, d => {
      setData(d)
      setLocalData(d)
    })
    return unsub
  }, [month])

  // Fetch tồn quỹ from Realtime DB
  useEffect(() => {
    setTonQuyLoading(true)
    const db = getDb()
    get(ref(db, 'data_quy')).then(snap => {
      const rows = toArr(snap)
      // Latest Tồn across all accounts = last row's Tồn OR sum of latest per-account balances
      const latestPerAcc = new Map<string, number>()
      for (const r of rows) {
        const stk = String(r['Số_tài_khoản'] ?? r['So_tai_khoan'] ?? '')
        const ton = Number(r['Tồn'] ?? r['Ton'] ?? 0)
        if (stk) latestPerAcc.set(stk, ton)
      }
      let total = 0
      latestPerAcc.forEach(v => { total += v })
      setTonQuy(total)
    }).catch(() => setTonQuy(0))
      .finally(() => setTonQuyLoading(false))
  }, [])

  // Also compute total Chi for selected month from data_quy (for reconciliation)
  const [chiThang, setChiThang] = useState(0)
  const [thuThang, setThuThang] = useState(0)
  useEffect(() => {
    const db = getDb()
    get(ref(db, 'data_quy')).then(snap => {
      const rows = toArr(snap)
      let chi = 0, thu = 0
      for (const r of rows) {
        const ngay = String(r['Ngày'] ?? r['Ngay'] ?? '')
        if (!ngay.startsWith(month)) continue
        const ps = Math.abs(Number(r['Số_tiền_PS'] ?? r['So_tien_PS'] ?? 0))
        const loai = String(r['Ghi_chu'] ?? r['Ghi chu'] ?? '')
        if (loai === 'Chi' || ps < 0) chi += ps
        else if (loai === 'Thu' || ps > 0) thu += ps
      }
      setChiThang(chi)
      setThuThang(thu)
    }).catch(() => {})
  }, [month])

  const handleSave = useCallback(async () => {
    setSaving(true)
    setSaveMsg('')
    try {
      await saveNganSach(localData)
      setSaveMsg('Đã lưu ✓')
      setTimeout(() => setSaveMsg(''), 3000)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Lỗi'
      setSaveMsg('Lỗi: ' + msg)
    } finally {
      setSaving(false)
    }
  }, [localData])

  if (sessLoading) return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Đang tải...</div>
  if (!can('m:ngan-sach')) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', gap: 12 }}>
      <div style={{ fontSize: 40 }}>🔒</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#1C3557' }}>Không có quyền truy cập</div>
    </div>
  )

  const TABS: { id: TabId; label: string }[] = [
    { id: 'tong-hop', label: '📊 Tổng hợp' },
    { id: 'ke-hoach', label: '✏️ Kế hoạch & Thực hiện' },
    { id: 'giai-phap', label: '💡 Giải pháp cân đối' },
  ]

  const [y, m] = month.split('-')
  const thangLabel = `T${parseInt(m)}.${y}`

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
        display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap',
        background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 10, padding: '10px 14px',
      }}>
        <RCard label={`Tồn quỹ thực tế`} val={tonQuy} loading={tonQuyLoading} color="#166534" />
        <RCard label={`Thu tháng ${thangLabel} (từ Quỹ)`} val={thuThang} color="#1C3557" />
        <RCard label={`Chi tháng ${thangLabel} (từ Quỹ)`} val={chiThang} color="#9A3412" />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
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
        <TabTongHop data={localData} tonQuySoDu={tonQuy} tonQuySoDuLoading={tonQuyLoading} />
      )}
      {tab === 'ke-hoach' && (
        <TabKeHoach data={localData} onChange={setLocalData} onSave={handleSave} saving={saving} />
      )}
      {tab === 'giai-phap' && (
        <TabGiaiPhap data={localData} onChange={setLocalData} onSave={handleSave} saving={saving} />
      )}
    </>
  )
}

function RCard({ label, val, loading, color = '#1C3557' }: { label: string; val: number; loading?: boolean; color?: string }) {
  return (
    <div style={{ minWidth: 160 }}>
      <div style={{ fontSize: 10.5, color: '#9CA3AF', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color }}>
        {loading ? '…' : val.toLocaleString('vi-VN') + ' ₫'}
      </div>
    </div>
  )
}
