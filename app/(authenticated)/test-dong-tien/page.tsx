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

import { DEFAULT_ITEMS, DEFAULT_GIAI_PHAP } from '@/lib/ngan-sach-types'
import type { NganSachThang } from '@/lib/ngan-sach-types'

// ── Sổ quỹ data_quy (Google Sheets → Firebase RTDB) ─────────
import { subscribeDongTienTuQuy } from '@/lib/dong-tien-quy-adapter'

// ============================================================

type Tab = 'dong-tien' | 'ke-hoach' | 'tong-hop' | 'giai-phap'

const TABS: { key: Tab; label: string; emoji: string }[] = [
  { key: 'dong-tien',  label: 'Dòng tiền',            emoji: '💵' },
  { key: 'ke-hoach',   label: 'Kế hoạch',              emoji: '📋' },
  { key: 'tong-hop',   label: 'Báo cáo thực hiện',     emoji: '📊' },
  { key: 'giai-phap',  label: 'Giải pháp cân đối',     emoji: '⚖️' },
]

function pad2(n: number) { return String(n).padStart(2, '0') }

// Ngày đầu / cuối của 1 tháng, định dạng YYYY-MM-DD (cho <input type="date">)
function firstDayOfMonth(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`
}
function lastDayOfMonth(d: Date = new Date()): string {
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return `${last.getFullYear()}-${pad2(last.getMonth() + 1)}-${pad2(last.getDate())}`
}
// Tháng dạng "YYYY-MM" lấy từ 1 ngày YYYY-MM-DD
function thangCuaNgay(ngay: string): string {
  return ngay.slice(0, 7)
}
// Cộng/trừ số tháng vào 1 ngày YYYY-MM-DD, trả về đầu tháng kết quả
function shiftMonth(ngay: string, delta: number): Date {
  const [y, m] = ngay.split('-').map(Number)
  return new Date(y, (m - 1) + delta, 1)
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

  const [tab,    setTab]    = useState<Tab>('dong-tien')

  // ── Bộ lọc "Từ ngày – Đến ngày" (dùng chung cho cả 4 tab) ────
  const [tuNgay,  setTuNgay]  = useState(firstDayOfMonth())
  const [denNgay, setDenNgay] = useState(lastDayOfMonth())

  // Kế hoạch/Báo cáo/Giải pháp làm việc theo dữ liệu 1 THÁNG (tài liệu
  // NganSachThang lưu theo tháng) → tháng áp dụng = tháng chứa "Từ ngày"
  const month = thangCuaNgay(tuNgay)

  // ── Dữ liệu ngân sách Firestore ─────────────────────────────
  const [localData, setLocalData] = useState<NganSachThang>(makeEmptyDoc(month))
  const [saving,    setSaving]    = useState(false)
  const [saveMsg,   setSaveMsg]   = useState('')

  // ── kmcpActual = thực hiện thường + thực hiện vay NH ────────
  const [kmcpActual,   setKmcpActual]   = useState<Record<string, number>>({})
  // kmcpPlanned = kế hoạch tự động cho 5 dòng vay NH
  const [kmcpPlanned,  setKmcpPlanned]  = useState<Record<string, number>>({})

  // ── Tồn quỹ ─────────────────────────────────────────────────
  
  const [tonQuy,       setTonQuy]       = useState(0)
  const [tonQuyLoading,setTonQuyLoading]= useState(true)
  

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          title="Tháng trước"
          onClick={() => {
            const d = shiftMonth(tuNgay, -1)
            setTuNgay(firstDayOfMonth(d))
            setDenNgay(lastDayOfMonth(d))
          }}
          style={{
            width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid #E5E7EB', borderRadius: 6, background: '#fff', color: '#6B7280',
            cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
          }}
        >‹</button>

        <label style={{ fontSize: 12, color: '#6B7280' }}>Từ</label>
        <input
          type="date"
          className="nh-input"
          style={{ width: 145 }}
          value={tuNgay}
          onChange={e => {
            const v = e.target.value
            setTuNgay(v)
            if (denNgay < v) setDenNgay(v)
          }}
        />
        <label style={{ fontSize: 12, color: '#6B7280' }}>Đến</label>
        <input
          type="date"
          className="nh-input"
          style={{ width: 145 }}
          value={denNgay}
          onChange={e => {
            const v = e.target.value
            setDenNgay(v)
            if (tuNgay > v) setTuNgay(v)
          }}
        />

        <button
          title="Tháng sau"
          onClick={() => {
            const d = shiftMonth(tuNgay, 1)
            setTuNgay(firstDayOfMonth(d))
            setDenNgay(lastDayOfMonth(d))
          }}
          style={{
            width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid #E5E7EB', borderRadius: 6, background: '#fff', color: '#6B7280',
            cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
          }}
        >›</button>

        <button
          title="Về tháng hiện tại"
          onClick={() => { setTuNgay(firstDayOfMonth()); setDenNgay(lastDayOfMonth()) }}
          style={{
            padding: '4px 10px', border: '1px solid #E5E7EB', borderRadius: 6, background: '#fff',
            color: '#6B7280', cursor: 'pointer', fontSize: 11.5, fontFamily: 'inherit', fontWeight: 600,
          }}
        >Tháng này</button>
      </div>
    )
    return () => { setLeft(null); setRight(null) }
  }, [setLeft, setRight, tuNgay, denNgay])

  // ── Subscribe Firestore ngân sách ────────────────────────────
  useEffect(() => {
    return subscribeNganSach(month, doc => {
      setLocalData(doc ?? makeEmptyDoc(month))
    })
  }, [month])

  // ── Subscribe data_quy (Google Sheets → Firebase RTDB) ──────
  // subscribeDongTienTuQuy đọc RTDB node "data_quy", parse rows,
  // trả về { hoatDong, vayRows, khongXacDinh, tonQuyRealtime }
  useEffect(() => {
    return subscribeDongTienTuQuy(quyData => {
      // Gom tất cả raw rows từ hoatDong + vayRows để build KMCP maps
      // (dong-tien-quy-adapter đã parse + filter Thực tế rồi, nhưng
      //  buildKmcpActual/buildVayActual cần raw rows — dùng tonQuyRealtime
      //  và tính manual từ vayRows thay thế)

      // Tồn quỹ realtime từ adapter (tổng Tồn mới nhất mỗi tài khoản)
      setTonQuy(quyData.tonQuyRealtime)
      setTonQuyLoading(false)

      // Build kmcpActual từ hoatDong (CP thường, đã loại vay NH)
      const actualFromHoatDong: Record<string, number> = {}
      for (const item of quyData.hoatDong) {
        if (!item.nhom) continue
        actualFromHoatDong[item.nhom] = (actualFromHoatDong[item.nhom] ?? 0) + item.soTien
      }

      // Build vayActual từ vayRows (5 dòng vay NH)
      const vayActual: Record<string, number> = {}
      for (const vr of quyData.vayRows) {
        if (!vr.parsed.xacDinh) { vayActual['VAY-KHAC'] = (vayActual['VAY-KHAC'] ?? 0) + vr.soTien; continue }
        const p = vr.parsed
        let kmcp: string
        if (p.loaiKhoan === 'thu-giai-ngan') kmcp = 'THU-VAY'
        else if (p.nhanh === 'ca-nhan') kmcp = p.loaiKhoan === 'lai' ? 'VAY-LAI-CN' : 'VAY-GOC-CN'
        else kmcp = p.loaiKhoan === 'lai' ? 'VAY-LAI-DN' : 'VAY-GOC-DN'
        vayActual[kmcp] = (vayActual[kmcp] ?? 0) + vr.soTien
      }

      setKmcpActual({ ...actualFromHoatDong, ...vayActual })

      // Thu/Chi trong khoảng Từ ngày – Đến ngày đang chọn
      let thu = 0, chi = 0
      for (const item of quyData.hoatDong) {
        if (item.ngay < tuNgay || item.ngay > denNgay) continue
        if (item.loai === 'thu') thu += item.soTien
        else chi += item.soTien
      }
      setThuThang(thu)
      setChiThang(chi)
    })
  }, [tuNgay, denNgay])

  // ── Subscribe kế hoạch tự động vay NH ───────────────────────
  useEffect(() => {
    return subscribeKmcpPlanned(month, setKmcpPlanned)
  }, [month])

  // ── Save ─────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    setSaving(true)
    setSaveMsg('')
    try {
     await saveNganSach(localData)
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

            {tab !== 'dong-tien' && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 11.5, color: '#9CA3AF', marginTop: -10, marginBottom: 12,
              }}>
                📌 Đang áp dụng kế hoạch/báo cáo tháng{' '}
                <b style={{ color: '#1C3557' }}>{month.split('-')[1]}/{month.split('-')[0]}</b>
                {' '}(theo "Từ ngày" đã chọn ở góc trên bên phải)
              </div>
            )}

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
                tonQuySoDu={tonQuy}
                tonQuyRealtime={tonQuy}
                tonQuyDetail={[]}
              />
            )}

            {tab === 'tong-hop' && (
              <TabTongHop
                data={localData}
                tonQuySoDu={tonQuy}
                tonQuyRealtime={tonQuy}
                tonQuySoDuLoading={tonQuyLoading}
                kmcpActual={kmcpActual}
                kmcpPlanned={kmcpPlanned}
                thuThang={thuThang}
                chiThang={chiThang}
                tonQuyDetail={[]}
              />
            )}

            {tab === 'giai-phap' && (
              <TabGiaiPhap
  data={localData}
  onChange={setLocalData}
  onSave={handleSave}
  saving={saving}
/>
            )}

          </div>
        </div>
      </div>
    </>
  )
}