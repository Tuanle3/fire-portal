'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import { fetchNoxhTable } from '@/lib/noxhData'
import { Project, CeoData, RISK_BG } from '../_lib/types'
import { fmtTyU, fmtMoneyStr } from '../_lib/format'
import { useChart } from '../_lib/chart'
import { buildCeoLive } from '../_lib/ceo-live'

export function TabCEO({ p: p0, donVi='ty' }: { p: Project; donVi?: 'ty'|'trieu'|'dong' }) {
  const lineRef  = useRef<HTMLCanvasElement>(null)
  const donutRef = useRef<HTMLCanvasElement>(null)
  const [d, setD] = useState<CeoData | null>(null)

  useEffect(()=>{
    const pfx = p0.prefix
    Promise.all([
      fetchNoxhTable(`${pfx}_Lien_Danh`),
      fetchNoxhTable(`${pfx}_Thi_Cong`),
      fetchNoxhTable(`${pfx}_Von_Vay`),
      fetchNoxhTable(`${pfx}_Thanh_Toan_NT`),
      fetchNoxhTable(`${pfx}_Ban_Hang`),
      fetchNoxhTable(`${pfx}_Cong_No_Thu`),
    ]).then(([ld,tc,vv,tt,bh,cn])=>setD({ld:ld.data??[],tc:tc.data??[],vv:vv.data??[],tt:tt.data??[],bh:bh.data??[],cn:cn.data??[]}))
     .catch(()=>setD({ld:[],tc:[],vv:[],tt:[],bh:[],cn:[]}))
  },[p0.prefix])

  const p = useMemo(()=>buildCeoLive(p0, d, donVi), [p0, d, donVi])

  useChart(lineRef,  p, 'line',  donVi)
  useChart(donutRef, p, 'donut', donVi)
  const k = p.ceoKpis
  const highRisks = p.risks.filter(r=>r.cls==='r2')
  const midRisks  = p.risks.filter(r=>r.cls==='r1')

  return (
    <div>
      {/* ── Row 1: KPI 4 cards ── */}
      <div className="ceo-kpi-row" style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:14}}>
        {[
          {head:'📊 TIẾN ĐỘ TỔNG THỂ', v:k.k1, s:k.k1s, hbg:'#EEF3FA', hc:'#4B6A8A', vc:'#1C3557'},
          {head:'🏦 ĐÃ GIẢI NGÂN NH',   v:k.k2, s:k.k2s, hbg:'#EAF6EE', hc:'#1F6B3D', vc:'#1F6B3D'},
          {head:'📝 SẢN PHẨM ĐÃ BÁN',  v:k.k3, s:k.k3s, hbg:'#FEF9EC', hc:'#8A5A12', vc:'#8A5A12'},
          {head:'💰 THỰC THU',           v:k.k4, s:k.k4s, hbg:'#EEF3FA', hc:'#4B6A8A', vc:'#1C3557'},
        ].map(it=>(
          <div key={it.head} style={{background:'#fff',border:'1px solid #E0E7F0',borderRadius:12,overflow:'hidden'}}>
            <div style={{padding:'8px 14px',background:it.hbg,borderBottom:'.5px solid #D0DCE8',fontSize:10,fontWeight:700,letterSpacing:'.07em',color:it.hc}}>{it.head}</div>
            <div style={{padding:'12px 14px'}}>
              <div style={{fontSize:donVi==='dong'?18:26,fontWeight:800,color:it.vc,lineHeight:1.1,whiteSpace:'nowrap'}}>{fmtMoneyStr(it.v, donVi)}</div>
              <div style={{fontSize:11,color:'#6B7280',marginTop:4}}>{it.s}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Cảnh báo hệ thống ── */}
      {p.alerts.length > 0 && (
        <div className="ceo-row3" style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:14}}>
          {p.alerts.map((a,i)=>(
            <div key={i} style={{display:'flex',gap:8,alignItems:'flex-start',background:'#FFF4E0',border:'1px solid #FDE68A',borderLeft:'3px solid #F59E0B',borderRadius:8,padding:'9px 12px',fontSize:12,color:'#78350F'}}>
              <span style={{flexShrink:0}}>⚠️</span><span>{a}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Row 2: 3 cột bằng nhau — Chart | Donut | Thi công ── */}
      <div className="ceo-row3" style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14,marginBottom:14}}>

        {/* Line chart */}
        <div className="sc">
          <div className="sc-head"><span className="sc-title">📈 THU / CHI THEO THÁNG</span></div>
          <div style={{padding:'12px 14px',height:200}}><canvas ref={lineRef}/></div>
        </div>

        {/* Donut */}
        <div className="sc">
          <div className="sc-head"><span className="sc-title">🟡 CƠ CẤU CHI TIÊU</span></div>
          <div style={{padding:'12px 16px',display:'flex',alignItems:'center',gap:16,height:200,boxSizing:'border-box'}}>
            <div style={{width:160,height:160,flexShrink:0}}><canvas ref={donutRef}/></div>
            <div style={{flex:1}}>
              {p.donut.labels.map((l,i)=>(
                <div key={l} style={{display:'flex',alignItems:'center',gap:8,marginBottom:11}}>
                  <span style={{width:10,height:10,borderRadius:2,background:p.donut.colors[i],flexShrink:0}}/>
                  <span style={{fontSize:12,color:'#3D3D3D',flex:1}}>{l}</span>
                  <span style={{fontSize:13,fontWeight:700,color:'#1C3557',whiteSpace:'nowrap'}}>{fmtTyU(p.donut.vals[i], donVi)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Thi công */}
        <div className="sc">
          <div className="sc-head">
            <span className="sc-title">🏗️ TIẾN ĐỘ THI CÔNG</span>
            <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:10,
              background:p.tcAlert.includes('Trễ')||p.tcAlert.includes('Chậm')?'#FDECEC':'#EAF6EE',
              color:p.tcAlert.includes('Trễ')||p.tcAlert.includes('Chậm')?'#DC2626':'#1F6B3D'}}>
              {p.tcAlert}
            </span>
          </div>
          <div style={{padding:'14px'}}>
            {p.thiCong.map(t=>(
              <div key={t.name} style={{marginBottom:18}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:2}}>
                  <span style={{fontSize:12,fontWeight:600,color:'#1F2430'}}>{t.name}</span>
                  <span style={{fontSize:12,fontWeight:800,color:t.pct===100?'#1F6B3D':t.pct<20?'#DC2626':'#1C3557'}}>{t.pct}%</span>
                </div>
                <div style={{fontSize:10.5,color:'#9CA3AF',marginBottom:5}}>{t.hm}</div>
                <div style={{height:7,background:'#EEF3FA',borderRadius:4,overflow:'hidden'}}>
                  <div style={{width:`${t.pct}%`,height:'100%',borderRadius:4,
                    background:t.pct===100?'#1F6B3D':t.pct<20?'#DC2626':'#1C3557'}}/>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Row 3: 3 cột bằng nhau — Góp vốn | Ma trận rủi ro | Việc CEO ── */}
      <div className="ceo-row3" style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14,marginBottom:14}}>

        {/* Góp vốn */}
        <div className="sc">
          <div className="sc-head">
            <span className="sc-title">🤝 GÓP VỐN LIÊN DANH</span>
            <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:10,background:'#FDECEC',color:'#DC2626'}}>{p.gvAlert}</span>
          </div>
          <div style={{padding:'12px 14px'}}>
            {p.gopVon.map(g=>(
              <div key={g.name} style={{marginBottom:14,paddingBottom:14,borderBottom:'1px solid #EEF3FA'}}>
                <div style={{fontSize:12,fontWeight:700,color:'#1F2430',marginBottom:6}}>{g.name}</div>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                  <span style={{fontSize:11,color:'#9CA3AF'}}>Tiến độ góp vốn</span>
                  <span style={{fontSize:12,fontWeight:800,color:g.pct<10?'#DC2626':'#D4A64A'}}>{g.pct}%</span>
                </div>
                <div style={{height:6,background:'#EEF3FA',borderRadius:3,overflow:'hidden',marginBottom:6}}>
                  <div style={{width:`${g.pct}%`,height:'100%',borderRadius:3,background:g.pct<10?'#DC2626':'#D4A64A'}}/>
                </div>
                <div style={{display:'flex',gap:8,fontSize:11,color:'#6B7280',flexWrap:'wrap'}}>
                  <span style={{whiteSpace:'nowrap'}}>Cam kết: <strong style={{color:'#1F2430'}}>{fmtTyU(g.camket, donVi)}</strong></span>
                  <span style={{whiteSpace:'nowrap'}}>Đã góp: <strong style={{color:'#1F6B3D'}}>{fmtTyU(g.dago, donVi)}</strong></span>
                  <span style={{whiteSpace:'nowrap'}}>Còn: <strong style={{color:g.con>0?'#DC2626':'#1F6B3D'}}>{fmtTyU(g.con, donVi)}</strong></span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Ma trận rủi ro */}
        <div className="sc">
          <div className="sc-head" style={{background:'#FDECEC',borderBottomColor:'#FECACA'}}>
            <span style={{fontSize:11,fontWeight:700,letterSpacing:'.07em',color:'#8C1F1F'}}>🔴 MA TRẬN RỦI RO</span>
            <div style={{display:'flex',gap:5}}>
              {highRisks.length>0 && <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:10,background:'#DC2626',color:'#fff'}}>{highRisks.length} Cao</span>}
              {midRisks.length>0  && <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:10,background:'#FFF4E0',color:'#8A5A12'}}>{midRisks.length} TB</span>}
            </div>
          </div>
          <div style={{padding:'12px 14px'}}>
            {p.risks.length===0
              ? <div style={{textAlign:'center',padding:20,fontSize:12,color:'#1F6B3D',fontWeight:600}}>✅ Không có rủi ro</div>
              : p.risks.map((r,i)=>{
                  const rb = RISK_BG[r.cls]
                  return (
                    <div key={i} style={{background:rb.bg,border:`1px solid ${rb.border}`,borderLeft:`3px solid ${rb.dot}`,borderRadius:8,padding:'10px 12px',marginBottom:8,display:'flex',gap:10,alignItems:'flex-start'}}>
                      <div style={{width:24,height:24,borderRadius:6,background:rb.dot,color:'#fff',fontSize:11,fontWeight:800,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{r.n}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:11.5,fontWeight:700,color:'#1F2430',marginBottom:1}}>{r.t}</div>
                        <div style={{fontSize:10.5,color:'#6B7280'}}>{r.d}</div>
                      </div>
                      <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:6,background:rb.dot,color:'#fff',flexShrink:0}}>{r.tag}</span>
                    </div>
                  )
                })
            }
          </div>
        </div>

        {/* Việc CEO cần xử lý */}
        <div className="sc">
          <div className="sc-head" style={{background:'#EAF6EE',borderBottomColor:'#BBF7D0'}}>
            <span style={{fontSize:11,fontWeight:700,letterSpacing:'.07em',color:'#1F6B3D'}}>✅ VIỆC CEO / CFO XỬ LÝ</span>
            {p.tasks.filter(t=>t.urgent).length>0 &&
              <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:10,background:'#DC2626',color:'#fff'}}>{p.tasks.filter(t=>t.urgent).length} khẩn</span>}
          </div>
          <div style={{padding:'10px 12px'}}>
            {p.tasks.map((t,i)=>(
              <div key={i} style={{display:'flex',alignItems:'flex-start',gap:9,padding:'9px 10px',marginBottom:6,borderRadius:8,
                background:t.urgent?'#FDECEC':'#F8FAFC',
                border:t.urgent?'1px solid #FECACA':'1px solid #E0E7F0'}}>
                <span style={{width:7,height:7,borderRadius:'50%',marginTop:5,flexShrink:0,
                  background:t.dot==='dot-red'?'#DC2626':t.dot==='dot-amber'?'#F59E0B':'#1F6B3D'}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:11.5,fontWeight:600,color:t.urgent?'#8C1F1F':'#1F2430',marginBottom:2,lineHeight:1.3}}>{t.title}</div>
                  <div style={{fontSize:10.5,color:'#9CA3AF'}}>{t.sub}</div>
                </div>
                <span style={{fontSize:10.5,fontWeight:700,flexShrink:0,color:t.urgent?'#DC2626':'#6B7280'}}>{t.date}</span>
              </div>
            ))}
          </div>
        </div>

      </div>

    </div>
  )
}
