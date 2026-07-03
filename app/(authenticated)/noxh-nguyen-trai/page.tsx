'use client'
import { useState, useEffect } from 'react'
import { useUserSession } from '@/contexts/user-session'
import { fetchNoxhTable } from '@/lib/noxhData'
import { noxhNguyenTrai } from './_lib/seed'
import { DetailTab, DETAIL_TABS, Project } from './_lib/types'
import { TabCEO } from './_tabs/TabCEO'
import { TabPhapLy } from './_tabs/TabPhapLy'
import { TabTaiChinh } from './_tabs/TabTaiChinh'
import { TabThiCong } from './_tabs/TabThiCong'
import { TabTienDo } from './_tabs/TabTienDo'
import { TabBanHang } from './_tabs/TabBanHang'
import { TabKeToan } from './_tabs/TabKeToan'
import { TabChungTu } from './_tabs/TabChungTu'

export default function NoxhNguyenTraiPage() {
  const { loading, can } = useUserSession()
  const [activeTab, setActiveTab] = useState<DetailTab>('ceo')
  const [donVi, setDonVi] = useState<'ty'|'trieu'|'dong'>('ty')

  // ── Live overlay từ NOXH_NT_Thong_Tin (diện tích / tổng vốn / khởi công / hoàn thành) ──
  type LiveOverlay = { area?:string; cap?:number; start?:string; end?:string }
  const [live, setLive] = useState<LiveOverlay>({})

  useEffect(()=>{
    fetchNoxhTable('NOXH_NT_Thong_Tin').then(({data})=>{
      if(!data) return
      const byStt=(n:number)=>data.find((r:any)=>Number(r.stt)===n)
      const dt=byStt(1); const tv=byStt(2); const kc=byStt(3); const ht=byStt(4)
      const patch: LiveOverlay = {}
      if(dt && dt.thong_so_num) patch.area=`${Number(dt.thong_so_num).toLocaleString('vi-VN')} m²`
      else if(dt?.thong_so_text) patch.area=dt.thong_so_text
      if(tv?.thong_so_num) patch.cap=Number(tv.thong_so_num)/1e9
      if(kc?.thong_so_text) patch.start=kc.thong_so_text
      if(ht?.thong_so_text) patch.end=ht.thong_so_text
      setLive(patch)
    })
  },[])

  const project: Project = {
    ...noxhNguyenTrai,
    area: live.area ?? noxhNguyenTrai.area,
    totalCap: live.cap!=null ? `${Math.round(live.cap)} tỷ` : noxhNguyenTrai.totalCap,
    totalCapNum: live.cap ?? noxhNguyenTrai.totalCapNum,
    estStart: live.start ?? noxhNguyenTrai.estStart,
    estEnd: live.end ?? noxhNguyenTrai.estEnd,
  }

  if (loading) {
    return <div style={{padding:40,textAlign:'center',color:'#9CA3AF',fontSize:13}}>Đang tải...</div>
  }

  if (!can('m:noxh')) {
    return (
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'60px 20px',gap:12}}>
        <div style={{fontSize:40}}>🔒</div>
        <div style={{fontSize:16,fontWeight:700,color:'#1C3557'}}>Không có quyền truy cập</div>
        <div style={{fontSize:13,color:'#9CA3AF',textAlign:'center'}}>Module này được giới hạn theo phân quyền. Liên hệ quản trị viên.</div>
      </div>
    )
  }

  return (
    <>
      <style>{`
        /* ── tokens ─────────────────────────────────── */
        :root {
          --navy-dark:#0D1F33; --navy:#1C3557; --navy2:#2A4D7A; --navy3:#3E6E9F;
          --gold:#D4A64A; --gold2:#B08A3E; --gold-lt:#F0C870;
          --bg:#FAF8F3; --surface:#fff; --surf2:#EEF3FA; --surf3:#F5EDDC;
          --border:#E5E0D8; --border2:#D0CCC4; --border3:#D0DCE8;
          --txt:#1F2430; --txt2:#3D3D3D; --muted:#6B7280; --muted2:#9CA3AF;
          --green:#1F6B3D; --greenbg:#EAF6EE;
          --red:#8C1F1F; --redbg:#FDECEC;
          --amber:#8A5A12; --amberbg:#FFF4E0;
          --r:14px; --rm:10px; --rs:6px;
          --sh:0 1px 3px rgba(13,31,51,.06),0 4px 14px rgba(13,31,51,.07);
          --sh2:0 2px 8px rgba(13,31,51,.05),0 8px 28px rgba(13,31,51,.11);
        }

        /* ── layout ─────────────────────────────────── */
        .prj-wrap { font-family:'Be Vietnam Pro',sans-serif; font-size:13px; color:var(--txt); }
        .prj-topbar { background:linear-gradient(90deg,#FAF8F3 0%,#FFFFFF 60%); border-bottom:1px solid var(--border); padding:0 24px; height:52px; display:flex; align-items:center; justify-content:space-between; position:sticky; top:0; z-index:50; box-shadow:0 1px 4px rgba(13,31,51,.06); }
        .prj-page-title { font-size:16px; font-weight:700; color:var(--navy); }
        .prj-page-sub   { font-size:11.5px; color:var(--muted); margin-top:1px; }
        .prj-topbar-right { display:flex; align-items:center; gap:10px; }
        .prj-content { padding:20px 24px; }

        /* ── buttons ─────────────────────────────────── */
        .btn-primary { background:var(--navy); color:#fff; border:none; padding:7px 14px; border-radius:var(--rm); font-size:12px; font-weight:600; cursor:pointer; font-family:inherit; display:flex; align-items:center; gap:5px; }
        .btn-primary:hover { background:var(--navy2); }
        .btn-gold    { background:var(--gold); color:var(--navy); border:none; padding:7px 14px; border-radius:var(--rm); font-size:12px; font-weight:700; cursor:pointer; font-family:inherit; display:flex; align-items:center; gap:5px; }
        .btn-ghost   { background:#fff; border:1px solid #E5E0D8; color:#3D3D3D; padding:6px 14px; border-radius:8px; font-size:11px; font-weight:600; cursor:pointer; font-family:inherit; display:flex; align-items:center; gap:5px; transition:all .15s; }
        .btn-ghost:hover { border-color:var(--navy); background:#EEF3FA; }
        .btn-detail  { background:none; border:1.5px solid var(--gold); color:var(--gold2); padding:4px 10px; border-radius:var(--rs); font-size:11px; font-weight:700; cursor:pointer; font-family:inherit; }
        .btn-detail:hover { background:var(--gold); color:var(--navy); }

        /* ── badges ──────────────────────────────────── */
        .badge         { font-size:10px; font-weight:700; padding:2px 8px; border-radius:var(--rs); }
        .badge-active  { background:var(--amberbg); color:var(--amber); }
        .badge-upcoming{ background:var(--surf2);   color:var(--navy2); }
        .badge-done    { background:var(--greenbg); color:var(--green); }
        .badge-cho-duyet { background:#FFF4E0; color:#8A5A12; border-radius:5px; padding:2px 7px; font-size:10px; font-weight:700; }
        .badge-da-gn     { background:#EAF6EE; color:#1F6B3D; border-radius:5px; padding:2px 7px; font-size:10px; font-weight:700; }
        .badge-neu       { background:#EEF3FA; color:#4B6A8A; border-radius:5px; padding:2px 7px; font-size:10px; font-weight:700; }

        /* ── breadcrumb ──────────────────────────────── */
        .breadcrumb { display:flex; align-items:center; gap:6px; font-size:11.5px; color:var(--muted); margin-bottom:4px; }
        .breadcrumb button { background:none; border:none; color:var(--navy2); font-weight:500; cursor:pointer; font-family:inherit; font-size:11.5px; padding:0; }
        .breadcrumb button:hover { color:var(--navy); }

        /* ── detail tabs ─────────────────────────────── */
        .subtab-bar { display:flex; align-items:center; gap:2px; border-bottom:1px solid var(--border); overflow-x:auto; margin-bottom:20px; background:var(--surface); padding:0 4px; }
        .subtab-bar::-webkit-scrollbar { height:0; }
        .subtab { padding:10px 16px; font-size:12.5px; font-weight:600; color:var(--muted); cursor:pointer; border-bottom:2.5px solid transparent; background:none; border-top:none; border-left:none; border-right:none; font-family:inherit; white-space:nowrap; flex-shrink:0; transition:color .15s; }
        .subtab:hover:not(.active) { color:var(--navy); background:var(--surf2); }
        .subtab.active { color:var(--navy); font-weight:700; border-bottom-color:var(--gold); }

        /* ── sc card ─────────────────────────────────── */
        .sc { background:#fff; border:1px solid #E0E7F0; border-radius:12px; margin-bottom:14px; overflow:hidden; }
        .sc-head { padding:10px 16px; border-bottom:.5px solid #A8C4DE; display:flex; align-items:center; justify-content:space-between; background:#EEF3FA; }
        .sc-title { font-size:11px; font-weight:700; letter-spacing:.07em; color:#4B6A8A; text-transform:uppercase; }
        .sc-body { padding:14px 16px; }

        /* ── ceo layout grids ────────────────────────── */
        .ceo-kpi-row { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-bottom:14px; }
        .ceo-kpi { background:var(--surface); border-radius:var(--rm); box-shadow:var(--sh); overflow:hidden; border:1px solid var(--border3); margin-bottom:0; }
        .ceo-kpi-label { display:block; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.07em; padding:8px 14px; background:#EEF3FA; border-bottom:1px solid #D0DCE8; color:#4B6A8A; }
        .ceo-kpi-val   { display:block; font-size:22px; font-weight:800; color:var(--navy); line-height:1.1; padding:10px 14px 0; }
        .ceo-kpi-sub   { display:block; font-size:10.5px; color:var(--muted); padding:3px 14px 12px; }
        .ceo-kpi-navy  .ceo-kpi-label { background:#EEF3FA; border-color:#D0DCE8; color:#4B6A8A; }
        .ceo-kpi-green .ceo-kpi-label { background:#EAF6EE; border-color:#BBF7D0; color:#1F6B3D; }
        .ceo-kpi-amber .ceo-kpi-label { background:#FFF4E0; border-color:#FDE68A; color:#8A5A12; }
        .ceo-kpi-red   .ceo-kpi-label { background:#FDECEC; border-color:#FECACA; color:#8C1F1F; }
        .ceo-row2 { display:grid; grid-template-columns:1fr 320px; gap:14px; margin-bottom:14px; }
        .ceo-row3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:14px; margin-bottom:14px; }
        .ceo-row4 { display:grid; grid-template-columns:1fr 1fr; gap:14px; }

        /* ── thi cong ────────────────────────────────── */
        .tc-item:last-child { margin-bottom:0; }
        .tc-row { display:flex; align-items:center; justify-content:space-between; margin-bottom:4px; }
        .tc-name { font-size:12px; color:var(--txt2); font-weight:500; }
        .tc-bar  { height:6px; background:var(--surf2); border-radius:3px; overflow:hidden; }
        .tc-fill { height:100%; border-radius:3px; transition:width .6s ease; }
        .fill-green { background:var(--green); }
        .fill-navy  { background:var(--navy); }
        .fill-red   { background:#DC2626; }

        /* ── gop von ─────────────────────────────────── */
        .gv-item { padding:10px 0; border-bottom:1px solid var(--border); }
        .gv-item:last-child { border-bottom:none; padding-bottom:0; }
        .gv-name { font-size:12px; font-weight:700; color:var(--txt); margin-bottom:4px; }
        .gv-pct-row { display:flex; align-items:center; justify-content:space-between; margin-bottom:4px; }
        .gv-bar  { height:5px; background:var(--surf2); border-radius:3px; overflow:hidden; margin-bottom:5px; }
        .gv-fill { height:100%; border-radius:3px; background:var(--gold); }
        .gv-nums { display:flex; gap:12px; font-size:11px; color:var(--muted); }
        .gv-nums strong { color:var(--txt2); font-weight:700; }

        /* ── risks ───────────────────────────────────── */
        .risk-item { display:flex; gap:10px; padding:9px 0; border-bottom:1px dashed var(--border); }
        .risk-item:last-child { border-bottom:none; }
        .risk-num { width:22px; height:22px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; flex-shrink:0; }
        .risk-high { background:var(--redbg);   color:var(--red); }
        .risk-mid  { background:var(--amberbg); color:var(--amber); }
        .risk-ok   { background:var(--greenbg); color:var(--green); }
        .risk-content { flex:1; }
        .risk-title { font-size:12px; font-weight:700; color:var(--txt); margin-bottom:1px; }
        .risk-desc  { font-size:11px; color:var(--muted); }
        .risk-tag   { font-size:10px; font-weight:700; padding:2px 6px; border-radius:4px; flex-shrink:0; align-self:center; }
        .tag-urgent { background:var(--redbg);   color:var(--red); }
        .tag-watch  { background:var(--amberbg); color:var(--amber); }
        .tag-ok     { background:var(--greenbg); color:var(--green); }

        /* ── alerts / tasks ──────────────────────────── */
        .alert-item-amber { background:var(--amberbg); border-left:3px solid var(--amber); border-radius:var(--rs); padding:8px 12px; margin-bottom:6px; font-size:12px; color:var(--amber); font-weight:500; }
        .task-item { display:flex; align-items:flex-start; gap:10px; padding:9px 0; border-bottom:1px solid var(--border); }
        .task-item:last-child { border-bottom:none; }
        .task-content { flex:1; }
        .task-title  { font-size:12.5px; font-weight:600; color:var(--txt); margin-bottom:2px; }
        .task-sub    { font-size:11px; color:var(--muted); }
        .task-date   { font-size:11px; font-weight:600; color:var(--muted); flex-shrink:0; }
        .task-urgent { color:var(--red) !important; }
        .task-dot    { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
        .dot-red   { background:#DC2626; }
        .dot-amber { background:var(--gold); }
        .dot-green { background:var(--green); }

        /* ── legal table ─────────────────────────────── */
        .legal-table { width:100%; border-collapse:collapse; }
        .legal-table th { text-align:left; font-size:11px; font-weight:700; color:#4B6A8A; text-transform:uppercase; letter-spacing:.07em; padding:9px 14px; background:#EEF3FA; border-bottom:1px solid #D0DCE8; white-space:nowrap; }
        .legal-table th:first-child { border-radius:6px 0 0 0; }
        .legal-table th:last-child  { border-radius:0 6px 0 0; }
        .legal-table td { padding:10px 14px; font-size:12.5px; border-bottom:1px solid var(--border); }
        .legal-table tr:last-child td { border-bottom:none; }
        .legal-table tr:hover td { background:var(--surf2); }

        /* ── finance tab ─────────────────────────────── */
        .finance-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:16px; }
        .fin-card { background:var(--surface); border-radius:var(--r); box-shadow:var(--sh); padding:16px; border-top:3px solid var(--navy); }
        .fin-card-green { border-top-color:var(--green); }
        .fin-card-red   { border-top-color:#DC2626; }
        .fin-label { font-size:10.5px; color:var(--muted); font-weight:600; text-transform:uppercase; letter-spacing:.8px; margin-bottom:6px; }
        .fin-val   { font-size:20px; font-weight:700; color:var(--navy); }

        /* ── phase timeline ──────────────────────────── */
        .phase-row { display:flex; gap:14px; }
        .phase-connector { width:36px; display:flex; flex-direction:column; align-items:center; flex-shrink:0; }
        .phase-dot { width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:700; flex-shrink:0; }
        .phase-dot-done    { background:var(--green); color:#fff; }
        .phase-dot-active  { background:var(--navy);  color:#fff; }
        .phase-dot-pending { background:var(--surf2); color:var(--muted); }
        .phase-line { width:2px; flex:1; background:var(--border); margin-top:4px; min-height:20px; }
        .phase-content { flex:1; padding-bottom:20px; }
        .phase-name { font-size:13px; font-weight:700; color:var(--txt); margin-bottom:4px; }
        .phase-bar-wrap { display:flex; align-items:center; gap:10px; }
        .phase-bar { flex:1; height:6px; background:var(--surf2); border-radius:3px; overflow:hidden; }
        .phase-bar-fill { height:100%; border-radius:3px; }
        .phase-bar-fill-done    { background:var(--green); }
        .phase-bar-fill-active  { background:var(--navy); }
        .phase-bar-fill-pending { background:var(--border2); }
        .phase-pct { font-size:12px; font-weight:700; color:var(--navy); width:34px; text-align:right; }

        /* ── layout shell ── */
        .prj-main  { flex:1; display:flex; flex-direction:column; overflow-y:auto; overflow-x:hidden; }
      `}</style>

      <div className="prj-main">
        <div className="prj-wrap">
          {/* Sticky header: topbar + tabs */}
          <div style={{position:'sticky',top:0,zIndex:50,background:'linear-gradient(90deg,#FAF8F3 0%,#FFFFFF 60%)',borderBottom:'1px solid #E5E0D8',boxShadow:'0 2px 8px rgba(13,31,51,.07)'}}>
            <div className="prj-topbar" style={{borderBottom:'none'}}>
              <div>
                <div className="breadcrumb">
                  <span>Dự án</span>
                  <span>›</span>
                  <span>{project.name}</span>
                </div>
                <div className="prj-page-title">{project.name}</div>
              </div>
              <div className="prj-topbar-right">
                <div style={{display:'flex',alignItems:'center',gap:5,border:'1px solid #D1D9E6',borderRadius:8,overflow:'hidden',background:'#fff'}}>
                  {(['ty','trieu','dong'] as const).map((v,i)=>(
                    <button key={v} onClick={()=>setDonVi(v)} style={{padding:'5px 11px',border:'none',borderRight:i<2?'1px solid #D1D9E6':'none',cursor:'pointer',fontFamily:'inherit',fontSize:11,fontWeight:700,background:donVi===v?'#1C3557':'#fff',color:donVi===v?'#fff':'#6B7280',transition:'all .15s'}}>
                      {v==='ty'?'Tỷ':v==='trieu'?'Triệu':'Đồng'}
                    </button>
                  ))}
                </div>
                <button className="btn-gold">↑ Xuất báo cáo</button>
              </div>
            </div>
            {/* Sub-tabs nằm trong sticky header */}
            <div className="subtab-bar" style={{margin:'0 24px',borderBottom:'none'}}>
              {DETAIL_TABS.map(t=>(
                <button key={t.id} className={`subtab${activeTab===t.id?' active':''}`} onClick={()=>setActiveTab(t.id)}>{t.label}</button>
              ))}
            </div>
          </div>

          <div className="prj-content">
            {activeTab==='ceo'       && <TabCEO      p={project} donVi={donVi}/>}
            {activeTab==='phap-ly'   && <TabPhapLy   p={project} donVi={donVi}/>}
            {activeTab==='tai-chinh' && <TabTaiChinh p={project} donVi={donVi}/>}
            {activeTab==='thi-cong'  && <TabThiCong  p={project} donVi={donVi}/>}
            {activeTab==='tien-do'   && <TabTienDo   p={project} donVi={donVi}/>}
            {activeTab==='ban-hang'  && <TabBanHang  p={project} donVi={donVi}/>}
            {activeTab==='ke-toan'   && <TabKeToan   p={project} donVi={donVi}/>}
            {activeTab==='chung-tu'  && <TabChungTu  sheetId={project.sheetId}/>}
          </div>
        </div>
      </div>
    </>
  )
}
