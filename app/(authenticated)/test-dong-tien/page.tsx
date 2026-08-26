'use client'
// ============================================================
// page.tsx — Module "Test Dòng tiền" (gộp từ module Ngân sách)
// 4 tab:
//   dong-tien   — Dòng tiền (TabDongTien cũ — giữ nguyên)
//   ke-hoach    — Kế hoạch (TabKeHoach, nhập tay + AUTO vay NH)
//   tong-hop    — Báo cáo thực hiện (TabTongHop)
//   giai-phap   — Giải pháp cân đối (TabGiaiPhap)
// ============================================================
import { useEffect, useState, useCallback } from 'react'
import { useUserSession }   from '@/contexts/user-session'
import { useTopbarInfo }    from '@/contexts/topbar-info'
import NhSharedStyles       from '@/components/NhSharedStyles'

// ── Tab Dòng tiền (giữ nguyên file cũ) ──────────────────────
import TabDongTien from './TabDongTien'

// ── Tab Kế hoạch + Tổng hợp (dùng lại từ module Ngân sách) ──
import { TabKeHoach }   from './TabKeHoach'
import { TabTongHop }   from './TabTongHop'
import { TabGiaiPhap }  from './TabGiaiPhap'

// ── Data layer ───────────────────────────────────────────────
import { subscribeNganSach, saveNganSach } from '@/lib/ngan-sach-store'
import { subscribeKmcpPlanned }            from '@/lib/ngan-sach-vay-mapping'
import {
  buildKmcpActual,
  buildVayActual,
  buildTonDauKy,
  sumThuThang,
  sumChiThang,
  findKey,
} from '@/lib/ngan-sach-mapping'
import { DEFAULT_ITEMS, DEFAULT_GIAI_PHAP } from '@/lib/ngan-sach-types'
import type { NganSachThang, TonQuyAcc }    from '@/lib/ngan-sach-types'

// ── RTDB tồn quỹ (giữ nguyên logic từ trang Ngân sách gốc) ──
import { subscribeTonQuyRealtime } from '@/lib/quy-store'

// ── Sổ quỹ data_quy (Google Sheets RTDB) ─────────────────────
import { subscribeDataQuy } from '@/lib/data-quy-store'

// ============================================================

type Tab = 'dong-tien' | 'ke-hoach' | 'tong-hop' | 'giai-phap'

const TABS: { key: Tab; label: string; emoji: string }[] = [
  { key: 'dong-tien',  label: 'Dòng tiền',            emoji: '💵' },
  { key: 'ke-hoach',   label: 'Kế hoạch',              emoji: '📋' },
  { key: 'tong-hop',   label: 'Báo cáo thực hiện',     emoji: '📊' },
  { key: 'giai-phap',  label: 'Giải pháp cân đối',     emoji: '⚖️' },
]

