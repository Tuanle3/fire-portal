'use client'
// ============================================================
// page.tsx — Module "Test Dòng tiền" (gộp từ module Ngân sách)
// 4 tab:
//   dong-tien   — Dòng tiền (TabDongTien cũ — giữ nguyên)
//   ke-hoach    — Kế hoạch (TabKeHoach, nhập tay + AUTO vay NH)
//   tong-hop    — Báo cáo thực hiện (TabTongHop)
//   giai-phap   — Giải pháp cân đối (TabGiaiPhap)
// ============================================================
import { useEffect, useState, useCallback, useMemo } from 'react'
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
import { matchKMCP }                        from '@/lib/ngan-sach-mapping'

import { DEFAULT_ITEMS, DEFAULT_GIAI_PHAP } from '@/lib/ngan-sach-types'
import type { NganSachThang } from '@/lib/ngan-sach-types'

// ── Sổ quỹ data_quy (Google Sheets → Firebase RTDB) ─────────
import { subscribeDongTienTuQuy } from '@/lib/dong-tien-quy-adapter'
// ── Hạn mức tín dụng (gốc/lãi vay NH) ──────────────────────
import { subscribeDongTienTuHanMuc } from '@/lib/dong-tien-hanmuc-adapter'

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

const [tuNgay, setTuNgay] = useState(`${defaultThang()}-01`)
const [denNgay, setDenNgay] = useState(() => {
  const d = new Date(); const y = d.getFullYear(); const m = d.getMonth()
  return `${y}-${String(m + 1).padStart(2, '0')}-${new Date(y, m + 1, 0).getDate()}`
})
  // ── Dữ liệu ngân sách Firestore ─────────────────────────────
  const [localData, setLocalData] = useState<NganSachThang>(makeEmptyDoc(month))
  const [saving,    setSaving]    = useState(false)
  const [saveMsg,   setSaveMsg]   = useState('')

  // ── kmcpActual = thực hiện thường + thực hiện vay NH ────────
  const [kmcpActual,   setKmcpActual]   = useState<Record<string, number>>({})
  // hanMucActual = thực hiện gốc/lãi từ hạn mức (kỳ trả nợ đã thực hiện)
  const [hanMucActual, setHanMucActual] = useState<Record<string, number>>({})
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

  // ── Subscribe hạn mức tín dụng → thực hiện gốc/lãi vay NH ──
  // Kỳ trả nợ trangThai='da-tra' → cộng vào VAY-GOC-DN/VAY-LAI-DN/VAY-GOC-CN/VAY-LAI-CN
  useEffect(() => {
    return subscribeDongTienTuHanMuc(hanMucData => {
      const acc: Record<string, number> = {}
      for (const it of hanMucData.items) {
        if (!it.ngay.startsWith(month)) continue
        // Chỉ lấy khoản đã thực hiện (trangThai = thuc-te)
        if (it.trangThai !== 'thuc-te') continue
        // Khớp nguồn vay → KMCP
        let kmcp: string | null = null
        if (it.nguon === 'kytra-no') {
          // Phân biệt gốc/lãi qua nhom hoặc nhanNhan
          const label = (it.nhanNhan ?? '').toLowerCase()
          const isCN  = (it.entity === 'Cá nhân')
          if (label.includes('lãi') || label.includes('lai')) {
            kmcp = isCN ? 'VAY-LAI-CN' : 'VAY-LAI-DN'
          } else {
            kmcp = isCN ? 'VAY-GOC-CN' : 'VAY-GOC-DN'
          }
        } else if (it.nguon === 'kythu-nh') {
          // Hạn mức ngắn hạn — luôn là DN
          const label = (it.nhanNhan ?? '').toLowerCase()
          kmcp = (label.includes('lãi') || label.includes('lai')) ? 'VAY-LAI-DN' : 'VAY-GOC-DN'
        } else if (it.nguon === 'giai-ngan') {
          kmcp = 'THU-VAY'
        }
        if (!kmcp) continue
        acc[kmcp] = (acc[kmcp] ?? 0) + it.soTien
      }
      setHanMucActual(acc)
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
      // hoatDong.nhom = Mã ngân sách từ sổ quỹ → khớp đúng KMCP
      const actualFromHoatDong: Record<string, number> = {}
      for (const item of quyData.hoatDong) {
        if (item.ngay < tuNgay || item.ngay > denNgay) continue
        if (!item.nhom) continue
        actualFromHoatDong[item.nhom] = (actualFromHoatDong[item.nhom] ?? 0) + item.soTien
      }

      // Fallback: dòng khongXacDinh (có Nhóm_CP nhưng không có Mã ngân sách)
      // → matchKMCP để map Nhóm_CP → KMCP chuẩn.
      // PA (b): dòng nào matchKMCP không nhận diện được rule nào thì gom vào
      // 2 mã catch-all có sẵn (CP-KHAC / THU-K) theo dấu Số_tiền_PS — không
      // bỏ qua nữa, để không còn "chi chưa phân loại" biến mất khỏi báo cáo.
      for (const r of quyData.khongXacDinh) {
        const ngay = String(r['Ngày'] ?? r['Ngay'] ?? '')
        if (!ngay || ngay < tuNgay || ngay > denNgay) continue
        const ghiChu = String(r['Ghi_chu'] ?? '')
        if (ghiChu === 'Dư đầu kỳ' || ghiChu === 'Dư cuối kỳ') continue
        const ps = Number(r['Số_tiền_PS'] ?? r['So_tien_PS'] ?? 0)
        if (!ps) continue
        const nhomCP = String(r['Nhóm_CP'] ?? r['Nhom_CP'] ?? '')
        const kmcp = matchKMCP(nhomCP, ghiChu) ?? (ps < 0 ? 'CP-KHAC' : 'THU-K')
        actualFromHoatDong[kmcp] = (actualFromHoatDong[kmcp] ?? 0) + Math.abs(ps)
      }

      // Build vayActual từ vayRows (5 dòng vay NH)
      // + đồng thời khớp theo ĐÚNG mã ngân sách chi tiết (VD "SAP_NH_ACB_Lai")
      // — vì bảng KH hiện có các dòng con tách theo từng ngân hàng/entity,
      // không chỉ 5 mã gộp thô. Cộng cả 2 vào cùng actualFromHoatDong để
      // dòng nào dùng mã gộp thô hay mã chi tiết đều lên số đúng.
      const vayActual: Record<string, number> = {}
      for (const vr of quyData.vayRows) {
        if (vr.ngay < tuNgay || vr.ngay > denNgay) continue
        if (vr.maNS) actualFromHoatDong[vr.maNS] = (actualFromHoatDong[vr.maNS] ?? 0) + vr.soTien
        if (!vr.parsed.xacDinh) { vayActual['VAY-KHAC'] = (vayActual['VAY-KHAC'] ?? 0) + vr.soTien; continue }
        const p = vr.parsed
        let kmcp: string
        if (p.loaiKhoan === 'thu-giai-ngan') kmcp = 'THU-VAY'
        else if (p.nhanh === 'ca-nhan') kmcp = p.loaiKhoan === 'lai' ? 'VAY-LAI-CN' : 'VAY-GOC-CN'
        else kmcp = p.loaiKhoan === 'lai' ? 'VAY-LAI-DN' : 'VAY-GOC-DN'
        vayActual[kmcp] = (vayActual[kmcp] ?? 0) + vr.soTien
      }

      // eslint-disable-next-line no-console
      console.log('[DEBUG vay]', {
        soDongVayRows: quyData.vayRows.length,
        mauVayRows: quyData.vayRows.slice(0, 5),
        vayActual,
      })

      setKmcpActual({ ...actualFromHoatDong, ...vayActual })

      // Thu/Chi theo khoảng tuNgay → denNgay
      let thu = 0, chi = 0
      for (const item of quyData.hoatDong) {
        if (item.ngay < tuNgay || item.ngay > denNgay) continue
        if (item.loai === 'thu') thu += item.soTien
        else chi += item.soTien
      }
      setThuThang(thu)
      setChiThang(chi)
    })
  }, [month, tuNgay, denNgay])

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

  // ── Gộp thực hiện: CP thường + vay NH từ sổ quỹ + gốc/lãi từ hạn mức ──
  // Ưu tiên: nếu cùng KMCP vay NH có cả 2 nguồn → cộng dồn (không ghi đè)
  // Thực tế: sổ quỹ khớp Mã ngân sách → vay NH; hạn mức khớp kỳ trả nợ đã trả
  // → 2 nguồn bổ sung cho nhau, không trùng nếu data_quy có mã đúng chuẩn.
  const kmcpActualFinal = useMemo(() => {
    const merged = { ...kmcpActual }
    for (const [kmcp, val] of Object.entries(hanMucActual)) {
      // Chỉ dùng hanMucActual cho KMCP vay nếu sổ quỹ chưa có số
      // (tránh cộng 2 lần khi sổ quỹ đã khớp đúng mã)
      if (!merged[kmcp]) merged[kmcp] = val
    }
    return merged
  }, [kmcpActual, hanMucActual])

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
                kmcpActual={kmcpActualFinal}
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
                kmcpActual={kmcpActualFinal}
                kmcpPlanned={kmcpPlanned}
                thuThang={thuThang}
                chiThang={chiThang}
                tonQuyDetail={[]}
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
