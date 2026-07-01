'use client'
import { useState } from 'react'
import { getDb } from '@/lib/firebase'
import { ref, push, remove, set } from 'firebase/database'
import type { Phase, ProjectUnit } from '../_lib/types'
import { PREFIX, TRANG_THAI_LABEL } from '../_lib/types'

interface Props { phases: Phase[]; canEdit: boolean; onReload: () => void; unit: ProjectUnit }

const TT_LIST = [['done','Hoàn thành'],['active','Đang thực hiện'],['pending','Chờ thực hiện']]
const TT_COLOR: Record<string, string> = { done:'#15803D', active:'#1C3557', pending:'#9ca3af' }
const TT_BG:    Record<string, string> = { done:'#F0FDF4', active:'#EFF6FF', pending:'#F9FAFB' }
const TT_DOT:   Record<string, string> = { done:'✓', active:'▶', pending:'○' }

export default function TabTienDo({ phases, canEdit, onReload }: Props) {
  const sorted = [...phases].sort((a, b) => a.thu_tu - b.thu_tu)
  const [showAdd, setShowAdd] = useState(false)
  const [form,    setForm]    = useState({ ten:'', pct:'0', trang_thai:'pending', thu_tu:phases.length+1 })
  const [editKey, setEditKey] = useState<string|null>(null)
  const [saving,  setSaving]  = useState(false)
  const [msg,     setMsg]     = useState('')

  async function save() {
    if (!form.ten) return
    setSaving(true)
    const data = { ten:form.ten, pct:parseInt(form.pct)||0, trang_thai:form.trang_thai, thu_tu:Number(form.thu_tu) }
    const db = getDb()
    if (editKey) await set(ref(db,`${PREFIX}_TienDo/${editKey}`), data)
    else         await push(ref(db,`${PREFIX}_TienDo`), data)
    setSaving(false); setMsg('✓'); onReload()
    setForm({ ten:'', pct:'0', trang_thai:'pending', thu_tu:phases.length+2 }); setEditKey(null); setShowAdd(false)
  }

  return (
    <div>
      {/* Timeline */}
      <div style={{ display:'flex', gap:24, flexWrap:'wrap' }}>
        {/* Left: Visual timeline */}
        <div style={{ flex:'0 0 340px', background:'#fff', border:'1px solid #E5E0D8', borderRadius:14, padding:'24px 20px' }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#6B7280', letterSpacing:'.06em', marginBottom:20 }}>TIẾN ĐỘ DỰ ÁN</div>
          <div style={{ position:'relative' }}>
            {sorted.length === 0 && <div style={{ color:'#9ca3af', fontSize:13, textAlign:'center', padding:'20px 0' }}>Chưa có giai đoạn</div>}
            {sorted.map((p, i) => {
              const c = TT_COLOR[p.trang_thai] ?? '#9ca3af'
              const bg = TT_BG[p.trang_thai] ?? '#F9FAFB'
              const dot = TT_DOT[p.trang_thai] ?? '○'
              return (
                <div key={p.key} style={{ display:'flex', gap:14, marginBottom:i < sorted.length-1 ? 0 : 0 }}>
                  {/* Dot + line */}
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', width:28 }}>
                    <div style={{ width:28, height:28, borderRadius:'50%', background:bg, border:`2px solid ${c}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, color:c, flexShrink:0 }}>{dot}</div>
                    {i < sorted.length-1 && <div style={{ width:2, flex:1, background:'#E5E7EB', minHeight:32 }} />}
                  </div>
                  {/* Content */}
                  <div style={{ flex:1, paddingBottom:24, paddingTop:2 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:'#1F2430' }}>{p.ten}</div>
                      <div style={{ fontSize:12, fontWeight:800, color:c }}>{p.pct}%</div>
                    </div>
                    <div style={{ height:6, background:'#E5E7EB', borderRadius:3, marginBottom:6 }}>
                      <div style={{ width:`${p.pct}%`, height:'100%', background:c, borderRadius:3, transition:'width .4s' }} />
                    </div>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                      <span style={{ fontSize:11, fontWeight:700, color:c, background:bg, padding:'2px 8px', borderRadius:5 }}>
                        {p.trang_thai==='done'?'✓ Hoàn thành':p.trang_thai==='active'?'▶ Đang thực hiện':'○ Chờ'}
                      </span>
                      {canEdit && (
                        <div style={{ display:'flex', gap:4 }}>
                          <button style={btnSm} onClick={()=>{ setEditKey(p.key); setForm({ ten:p.ten, pct:String(p.pct), trang_thai:p.trang_thai, thu_tu:p.thu_tu }); setShowAdd(false) }}>✏️</button>
                          <button style={{...btnSm,color:'#DC2626'}} onClick={async()=>{ if(confirm('Xóa giai đoạn này?')){ await remove(ref(getDb(),`${PREFIX}_TienDo/${p.key}`)); onReload() } }}>🗑</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          {canEdit && (
            <button style={{ ...btnP, width:'100%', marginTop:8, justifyContent:'center', display:'flex' }} onClick={()=>{ setShowAdd(s=>!s); setEditKey(null); setForm({ten:'',pct:'0',trang_thai:'pending',thu_tu:sorted.length+1}) }}>
              ➕ Thêm giai đoạn
            </button>
          )}
        </div>

        {/* Right: Form + Summary */}
        <div style={{ flex:1, minWidth:260 }}>
          {/* Add/Edit form */}
          {(showAdd || editKey) && canEdit && (
            <div style={{ background:'#F5F8FC', border:'1px solid #D0DCE8', borderRadius:12, padding:'18px 20px', marginBottom:16 }}>
              <div style={{ fontWeight:700, color:'#1C3557', marginBottom:14, fontSize:13 }}>{editKey ? '✏️ Sửa giai đoạn' : '➕ Thêm giai đoạn'}</div>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                <F label="Tên giai đoạn *"><input style={inp} value={form.ten} onChange={e=>setForm(p=>({...p,ten:e.target.value}))} placeholder="Tên giai đoạn"/></F>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  <F label="Tiến độ (%)"><input style={inp} type="number" min="0" max="100" value={form.pct} onChange={e=>setForm(p=>({...p,pct:e.target.value}))}/></F>
                  <F label="Thứ tự"><input style={inp} type="number" value={form.thu_tu} onChange={e=>setForm(p=>({...p,thu_tu:Number(e.target.value)}))}/></F>
                </div>
                <F label="Trạng thái">
                  <select style={inp} value={form.trang_thai} onChange={e=>setForm(p=>({...p,trang_thai:e.target.value}))}>
                    {TT_LIST.map(([v,l])=><option key={v} value={v}>{l}</option>)}
                  </select>
                </F>
              </div>
              <div style={{ display:'flex', gap:8, marginTop:12, alignItems:'center' }}>
                <button style={btnP} onClick={save} disabled={saving||!form.ten}>{saving?'Đang lưu...':'💾 Lưu'}</button>
                <button style={btnO} onClick={()=>{ setShowAdd(false); setEditKey(null) }}>Hủy</button>
                {msg && <span style={{ fontSize:12, color:'#15803D' }}>{msg}</span>}
              </div>
            </div>
          )}

          {/* Stats */}
          <div style={{ background:'#fff', border:'1px solid #E5E0D8', borderRadius:12, padding:'18px 20px' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#6B7280', letterSpacing:'.06em', marginBottom:14 }}>TỔNG KẾT TIẾN ĐỘ</div>
            {TT_LIST.map(([tt, label]) => {
              const cnt = sorted.filter(p => p.trang_thai === tt).length
              const c = TT_COLOR[tt]
              return (
                <div key={tt} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12, padding:'10px 14px', background:TT_BG[tt], borderRadius:8 }}>
                  <span style={{ fontSize:12, fontWeight:600, color:'#374151' }}>{label}</span>
                  <span style={{ fontSize:20, fontWeight:800, color:c }}>{cnt}</span>
                </div>
              )
            })}
            <div style={{ borderTop:'1px solid #E5E0D8', paddingTop:12, marginTop:4 }}>
              <div style={{ fontSize:11, color:'#6B7280', marginBottom:4 }}>Tiến độ tổng thể</div>
              <div style={{ height:8, background:'#E5E7EB', borderRadius:4 }}>
                <div style={{ width:`${sorted.length?Math.round(sorted.reduce((s,p)=>s+p.pct,0)/sorted.length):0}%`, height:'100%', background:'#1C3557', borderRadius:4 }} />
              </div>
              <div style={{ fontSize:14, fontWeight:800, color:'#1C3557', marginTop:6 }}>
                {sorted.length ? Math.round(sorted.reduce((s,p)=>s+p.pct,0)/sorted.length) : 0}%
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function F({ label, children }: { label:string; children:React.ReactNode }) {
  return <div><label style={{ fontSize:11, fontWeight:700, color:'#374151', display:'block', marginBottom:4 }}>{label}</label>{children}</div>
}

const inp:  React.CSSProperties = { width:'100%', padding:'7px 10px', border:'1px solid #D1D5DB', borderRadius:7, fontSize:12, fontFamily:'inherit', color:'#1F2430', boxSizing:'border-box' }
const btnP: React.CSSProperties = { padding:'8px 16px', background:'#1C3557', color:'#fff', border:'none', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }
const btnO: React.CSSProperties = { padding:'8px 16px', background:'transparent', color:'#1C3557', border:'1.5px solid #1C3557', borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }
const btnSm:React.CSSProperties = { padding:'4px 8px', background:'#F3F4F6', border:'1px solid #E5E7EB', borderRadius:5, cursor:'pointer', fontSize:12, fontFamily:'inherit' }