function defaultThang(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function makeEmptyDoc(thang: string): NganSachThang {
  return {
    thang,
    ngay_cap_nhat: new Date().toISOString().slice(0, 10),
    items: DEFAULT_ITEMS.map((it, i) => ({ ...it, id: `item-${i}` })),
    giai_phap: DEFAULT_GIAI_PHAP.map((g, i) => ({ ...g, id: `gp-${i}` })),
  }
}

export default function TestDongTienPage() {
  const { loading: sessLoading, can } = useUserSession()
  const { setLeft, setRight }         = useTopbarInfo()

  const [tab,   setTab]   = useState<Tab>('dong-tien')
  const [month, setMonth] = useState(defaultThang())

  // ── Dữ liệu ngân sách Firestore ─────────────────────────────
  const [localData, setLocalData] = useState<NganSachThang>(makeEmptyDoc(month))
  const [saving,    setSaving]    = useState(false)
  const [saveMsg,   setSaveMsg]   = useState('')

  // ── kmcpActual = thực hiện thường + thực hiện vay NH ────────
  const [kmcpActual,   setKmcpActual]   = useState<Record<string, number>>({})
  // kmcpPlanned = kế hoạch tự động cho 5 dòng vay NH
  const [kmcpPlanned,  setKmcpPlanned]  = useState<Record<string, number>>({})

  // ── Tồn quỹ ─────────────────────────────────────────────────
  const [tonDauKy,     setTonDauKy]     = useState(0)
  const [tonQuy,       setTonQuy]       = useState(0)
  const [tonQuyLoading,setTonQuyLoading]= useState(true)
  const [tonQuyDetail, setTonQuyDetail] = useState<TonQuyAcc[]>([])

  // ── Thu/Chi tháng ────────────────────────────────────────────
  const [thuThang, setThuThang] = useState(0)
  const [chiThang, setChiThang] = useState(0)

  // ── Topbar ───────────────────────────────────────────────────
  useEffect(() => {
    setLeft(
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', lineHeight: 1.15 }}>
        <div style={{ fontSize: 11, color: '#6B7280' }}>Module › Test Dòng tiền</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#1C3557' }}>💵 Test Dòng tiền</div>
      </div>
    )
    setRight(
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label style={{ fontSize: 12, color: '#6B7280' }}>Tháng</label>
        <input
          type="month"
          className="nh-input"
          style={{ width: 140 }}
          value={month}
          onChange={e => setMonth(e.target.value)}
        />
      </div>
    )
    return () => { setLeft(null); setRight(null) }
  }, [setLeft, setRight, month])

  // ── Subscribe Firestore ngân sách ────────────────────────────
  useEffect(() => {
    return subscribeNganSach(month, doc => {
      setLocalData(doc ?? makeEmptyDoc(month))
    })
  }, [month])

  // ── Subscribe data_quy (Google Sheets → RTDB) ────────────────
  useEffect(() => {
    return subscribeDataQuy(rows => {
      const loaiKey = findKey(rows, 'loai')
      // KMCP thường (bỏ vay NH)
      const actual  = buildKmcpActual(rows, month)
      // Thực hiện 5 dòng vay NH
      const vayAct  = buildVayActual(rows, month)
      setKmcpActual({ ...actual, ...vayAct })

      // Tồn đầu kỳ
      setTonDauKy(buildTonDauKy(rows, month))

      // Thu/Chi tháng
      setThuThang(sumThuThang(rows, month, loaiKey))
      setChiThang(sumChiThang(rows, month, loaiKey))
    })
  }, [month])

  // ── Subscribe kế hoạch tự động vay NH ───────────────────────
  // Tự cập nhật theo tháng đang chọn + khi hợp đồng/lịch trả nợ thay đổi.
  useEffect(() => {
    return subscribeKmcpPlanned(month, setKmcpPlanned)
  }, [month])

  // ── Subscribe tồn quỹ realtime (RTDB) ───────────────────────
  useEffect(() => {
    setTonQuyLoading(true)
    return subscribeTonQuyRealtime(({ tong, detail }) => {
      setTonQuy(tong)
      setTonQuyDetail(detail ?? [])
      setTonQuyLoading(false)
    })
  }, [])

  // ── Save ─────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    setSaving(true)
    setSaveMsg('')
    try {
      await saveNganSach(month, localData)
      setSaveMsg('✅ Đã lưu')
    } catch {
      setSaveMsg('❌ Lỗi lưu')
    } finally {
      setSaving(false)
      setTimeout(() => setSaveMsg(''), 3000)
    }
  }, [month, localData])

  // ── Guards ───────────────────────────────────────────────────
  if (sessLoading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>
        Đang tải...
      </div>
    )
  }
  if (!can('m:test-dong-tien')) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', gap: 12 }}>
        <div style={{ fontSize: 40 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#1C3557' }}>Không có quyền truy cập</div>
        <div style={{ fontSize: 13, color: '#9CA3AF', textAlign: 'center' }}>
          Module này được giới hạn theo phân quyền. Liên hệ quản trị viên.
        </div>
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────
  return (
    <>
      <NhSharedStyles />
      <div className="nh-main">
        <div className="nh-wrap">
          <div className="nh-content">

            {/* ── TAB BAR ─────────────────────────────────────── */}
            <div style={{
              display: 'flex', gap: 4, marginBottom: 16,
              borderBottom: '2px solid var(--nh-border)',
              paddingBottom: 0,
            }}>
              {TABS.map(t => {
                const active = tab === t.key
                return (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    style={{
                      padding: '8px 18px',
                      fontSize: 13,
                      fontWeight: active ? 700 : 400,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      border: 'none',
                      borderBottom: active ? '2px solid var(--nh-navy)' : '2px solid transparent',
                      background: 'transparent',
                      color: active ? 'var(--nh-navy)' : 'var(--nh-muted2)',
                      marginBottom: -2,
                      transition: 'all .12s',
                    }}
                  >
                    {t.emoji} {t.label}
                  </button>
                )
              })}
            </div>

            {/* ── TAB CONTENT ─────────────────────────────────── */}

            {tab === 'dong-tien' && <TabDongTien />}

            {tab === 'ke-hoach' && (
              <TabKeHoach
                data={localData}
                month={month}
                onChange={setLocalData}
                onSave={handleSave}
                saving={saving}
                saveMsg={saveMsg}
                kmcpActual={kmcpActual}
                kmcpPlanned={kmcpPlanned}
                tonQuySoDu={tonDauKy}
                tonQuyRealtime={tonQuy}
                tonQuyDetail={tonQuyDetail}
              />
            )}

            {tab === 'tong-hop' && (
              <TabTongHop
                data={localData}
                tonQuySoDu={tonDauKy}
                tonQuyRealtime={tonQuy}
                tonQuySoDuLoading={tonQuyLoading}
                kmcpActual={kmcpActual}
                kmcpPlanned={kmcpPlanned}
                thuThang={thuThang}
                chiThang={chiThang}
                tonQuyDetail={tonQuyDetail}
              />
            )}

            {tab === 'giai-phap' && (
              <TabGiaiPhap
                data={localData}
                month={month}
                onChange={setLocalData}
                onSave={handleSave}
                saving={saving}
                saveMsg={saveMsg}
              />
            )}

          </div>
        </div>
      </div>
    </>
  )
}