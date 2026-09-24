'use client'
import { useState, useEffect } from 'react'
import { useUserSession } from '@/contexts/user-session'
import { useTopbarInfo } from '@/contexts/topbar-info'
import {
  subscribeBankRelations, subscribeBankProposals, subscribeBankNotes,
  saveBankRelation, deleteBankRelation, saveBankProposal, deleteBankProposal, saveBankNote, deleteBankNote,
} from '@/lib/bank-store'
import { BankRelation, BankProposal, BankNote } from '@/lib/bank-types'
import { TabNganHang } from './_tabs/TabNganHang'
import { TabSoSanh } from './_tabs/TabSoSanh'
import { TabHanMucWrapper } from './_tabs/TabHanMucWrapper'
import NhSharedStyles from '@/components/NhSharedStyles'
import { Wallet, Landmark, Scale } from 'lucide-react'

type TabId = 'ngan-hang' | 'so-sanh' | 'han-muc'

const TABS: { id: TabId; label: string; icon: typeof Wallet }[] = [
  { id: 'han-muc',    label: 'Hạn mức tín dụng', icon: Wallet },
  { id: 'ngan-hang',  label: 'Ngân hàng',        icon: Landmark },
  { id: 'so-sanh',    label: 'So sánh',          icon: Scale },
]

// Style riêng cho thanh tab + khung nội dung (tiền tố nhp- để không đụng NhSharedStyles)
const PAGE_CSS = `
.nhp-bar{position:sticky;top:0;z-index:50;background:#fff;border-bottom:1px solid #E5E0D8;box-shadow:0 1px 4px rgba(13,31,51,.06)}
.nhp-tabs{display:flex;align-items:stretch;gap:2px;padding:0 6px;overflow-x:auto;scrollbar-width:none}
.nhp-tabs::-webkit-scrollbar{display:none}
.nhp-tab{display:flex;align-items:center;gap:7px;padding:9px 16px;border:none;background:none;cursor:pointer;
  font-size:13px;font-weight:500;color:#6B7280;white-space:nowrap;border-bottom:2px solid transparent;margin-bottom:-1px;
  transition:color .15s,border-color .15s,background .15s}
.nhp-tab:hover{color:#1C3557;background:#FAF8F3}
.nhp-tab.on{color:#1C3557;font-weight:700;border-bottom-color:#D4A64A}
.nhp-cnt{font-size:10.5px;font-weight:700;line-height:1;padding:3px 7px;border-radius:999px;background:#EEF2F7;color:#4B6A8A}
.nhp-tab.on .nhp-cnt{background:#1C3557;color:#fff}
.nhp-root .nh-content{padding-top:10px;padding-bottom:10px}
`

export default function NganHangPage() {
  const { loading: sessLoading, can } = useUserSession()
  const [activeTab, setActiveTab] = useState<TabId>('han-muc')

  const [relations, setRelations] = useState<BankRelation[]>([])
  const [proposals, setProposals] = useState<BankProposal[]>([])
  const [notes, setNotes]         = useState<BankNote[]>([])
  const [dataLoading, setDataLoading] = useState(true)

  const { setLeft, setRight } = useTopbarInfo()
  useEffect(() => {
    setLeft(
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#1C3557' }}>🏦 List ngân hàng</span>
        <span style={{ fontSize: 11, color: '#9CA3AF' }}>Module › Ngân hàng</span>
      </div>
    )
    setRight(null)
    return () => { setLeft(null); setRight(null) }
  }, [setLeft, setRight])

  useEffect(() => {
    const u1 = subscribeBankRelations(rows => { setRelations(rows); setDataLoading(false) })
    const u2 = subscribeBankProposals(setProposals)
    const u3 = subscribeBankNotes(setNotes)
    return () => { u1(); u2(); u3() }
  }, [])

  if (sessLoading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Đang tải...</div>
  }
  if (!can('m:nganhang')) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', gap: 12 }}>
        <div style={{ fontSize: 40 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#1C3557' }}>Không có quyền truy cập</div>
        <div style={{ fontSize: 13, color: '#9CA3AF', textAlign: 'center' }}>Module này được giới hạn theo phân quyền. Liên hệ quản trị viên.</div>
      </div>
    )
  }

  const loadingBox = (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--nh-muted)', fontSize: 13 }}>Đang tải dữ liệu...</div>
  )
  const counts: Partial<Record<TabId, number>> = { 'ngan-hang': relations.length, 'so-sanh': proposals.length }

  return (
    <>
      <NhSharedStyles />
      <style>{PAGE_CSS}</style>

      <div className="nh-main nhp-root">
        <div className="nh-wrap">
          <div className="nhp-bar">
            <div className="nhp-tabs" role="tablist">
              {TABS.map(t => {
                const Icon = t.icon
                const n = counts[t.id]
                return (
                  <button
                    key={t.id} role="tab" aria-selected={activeTab === t.id}
                    className={`nhp-tab${activeTab === t.id ? ' on' : ''}`}
                    onClick={() => setActiveTab(t.id)}
                  >
                    <Icon size={14} />
                    {t.label}
                    {!dataLoading && n !== undefined && n > 0 && <span className="nhp-cnt">{n}</span>}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="nh-content">
            {/* Hạn mức tín dụng tự lấy dữ liệu riêng → không phải chờ danh sách ngân hàng */}
            {activeTab === 'han-muc' && <TabHanMucWrapper />}

            {activeTab === 'ngan-hang' && (dataLoading ? loadingBox : (
              <TabNganHang
                relations={relations} proposals={proposals} notes={notes}
                onSaveRelation={saveBankRelation} onDeleteRelation={deleteBankRelation}
                onSaveProposal={saveBankProposal} onDeleteProposal={deleteBankProposal}
                onSaveNote={saveBankNote} onDeleteNote={deleteBankNote}
              />
            ))}
            {activeTab === 'so-sanh' && (dataLoading ? loadingBox : (
              <TabSoSanh relations={relations} proposals={proposals} notes={notes} />
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
