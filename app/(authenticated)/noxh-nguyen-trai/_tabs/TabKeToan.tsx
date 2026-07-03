'use client'
import { useState, useEffect } from 'react'
import { fetchNoxhTable } from '@/lib/noxhData'
import { Project } from '../_lib/types'

export function TabKeToan({ p, donVi='ty' }: { p: Project; donVi?: 'ty'|'trieu'|'dong' }) {
  const [payments, setPayments] = useState<any[]>([])
  const [congNo,   setCongNo]   = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [loadCN,   setLoadCN]   = useState(true)
  const [sub,      setSub]      = useState<'tt-nt'|'cong-no'>('tt-nt')
  const [search,   setSearch]   = useState('')
  const [fTT,      setFTT]      = useState('Tất cả')

  useEffect(()=>{
    fetchNoxhTable(`${p.prefix}_Thanh_Toan_NT`)
      .then(({data})=>{ setPayments([...(data??[])].sort((a,b)=>Number(a.stt??0)-Number(b.stt??0))); setLoading(false) })
    fetchNoxhTable(`${p.prefix}_Cong_No_Thu`)
      .then(({data})=>{ setCongNo([...(data??[])].sort((a,b)=>Number(a.stt??0)-Number(b.stt??0))); setLoadCN(false) })
  },[])

  // Accessors — tên cột thực tế NOXH_NT_Thanh_Toan_NT
  const gv=(r:any,...ks:string[])=>{for(const k of ks){if(r[k]!==undefined&&r[k]!==null&&r[k]!=='')return r[k]};return null}
  const getMaGoi  =(r:any)=>gv(r,'ma_goi_thau')?? '–'
  const getTenNT  =(r:any)=>gv(r,'ten_nha_thau')?? '–'
  const getDot    =(r:any)=>gv(r,'dot_nghiem_thu')?? '–'
  const getNgayNT =(r:any)=>gv(r,'ngay_nghiem_thu')?? '–'
  const toTy      =(raw:any)=>Number(raw??0)/1e9
  const getGTHD   =(r:any)=>toTy(gv(r,'gia_tri_hop_dong'))
  const getGTNT   =(r:any)=>toTy(gv(r,'gia_tri_de_nghi_tt'))
  const getDNTT   =(r:any)=>toTy(gv(r,'gia_tri_de_nghi_tt'))
  const getKTTU   =(r:any)=>toTy(gv(r,'khau_tru_tam_ung'))
  const getKTBH   =(r:any)=>toTy(gv(r,'khau_tru_bao_hanh'))
  const getThucTT =(r:any)=>toTy(gv(r,'so_tien_thuc_tt'))
  const getNgayDC =(r:any)=>gv(r,'ngay_duyet_chi')?? '–'
  const getNgayTT =(r:any)=>gv(r,'ngay_tt_thuc_te')?? '–'
  const getTrangThai=(r:any)=>gv(r,'trang_thai_tt')?? '–'

  const fmt=(tyVal:number)=>{
    if(!tyVal) return '–'
    const f=(n:number,d=3)=>n.toLocaleString('vi-VN',{minimumFractionDigits:d,maximumFractionDigits:d})
    if(donVi==='ty') return f(tyVal,3)
    if(donVi==='trieu') return f(tyVal*1000,0)
    return tyVal*1e9>0?Math.round(tyVal*1e9).toLocaleString('vi-VN'):'–'
  }
  const dvLbl=donVi==='ty'?'tỷ':donVi==='trieu'?'triệu':'đ'

  const isDaTT    =(r:any)=>getTrangThai(r).toLowerCase().includes('đã thanh toán')||getTrangThai(r).toLowerCase().includes('da thanh toan')
  const isChoDuyet=(r:any)=>!isDaTT(r)&&getTrangThai(r)!=='–'
  const choDuyet  =payments.filter(r=>isChoDuyet(r))
  const daTT      =payments.filter(r=>isDaTT(r))
  const ttList    =['Tất cả',...Array.from(new Set(payments.map(getTrangThai).filter(v=>v&&v!=='–')))]
  const ttOrder   =(tt:string)=>isDaTT({trang_thai_tt:tt})?1:0
  const filtered  =payments
    .filter(r=>{
      const ms=search===''||getMaGoi(r).toLowerCase().includes(search.toLowerCase())||getTenNT(r).toLowerCase().includes(search.toLowerCase())
      return ms&&(fTT==='Tất cả'||getTrangThai(r)===fTT)
    })
    .sort((a,b)=>ttOrder(getTrangThai(a))-ttOrder(getTrangThai(b)))

  // Top 8 nhà thầu theo thực TT
  const ntMap:Record<string,number>={}
  payments.forEach(r=>{const n=getTenNT(r);if(n!=='–')ntMap[n]=(ntMap[n]??0)+getThucTT(r)})
  const top8=Object.entries(ntMap).sort((a,b)=>b[1]-a[1]).slice(0,8)
  const maxBar=top8[0]?.[1]??1
  const BAR_COLORS=['#1C3557','#2563EB','#7C3AED','#D97706','#059669','#DC2626','#0891B2','#9CA3AF']

  const tonDong=choDuyet.filter(r=>!getNgayDC(r)||getNgayDC(r)==='–')
  const tongThucTT=payments.reduce((s,r)=>s+getThucTT(r),0)

  const ttBadge=(tt:string)=>tt==='Đã thanh toán'||tt==='đã thanh toán'?{bg:'#EAF6EE',c:'#1F6B3D'}:tt==='Chờ duyệt'?{bg:'#FFF4E0',c:'#8A5A12'}:{bg:'#EEF3FA',c:'#1C3557'}

  return (
    <div>
      <style>{`
        .kt-stab{padding:7px 16px;font-size:12.5px;font-weight:600;border-radius:8px;border:1px solid #E0E7F0;background:#fff;cursor:pointer;color:#6B7280;font-family:inherit;display:inline-flex;align-items:center;gap:6px;margin-right:6px;margin-bottom:14px}
        .kt-stab.act{background:#1C3557;color:#fff;border-color:#1C3557}
        .kt-kpi4{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px}
        .kt-card{background:#fff;border-radius:12px;overflow:hidden;border:1px solid #E0E7F0}
        .kt-ch{padding:9px 14px;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;border-bottom:1px solid}
        .kt-cb{padding:10px 14px 12px}
        .kt-val{font-size:22px;font-weight:800;line-height:1.1}
        .kt-sub{font-size:11px;color:#6B7280;margin-top:3px}
        .kt-row2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
        .kt-panel{background:#fff;border:1px solid #E0E7F0;border-radius:12px;overflow:hidden}
        .kt-ph{padding:10px 14px;background:#EEF3FA;border-bottom:.5px solid #D0DCE8;font-size:11px;font-weight:700;letter-spacing:.07em;color:#4B6A8A;text-transform:uppercase;display:flex;align-items:center;justify-content:space-between}
        .kt-pb{padding:12px 14px}
        .kt-inp{padding:7px 12px;border:1px solid #E0E7F0;border-radius:8px;font-size:12px;font-family:inherit;outline:none;width:280px}
        .kt-sel{padding:6px 10px;border:1px solid #E0E7F0;border-radius:8px;font-size:12px;font-family:inherit;background:#fff;cursor:pointer}
      `}</style>

      {/* Sub-tabs */}
      <div>
        <button className={`kt-stab${sub==='tt-nt'?' act':''}`} onClick={()=>setSub('tt-nt')}>💳 Thanh toán nhà thầu</button>
        <button className={`kt-stab${sub==='cong-no'?' act':''}`} onClick={()=>setSub('cong-no')}>📊 Công nợ phải thu</button>
      </div>

      {sub==='tt-nt'&&<>
        {/* KPI 4 */}
        <div className="kt-kpi4">
          {[
            {l:'⏳ Chờ duyệt',v:choDuyet.length,sub:'Tổng '+fmt(choDuyet.reduce((s,r)=>s+getDNTT(r),0))+' '+dvLbl,hBg:'#FFF4E0',hBd:'#FDE68A',hC:'#8A5A12',vC:'#D97706'},
            {l:'✅ Đã thanh toán',v:daTT.length,sub:'Phiếu đã xử lý',hBg:'#F0FDF4',hBd:'#BBF7D0',hC:'#1F6B3D',vC:'#16A34A'},
            {l:'📑 Tổng phiếu TT',v:payments.length,sub:'Tổng số lượt',hBg:'#EEF3FA',hBd:'#D0DCE8',hC:'#4B6A8A',vC:'#1C3557'},
            {l:'🚨 GT chờ duyệt',v:fmt(choDuyet.reduce((s,r)=>s+getDNTT(r),0))+' '+dvLbl,sub:'Cần duyệt ngay',hBg:'#FDECEC',hBd:'#FECACA',hC:'#8C1F1F',vC:choDuyet.length>0?'#DC2626':'#9CA3AF'},
          ].map(it=>(
            <div key={it.l} className="kt-card">
              <div className="kt-ch" style={{background:it.hBg,borderBottomColor:it.hBd,color:it.hC}}>{it.l}</div>
              <div className="kt-cb"><div className="kt-val" style={{color:it.vC}}>{it.v}</div><div className="kt-sub">{it.sub}</div></div>
            </div>
          ))}
        </div>

        {/* Row 2: biểu đồ + tồn đọng */}
        <div className="kt-row2">
          <div className="kt-panel">
            <div className="kt-ph">💰 Chi theo nhà thầu (top 8)<span style={{fontSize:10,color:'#9CA3AF',fontWeight:400,textTransform:'none'}}>thực TT · {payments.length>0?`09_THANH_TOAN_NT`:''}</span></div>
            <div className="kt-pb">
              {top8.map(([name,val],i)=>(
                <div key={i} style={{marginBottom:10}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:3}}>
                    <span style={{fontSize:11.5,color:'#374151',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',paddingRight:8}}>{name}</span>
                    <span style={{fontSize:12,fontWeight:700,color:BAR_COLORS[i],flexShrink:0}}>{fmt(val)} {dvLbl}</span>
                  </div>
                  <div style={{height:6,background:'#EEF3FA',borderRadius:3,overflow:'hidden'}}>
                    <div style={{width:`${Math.round(val/maxBar*100)}%`,height:'100%',background:BAR_COLORS[i],borderRadius:3}}/>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="kt-panel">
            <div className="kt-ph">🔔 Đề nghị TT tồn đọng<span style={{background:tonDong.length>0?'#FDECEC':'#F0FDF4',color:tonDong.length>0?'#DC2626':'#1F6B3D',padding:'1px 8px',borderRadius:5,fontSize:10,fontWeight:700}}>{tonDong.length} phiếu</span></div>
            <div className="kt-pb">
              {tonDong.length===0
                ?<div style={{textAlign:'center',padding:'16px 0',color:'#9CA3AF',fontSize:12}}>✅ Không có tồn đọng</div>
                :tonDong.slice(0,5).map((r,i)=>(
                  <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 0',borderBottom:'1px solid #F3F6FB',fontSize:12}}>
                    <div>
                      <div style={{fontWeight:700,color:'#1C3557'}}>{getMaGoi(r)} — {getTenNT(r).slice(0,30)}</div>
                      <div style={{fontSize:11,color:'#9CA3AF',marginTop:2}}>{getDot(r)} · {fmt(getThucTT(r))} {dvLbl}</div>
                    </div>
                    <span style={{background:'#FFF4E0',color:'#8A5A12',borderRadius:5,padding:'2px 8px',fontSize:10,fontWeight:700,flexShrink:0}}>Chờ duyệt</span>
                  </div>
                ))
              }
              <button style={{width:'100%',background:'#1C3557',color:'#fff',border:'none',padding:'10px 0',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit',borderRadius:8,marginTop:12}}>
                💳 Push việc cho Ban Kế toán →
              </button>
            </div>
          </div>
        </div>

        {/* Bảng chi tiết */}
        <div className="kt-panel">
          <div className="kt-ph">📄 Chi tiết thanh toán nhà thầu<span style={{fontSize:10,color:'#9CA3AF',fontWeight:400,textTransform:'none'}}>{filtered.length} phiếu</span></div>
          <div className="kt-pb" style={{paddingBottom:0}}>
            <div style={{display:'flex',gap:8,marginBottom:10}}>
              <input className="kt-inp" placeholder="🔍 Tìm mã gói, tên nhà thầu..." value={search} onChange={e=>setSearch(e.target.value)}/>
              <select className="kt-sel" value={fTT} onChange={e=>setFTT(e.target.value)}>{ttList.map(v=><option key={v}>{v}</option>)}</select>
              <span style={{marginLeft:'auto',fontSize:11,color:'#6B7280',alignSelf:'center'}}>Đơn vị: {dvLbl}</span>
            </div>
          </div>
          {loading?<div style={{textAlign:'center',padding:20,color:'#9CA3AF',fontSize:12}}>Đang tải…</div>:(
            <div style={{border:'1px solid #E0E7F0',borderRadius:8,overflow:'hidden',margin:'0 14px 14px'}}>
              <div style={{maxHeight:460,overflowY:'auto',overflowX:'auto'}}>
                <table className="legal-table" style={{width:'100%',marginBottom:0,minWidth:860}}>
                  <thead>
                    <tr>
                      <th style={{position:'sticky',top:0,left:0,zIndex:3,width:72}}>Mã gói</th>
                      <th style={{position:'sticky',top:0,left:72,zIndex:3,minWidth:160,boxShadow:'2px 0 4px rgba(13,31,51,.10)'}}>Tên nhà thầu</th>
                      <th style={{position:'sticky',top:0}}>Đợt</th><th style={{position:'sticky',top:0}}>Ngày NT</th>
                      <th style={{position:'sticky',top:0,textAlign:'right'}}>GT HĐ({dvLbl})</th>
                      <th style={{position:'sticky',top:0,textAlign:'right'}}>ĐN TT({dvLbl})</th>
                      <th style={{position:'sticky',top:0,textAlign:'right'}}>KT Tạm ứng</th>
                      <th style={{position:'sticky',top:0,textAlign:'right'}}>KT Bảo hành</th>
                      <th style={{position:'sticky',top:0,textAlign:'right'}}>Thực TT({dvLbl})</th>
                      <th style={{position:'sticky',top:0}}>Ngày duyệt</th><th style={{position:'sticky',top:0}}>Ngày TT</th>
                      <th style={{position:'sticky',top:0,textAlign:'center'}}>Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length===0?<tr><td colSpan={12} style={{textAlign:'center',color:'#9CA3AF',padding:20}}>Không có dữ liệu</td></tr>
                    :filtered.map((r,i)=>{
                      const tt=getTrangThai(r); const {bg,c}=ttBadge(tt)
                      const rowBg=tt==='Chờ duyệt'?'#FFF4E0':'#fff'
                      return <tr key={i} style={tt==='Chờ duyệt'?{background:'#FFF4E0'}:{}}>
                        <td style={{position:'sticky',left:0,zIndex:1,background:rowBg}}><code style={{fontSize:11,background:'#EEF3FA',padding:'2px 5px',borderRadius:4}}>{getMaGoi(r)}</code></td>
                        <td style={{position:'sticky',left:72,zIndex:1,background:rowBg,boxShadow:'2px 0 4px rgba(13,31,51,.05)',fontSize:12}}>{getTenNT(r)}</td>
                        <td style={{color:'#6B7280',fontSize:11.5}}>{getDot(r)}</td>
                        <td style={{color:'#6B7280',fontSize:11}}>{getNgayNT(r)}</td>
                        <td style={{textAlign:'right',color:'#1C3557',fontWeight:600}}>{fmt(getGTHD(r))}</td>
                        <td style={{textAlign:'right',color:'#1C3557',fontWeight:700}}>{fmt(getDNTT(r))}</td>
                        <td style={{textAlign:'right',color:'#6B7280'}}>{getKTTU(r)>0?fmt(getKTTU(r)):'0'}</td>
                        <td style={{textAlign:'right',color:'#6B7280'}}>{getKTBH(r)>0?fmt(getKTBH(r)):'0'}</td>
                        <td style={{textAlign:'right',fontWeight:700,color:'#16A34A'}}>{fmt(getThucTT(r))}</td>
                        <td style={{color:'#6B7280',fontSize:11}}>{getNgayDC(r)}</td>
                        <td style={{color:'#6B7280',fontSize:11}}>{getNgayTT(r)}</td>
                        <td style={{textAlign:'center'}}><span style={{background:bg,color:c,padding:'2px 8px',borderRadius:5,fontSize:10,fontWeight:700}}>{tt}</span></td>
                      </tr>
                    })}
                  </tbody>
                  {filtered.length>0&&<tfoot style={{position:'sticky',bottom:0,zIndex:2}}>
                    <tr style={{background:'#EEF3FA',fontWeight:800,color:'#1C3557',fontSize:12}}>
                      <td style={{position:'sticky',left:0,background:'#EEF3FA',padding:'8px 10px'}} colSpan={2}>Tổng ({filtered.length} phiếu)</td>
                      <td colSpan={2}/>
                      <td style={{textAlign:'right',padding:'8px 10px'}}>{fmt(filtered.reduce((s,r)=>s+getGTHD(r),0))}</td>
                      <td style={{textAlign:'right',padding:'8px 10px'}}>{fmt(filtered.reduce((s,r)=>s+getDNTT(r),0))}</td>
                      <td style={{textAlign:'right',padding:'8px 10px'}}>{fmt(filtered.reduce((s,r)=>s+getKTTU(r),0))}</td>
                      <td style={{textAlign:'right',padding:'8px 10px'}}>{fmt(filtered.reduce((s,r)=>s+getKTBH(r),0))}</td>
                      <td style={{textAlign:'right',padding:'8px 10px',color:'#16A34A'}}>{fmt(filtered.reduce((s,r)=>s+getThucTT(r),0))}</td>
                      <td colSpan={3}/>
                    </tr>
                  </tfoot>}
                </table>
              </div>
            </div>
          )}
        </div>
      </>}

      {sub==='cong-no'&&(()=>{
        const cnGv=(r:any,...ks:string[])=>{for(const k of ks){if(r[k]!==undefined&&r[k]!==null&&r[k]!=='')return r[k]};return null}
        const cnSoHD =(r:any)=>cnGv(r,'so_hd_mbb')?? '–'
        const cnTenKH=(r:any)=>cnGv(r,'ten_khach')?? '–'
        const cnMaCan=(r:any)=>cnGv(r,'ma_can_ho')?? '–'
        const cnDot  =(r:any)=>cnGv(r,'dot_thanh_toan')?? '–'
        const cnPThu =(r:any)=>Number(cnGv(r,'so_tien_phai_thu')??0)/1e9
        const cnNgayHan=(r:any)=>cnGv(r,'ngay_den_han')?? '–'
        const cnNgayTT=(r:any)=>cnGv(r,'ngay_tt_thuc_te')?? '–'
        const cnThucThu=(r:any)=>Number(cnGv(r,'so_tien_thuc_thu')??0)/1e9
        const cnCL   =(r:any)=>cnPThu(r)-cnThucThu(r)
        const isQH   =(r:any)=>cnNgayTT(r)==='–'&&cnNgayHan(r)!=='–'&&new Date(cnNgayHan(r))<new Date()
        const tongPThu=congNo.reduce((s,r)=>s+cnPThu(r),0)
        const tongTT  =congNo.reduce((s,r)=>s+cnThucThu(r),0)
        const tongCL  =congNo.reduce((s,r)=>s+cnCL(r),0)
        const soQH    =congNo.filter(r=>isQH(r)).length
        return <>
          <div className="kt-kpi4" style={{marginBottom:12}}>
            {[
              {l:'📋 Tổng đợt thu',v:congNo.length,vC:'#1C3557'},
              {l:'💰 Tổng phải thu',v:fmt(tongPThu)+' '+dvLbl,vC:'#1C3557'},
              {l:'✅ Đã thu',v:fmt(tongTT)+' '+dvLbl,vC:'#16A34A'},
              {l:'⏳ Còn lại',v:fmt(tongCL)+' '+dvLbl,vC:soQH>0?'#DC2626':'#D97706'},
            ].map(it=>(
              <div key={it.l} className="kt-card">
                <div className="kt-ch" style={{background:'#EEF3FA',borderBottomColor:'#D0DCE8',color:'#4B6A8A'}}>{it.l}</div>
                <div className="kt-cb"><div className="kt-val" style={{color:it.vC,fontSize:18}}>{it.v}</div></div>
              </div>
            ))}
          </div>
          <div className="kt-panel">
            <div className="kt-ph">📄 Chi tiết công nợ phải thu<span style={{fontSize:10,color:'#9CA3AF',fontWeight:400,textTransform:'none'}}>{congNo.length} dòng · đơn vị: {dvLbl}</span></div>
            {loadCN?<div style={{padding:20,textAlign:'center',color:'#9CA3AF'}}>Đang tải…</div>:(
              <div style={{border:'1px solid #E0E7F0',borderRadius:8,overflow:'hidden',margin:'12px 14px'}}>
                <div style={{maxHeight:480,overflowY:'auto',overflowX:'auto'}}>
                  <table className="legal-table" style={{width:'100%',marginBottom:0}}>
                    <thead style={{position:'sticky',top:0,zIndex:2,background:'#F8FAFC'}}>
                      <tr>
                        <th>Số HĐ</th><th>Tên khách hàng</th><th>Mã căn</th><th>Đợt TT</th>
                        <th style={{textAlign:'right'}}>Phải thu ({dvLbl})</th>
                        <th>Ngày đến hạn</th><th>Ngày TT</th>
                        <th style={{textAlign:'right'}}>Thực thu ({dvLbl})</th>
                        <th style={{textAlign:'right'}}>Chênh lệch ({dvLbl})</th>
                        <th style={{textAlign:'center'}}>Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody>
                      {congNo.length===0?<tr><td colSpan={10} style={{textAlign:'center',color:'#9CA3AF',padding:20}}>Không có dữ liệu</td></tr>
                      :congNo.map((r,i)=>{
                        const qh=isQH(r); const thu=cnThucThu(r)>0; const cl=cnCL(r)
                        return <tr key={i} style={qh?{background:'#FDECEC'}:thu?{}:{background:'#FFF4E0'}}>
                          <td><code style={{fontSize:11,background:'#EEF3FA',padding:'2px 5px',borderRadius:4}}>{cnSoHD(r)}</code></td>
                          <td style={{fontSize:12}}>{cnTenKH(r)}</td>
                          <td style={{color:'#6B7280',fontSize:11}}>{cnMaCan(r)}</td>
                          <td style={{color:'#6B7280',fontSize:11.5}}>{cnDot(r)}</td>
                          <td style={{textAlign:'right',fontWeight:700,color:'#1C3557'}}>{fmt(cnPThu(r))}</td>
                          <td style={{color:qh?'#DC2626':'#6B7280',fontSize:11,fontWeight:qh?700:400}}>{cnNgayHan(r)}</td>
                          <td style={{color:'#6B7280',fontSize:11}}>{cnNgayTT(r)}</td>
                          <td style={{textAlign:'right',color:'#16A34A',fontWeight:700}}>{cnThucThu(r)>0?fmt(cnThucThu(r)):'–'}</td>
                          <td style={{textAlign:'right',color:cl>0.001?'#D97706':cl<-0.001?'#DC2626':'#16A34A',fontWeight:600}}>{Math.abs(cl)>0.0001?fmt(cl):'0'}</td>
                          <td style={{textAlign:'center'}}>{
                            qh?<span style={{background:'#FEE2E2',color:'#DC2626',padding:'2px 8px',borderRadius:5,fontSize:10,fontWeight:700}}>Quá hạn</span>
                            :thu?<span style={{background:'#EAF6EE',color:'#1F6B3D',padding:'2px 8px',borderRadius:5,fontSize:10,fontWeight:700}}>Đã thu</span>
                            :<span style={{background:'#FFF4E0',color:'#8A5A12',padding:'2px 8px',borderRadius:5,fontSize:10,fontWeight:700}}>Chưa thu</span>
                          }</td>
                        </tr>
                      })}
                    </tbody>
                    {congNo.length>0&&<tfoot>
                      <tr style={{background:'#EEF3FA',fontWeight:800,color:'#1C3557',fontSize:12}}>
                        <td colSpan={4} style={{padding:'8px 10px'}}>Tổng ({congNo.length} đợt)</td>
                        <td style={{textAlign:'right',padding:'8px 10px'}}>{fmt(tongPThu)}</td>
                        <td colSpan={2}/>
                        <td style={{textAlign:'right',padding:'8px 10px',color:'#16A34A'}}>{fmt(tongTT)}</td>
                        <td style={{textAlign:'right',padding:'8px 10px',color:'#D97706'}}>{fmt(tongCL)}</td>
                        <td/>
                      </tr>
                    </tfoot>}
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      })()}
    </div>
  )
}
