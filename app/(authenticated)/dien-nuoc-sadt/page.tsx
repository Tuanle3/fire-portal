'use client'
import { useState, useEffect } from 'react'
import { useUserSession } from '@/contexts/user-session'
import {
  subscribeMeterReadings, subscribeCustomers, subscribeUsage, subscribePayments,
} from '@/lib/dien-nuoc-store'
import { MeterReading, Customer, CustomerUsage, Payment } from '@/lib/dien-nuoc-types'
import { TabTongQuan } from './_tabs/TabTongQuan'
import { TabNhapChiSo } from './_tabs/TabNhapChiSo'
import { TabKhachHang } from './_tabs/TabKhachHang'
import { TabCongNo } from './_tabs/TabCongNo'

type TabId = 'tong-quan' | 'nhap-chi-so' | 'khach-hang' | 'cong-no'
const TABS: { id: TabId; label: string }[] = [
  { id: 'tong-quan',   label: 'Tổng quan' },
  { id: 'nhap-chi-so', label: 'Nhập chỉ số điện nước' },
  { id: 'khach-hang',  label: 'Khách hàng' },
  { id: 'cong-no',     label: 'Công nợ & Thu tiền' },
]

function curMonth() { return new Date().toISOString().slice(0, 7) }

export default function DienNuocSadtPage() {
  const { loading: sessLoading, can } = useUserSession()
  const [activeTab, setActiveTab] = useState<TabId>('tong-quan')
  const [month, setMonth]         = useState(curMonth())

  const [readings, setReadings]   = useState<MeterReading[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [usages, setUsages]       = useState<CustomerUsage[]>([])
  const [payments, setPayments]   = useState<Payment[]>([])
  const [dataLoading, setDataLoading] = useState(true)

  useEffect(() => {
    const u1 = subscribeMeterReadings(setReadings)
    const u2 = subscribeCustomers(rows => { setCustomers(rows); setDataLoading(false) })
    const u3 = subscribeUsage(setUsages)
    const u4 = subscribePayments(setPayments)
    return () => { u1(); u2(); u3(); u4() }
  }, [])

  if (sessLoading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Đang tải...</div>
  }
  if (!can('m:dien-nuoc')) {
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
          --navy-dark:#0D1F33; --navy:#1C3557; --navy2:#2A4D7A; --navy3:#3E6E9F;
          --gold:#D4A64A; --gold2:#B08A3E;
          --bg:#FAF8F3; --surface:#fff; --surf2:#EEF3FA;
          --border:#E5E0D8; --border2:#D0CCC4; --border3:#D0DCE8;
          --txt:#1F2430; --txt2:#3D3D3D; --muted:#6B7280; --muted2:#9CA3AF;
          --green:#1F6B3D; --greenbg:#EAF6EE;
          --red:#8C1F1F; --redbg:#FDECEC;
          --amber:#8A5A12; --amberbg:#FFF4E0;
          --r:14px; --rm:10px; --rs:6px;
          --sh:0 1px 3px rgba(13,31,51,.06),0 4px 14px rgba(13,31,51,.07);
        }
        .prj-wrap { font-family:'Be Vietnam Pro',sans-serif; font-size:13px; color:var(--txt); }
        .prj-main { flex:1; display:flex; flex-direction:column; overflow-y:auto; overflow-x:hidden; }
        .prj-topbar { background:linear-gradient(90deg,#FAF8F3 0%,#FFFFFF 60%); border-bottom:1px solid var(--border); padding:0 24px; height:52px; display:flex; align-items:center; justify-content:space-between; }
        .prj-page-title { font-size:16px; font-weight:700; color:var(--navy); }
        .prj-content { padding:20px 24px; }
        .breadcrumb { display:flex; align-items:center; gap:6px; font-size:11.5px; color:var(--muted); margin-bottom:4px; }

        .subtab-bar { display:flex; align-items:center; gap:2px; border-bottom:1px solid var(--border); overflow-x:auto; background:var(--surface); padding:0 4px; margin:0 24px; }
        .subtab-bar::-webkit-scrollbar { height:0; }
        .subtab { padding:10px 16px; font-size:12.5px; font-weight:600; color:var(--muted); cursor:pointer; border-bottom:2.5px solid transparent; background:none; border-top:none; border-left:none; border-right:none; font-family:inherit; white-space:nowrap; flex-shrink:0; transition:color .15s; }
        .subtab:hover:not(.active) { color:var(--navy); background:var(--surf2); }
        .subtab.active { color:var(--navy); font-weight:700; border-bottom-color:var(--gold); }

        .sc { background:#fff; border:1px solid #E0E7F0; border-radius:12px; margin-bottom:14px; overflow:hidden; }
        .sc-head { padding:10px 16px; border-bottom:.5px solid #A8C4DE; display:flex; align-items:center; justify-content:space-between; background:#EEF3FA; }
        .sc-title { font-size:11px; font-weight:700; letter-spacing:.07em; color:#4B6A8A; text-transform:uppercase; }
        .sc-body { padding:14px 16px; }

        .ceo-kpi-row { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-bottom:14px; }
        .ceo-kpi { background:var(--surface); border-radius:var(--rm); box-shadow:var(--sh); overflow:hidden; border:1px solid var(--border3); }
        .ceo-kpi-label { display:block; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.07em; padding:8px 14px; background:#EEF3FA; border-bottom:1px solid #D0DCE8; color:#4B6A8A; }
        .ceo-kpi-val   { display:block; font-size:20px; font-weight:800; color:var(--navy); line-height:1.1; padding:10px 14px 0; }
        .ceo-kpi-sub   { display:block; font-size:10.5px; color:var(--muted); padding:3px 14px 12px; }
        .ceo-kpi-green .ceo-kpi-label { background:#EAF6EE; border-color:#BBF7D0; color:#1F6B3D; }
        .ceo-kpi-amber .ceo-kpi-label { background:#FFF4E0; border-color:#FDE68A; color:#8A5A12; }
        .ceo-kpi-red   .ceo-kpi-label { background:#FDECEC; border-color:#FECACA; color:#8C1F1F; }

        .dn-table { width:100%; border-collapse:collapse; }
        .dn-table th { text-align:left; font-size:11px; font-weight:700; color:#4B6A8A; text-transform:uppercase; letter-spacing:.05em; padding:8px 12px; background:#EEF3FA; border-bottom:1px solid #D0DCE8; white-space:nowrap; }
        .dn-table td { padding:9px 12px; font-size:12.5px; border-bottom:1px solid var(--border); }
        .dn-table tr:last-child td { border-bottom:none; }
        .dn-table tr:hover td { background:var(--surf2); }

        .btn-primary { background:var(--navy); color:#fff; border:none; padding:7px 14px; border-radius:var(--rm); font-size:12px; font-weight:600; cursor:pointer; font-family:inherit; }
        .btn-primary:hover { background:var(--navy2); }
        .btn-ghost { background:#fff; border:1px solid #E5E0D8; color:#3D3D3D; padding:6px 12px; border-radius:8px; font-size:11.5px; font-weight:600; cursor:pointer; font-family:inherit; transition:all .15s; }
        .btn-ghost:hover { border-color:var(--navy); background:#EEF3FA; }
        .btn-danger { background:#fff; border:1px solid #FECACA; color:#DC2626; padding:5px 10px; border-radius:7px; font-size:11px; font-weight:600; cursor:pointer; font-family:inherit; }
        .btn-danger:hover { background:#FEF2F2; }

        .badge { font-size:10px; font-weight:700; padding:2px 8px; border-radius:var(--rs); }
        .badge-green { background:var(--greenbg); color:var(--green); }
        .badge-red   { background:var(--redbg);   color:var(--red); }
        .badge-amber { background:var(--amberbg); color:var(--amber); }

        .dn-input { font-family:inherit; font-size:12.5px; color:var(--txt); background:#fff; border:1px solid var(--border2); border-radius:7px; padding:6px 9px; width:100%; }
        .dn-input:focus { border-color:var(--navy3); outline:none; }
        .dn-label { font-size:11px; font-weight:700; color:var(--muted); letter-spacing:.03em; text-transform:uppercase; display:block; margin-bottom:4px; }
      `}</style>

      <div className="prj-main">
        <div className="prj-wrap">
          <div style={{ position: 'sticky', top: 0, zIndex: 50, background: 'linear-gradient(90deg,#FAF8F3 0%,#FFFFFF 60%)', borderBottom: '1px solid #E5E0D8', boxShadow: '0 2px 8px rgba(13,31,51,.07)' }}>
            <div className="prj-topbar">
              <div>
                <div className="breadcrumb"><span>Module</span><span>›</span><span>Điện nước SA.ĐT</span></div>
                <div className="prj-page-title">⚡ Điện nước SA.ĐT</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label className="dn-label" style={{ margin: 0 }}>Tháng:</label>
                <input type="month" className="dn-input" style={{ width: 140 }} value={month} onChange={e => setMonth(e.target.value)} />
              </div>
            </div>
            <div className="subtab-bar">
              {TABS.map(t => (
                <button key={t.id} className={`subtab${activeTab === t.id ? ' active' : ''}`} onClick={() => setActiveTab(t.id)}>{t.label}</button>
              ))}
            </div>
          </div>

          <div className="prj-content">
            {dataLoading ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Đang tải dữ liệu...</div>
            ) : (
              <>
                {activeTab === 'tong-quan'   && <TabTongQuan readings={readings} customers={customers} usages={usages} payments={payments} month={month} />}
                {activeTab === 'nhap-chi-so' && <TabNhapChiSo readings={readings} customers={customers} usages={usages} month={month} />}
                {activeTab === 'khach-hang'  && <TabKhachHang customers={customers} />}
                {activeTab === 'cong-no'     && <TabCongNo readings={readings} customers={customers} usages={usages} payments={payments} month={month} />}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
