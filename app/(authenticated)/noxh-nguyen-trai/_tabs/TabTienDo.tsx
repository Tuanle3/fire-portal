'use client'
import { Project, PHASE_ICON } from '../_lib/types'

export function TabTienDo({ p, donVi='ty' }: { p: Project; donVi?: 'ty'|'trieu'|'dong' }) {
  return (
    <div className="sc">
      <div className="sc-head"><span className="sc-title">📅 Tiến độ giai đoạn</span></div>
      <div className="sc-body">
        {p.phases.map((ph,i)=>(
          <div key={i} className="phase-row">
            <div className="phase-connector">
              <div className={`phase-dot phase-dot-${ph.state}`}>{PHASE_ICON[ph.state]}</div>
              {i<p.phases.length-1 && <div className="phase-line"/>}
            </div>
            <div className="phase-content">
              <div className="phase-name">{ph.name}</div>
              <div className="phase-bar-wrap">
                <div className="phase-bar"><div className={`phase-bar-fill phase-bar-fill-${ph.state}`} style={{width:`${ph.pct}%`}}/></div>
                <span className="phase-pct">{ph.pct}%</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
