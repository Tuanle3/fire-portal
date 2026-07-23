'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
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
import { TabDuBao } from './_tabs/TabDuBao'

type TabId = 'tong-hop' | 'ke-hoach' | 'giai-phap' | 'du-bao'

const TABS: { id: TabId; label: string }[] = [
  { id: 'du-bao',    label: '📅 Kế hoạch dòng tiền' },
  { id: 'tong-hop',  label: '📊 Báo cáo thực hiện' },
  { id: 'ke-hoach',  label: '✏️ Data kế hoạch' },
  { id: 'giai-phap', label: '💡 Giải pháp cân đối' },
]

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

  const [tab, setTab]         = useState<TabId>('du-bao')
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
  const [tonQuyDetail, setTonQuyDetail] = useState<{ stk: string; bank: string; unit: string; dauKy: number; ton: number }[]>([])

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

  // Keep latest handleSave in a ref so topbar button always calls current version
  const handleSaveRef = useRef(handleSave)
  useEffect(() => { handleSaveRef.current = handleSave }, [handleSave])

  // Topbar left: thanh tab thay cho tiêu đề module
  useEffect(() => {
    setLeft(
      <div className="ns-tab-bar" style={{ marginBottom: 0, borderBottom: 'none', gap: 2 }}>
        {TABS.map(t => (
          <button key={t.id} className={`ns-tab${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
    )
  }, [setLeft, tab])

  // Topbar right: Lưu button (when ke-hoach) + month picker
  // Use handleSaveRef so we don't re-run on every localData change
  useEffect(() => {
    setRight(
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {tab === 'ke-hoach' && (
          <>
            <button
              onClick={() => handleSaveRef.current()}
              disabled={saving}
              style={{
                padding: '6px 20px', fontSize: 13, fontWeight: 700,
                background: saving ? '#9CA3AF' : '#1C3557',
                color: '#fff', border: 'none', borderRadius: 7,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? '⏳ Đang lưu…' : '💾 Lưu'}
            </button>
            {saveMsg && (
              <span style={{ fontSize: 12, color: saveMsg.startsWith('Lỗi') ? '#B91C1C' : '#166534', fontWeight: 600 }}>
                {saveMsg}
              </span>
            )}
          </>
        )}
        <span style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', letterSpacing: '.03em', textTransform: 'uppercase' }}>Tháng:</span>
        <input
          type="month" value={month}
          onChange={e => setMonth(e.target.value)}
          style={{ fontFamily: 'inherit', fontSize: 12.5, color: '#1F2430', background: '#fff', border: '1px solid #D0CCC4', borderRadius: 7, padding: '5px 8px', width: 140 }}
        />
      </span>
    )
  }, [month, tab, saving, saveMsg, setRight])

  useEffect(() => () => { setLeft(null); setRight(null) }, [setLeft, setRight])

  // Subscribe to Firestore budget doc for selected month
  useEffect(() => {
    setLocalData(makeDefault(month))
    const unsub = subscribeNganSach(month, d => setLocalData(d))
    return unsub
  }, [month])

  // Fetch ALL data_quy once, then derive everything from it (KMCP map + chi/thu + ton quy)
  useEffect(() => {
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

      // Tính cuoiky của từng tháng + capture per-account balance tại cuối tháng trước
      const [selY, selM] = month.split('-')
      const prevM = parseInt(selM) - 1
      const prevMm = prevM > 0 ? String(prevM).padStart(2, '0') : null

      const yearRows = sorted.filter(r => String(r['Ngày'] ?? '').startsWith(CY_PX))
      const ton = new Map<string, number>(dauKyAcc)
      let curMm = ''
      const monthCuoiKy = new Map<string, number>()
      // Per-account snapshot tại cuối tháng trước (để hiển thị đầu kỳ từng TK)
      let dauKyAccSnapshot = new Map<string, number>(dauKyAcc) // mặc định = đầu năm

      for (const r of yearRows) {
        const mm  = String(r['Ngày'] ?? '').slice(5, 7)
        const stk = String(r['Số_tài_khoản'] ?? '')
        if (mm !== curMm) {
          if (curMm) {
            let c = 0; ton.forEach(v => { c += v })
            monthCuoiKy.set(curMm, c)
            // Nếu vừa đóng tháng trước → snapshot per-account
            if (prevMm && curMm === prevMm) {
              dauKyAccSnapshot = new Map(ton)
            }
          }
          curMm = mm
        }
        if (stk) ton.set(stk, Number(r['Tồn'] ?? 0))
      }
      if (curMm) {
        let c = 0; ton.forEach(v => { c += v })
        monthCuoiKy.set(curMm, c)
        if (prevMm && curMm === prevMm) {
          dauKyAccSnapshot = new Map(ton)
        }
      }

      // tonDauKy tổng
      if (prevM === 0) {
        let dk = 0; dauKyAcc.forEach(v => { dk += v })
        setTonDauKy(dk)
      } else if (monthCuoiKy.has(prevMm!)) {
        setTonDauKy(monthCuoiKy.get(prevMm!)!)
      } else {
        let dk = 0; dauKyAcc.forEach(v => { dk += v })
        setTonDauKy(dk)
      }

      // Chi tiết từng tài khoản: dauKy (đầu tháng) + ton (hiện tại)
      const allStks = new Set([...latestTon.keys(), ...dauKyAccSnapshot.keys()])
      const detail: { stk: string; bank: string; unit: string; dauKy: number; ton: number }[] = []
      allStks.forEach(stk => {
        detail.push({
          stk,
          bank: accBank.get(stk) ?? '',
          unit: accUnit.get(stk) ?? '',
          dauKy: dauKyAccSnapshot.get(stk) ?? 0,
          ton:   latestTon.get(stk) ?? 0,
        })
      })
      detail.sort((a, b) => b.dauKy - a.dauKy)
      setTonQuyDetail(detail)

      // Monthly aggregates (chỉ tính dòng Thực tế)
      const loaiKey = findKey(rows, 'loai')
      setChiThang(sumChiThang(rows, month, loaiKey))
      setThuThang(sumThuThang(rows, month, loaiKey))

      // KMCP-level actual from Nhóm_CP field
      setKmcpActual(buildKmcpActual(rows, month))
    }).catch(() => {})
      .finally(() => setTonQuyLoading(false))
  }, [month])

  if (sessLoading) return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Đang tải...</div>
  if (!can('m:ngan-sach')) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', gap: 12 }}>
      <div style={{ fontSize: 40 }}>🔒</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#1C3557' }}>Không có quyền truy cập</div>
    </div>
  )

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

      {tab === 'tong-hop' && (
        <TabTongHop
          data={localData}
          tonQuySoDu={tonDauKy}
          tonQuyRealtime={tonQuy}
          tonQuySoDuLoading={tonQuyLoading}
          kmcpActual={kmcpActual}
          thuThang={thuThang}
          chiThang={chiThang}
          tonQuyDetail={tonQuyDetail}
        />
      )}
      {tab === 'ke-hoach' && (
        <TabKeHoach
          data={localData}
          month={month}
          onChange={setLocalData}
          onSave={handleSave}
          saving={saving}
          saveMsg={saveMsg}
          kmcpActual={kmcpActual}
          tonQuySoDu={tonDauKy}
          tonQuyRealtime={tonQuy}
          tonQuyDetail={tonQuyDetail}
        />
      )}
      {tab === 'du-bao' && (
        <TabDuBao
          month={month}
          localData={localData}
          tonDauKy={tonDauKy}
          tonQuyRealtime={tonQuy}
          kmcpActual={kmcpActual}
        />
      )}
      {tab === 'giai-phap' && (
        <TabGiaiPhap data={localData} onChange={setLocalData} onSave={handleSave} saving={saving} />
      )}
    </>
    </div>
  )
}
