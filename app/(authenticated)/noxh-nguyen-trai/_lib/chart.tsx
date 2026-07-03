import { useRef, useEffect } from 'react'
import type React from 'react'
import type { Project } from './types'

// ── Chart hook ────────────────────────────────────────────────────────────────
export function useChart(
  ref: React.RefObject<HTMLCanvasElement | null>,
  project: Project | null,
  type: 'line' | 'bar' | 'donut',
  donVi: 'ty'|'trieu'|'dong' = 'ty'
) {
  const inst = useRef<any>(null)
  useEffect(() => {
    if (!ref.current || !project) return
    const build = () => {
      const Chart = (window as any).Chart
      if (!Chart || !ref.current) return
      inst.current?.destroy()
      const ctx = ref.current.getContext('2d')!
      if (type === 'line') {
        inst.current = new Chart(ctx, {
          type: 'line',
          data: { labels: project.thuChi.labels, datasets: [
            { label:'Thu KH', data: project.thuChi.thu, borderColor:'#1C3557', backgroundColor:'rgba(28,53,87,.08)', borderWidth:2, tension:.4, pointRadius:4, fill:true },
            { label:'Giải ngân', data: project.thuChi.giaiNgan, borderColor:'#1F6B3D', borderWidth:1.5, tension:.4, pointRadius:3, fill:false },
            { label:'Chi thi công', data: project.thuChi.chiTC, borderColor:'#DC2626', borderWidth:1.5, borderDash:[5,3], tension:.4, pointRadius:3, fill:false },
          ]},
          options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:true, position:'top', labels:{ boxWidth:10, font:{ size:10 }, color:'#6B7280' }}}, scales:{ x:{ grid:{display:false}, ticks:{font:{size:10},color:'#6B7280'}}, y:{ grid:{color:'#F0F0F0'}, ticks:{font:{size:10},color:'#6B7280'}}}},
        })
      } else if (type === 'bar') {
        inst.current = new Chart(ctx, {
          type: 'bar',
          data: { labels: project.thuChi.labels, datasets: [
            { label:`Giải ngân (${donVi==='trieu'?'tr':donVi==='dong'?'đ':'tỷ'})`, data: project.thuChi.giaiNgan, backgroundColor:'rgba(28,53,87,.8)', borderRadius:5 },
            { label:`Thu về (${donVi==='trieu'?'tr':donVi==='dong'?'đ':'tỷ'})`,    data: project.thuChi.thu,      backgroundColor:'rgba(212,166,74,.75)', borderRadius:5 },
          ]},
          options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ labels:{ font:{size:10}, color:'#6B7280', boxWidth:10 }}}, scales:{ x:{ grid:{display:false}, ticks:{font:{size:10}}}, y:{ grid:{color:'#F0F0F0'}, ticks:{font:{size:10}}}}},
        })
      } else {
        inst.current = new Chart(ctx, {
          type: 'doughnut',
          data: { labels: project.donut.labels, datasets: [{ data: project.donut.vals, backgroundColor: project.donut.colors, borderWidth:0, hoverOffset:4 }]},
          options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}}, cutout:'65%' },
        })
      }
    }
    if ((window as any).Chart) { build() }
    else {
      if (!document.querySelector('script[data-chartjs]')) {
        const s = document.createElement('script')
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js'
        s.setAttribute('data-chartjs','1')
        s.onload = build
        document.head.appendChild(s)
      } else { setTimeout(build, 200) }
    }
    return () => { inst.current?.destroy(); inst.current = null }
  }, [project, type, ref, donVi])
}
