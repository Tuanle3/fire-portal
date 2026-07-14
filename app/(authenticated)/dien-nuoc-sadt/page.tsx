'use client'
import { useState, useEffect } from 'react'
import { useUserSession } from '@/contexts/user-session'
import { useTopbarInfo } from '@/contexts/topbar-info'
import {
  subscribeMeterReadings, subscribeCustomers, subscribeUsage, subscribePayments, subscribeMeterNames, saveMeterNames,
} from '@/lib/dien-nuoc-store'
import { MeterReading, Customer, CustomerUsage, Payment, MeterId, meterLabel } from '@/lib/dien-nuoc-types'
import { TabTongQuan } from './_tabs/TabTongQuan'
import { TabNhapChiSo } from './_tabs/TabNhapChiSo'
import { TabKhachHang } from './_tabs/TabKhachHang'
import { TabCongNo } from './_tabs/TabCongNo'
import { TabPhiQuanLy } from './_tabs/TabPhiQuanLy'
import { TabPhiKhac } from './_tabs/TabPhiKhac'

type TabId = 'tong-quan' | 'dh1' | 'dh2' | 'nuoc' | 'phi-quan-ly' | 'phi-khac' | 'khach-hang' | 'cong-no'
const METER_TAB: Record<string, MeterId> = { dh1: 1, dh2: 2, nuoc: 3 }

function curMonth() { return new Date().toISOString().slice(0, 7) }

