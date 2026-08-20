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

type TabId = 'ngan-hang' | 'so-sanh' | 'han-muc'

const TABS: { id: TabId; label: string }[] = [
  { id: 'han-muc',    label: 'Hạn mức tín dụng' },
  { id: 'ngan-hang',  label: 'Ngân hàng' },
  { id: 'so-sanh',    label: 'So sánh' },
]

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
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', lineHeight: 1.15 }}>
        <div style={{ fontSize: 11, color: '#6B7280' }}>Module › List ngân hàng</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#1C3557' }}>🏦 List ngân hàng</div>
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

  return (
    <>
      <NhSharedStyles />

      <div className="nh-main">
        <div className="nh-wrap">
          <div style={{ position: 'sticky', top: 0, zIndex: 50, background: 'linear-gradient(90deg,#FAF8F3 0%,#FFFFFF 60%)', borderBottom: '1px solid #E5E0D8', boxShadow: '0 2px 8px rgba(13,31,51,.07)' }}>
            <div className="subtab-bar">
              {TABS.map(t => (
                <button key={t.id} className={`subtab${activeTab === t.id ? ' active' : ''}`} onClick={() => setActiveTab(t.id)}>{t.label}</button>
              ))}
            </div>
          </div>

          <div className="nh-content">
            {dataLoading ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--nh-muted)' }}>Đang tải dữ liệu...</div>
            ) : (
              <>
                {activeTab === 'ngan-hang' && (
                  <TabNganHang
                    relations={relations} proposals={proposals} notes={notes}
                    onSaveRelation={saveBankRelation} onDeleteRelation={deleteBankRelation}
                    onSaveProposal={saveBankProposal} onDeleteProposal={deleteBankProposal}
                    onSaveNote={saveBankNote} onDeleteNote={deleteBankNote}
                  />
                )}
                {activeTab === 'so-sanh' && (
                  <TabSoSanh relations={relations} proposals={proposals} notes={notes} />
                )}
                {activeTab === 'han-muc' && <TabHanMucWrapper />}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}