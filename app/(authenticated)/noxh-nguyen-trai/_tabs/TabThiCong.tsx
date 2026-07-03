'use client'
import { useState, useEffect } from 'react'
import { fetchNoxhTable } from '@/lib/noxhData'
import { Project } from '../_lib/types'

export function TabThiCong({ p, donVi='ty' }: { p: Project; donVi?: 'ty'|'trieu'|'dong' }) {
  const gv=(r:any,...ks:string[])=>{for(const k of ks){if(r[k]!==undefined&&r[k]!==null&&r[k]!=='')return r[k]};return null}

  // === NOXH_NT_Thi_Cong — dùng cho tab "Hạng mục thi công" ===
  const getMaTC    =(r:any)=>gv(r,'ma_goi_thau','ma_hang_muc','stt')?? '–'
  const getTenTC   =(r:any)=>gv(r,'ten_hang_muc','ten_goi_thau')?? '–'
  const getNhomTC  =(r:any)=>gv(r,'nhom_hang_muc')?? '–'
  const getNhaTC   =(r:any)=>gv(r,'nha_thau_phu_trach')?? '–'
  const getTDTC    =(r:any)=>{
    const raw=gv(r,'tien_do_percent')
    if(raw!==null&&raw!==undefined){const v=Number(raw);return v<=1&&v>0?Math.round(v*100):Math.round(v)}
    const tt=String(gv(r,'trang_thai')??'')
    if(tt.startsWith('Hoàn')) return 100
    return 0
  }
  const getTreTC   =(r:any)=>Number(gv(r,'so_ngay_tre')??0)
  const getTTTC    =(r:any)=>gv(r,'trang_thai')?? '–'
  const getBDTC    =(r:any)=>gv(r,'ngay_bat_dau_kh')?? '–'
  const getHTKHTC  =(r:any)=>gv(r,'ngay_hoan_thanh_kh')?? '–'
  const getKLKHTC  =(r:any)=>Number(gv(r,'khoi_luong_kh')??0)
  const getKLThucTC=(r:any)=>Number(gv(r,'khoi_luong_thuc_te')??0)

  // === NOXH_NT_Goi_Thau — dùng cho tab "Gói thầu / Hợp đồng" ===
  const getMaGT    =(r:any)=>gv(r,'ma_goi_thau','stt')?? '–'
  const getTenGT   =(r:any)=>gv(r,'ten_goi_thau')?? '–'
  const getNhaGT   =(r:any)=>gv(r,'nha_thau_trung_thau')?? '–'
  const getTTGT    =(r:any)=>gv(r,'trang_thai_goi_thau')?? '–'
  const getGTHD    =(r:any)=>{const n=Number(gv(r,'gia_tri_hd_ky')??0);return n>=1e9?n/1e9:n>=1e6?n/1e9:n}
  const getBDGT    =(r:any)=>gv(r,'ngay_ky_hd')?? '–'
  const getHTGT    =(r:any)=>gv(r,'ngay_ht_theo_hd')?? '–'
  const getTDGT    =(r:any)=>{const tt=String(getTTGT(r));return tt.startsWith('Hoàn')?100:tt.includes('Đang')?50:0}

  // === NOXH_NT_Nha_Thau ===
  const getNTMaX   =(r:any)=>gv(r,'ma_nha_thau','stt')?? '–'
  const getNTTenX  =(r:any)=>gv(r,'ten_cong_ty')?? '–'
  const getNTLoaiX =(r:any)=>gv(r,'loai_cong_viec','hang_nha_thau')?? '–'
  const getNTTTX   =(r:any)=>gv(r,'trang_thai_hop_tac')?? '–'

  const isTreHM  =(r:any)=>getTreTC(r)>0||String(getTTTC(r)).includes('Trễ')||String(getTTTC(r)).includes('trễ')
  const isHoanHM =(r:any)=>String(getTTTC(r)).startsWith('Hoàn')
  const isDangHM =(r:any)=>String(getTTTC(r)).includes('Đang')||String(getTTTC(r)).includes('đang')
  const isChuaHM =(r:any)=>String(getTTTC(r)).includes('Chưa')||String(getTTTC(r)).includes('chưa')

  const [goiThau, setGoiThau]   = useState<any[]>([])
  const [thiCong, setThiCong]   = useState<any[]>([])
  const [nhaThaus,setNhaThaus]  = useState<any[]>([])
  const [loadTC,  setLoadTC]    = useState(true)
  const [subTC,   setSubTC]     = useState<'hang-muc'|'goi-thau'|'nha-thau'>('hang-muc')
  const [searchTC,setSearchTC]  = useState('')
  const [fNhom,   setFNhom]     = useState('Tất cả nhóm')
  const [fTT,     setFTT]       = useState('Tất cả')

  useEffect(()=>{
    Promise.all([fetchNoxhTable(`${p.prefix}_Goi_Thau`),fetchNoxhTable(`${p.prefix}_Thi_Cong`),fetchNoxhTable(`${p.prefix}_Nha_Thau`)])
      .then(([r1,r2,r3])=>{
        const gt=r1.data??[], tc=r2.data??[], nt=r3.data??[]
        setGoiThau(gt);setThiCong(tc);setNhaThaus(nt);setLoadTC(false)
      })
  },[])

  // thiCong → tab "Hạng mục thi công"; goiThau → tab "Gói thầu/HĐ"
  const tre=thiCong.filter(isTreHM)
  const hoanthanh=thiCong.filter(r=>!isTreHM(r)&&isHoanHM(r))
  const dangtc=thiCong.filter(r=>!isTreHM(r)&&!isHoanHM(r)&&isDangHM(r))
  const chuatk=thiCong.filter(r=>!isTreHM(r)&&!isHoanHM(r)&&!isDangHM(r)&&isChuaHM(r))
  const tongGT=goiThau.reduce((s,r)=>s+getGTHD(r),0)
  const avgTD=thiCong.length?Math.round(thiCong.reduce((s,r)=>s+getTDTC(r),0)/thiCong.length):0

  // Hàm format tiền theo đơn vị đang chọn (input luôn là tỷ)
  const fmt=(n:number,decimals=0)=>n.toLocaleString('vi-VN',{minimumFractionDigits:decimals,maximumFractionDigits:decimals})
  const fmtTien=(tyVal:number)=>{
    if(!tyVal||tyVal===0) return '–'
    if(donVi==='ty') return `${fmt(tyVal,3)} tỷ`
    if(donVi==='trieu') return `${fmt(tyVal*1000,0)} triệu`
    return `${fmt(tyVal*1e9,0)} đ`
  }
  const dvLabel=donVi==='ty'?'tỷ':donVi==='trieu'?'triệu đồng':'đồng'

  // Nhóm hạng mục từ NOXH_NT_Thi_Cong
  const grpData=(()=>{
    const map:Record<string,{ten:string;total:number;tre:number;td:number[]}>={}
    thiCong.forEach(r=>{const n=getNhomTC(r)||'–';if(!map[n])map[n]={ten:n,total:0,tre:0,td:[]};map[n].total++;if(isTreHM(r))map[n].tre++;map[n].td.push(getTDTC(r))})
    return Object.values(map).map(g=>({'nhom':g.ten,'so_hm':g.total,'so_tre':g.tre,'tien_do':g.td.length?Math.round(g.td.reduce((a,b)=>a+b,0)/g.td.length):0}))
  })()

  const contractors=nhaThaus
  const nhomList=['Tất cả nhóm',...Array.from(new Set(thiCong.map(r=>getNhomTC(r)).filter(n=>n&&n!=='–')))]
  const ttList=['Tất cả',...Array.from(new Set(thiCong.map(r=>getTTTC(r)).filter(t=>t&&t!=='–')))]
  const filtered=thiCong.filter(r=>{
    const ms=searchTC===''||getMaTC(r).toLowerCase().includes(searchTC.toLowerCase())||getTenTC(r).toLowerCase().includes(searchTC.toLowerCase())||getNhaTC(r).toLowerCase().includes(searchTC.toLowerCase())
    return ms&&(fNhom==='Tất cả nhóm'||getNhomTC(r)===fNhom)&&(fTT==='Tất cả'||getTTTC(r)===fTT)
  }).sort((a,b)=>getTreTC(b)-getTreTC(a))

  const NHOM_CLR:Record<string,string>={'CP khác':'#6366F1','Tư vấn ĐTXD':'#0EA5E9','Thiết kế thi công':'#F59E0B','Thi công chính':'#16A34A','Nhà thầu phụ':'#8B5CF6'}
  const nhomClr=(n:string)=>NHOM_CLR[n]??'#9CA3AF'

  return (
    <div>
      <style>{`
        .tc3-kpi4x{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:10px}
        .tc3-kpi5x{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:10px}
        .tc3-cardx{background:#fff;border-radius:12px;overflow:hidden;border:1px solid #E0E7F0}
        .tc3-chx{padding:9px 14px;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;border-bottom:1px solid}
        .tc3-cbx{padding:10px 14px 12px}
        .tc3-valx{font-size:24px;font-weight:800;line-height:1.1}
        .tc3-subx{font-size:11px;color:#6B7280;margin-top:3px}
        .tc3-statx{background:#F8FAFC;border:1px solid #E0E7F0;border-radius:10px;padding:10px 14px}
        .tc3-row2x{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
        .tc3-panelx{background:#fff;border:1px solid #E0E7F0;border-radius:12px;overflow:hidden;margin-bottom:12px}
        .tc3-phx{padding:10px 14px;background:#EEF3FA;border-bottom:.5px solid #D0DCE8;font-size:11px;font-weight:700;letter-spacing:.07em;color:#4B6A8A;text-transform:uppercase;display:flex;align-items:center;justify-content:space-between}
        .tc3-pbx{padding:12px 14px}
        .tc3-grpx{padding:8px 0;border-bottom:.5px solid #F3F6FB}.tc3-grpx:last-child{border-bottom:none}
        .tc3-stbx{display:flex;gap:2px;border-bottom:1px solid #E0E7F0;margin-bottom:12px}
        .tc3-stabx{padding:9px 16px;font-size:12px;font-weight:600;color:#6B7280;cursor:pointer;border-bottom:2px solid transparent;background:none;border-top:none;border-left:none;border-right:none;font-family:inherit;white-space:nowrap}
        .tc3-stabx.ax{color:#1C3557;border-bottom-color:#1C3557;font-weight:700}
        .tc3-stabx:hover:not(.ax){color:#1C3557;background:#F8FAFC}
        .tc3-srcx{flex:1;max-width:320px;padding:7px 12px;border:1px solid #E0E7F0;border-radius:8px;font-size:12px;font-family:inherit;outline:none}
        .tc3-selx{padding:6px 10px;border:1px solid #E0E7F0;border-radius:8px;font-size:12px;font-family:inherit;background:#fff;cursor:pointer}
        .nbx{display:inline-block;padding:2px 8px;border-radius:5px;font-size:10px;font-weight:700}
        .xttre{background:#FDECEC;color:#DC2626;border-radius:5px;padding:2px 7px;font-size:10px;font-weight:700}
        .xthoan{background:#EAF6EE;color:#1F6B3D;border-radius:5px;padding:2px 7px;font-size:10px;font-weight:700}
        .xtdang{background:#EEF3FA;color:#1C3557;border-radius:5px;padding:2px 7px;font-size:10px;font-weight:700}
        .xtchua{background:#F3F4F6;color:#6B7280;border-radius:5px;padding:2px 7px;font-size:10px;font-weight:700}
        .wixt{display:flex;justify-content:space-between;align-items:flex-start;padding:7px 0;border-bottom:.5px solid #F3F6FB;font-size:11.5px}.wixt:last-child{border-bottom:none}
      `}</style>

      {/* KPI 4 */}
      <div className="tc3-kpi4x">
        <div className="tc3-cardx"><div className="tc3-chx" style={{background:'#EEF3FA',borderBottomColor:'#D0DCE8',color:'#4B6A8A'}}>📊 Tiến độ TB toàn DA</div><div className="tc3-cbx"><div className="tc3-valx" style={{color:'#1C3557'}}>{avgTD}%</div><div className="tc3-subx">{dangtc.length} đang TC · GT: {fmtTien(tongGT)}</div></div></div>
        <div className="tc3-cardx"><div className="tc3-chx" style={{background:'#F0FDF4',borderBottomColor:'#BBF7D0',color:'#1F6B3D'}}>🏗️ Hạng mục thi công</div><div className="tc3-cbx"><div className="tc3-valx" style={{color:'#16A34A'}}>{thiCong.length}</div><div className="tc3-subx">{dangtc.length} đang TC · {hoanthanh.length} hoàn thành</div></div></div>
        <div className="tc3-cardx"><div className="tc3-chx" style={{background:'#FDECEC',borderBottomColor:'#FECACA',color:'#8C1F1F'}}>⚠️ Hạng mục trễ / dừng</div><div className="tc3-cbx"><div className="tc3-valx" style={{color:tre.length>0?'#DC2626':'#16A34A'}}>{tre.length}</div><div className="tc3-subx">{tre.length>0?'Cần xử lý ngay':'Không có trễ'}</div></div></div>
        <div className="tc3-cardx"><div className="tc3-chx" style={{background:'#FFF4E0',borderBottomColor:'#FDE68A',color:'#8A5A12'}}>👷 Nhà thầu đang HT</div><div className="tc3-cbx"><div className="tc3-valx" style={{color:'#D97706'}}>{contractors.length}</div><div className="tc3-subx">Đánh giá TB: – / 5 ({contractors.length} NT)</div></div></div>
      </div>

      {/* Stat 5 + bộ chọn đơn vị */}
      <div className="tc3-kpi5x" style={{alignItems:'center'}}>
        <div className="tc3-statx"><div style={{fontSize:10,color:'#6B7280',fontWeight:600,textTransform:'uppercase',letterSpacing:'.05em'}}>Tổng GT hợp đồng</div><div style={{fontSize:15,fontWeight:800,color:'#1C3557',marginTop:2}}>{fmtTien(tongGT)}</div></div>
        <div className="tc3-statx"><div style={{fontSize:10,color:'#6B7280',fontWeight:600,textTransform:'uppercase',letterSpacing:'.05em'}}>Tổng gói thầu</div><div style={{fontSize:18,fontWeight:800,color:'#1C3557',marginTop:2}}>{goiThau.length}</div></div>
        <div className="tc3-statx"><div style={{fontSize:10,color:'#6B7280',fontWeight:600,textTransform:'uppercase',letterSpacing:'.05em'}}>Đang thi công</div><div style={{fontSize:18,fontWeight:800,color:'#1C3557',marginTop:2}}>{dangtc.length}</div></div>
        <div className="tc3-statx"><div style={{fontSize:10,color:'#6B7280',fontWeight:600,textTransform:'uppercase',letterSpacing:'.05em'}}>Hoàn thành</div><div style={{fontSize:18,fontWeight:800,color:'#16A34A',marginTop:2}}>{hoanthanh.length}</div></div>
        <div className="tc3-statx"><div style={{fontSize:10,color:'#6B7280',fontWeight:600,textTransform:'uppercase',letterSpacing:'.05em'}}>Chưa triển khai</div><div style={{fontSize:18,fontWeight:800,color:'#9CA3AF',marginTop:2}}>{chuatk.length}</div></div>
      </div>

      {/* Alert */}
      {tre.length>0&&<div style={{background:'#FFF4E0',border:'1px solid #FDE68A',borderRadius:10,padding:'10px 16px',fontSize:12,color:'#8A5A12',fontWeight:500,marginBottom:10}}>⚠️ <strong>{tre.length} hạng mục thi công đang trễ tiến độ</strong> – cần kiểm tra ngay với nhà thầu phụ trách.</div>}

      {/* Groups + Cảnh báo */}
      <div className="tc3-row2x">
        <div className="tc3-panelx" style={{marginBottom:0}}>
          <div className="tc3-phx">📐 Tiến độ từng nhóm hạng mục<span style={{fontSize:10,color:'#9CA3AF',fontWeight:400,textTransform:'none'}}>{grpData.length} nhóm · {thiCong.length} hạng mục</span></div>
          <div className="tc3-pbx">
            {grpData.map((r:any,i:number)=>{
              const td=Math.round(Number(r.tien_do??0)),soHM=Number(r.so_hm??0),soTre=Number(r.so_tre??0)
              const barC=td===100?'#16A34A':td<30?'#DC2626':'#1C3557'
              return(
                <div key={i} className="tc3-grpx">
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}><span style={{fontSize:12.5,fontWeight:600,color:'#1F2430'}}>{r.nhom??'–'}</span><span style={{fontSize:12,fontWeight:700,color:barC}}>{td}%</span></div>
                  <div style={{fontSize:11,color:'#9CA3AF',marginBottom:5}}>{soHM>0?`${soHM} HM`:''}{soTre>0?` · ${soTre} trễ`:''}</div>
                  <div style={{height:8,background:'#EEF3FA',borderRadius:4,overflow:'hidden'}}><div style={{width:`${td}%`,height:'100%',background:barC,borderRadius:4}}/></div>
                </div>
              )
            })}
          </div>
        </div>
        <div className="tc3-panelx" style={{marginBottom:0}}>
          <div className="tc3-phx">🚨 Cảnh báo thi công{tre.length>0&&<span style={{background:'#FDECEC',color:'#DC2626',padding:'1px 7px',borderRadius:5,fontSize:10,fontWeight:700}}>{tre.length} cảnh báo</span>}</div>
          <div className="tc3-pbx" style={{paddingTop:8}}>
            {thiCong.filter((r:any)=>getTDTC(r)<30&&getTDTC(r)>0).length>0&&<div style={{background:'#FFF4E0',borderLeft:'3px solid #F59E0B',borderRadius:'0 8px 8px 0',padding:'7px 12px',marginBottom:8,fontSize:11.5,color:'#8A5A12'}}>⚠️ {thiCong.filter((r:any)=>getTDTC(r)<30&&getTDTC(r)>0).length} hạng mục tiến độ dưới 30% – cần kiểm tra nhân lực &amp; vật tư.</div>}
            {tre.map((r:any,i:number)=>(
              <div key={i} className="wixt"><div><div style={{fontWeight:700,color:'#1C3557',fontSize:12}}>{getMaTC(r)}</div><div style={{fontSize:11,color:'#6B7280',marginTop:1}}>Trễ {getTreTC(r)} ngày · NT: {getNhaTC(r).slice(0,35)}</div></div><span className="xttre">Khẩn</span></div>
            ))}
            {thiCong.filter((r:any)=>getTDTC(r)<30&&getTDTC(r)>0&&getTreTC(r)===0).map((r:any,i:number)=>(
              <div key={`s${i}`} className="wixt"><div><div style={{fontWeight:700,color:'#1C3557',fontSize:12}}>{getMaTC(r)}</div><div style={{fontSize:11,color:'#6B7280',marginTop:1}}>Tiến độ {getTDTC(r)}% · NT: {getNhaTC(r).slice(0,35)}</div></div><span style={{background:'#FFF4E0',color:'#8A5A12',borderRadius:5,padding:'2px 7px',fontSize:10,fontWeight:700}}>Chậm</span></div>
            ))}
            {tre.length===0&&thiCong.filter((r:any)=>getTDTC(r)<30&&getTDTC(r)>0).length===0&&<div style={{textAlign:'center',padding:'20px',color:'#9CA3AF',fontSize:12}}>Không có cảnh báo</div>}
            {(tre.length>0||thiCong.filter((r:any)=>getTDTC(r)<30).length>0)&&<button style={{width:'100%',background:'#1C3557',color:'#fff',border:'none',padding:'10px 0',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit',borderRadius:8,marginTop:10}}>📢 Push việc cho Ban Kỹ thuật →</button>}
          </div>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="tc3-stbx">
        {([['hang-muc','🏗️ Hạng mục thi công'],['goi-thau','📋 Gói thầu / Hợp đồng'],['nha-thau','👷 Danh sách nhà thầu']] as ['hang-muc'|'goi-thau'|'nha-thau',string][]).map(([v,l])=>(
          <button key={v} className={`tc3-stabx ${subTC===v?'ax':''}`} onClick={()=>setSubTC(v)}>{l}</button>
        ))}
      </div>

      {/* Hạng mục table */}
      {subTC==='hang-muc'&&(
        <div className="tc3-panelx">
          <div className="tc3-phx">📐 Chi tiết hạng mục thi công<span style={{fontSize:10,color:'#9CA3AF',fontWeight:400,textTransform:'none'}}>{filtered.length} hạng mục</span></div>
          <div className="tc3-pbx">
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10,gap:8}}>
              <input className="tc3-srcx" placeholder="🔍 Tìm mã gói, tên hạng mục, nhà thầu..." value={searchTC} onChange={e=>setSearchTC(e.target.value)}/>
              <div style={{display:'flex',gap:6}}>
                <select className="tc3-selx" value={fNhom} onChange={e=>setFNhom(e.target.value)}>{nhomList.map(n=><option key={n}>{n}</option>)}</select>
                <select className="tc3-selx" value={fTT} onChange={e=>setFTT(e.target.value)}>{ttList.map(t=><option key={t}>{t}</option>)}</select>
              </div>
            </div>
            {loadTC?<div style={{textAlign:'center',padding:'24px',color:'#9CA3AF',fontSize:12}}>Đang tải…</div>:(
              <div style={{overflowX:'auto'}}>
                <table className="legal-table">
                  <thead><tr>
                    <th>Mã gói</th><th style={{width:'22%'}}>Tên hạng mục</th><th>Nhóm HM</th>
                    <th style={{width:'30%'}}>Nhà thầu PT</th><th style={{textAlign:'center'}}>KL KH</th>
                    <th style={{textAlign:'center'}}>KL thực tế</th><th style={{textAlign:'center',width:110}}>Tiến độ</th>
                    <th>BD KH</th><th>HT KH</th><th style={{textAlign:'center'}}>Trễ(ngày)</th>
                    <th style={{textAlign:'center'}}>Trạng thái</th>
                  </tr></thead>
                  <tbody>
                    {filtered.length===0?<tr><td colSpan={11} style={{textAlign:'center',color:'#9CA3AF',padding:'20px'}}>Không có dữ liệu</td></tr>
                    :filtered.map((r:any,i:number)=>{
                      const td=getTDTC(r),tre2=getTreTC(r),tt=getTTTC(r)
                      const barC=tt.includes('Trễ')||tre2>0?'#DC2626':td===100?'#16A34A':'#1C3557'
                      const ttBadge=tt.includes('Trễ')||tt.includes('trễ')?'xttre':tt==='Hoàn thành'||tt==='Hoàn Thành'?'xthoan':tt.includes('Dừng')?'xttre':tt.includes('Chưa')?'xtchua':'xtdang'
                      const nhom=getNhomTC(r)
                      return(
                        <tr key={i} style={tre2>0?{background:'#FFF9F9'}:{}}>
                          <td><code style={{fontSize:11,background:'#EEF3FA',padding:'2px 6px',borderRadius:4}}>{getMaTC(r)}</code></td>
                          <td style={{fontWeight:500,fontSize:12}}>{getTenTC(r)}</td>
                          <td><span className="nbx" style={{background:nhomClr(nhom)+'22',color:nhomClr(nhom),border:`1px solid ${nhomClr(nhom)}44`}}>{nhom}</span></td>
                          <td style={{fontSize:11.5,color:'#374151'}}>{getNhaTC(r)}</td>
                          <td style={{textAlign:'center',color:'#6B7280'}}>{getKLKHTC(r)||'–'}</td>
                          <td style={{textAlign:'center',color:'#6B7280'}}>{getKLThucTC(r)||'–'}</td>
                          <td><div style={{display:'flex',alignItems:'center',gap:5}}><div style={{flex:1,height:6,background:'#EEF3FA',borderRadius:3,overflow:'hidden'}}><div style={{width:`${td}%`,height:'100%',background:barC,borderRadius:3}}/></div><span style={{fontSize:10,fontWeight:700,color:barC,width:28}}>{td}%</span></div></td>
                          <td style={{color:'#6B7280',fontSize:11}}>{getBDTC(r)}</td>
                          <td style={{color:'#6B7280',fontSize:11}}>{getHTKHTC(r)}</td>
                          <td style={{textAlign:'center',fontWeight:700,color:tre2>0?'#DC2626':'#9CA3AF'}}>{tre2>0?tre2:'–'}</td>
                          <td style={{textAlign:'center'}}><span className={ttBadge}>{tt}</span></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {subTC==='goi-thau'&&(
        <div className="tc3-panelx">
          <div className="tc3-phx">📋 Gói thầu / Hợp đồng<span style={{fontSize:10,color:'#9CA3AF',fontWeight:400,textTransform:'none'}}>{goiThau.length} hợp đồng</span></div>
          <div style={{padding:0}}>
            <table className="legal-table">
              <thead><tr><th>Mã gói</th><th style={{width:'28%'}}>Tên gói thầu</th><th>Nhà thầu trúng thầu</th><th style={{textAlign:'right'}}>GT HĐ ({dvLabel})</th><th>Ký HĐ</th><th>HT theo HĐ</th><th style={{textAlign:'center'}}>Trạng thái</th></tr></thead>
              <tbody>
                {goiThau.length===0?<tr><td colSpan={7} style={{textAlign:'center',color:'#9CA3AF',padding:20}}>Không có dữ liệu</td></tr>
                :goiThau.map((r:any,i:number)=>{
                  const tt=getTTGT(r),td=getTDGT(r)
                  const ttBadge=tt.includes('Hoàn')?'xthoan':tt.includes('Trễ')||tt.includes('Dừng')?'xttre':tt.includes('Chưa')?'xtchua':'xtdang'
                  const barC=tt.includes('Hoàn')?'#16A34A':tt.includes('Trễ')?'#DC2626':'#1C3557'
                  const gt=getGTHD(r)
                  return(
                    <tr key={i}>
                      <td><code style={{fontSize:11,background:'#EEF3FA',padding:'2px 6px',borderRadius:4}}>{getMaGT(r)}</code></td>
                      <td style={{fontWeight:500}}>{getTenGT(r)}</td>
                      <td style={{fontSize:11.5}}>{getNhaGT(r).length>35?getNhaGT(r).slice(0,35)+'…':getNhaGT(r)}</td>
                      <td style={{textAlign:'right',fontWeight:700,color:'#1C3557'}}>{fmtTien(gt)}</td>
                      <td style={{fontSize:11,color:'#6B7280'}}>{getBDGT(r)}</td>
                      <td style={{fontSize:11,color:'#6B7280'}}>{getHTGT(r)}</td>
                      <td style={{textAlign:'center'}}><span className={ttBadge}>{tt}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTC==='nha-thau'&&(
        <div className="tc3-panelx">
          <div className="tc3-phx">👷 Danh sách nhà thầu<span style={{fontSize:10,color:'#9CA3AF',fontWeight:400,textTransform:'none'}}>{contractors.length} nhà thầu</span></div>
          <div style={{padding:0}}>
            <table className="legal-table">
              <thead><tr><th>Mã NT</th><th style={{width:'40%'}}>Tên nhà thầu</th><th>Loại</th><th style={{textAlign:'center'}}>Số HĐ</th><th style={{textAlign:'right'}}>GT (tỷ)</th><th style={{textAlign:'center'}}>Trạng thái</th></tr></thead>
              <tbody>
                {contractors.length===0?<tr><td colSpan={6} style={{textAlign:'center',color:'#9CA3AF',padding:'20px'}}>Không có dữ liệu</td></tr>
                :contractors.map((r:any,i:number)=>{
                  const getNTSoHDX=(r:any)=>Number(gv(r,'so_hop_dong','so_hd_','Số HĐ','so_hd')??0)
                  const getNTGTX=(r:any)=>{const raw=gv(r,'gia_tri_hd_','gia_tri_hop_dong','Giá trị (tỷ)','gia_tri');if(!raw)return 0;const n=Number(raw);return n>=1000?n/1e9:n}
                  return(
                    <tr key={i}>
                      <td><code style={{fontSize:11,background:'#EEF3FA',padding:'2px 6px',borderRadius:4}}>{getNTMaX(r)}</code></td>
                      <td style={{fontWeight:500}}>{getNTTenX(r)}</td>
                      <td style={{color:'#6B7280',fontSize:11}}>{getNTLoaiX(r)}</td>
                      <td style={{textAlign:'center'}}>{getNTSoHDX(r)||'–'}</td>
                      <td style={{textAlign:'right',fontWeight:700,color:'#1C3557'}}>{getNTGTX(r)>0?getNTGTX(r).toFixed(2):'–'}</td>
                      <td style={{textAlign:'center'}}><span className={getNTTTX(r).includes('Hoàn')||getNTTTX(r).includes('hoàn')?'xthoan':getNTTTX(r).includes('Dừng')||getNTTTX(r).includes('Trễ')?'xttre':'xtdang'}>{getNTTTX(r)}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
