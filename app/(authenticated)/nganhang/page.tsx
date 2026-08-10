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
import { TabHanMuc } from './_tabs/TabHanMuc'

type TabId = 'ngan-hang' | 'so-sanh' | 'han-muc'

const TABS: { id: TabId; label: string }[] = [
  { id: 'ngan-hang', label: 'Ngân hàng' },
  { id: 'so-sanh',   label: 'So sánh' },
  { id: 'han-muc',   label: 'Hạn mức tín dụng' },
]

export default function NganHangPage() {
  const { loading: sessLoading, can } = useUserSession()
  const [activeTab, setActiveTab] = useState<TabId>('ngan-hang')

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
      <style>{`
        :root {
          --nh-navy:#1C3557; --nh-navy2:#2A4D7A; --nh-gold:#D4A64A;
          --nh-bg:#FAF8F3; --nh-surf:#fff; --nh-surf2:#EEF3FA;
          --nh-border:#E5E0D8; --nh-border2:#D0CCC4; --nh-border3:#D0DCE8;
          --nh-txt:#1F2430; --nh-muted:#6B7280; --nh-muted2:#9CA3AF;
          --nh-green:#1F6B3D; --nh-greenbg:#EAF6EE;
          --nh-red:#8C1F1F; --nh-redbg:#FDECEC;
          --nh-amber:#8A5A12; --nh-amberbg:#FFF4E0;
          --nh-r:12px; --nh-rs:6px;
        }
        .nh-wrap { font-family:'Be Vietnam Pro',sans-serif; font-size:13px; color:var(--nh-txt); }
        .nh-main { flex:1; display:flex; flex-direction:column; overflow-y:auto; overflow-x:hidden; }
        .nh-content { padding:20px 24px; }

        .subtab-bar { display:flex; align-items:center; gap:2px; border-bottom:1px solid var(--nh-border); overflow-x:auto; background:var(--nh-surf); padding:0 4px; margin:0 24px; }
        .subtab { padding:10px 16px; font-size:12.5px; font-weight:600; color:var(--nh-muted); cursor:pointer; border-bottom:2.5px solid transparent; background:none; border-top:none; border-left:none; border-right:none; font-family:inherit; white-space:nowrap; flex-shrink:0; transition:color .15s; }
        .subtab:hover:not(.active) { color:var(--nh-navy); background:var(--nh-surf2); }
        .subtab.active { color:var(--nh-navy); font-weight:700; border-bottom-color:var(--nh-gold); }

        .nh-card { background:#fff; border:1px solid #E0E7F0; border-radius:var(--nh-r); margin-bottom:14px; overflow:hidden; }
        .nh-card-head { padding:10px 16px; border-bottom:.5px solid #A8C4DE; display:flex; align-items:center; justify-content:space-between; background:#EEF3FA; gap:8px; flex-wrap:wrap; }
        .nh-card-title { font-size:11px; font-weight:700; letter-spacing:.07em; color:#4B6A8A; text-transform:uppercase; }
        .nh-card-body { padding:14px 16px; }

        .nh-kpi-row { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:16px; }
        .nh-kpi { background:var(--nh-surf); border-radius:10px; overflow:hidden; border:1px solid var(--nh-border3); }
        .nh-kpi-label { display:block; font-size:9.5px; font-weight:700; text-transform:uppercase; letter-spacing:.07em; padding:8px 14px; background:#EEF3FA; border-bottom:1px solid #D0DCE8; color:#4B6A8A; }
        .nh-kpi-val   { display:block; font-size:19px; font-weight:800; color:var(--nh-navy); line-height:1.1; padding:10px 14px 0; }
        .nh-kpi-sub   { display:block; font-size:10.5px; color:var(--nh-muted); padding:3px 14px 12px; }

        table.nh-tbl { width:100%; border-collapse:collapse; font-size:12px; }
        table.nh-tbl th { text-align:left; font-size:10px; font-weight:700; color:#4B6A8A; text-transform:uppercase; letter-spacing:.05em; padding:8px 10px; background:#EEF3FA; border-bottom:1px solid #D0DCE8; white-space:nowrap; }
        table.nh-tbl th.r, table.nh-tbl td.r { text-align:right; }
        table.nh-tbl td { padding:9px 10px; border-bottom:1px solid var(--nh-border); vertical-align:middle; }
        table.nh-tbl tr:last-child td { border-bottom:none; }
        table.nh-tbl tr:hover td { background:var(--nh-surf2); }

        .btn-primary { background:var(--nh-navy); color:#fff; border:none; padding:7px 14px; border-radius:8px; font-size:12px; font-weight:600; cursor:pointer; font-family:inherit; }
        .btn-primary:hover { background:var(--nh-navy2); }
        .btn-ghost { background:#fff; border:1px solid #E5E0D8; color:#3D3D3D; padding:6px 12px; border-radius:8px; font-size:11.5px; font-weight:600; cursor:pointer; font-family:inherit; transition:all .15s; }
        .btn-ghost:hover { border-color:var(--nh-navy); background:#EEF3FA; }
        .btn-danger { background:#fff; border:1px solid #FECACA; color:#DC2626; padding:5px 10px; border-radius:7px; font-size:11px; font-weight:600; cursor:pointer; font-family:inherit; }
        .btn-danger:hover { background:#FEF2F2; }
	.nh-modal-overlay { position:fixed; inset:0; z-index:60; display:flex; align-items:center; justify-content:center; background:rgba(15,23,42,.5); padding:16px; }
	.nh-modal-card { width:100%; max-width:760px; max-height:88vh; display:flex; flex-direction:column; background:#fff; border-radius:14px; box-shadow:0 20px 60px rgba(0,0,0,.25); overflow:hidden; }
	.nh-modal-head { display:flex; align-items:center; justify-content:space-between; padding:14px 20px; border-bottom:1px solid var(--nh-border); background:#EEF3FA; }
	.nh-modal-title { font-size:14.5px; font-weight:700; color:var(--nh-navy); }
	.nh-modal-close { border:none; background:none; cursor:pointer; color:var(--nh-muted); padding:4px; border-radius:6px; }
	.nh-modal-close:hover { background:#fff; color:var(--nh-navy); }
	.nh-modal-body { padding:16px 20px; overflow-y:auto; }
	.nh-modal-foot { display:flex; justify-content:flex-end; gap:8px; padding:14px 20px; border-top:1px solid var(--nh-border); }
	.nh-radio-row { display:flex; gap:16px; align-items:center; padding:6px 0 2px; }
	.nh-radio-row label { display:flex; align-items:center; gap:6px; font-size:12.5px; color:var(--nh-txt); cursor:pointer; font-weight:600; }
	.nh-hint { font-size:11px; color:var(--nh-muted2); margin-top:8px; }
	.nh-err { font-size:12.5px; color:var(--nh-red); background:var(--nh-redbg); border:1px solid #FECACA; border-radius:8px; padding:8px 10px; margin-top:8px; }

/* Nút Lưu tách màu rõ với Hủy (btn-ghost) và các nút primary khác */
.btn-save { background:var(--nh-green); color:#fff; border:none; padding:8px 16px; border-radius:8px; font-size:12.5px; font-weight:700; cursor:pointer; font-family:inherit; }
.btn-save:hover { background:#17532F; }
.btn-save:disabled { opacity:.6; cursor:not-allowed; }
        .nh-badge { display:inline-flex; align-items:center; border-radius:20px; padding:2px 9px; font-size:9.5px; font-weight:700; border:1px solid; white-space:nowrap; }
        .nh-b-green  { background:var(--nh-greenbg); color:var(--nh-green); border-color:#BBF7D0; }
        .nh-b-red    { background:var(--nh-redbg);   color:var(--nh-red);   border-color:#FECACA; }
        .nh-b-amber  { background:var(--nh-amberbg); color:var(--nh-amber); border-color:#FDE68A; }
        .nh-b-blue   { background:#EFF6FF; color:#1D4ED8; border-color:#93C5FD; }
        .nh-b-grey   { background:#F3F4F6; color:#6B7280; border-color:#D1D5DB; }
        .nh-b-purple { background:#F3E8FF; color:#7C3AED; border-color:#D8B4FE; }

        .nh-input, .nh-select, .nh-textarea { font-family:inherit; font-size:12.5px; color:var(--nh-txt); background:#fff; border:1px solid var(--nh-border2); border-radius:7px; padding:6px 9px; width:100%; }
        .nh-input:focus, .nh-select:focus, .nh-textarea:focus { border-color:var(--nh-navy2); outline:none; }
        .nh-label { font-size:11px; font-weight:700; color:var(--nh-muted); letter-spacing:.03em; text-transform:uppercase; display:block; margin-bottom:4px; }
        .nh-form-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:10px; margin-bottom:10px; }

        /* Thẻ phương án vay + thanh tiến độ xử lý hồ sơ */
        .nh-proposal-card { border:1px solid #E5E0D8; border-radius:10px; padding:12px 14px; margin-bottom:8px; background:#fff; }
        .nh-pc-head { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:4px; }
        .nh-pc-title { font-weight:700; color:#1F2430; font-size:13px; }
        .nh-pc-meta { font-size:11.5px; color:#6B7280; margin-bottom:10px; }
        .nh-stepper { display:flex; align-items:center; flex-wrap:wrap; gap:0; row-gap:6px; }
        .nh-step { display:flex; align-items:center; }
        .nh-step-dot { width:18px; height:18px; border-radius:50%; background:#E5E7EB; color:#9CA3AF; display:flex; align-items:center; justify-content:center; font-size:9.5px; font-weight:700; flex-shrink:0; }
        .nh-step-dot.done { background:var(--nh-green); color:#fff; }
        .nh-step-dot.current { background:var(--nh-navy); color:#fff; box-shadow:0 0 0 3px #EEF3FA; }
        .nh-step-label { font-size:9.5px; color:#9CA3AF; white-space:nowrap; }
        .nh-step-label.current { color:var(--nh-navy); font-weight:700; }
        .nh-step-line { width:16px; height:2px; margin:0 5px; }

        @media (max-width:1024px) { .nh-kpi-row { grid-template-columns:1fr 1fr } }
        @media (max-width:600px)  { .nh-content { padding:12px } .nh-kpi-row { grid-template-columns:1fr 1fr } }
      `}</style>

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
                {activeTab === 'han-muc' && <TabHanMuc />}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
