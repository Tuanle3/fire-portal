'use client'
import { useState, useEffect, useCallback } from 'react'
import { useUserSession } from '@/contexts/user-session'
import { useTopbarInfo } from '@/contexts/topbar-info'
import { getDb } from '@/lib/firebase'
import { ref, get } from 'firebase/database'
import { NganSachThang } from '@/lib/ngan-sach-types'
import { subscribeNganSach, saveNganSach, makeDefault } from '@/lib/ngan-sach-store'
import { buildKmcpActual, findKey, sumChiThang, sumThuThang } from '@/lib/ngan-sach-mapping'
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
  const [tonDauKy,    setTonDauKy]    = useState(0)
  const [quyLoaded,   setQuyLoaded]   = useState(false)
  const [tonQuyDetail, setTonQuyDetail] = useState<{ stk: string; bank: string; unit: string; ton: number }[]>([])
  const [showDetail,   setShowDetail]   = useState(false)

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

  // Fetch ALL data_quy once, then derive everything from it (KMCP map + chi/thu + ton quy)
  useEffect(() => {
    setQuyLoaded(false)
    setTonQuyLoading(true)
    get(ref(getDb(), 'data_quy')).then(snap => {
      const rows = toArr(snap)

      // Sort ascending by date (same as CEO dashboard)
      const sorted = [...rows].sort((a, b) =>
        String(a['Ngày'] ?? '').localeCompare(String(b['Ngày'] ?? ''))
      )

      const CY_PX = `${month.slice(0, 4)}-`

      // dauKyAcc = last Tồn per account before current year (same as CEO dashboard)
      const dauKyAcc = new Map<string, number>()
      for (const r of sorted) {
        if (String(r['Ngày'] ?? '') >= CY_PX) break
        const stk = String(r['Số_tài_khoản'] ?? '')
        if (stk) dauKyAcc.set(stk, Number(r['Tồn'] ?? 0))
      }

      // latestTon + metadata per account (same as CEO dashboard)
      const latestTon  = new Map<string, number>()
      const accBank    = new Map<string, string>()
      const accUnit    = new Map<string, string>()
      for (const r of sorted) {
        const stk = String(r['Số_tài_khoản'] ?? '')
        if (!stk) continue
        latestTon.set(stk, Number(r['Tồn'] ?? 0))
        accBank.set(stk, String(r['Ngân_hàng'] ?? r['Ngân hàng'] ?? ''))
        accUnit.set(stk, String(r['Đơn_vị'] ?? r['Đơn vị'] ?? ''))
      }

      // tonQuy (realtime) = sum of latestTon = số dư cuối kỳ thực tế hiện tại
      let realtime = 0
      latestTon.forEach(v => { realtime += v })
      setTonQuy(realtime)

      // Chi tiết từng tài khoản để kiểm tra
      const detail: { stk: string; bank: string; unit: string; ton: number }[] = []
      latestTon.forEach((ton, stk) => {
        detail.push({ stk, bank: accBank.get(stk) ?? '', unit: accUnit.get(stk) ?? '', ton })
      })
      detail.sort((a, b) => b.ton - a.ton)
      setTonQuyDetail(detail)

      // Tính cuoiky của từng tháng (giống monthRows trong dashboard)
      // để lấy cuoiky của tháng trước month => đó là tonDauKy
      const yearRows = sorted.filter(r => String(r['Ngày'] ?? '').startsWith(CY_PX))
      const ton = new Map<string, number>(dauKyAcc)
      let curMm = ''
      const monthCuoiKy = new Map<string, number>() // mm → cuoiky

      for (const r of yearRows) {
        const mm  = String(r['Ngày'] ?? '').slice(5, 7)
        const stk = String(r['Số_tài_khoản'] ?? '')
        if (mm !== curMm) {
          if (curMm) {
            let c = 0; ton.forEach(v => { c += v })
            monthCuoiKy.set(curMm, c)
          }
          curMm = mm
        }
        if (stk) ton.set(stk, Number(r['Tồn'] ?? 0))
      }
      if (curMm) {
        let c = 0; ton.forEach(v => { c += v })
        monthCuoiKy.set(curMm, c)
      }

      // tonDauKy = cuoiky của tháng trước; nếu là T1 thì = tổng dauKyAcc
      const [selY, selM] = month.split('-')
      const prevM = parseInt(selM) - 1
      if (prevM === 0) {
        // Tháng 1: đầu kỳ = tổng dauKyAcc (số dư đầu năm)
        let dk = 0; dauKyAcc.forEach(v => { dk += v })
        setTonDauKy(dk)
      } else {
        const prevMm = String(prevM).padStart(2, '0')
        if (monthCuoiKy.has(prevMm)) {
          setTonDauKy(monthCuoiKy.get(prevMm)!)
        } else {
          // Chưa có data tháng trước → fallback về đầu năm
          let dk = 0; dauKyAcc.forEach(v => { dk += v })
          setTonDauKy(dk)
        }
      }

      // Monthly aggregates (chỉ tính dòng Thực tế)
      const loaiKey = findKey(rows, 'loai')
      setChiThang(sumChiThang(rows, month, loaiKey))
      setThuThang(sumThuThang(rows, month, loaiKey))

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
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', minHeight: 0 }}>
    <>
      <style>{`
        .ns-tab-bar { display:flex; gap:4px; border-bottom:2px solid #E5E7EB; margin-bottom:20px; }
        .ns-tab { padding:8px 16px; font-size:13px; font-weight:600; color:#6B7280; background:none; border:none;
          border-bottom:2px solid transparent; cursor:pointer; margin-bottom:-2px; transition:color .15s,border-color .15s; }
        .ns-tab:hover { color:#1C3557; }
        .ns-tab.active { color:#1C3557; border-bottom-color:#1C3557; }
      `}</style>

      {/* Reconciliation bar */}
      <div style={{ marginBottom: 16, background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', padding: '10px 16px', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <RCard label="Tồn quỹ thực tế" val={tonQuy} loading={tonQuyLoading} color="#166534" />
            <button
              onClick={() => setShowDetail(v => !v)}
              title="Xem chi tiết từng tài khoản"
              style={{
                marginTop: 10, width: 20, height: 20, borderRadius: 4, border: '1px solid #D1FAE5',
                background: showDetail ? '#D1FAE5' : '#fff', color: '#166534', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >{showDetail ? '−' : '+'}</button>
          </div>
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

        {/* Chi tiết tồn quỹ từng tài khoản */}
        {showDetail && (
          <div style={{ borderTop: '1px solid #E5E7EB', padding: '8px 16px 12px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ color: '#6B7280', borderBottom: '1px solid #E5E7EB' }}>
                  <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600 }}>Đơn vị</th>
                  <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600 }}>Ngân hàng</th>
                  <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600 }}>Số tài khoản</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 600 }}>Tồn quỹ</th>
                </tr>
              </thead>
              <tbody>
                {tonQuyDetail.map(d => (
                  <tr key={d.stk} style={{ borderBottom: '1px solid #F3F4F6' }}>
                    <td style={{ padding: '4px 8px', color: '#374151' }}>{d.unit || '—'}</td>
                    <td style={{ padding: '4px 8px', color: '#374151' }}>{d.bank || '—'}</td>
                    <td style={{ padding: '4px 8px', color: '#6B7280', fontFamily: 'monospace' }}>{d.stk}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600, color: d.ton < 0 ? '#991B1B' : '#166534' }}>
                      {d.ton.toLocaleString('vi-VN')} ₫
                    </td>
                  </tr>
                ))}
                <tr style={{ borderTop: '2px solid #D1FAE5', background: '#F0FDF4' }}>
                  <td colSpan={3} style={{ padding: '5px 8px', fontWeight: 700, color: '#166534', fontSize: 13 }}>Tổng cộng</td>
                  <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700, color: '#166534', fontSize: 13 }}>
                    {tonQuy.toLocaleString('vi-VN')} ₫
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
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
          tonQuySoDu={tonDauKy}
          tonQuyRealtime={tonQuy}
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
          tonQuySoDu={tonDauKy}
          tonQuyRealtime={tonQuy}
        />
      )}
      {tab === 'giai-phap' && (
        <TabGiaiPhap data={localData} onChange={setLocalData} onSave={handleSave} saving={saving} />
      )}
    </>
    </div>
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
