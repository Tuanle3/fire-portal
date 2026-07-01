'use client'
import { useEffect, useRef, useMemo } from 'react'
import type { ProjectInfo, ThiCongItem, LienDanhMember, ThanhToanRow, ProjectTask, ProjectUnit } from '../_lib/types'
import { fmtU } from '../_lib/types'

interface Props {
  info: ProjectInfo
  thiCong: ThiCongItem[]
  lienDanh: LienDanhMember[]
  payments: ThanhToanRow[]
  tasks: ProjectTask[]
  unit: ProjectUnit
}

const MUC_COLOR: Record<string, string> = {
  khan:        '#DC2626',
  uu_tien:     '#D97706',
  hom_nay:     '#2563EB',
  binh_thuong: '#6B7280',
}
const MUC_LABEL: Record<string, string> = {
  khan:        'Khẩn',
  uu_tien:     'Ưu tiên',
  hom_nay:     'Hôm nay',
  binh_thuong: 'BT',
}

export default function TabCEO({ info, thiCong, lienDanh, payments, tasks, unit }: Props) {
  const chartRef  = useRef<HTMLCanvasElement>(null)
  const donutRef  = useRef<HTMLCanvasElement>(null)
  const chartInst = useRef<any>(null)
  const donutInst = useRef<any>(null)

  // Compute monthly Thu/Chi from payments (last 6 months)
  const { labels, thuData, chiData } = useMemo(() => {
    const months: string[] = []
    const now = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push(`T${String(d.getMonth() + 1).padStart(2,'0')}`)
    }
    const thu = Array(6).fill(0)
    const chi = Array(6).fill(0)
    payments.forEach(p => {
      const m = p.thang, y = p.nam
      const d = new Date(now.getFullYear(), now.getMonth() - 5, 1)
      for (let i = 0; i < 6; i++) {
        const md = new Date(d.getFullYear(), d.getMonth() + i, 1)
        if (md.getMonth() + 1 === m && md.getFullYear() === y) {
          if (p.nhom.startsWith('Thu')) thu[i] += p.so_tien
          else chi[i] += p.so_tien
        }
      }
    })
    return { labels: months, thuData: thu, chiData: chi }
  }, [payments])

  // Cơ cấu chi tiêu donut
  const donutData = useMemo(() => {
    const groups: Record<string, number> = {}
    payments.filter(p => !p.nhom.startsWith('Thu') && p.trang_thai !== 'huy').forEach(p => {
      const g = p.nhom; groups[g] = (groups[g] ?? 0) + p.so_tien
    })
    const entries = Object.entries(groups).sort((a, b) => b[1] - a[1]).slice(0, 4)
    return {
      labels: entries.map(([k]) => k),
      vals:   entries.map(([, v]) => v),
      colors: ['#1C3557','#D4A64A','#6B7280','#1F6B3D'],
    }
  }, [payments])

  // Construction groups summary
  const thiCongGroups = useMemo(() => {
    const g: Record<string, { pct: number[]; tre: number }> = {}
    thiCong.forEach(t => {
      if (!g[t.nhom]) g[t.nhom] = { pct: [], tre: 0 }
      g[t.nhom].pct.push(t.pct)
      if (t.trang_thai === 'tre') g[t.nhom].tre++
    })
    return Object.entries(g).map(([nhom, d]) => ({
      nhom,
      avgPct: Math.round(d.pct.reduce((a, b) => a + b, 0) / d.pct.length),
      tre: d.tre,
      count: d.pct.length,
    }))
  }, [thiCong])

  // Alerts
  const treCount  = thiCong.filter(t => t.trang_thai === 'tre').length
  const gvThieu   = lienDanh.reduce((s, m) => s + (m.cam_ket - m.da_gop), 0)
  const choDuyet  = payments.filter(p => p.trang_thai === 'cho_duyet')
  const choDuyetAmt = choDuyet.reduce((s, p) => s + p.so_tien, 0)

  // Charts
  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
    script.onload = () => { buildCharts() }
    if ((window as any).Chart) { buildCharts(); return }
    document.head.appendChild(script)

    function buildCharts() {
      const C = (window as any).Chart
      if (!chartRef.current || !donutRef.current) return

      chartInst.current?.destroy()
      chartInst.current = new C(chartRef.current, {
        type: 'line',
        data: {
          labels,
          datasets: [
            { label: 'Thu KH', data: thuData, borderColor: '#1C3557', backgroundColor: 'rgba(28,53,87,.08)', fill: true, tension: .4, pointRadius: 4 },
            { label: 'Chi TC', data: chiData,  borderColor: '#DC2626', backgroundColor: 'rgba(220,38,38,.06)', fill: true, tension: .4, pointRadius: 4, borderDash: [5,3] },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'top', labels: { font: { size: 10 }, boxWidth: 12 } } },
          scales: {
            y: { ticks: { font: { size: 9 }, callback: (v: number) => v + ' tỷ' }, grid: { color: '#f0ede8' } },
            x: { ticks: { font: { size: 9 } }, grid: { display: false } },
          },
        },
      })

      donutInst.current?.destroy()
      donutInst.current = new C(donutRef.current, {
        type: 'doughnut',
        data: { labels: donutData.labels, datasets: [{ data: donutData.vals, backgroundColor: donutData.colors, borderWidth: 2, borderColor: '#fff' }] },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '68%',
          plugins: { legend: { display: false } },
        },
      })
    }
  }, [labels, thuData, chiData, donutData])

  const totalChi = donutData.vals.reduce((a, b) => a + b, 0)

  return (
    <div>
      {/* KPI Row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:18 }}>
        <KpiCard icon="📊" label="TIẾN ĐỘ TỔNG THỂ" val={`${info.progress}%`} sub={`${treCount} hạng mục trễ`} subColor={treCount > 0 ? '#DC2626' : '#6B7280'} />
        <KpiCard icon="🏦" label="ĐÃ GIẢI NGÂN NH" val={fmtU(info.giaiNgan, unit)} sub={`HM ${fmtU(info.loan, unit)} · ${info.loan > 0 ? Math.round(info.giaiNgan / info.loan * 100) : 0}%`} />
        <KpiCard icon="🏠" label="SẢN PHẨM ĐÃ BÁN" val={`${info.soldUnits}/${info.totalUnits}`} sub={`Hấp thụ ${info.totalUnits > 0 ? Math.round(info.soldUnits / info.totalUnits * 100) : 0}%`} />
        <KpiCard icon="💰" label="THỰC THU" val={fmtU(info.thucThu, unit)} sub="Thực thu" />
      </div>

      {/* Alerts */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:18 }}>
        {treCount > 0 && <AlertBadge icon="⚠️" msg={`${treCount} hạng mục thi công đang trễ tiến độ`} color="#FEF3C7" border="#FDE68A" />}
        {gvThieu > 0.01 && <AlertBadge icon="⚠️" msg={`Thiếu vốn góp liên danh ${fmtU(gvThieu, unit)}`} color="#FEF3C7" border="#FDE68A" />}
        {choDuyet.length > 0 && <AlertBadge icon="⚠️" msg={`${choDuyet.length} phiếu thanh toán chờ duyệt · ${fmtU(choDuyetAmt, unit)}`} color="#FEF3C7" border="#FDE68A" />}
      </div>

      {/* Main grid: Chart | Donut | Thi công */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14, marginBottom:14 }}>
        <Panel title="📈 THU / CHI THEO THÁNG">
          <div style={{ height:200, position:'relative' }}>
            <canvas ref={chartRef} />
          </div>
        </Panel>

        <Panel title="🥧 CƠ CẤU CHI TIÊU">
          <div style={{ display:'flex', gap:10, height:200, alignItems:'center' }}>
            <div style={{ flex:'0 0 120px', height:140, position:'relative' }}>
              <canvas ref={donutRef} />
            </div>
            <div style={{ flex:1, fontSize:11 }}>
              {donutData.labels.map((l, i) => (
                <div key={l} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>
                  <span style={{ width:8, height:8, borderRadius:2, background:donutData.colors[i], flexShrink:0, display:'block' }} />
                  <span style={{ color:'#374151', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l}</span>
                  <span style={{ fontWeight:700, color:'#1F2430', whiteSpace:'nowrap' }}>{fmtU(donutData.vals[i], unit, 2)}</span>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel title={`🏗️ TIẾN ĐỘ THI CÔNG · ${treCount > 0 ? `${treCount} trễ` : 'Tốt'}`}
               titleExtra={<span style={{ background:'#FEE2E2', color:'#DC2626', fontSize:10, borderRadius:4, padding:'2px 7px', fontWeight:700 }}>{treCount} trễ</span>}>
          <div style={{ padding:'6px 0' }}>
            {thiCongGroups.map(g => (
              <div key={g.nhom} style={{ marginBottom:12 }}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, fontWeight:600, color:'#374151', marginBottom:4 }}>
                  <span>{g.nhom}</span>
                  <span style={{ color: g.tre > 0 ? '#DC2626' : '#1C3557' }}>{g.avgPct}%</span>
                </div>
                <div style={{ height:6, background:'#E5E7EB', borderRadius:3, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${g.avgPct}%`, background: g.tre > 0 ? '#DC2626' : '#1C3557', borderRadius:3, transition:'width .4s' }} />
                </div>
                {g.tre > 0 && <div style={{ fontSize:10, color:'#DC2626', marginTop:2 }}>{g.count} HM · {g.tre} trễ</div>}
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Second grid: Góp vốn | Rủi ro | Tasks */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14 }}>
        <Panel title="💼 GÓP VỐN LIÊN DANH"
               titleExtra={gvThieu > 0.01 ? <span style={{ fontSize:10, color:'#D97706', fontWeight:600 }}>Thiếu {fmtU(gvThieu, unit)}</span> : undefined}>
          {lienDanh.length === 0
            ? <div style={{ fontSize:12, color:'#9ca3af', padding:'20px 0', textAlign:'center' }}>Chưa có dữ liệu</div>
            : lienDanh.map(m => {
              const con = m.cam_ket - m.da_gop
              const pct = m.cam_ket > 0 ? Math.round(m.da_gop / m.cam_ket * 100) : 0
              return (
                <div key={m.key} style={{ marginBottom:14 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:'#1F2430', marginBottom:2 }}>{m.ten}</div>
                  <div style={{ height:4, background:'#E5E7EB', borderRadius:2, marginBottom:4 }}>
                    <div style={{ height:'100%', width:`${pct}%`, background: con > 1 ? '#D97706' : '#1C3557', borderRadius:2 }} />
                  </div>
                  <div style={{ fontSize:11, color:'#6B7280' }}>
                    Cam kết: <b style={{color:'#1F2430'}}>{fmtU(m.cam_ket, unit)}</b>
                    {' · '}Đã góp: <b style={{color:'#1C3557'}}>{fmtU(m.da_gop, unit)}</b>
                    {con > 0.01 && <> · <span style={{color:'#DC2626'}}>Còn {fmtU(con, unit)}</span></>}
                  </div>
                </div>
              )
            })}
        </Panel>

        <Panel title="⚡ MA TRẬN RỦI RO">
          {tasks.length === 0 && thiCong.filter(t => t.trang_thai === 'tre').length === 0
            ? <div style={{ fontSize:12, color:'#9ca3af', padding:'20px 0', textAlign:'center' }}>Không có rủi ro</div>
            : <>
              {thiCong.filter(t => t.trang_thai === 'tre').slice(0,3).map(t => (
                <RiskRow key={t.key} dot={2} title={`Trễ tiến độ: ${t.ma}`}
                  sub={`${t.nha_thau} · Trễ ${t.delay_days} ngày`} tag="Khẩn" tagCls="khan" />
              ))}
              {gvThieu > 0.01 && <RiskRow dot={2} title="Thiếu vốn góp liên danh" sub={`Còn thiếu ${fmtU(gvThieu, unit)}`} tag="Khẩn" tagCls="khan" />}
              {choDuyet.map(p => <RiskRow key={p.key} dot={1} title="Phiếu TT chờ duyệt" sub={`Tổng ${fmtU(p.so_tien, unit)}`} tag="Theo dõi" tagCls="theo-doi" />)}
            </>}
        </Panel>

        <Panel title="📋 VIỆC CEO / CFO XỬ LÝ"
               titleExtra={tasks.filter(t => t.urgency).length > 0
                 ? <span style={{ background:'#FEE2E2', color:'#DC2626', fontSize:10, borderRadius:4, padding:'2px 7px', fontWeight:700 }}>{tasks.filter(t => t.urgency).length} khẩn</span>
                 : undefined}>
          {tasks.length === 0
            ? <div style={{ fontSize:12, color:'#9ca3af', padding:'20px 0', textAlign:'center' }}>Không có việc</div>
            : tasks.slice(0,5).map(t => (
              <div key={t.key} style={{ display:'flex', gap:8, alignItems:'flex-start', marginBottom:10 }}>
                <span style={{ width:7, height:7, borderRadius:'50%', background: MUC_COLOR[t.muc], marginTop:4, flexShrink:0 }} />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:'#1F2430', lineHeight:1.4 }}>{t.ten}</div>
                  {t.mo_ta && <div style={{ fontSize:10.5, color:'#6B7280' }}>{t.mo_ta}</div>}
                </div>
                <span style={{ fontSize:10, fontWeight:700, color: MUC_COLOR[t.muc], whiteSpace:'nowrap' }}>
                  {MUC_LABEL[t.muc]}
                </span>
              </div>
            ))}
        </Panel>
      </div>
    </div>
  )
}

function KpiCard({ icon, label, val, sub, subColor }: { icon:string; label:string; val:string; sub:string; subColor?:string }) {
  return (
    <div style={{ background:'#fff', border:'1px solid #E5E0D8', borderRadius:12, padding:'16px 18px' }}>
      <div style={{ fontSize:10.5, fontWeight:700, color:'#9ca3af', letterSpacing:'.06em', marginBottom:8 }}>{icon} {label}</div>
      <div style={{ fontSize:26, fontWeight:800, color:'#1F2430', lineHeight:1.1, marginBottom:4 }}>{val}</div>
      <div style={{ fontSize:11.5, color: subColor ?? '#6B7280' }}>{sub}</div>
    </div>
  )
}

function AlertBadge({ icon, msg, color, border }: { icon:string; msg:string; color:string; border:string }) {
  return (
    <div style={{ background:color, border:`1px solid ${border}`, borderRadius:8, padding:'9px 14px', fontSize:12, color:'#92400E', display:'flex', gap:7, alignItems:'center' }}>
      {icon} {msg}
    </div>
  )
}

function Panel({ title, titleExtra, children }: { title:string; titleExtra?:React.ReactNode; children:React.ReactNode }) {
  return (
    <div style={{ background:'#fff', border:'1px solid #E5E0D8', borderRadius:12, padding:'14px 16px' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
        <div style={{ fontSize:11, fontWeight:700, color:'#6B7280', letterSpacing:'.06em' }}>{title}</div>
        {titleExtra}
      </div>
      {children}
    </div>
  )
}

function RiskRow({ dot, title, sub, tag, tagCls }: { dot:number; title:string; sub:string; tag:string; tagCls:string }) {
  const dotColor = dot >= 3 ? '#DC2626' : dot === 2 ? '#D97706' : '#2563EB'
  const tagStyle: Record<string, React.CSSProperties> = {
    'khan':     { background:'#FEE2E2', color:'#DC2626' },
    'theo-doi': { background:'#FEF3C7', color:'#D97706' },
  }
  return (
    <div style={{ display:'flex', gap:8, marginBottom:10, padding:'8px 10px', background:'#FAFAFA', borderRadius:8 }}>
      <div style={{ width:22, height:22, borderRadius:6, background:dotColor, color:'#fff', fontSize:11, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{dot}</div>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:11.5, fontWeight:600, color:'#1F2430' }}>{title}</div>
        <div style={{ fontSize:10.5, color:'#6B7280' }}>{sub}</div>
      </div>
      <span style={{ fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:5, whiteSpace:'nowrap', alignSelf:'flex-start', ...(tagStyle[tagCls] ?? {background:'#E5E7EB',color:'#374151'}) }}>{tag}</span>
    </div>
  )
}