export default function DienNuocSadtPage() {
  const { loading: sessLoading, can, role } = useUserSession()
  const [activeTab, setActiveTab] = useState<TabId>('tong-quan')
  const [month, setMonth]         = useState(curMonth())

  const [readings, setReadings]     = useState<MeterReading[]>([])
  const [customers, setCustomers]   = useState<Customer[]>([])
  const [usages, setUsages]         = useState<CustomerUsage[]>([])
  const [payments, setPayments]     = useState<Payment[]>([])
  const [meterNames, setMeterNames] = useState<Record<number, string>>({})
  const [dataLoading, setDataLoading] = useState(true)

  const canEditMeterName = role === 'admin'
  const setMeterNamesRemote = (id: number, name: string) => saveMeterNames({ ...meterNames, [id]: name })

  // Đưa breadcrumb + tiêu đề (trái) và ô chọn tháng (phải) lên thanh trên cùng chung với Admin/Đăng xuất.
  const { setLeft, setRight } = useTopbarInfo()
  useEffect(() => {
    setLeft(
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', lineHeight: 1.15 }}>
        <div style={{ fontSize: 11, color: '#6B7280' }}>Module › Điện nước SA.ĐT</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#1C3557' }}>⚡ Điện nước SA.ĐT</div>
      </div>
    )
    setRight(
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', letterSpacing: '.03em', textTransform: 'uppercase' }}>Tháng:</span>
        <input type="month" value={month} onChange={e => setMonth(e.target.value)}
          style={{ fontFamily: 'inherit', fontSize: 12.5, color: '#1F2430', background: '#fff', border: '1px solid #D0CCC4', borderRadius: 7, padding: '5px 8px', width: 140 }} />
      </span>
    )
  }, [month, setLeft, setRight])
  useEffect(() => () => { setLeft(null); setRight(null) }, [setLeft, setRight])

  useEffect(() => {
    const u1 = subscribeMeterReadings(setReadings)
    const u2 = subscribeCustomers(rows => { setCustomers(rows); setDataLoading(false) })
    const u3 = subscribeUsage(setUsages)
    const u4 = subscribePayments(setPayments)
    const u5 = subscribeMeterNames(setMeterNames)
    return () => { u1(); u2(); u3(); u4(); u5() }
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

        /* Bảng 1 (nhập chỉ số) bên trái 30% + Bảng 2 (theo tháng) bên phải 70% */
        .dn-split { display:flex; gap:18px; align-items:stretch; }
        .dn-split-left  { flex:0 0 30%; max-width:30%; min-width:0; display:flex; flex-direction:column; }
        .dn-split-right { flex:1 1 70%; min-width:0; overflow-x:auto; display:flex; flex-direction:column; }
        /* Bảng nhập/đối chiếu cao bằng cột: hàng đệm co giãn đẩy khối tổng xuống đáy */
        .dn-fill { flex:1 1 auto; }
        .dn-spacer td { height:100%; padding:0 !important; border:none !important; background:transparent !important; }
        .dn-spacer:hover td { background:transparent !important; }
        .dn-sum-top td { border-top:2px solid var(--navy) !important; }
        .dn-col-title { font-size:11px; font-weight:700; color:var(--muted); text-transform:uppercase; letter-spacing:.03em; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center; min-height:26px; }
        .dn-empty { font-size:12px; color:var(--muted2); font-style:italic; padding:16px 4px; }
        /* Cho phép bảng rộng cuộn ngang trong khung, tránh vỡ layout / tràn trang */
        .dn-scroll { overflow-x:auto; -webkit-overflow-scrolling:touch; }
        /* Lưới form khách hàng tự co theo bề rộng (không cần media query) */
        .dn-form-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:10px; margin-bottom:10px; }

        /* ── Sticky tab bar: ~42px cao ── */
        /* ── Sticky card header: thêm ~48px ── */
        /* Thead dính: các th trong thead luôn hiện khi cuộn dọc */
        .dn-table thead th { position:sticky; top:42px; z-index:5; }
        /* Trong card có sc-head sticky → thead lùi thêm độ cao sc-head */
        .sc--sticky .dn-table thead th { top:90px; }
        /* Góc trái trên (sticky cả ngang lẫn dọc) cần z-index cao hơn */
        .dn-table thead th.dn-sticky-col { z-index:8; }

        @media (max-width: 1100px) {
          /* Xếp dọc 2 bảng: tắt co giãn + bỏ hàng đệm (chỉ dùng khi 2 cột nằm ngang) */
          .dn-split { flex-direction:column; align-items:stretch; }
          .dn-split-left, .dn-split-right { flex:1 1 auto; width:100%; max-width:100%; }
          .dn-fill { flex:0 0 auto; }
          .dn-spacer { display:none; }
          .ceo-kpi-row { grid-template-columns:repeat(2,1fr); }
        }
        @media (max-width: 1024px) {
          /* iPad: thu nhỏ padding bảng, giảm font bảng */
          .prj-content { padding:14px 16px; }
          .dn-table th { font-size:10.5px; padding:7px 10px; }
          .dn-table td { padding:8px 10px; font-size:12px; }
          .dn-sticky-input { min-width:260px; }
          .sc-head { flex-wrap:wrap; gap:6px; }
          .ceo-kpi-row { grid-template-columns:repeat(2,1fr); }
        }
        @media (max-width: 640px) {
          .prj-content { padding:10px 8px; }
          .subtab-bar { margin:0 4px; }
          .subtab { padding:8px 10px; font-size:11.5px; }
          .sc-body { padding:10px 8px; }
          .sc-head { padding:8px 10px; flex-wrap:wrap; gap:6px; }
          .sc-title { font-size:10px; }
          /* Điện thoại: thu nhỏ cột đầu nhưng vẫn giữ sticky để dễ đối chiếu */
          .dn-sticky-col:first-child, .dn-table th.dn-sticky-col:first-child { min-width:90px; }
          .dn-sticky-input { left:90px; min-width:220px; }
          .dn-sticky-amt { left:310px; min-width:80px; }
          .dn-sticky-btn { left:390px; border-right:none !important; min-width:40px; }
          .dn-table th { font-size:10px; padding:6px 8px; }
          .dn-table td { padding:7px 8px; font-size:11.5px; }
          /* Thead: bù thêm chiều cao khi sc-head wrap nhiều dòng hơn */
          .sc--sticky .dn-table thead th { top:120px; }
        }

        /* Header của card dính lại khi cuộn (ngay dưới tab bar ~42px), tiện bấm nút */
        .sc--sticky { overflow:visible; }
        .sc--sticky .sc-head { position:sticky; top:42px; z-index:30; border-radius:12px 12px 0 0; }

        /* Bảng sản lượng khách hàng: cuộn ngang, cột nhập liệu dính bên trái */
        .dn-usage-wrap { overflow-x:auto; background:#F8FAFC; border:1px solid var(--border3); border-radius:10px; }
        .dn-sticky-col { position:sticky; z-index:2; background:#F8FAFC; }
        .dn-table th.dn-sticky-col { background:#EEF3FA; z-index:6; }
        .dn-sticky-col:first-child, .dn-table th.dn-sticky-col:first-child { left:0; min-width:120px; }
        .dn-sticky-input { left:120px; min-width:320px; }
        .dn-sticky-amt { left:440px; min-width:90px; }
        .dn-sticky-btn { left:530px; min-width:44px; border-right:2px solid var(--border3) !important; }
        .dn-section-hdr th { background:#DDE6F0 !important; color:var(--navy) !important; font-weight:800 !important; text-transform:uppercase; border-bottom:2px solid var(--border3) !important; }

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
            <div className="subtab-bar">
              {([
                { id: 'tong-quan' as TabId, label: 'Tổng quan' },
                { id: 'dh1' as TabId, label: meterLabel(meterNames, 1) },
                { id: 'dh2' as TabId, label: meterLabel(meterNames, 2) },
                { id: 'nuoc' as TabId, label: meterLabel(meterNames, 3) },
                { id: 'phi-quan-ly' as TabId, label: 'Phí quản lý' },
                { id: 'phi-khac' as TabId, label: 'Phí khác' },
                { id: 'khach-hang' as TabId, label: 'Khách hàng' },
                { id: 'cong-no' as TabId, label: 'Công nợ & Thu tiền' },
              ]).map(t => (
                <button key={t.id} className={`subtab${activeTab === t.id ? ' active' : ''}`} onClick={() => setActiveTab(t.id)}>{t.label}</button>
              ))}
            </div>
          </div>

          <div className="prj-content">
            {dataLoading ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Đang tải dữ liệu...</div>
            ) : (
              <>
                {activeTab === 'tong-quan' && <TabTongQuan readings={readings} customers={customers} usages={usages} payments={payments} month={month} meterNames={meterNames} />}
                {METER_TAB[activeTab] && <TabNhapChiSo meterId={METER_TAB[activeTab]} readings={readings} customers={customers} usages={usages} month={month} meterNames={meterNames} canEditMeterName={canEditMeterName} onSaveMeterNames={setMeterNamesRemote} />}
                {activeTab === 'phi-quan-ly' && <TabPhiQuanLy customers={customers} month={month} />}
                {activeTab === 'phi-khac' && <TabPhiKhac customers={customers} month={month} />}
                {activeTab === 'khach-hang' && <TabKhachHang customers={customers} meterNames={meterNames} month={month} />}
                {activeTab === 'cong-no' && <TabCongNo readings={readings} customers={customers} usages={usages} payments={payments} month={month} meterNames={meterNames} />}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
