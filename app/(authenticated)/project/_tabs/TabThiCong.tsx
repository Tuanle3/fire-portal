'use client'
import { useState } from 'react'
import { getDb } from '@/lib/firebase'
import { ref, push, remove, set } from 'firebase/database'
import type { ThiCongItem, ProjectUnit } from '../_lib/types'
import { PREFIX, fmtU, TRANG_THAI_LABEL } from '../_lib/types'

interface Props { items: ThiCongItem[]; canEdit: boolean; onReload: () => void; unit: ProjectUnit }

const NHOM_LIST     = ['CP khác','Tư vấn ĐTXD','Thiết kế thi công','Xây lắp chính','Hoàn thiện','Hạ tầng kỹ thuật']
const TT_LIST       = [['dang_thi_cong','Đang TC'],['hoan_thanh','Hoàn thành'],['tre','Trễ TD'],['chua_bat_dau','Chưa BĐ']]
const TT_COLOR: Record<string, [string,string]> = {
  dang_thi_cong: ['#1C3557','#EFF6FF'],
  hoan_thanh:    ['#15803D','#F0FDF4'],
  tre:           ['#DC2626','#FEF2F2'],
  chua_bat_dau:  ['#6B7280','#F9FAFB'],
}

const EMPTY = { ma:'', ten:'', nhom:'CP khác', nha_thau:'', kl_ke_hoach:100, kl_thuc_te:0, pct:0, ngay_bd:'', ngay_kt:'', trang_thai:'chua_bat_dau', delay_days:0, goi_thau:'', gia_tri:0 }

export default function TabThiCong({ items, canEdit, onReload, unit }: Props) {
  const [form,    setForm]    = useState(EMPTY)
  const [editKey, setEditKey] = useState<string|null>(null)
  const [saving,  setSaving]  = useState(false)
  const [msg,     setMsg]     = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [filter,  setFilter]  = useState('')
  const [filterNhom, setFilterNhom] = useState('')

  const treCount  = items.filter(t => t.trang_thai === 'tre').length
  const doneCount = items.filter(t => t.trang_thai === 'hoan_thanh').length
  const avgPct    = items.length ? Math.round(items.reduce((s, t) => s + t.pct, 0) / items.length) : 0

  const filtered = items.filter(t =>
    (!filter || t.ten.toLowerCase().includes(filter.toLowerCase()) || t.nha_thau.toLowerCase().includes(filter.toLowerCase()) || t.ma.toLowerCase().includes(filter.toLowerCase())) &&
    (!filterNhom || t.nhom === filterNhom)
  )

  function set2(k: string, v: unknown) { setForm(p => ({ ...p, [k]: v })) }

  async function save() {
    if (!form.ten) return
    setSaving(true)
    const data = { ...form, kl_ke_hoach: Number(form.kl_ke_hoach), kl_thuc_te: Number(form.kl_thuc_te), pct: Number(form.pct), delay_days: Number(form.delay_days), gia_tri: Number(form.gia_tri) }
    const db = getDb()
    if (editKey) await set(ref(db, `${PREFIX}_ThiCong/${editKey}`), data)
    else         await push(ref(db, `${PREFIX}_ThiCong`), data)
    setSaving(false); setMsg('✓ Đã lưu'); onReload()
    setForm(EMPTY); setEditKey(null); setShowAdd(false)
  }

  async function del(key: string) {
    if (!confirm('Xóa hạng mục này?')) return
    await remove(ref(getDb(), `${PREFIX}_ThiCong/${key}`))
    onReload()
  }

  const nhomGroups = Array.from(new Set(items.map(t => t.nhom)))

  return (
    <div>
      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:18 }}>
        <Kpi label="TIẾN ĐỘ TB" val={`${avgPct}%`} color="#1C3557" />
        <Kpi label="TỔNG HẠNG MỤC" val={String(items.length)} color="#374151" />
        <Kpi label="TRỄ TIẾN ĐỘ" val={String(treCount)} color={treCount>0?'#DC2626':'#15803D'} />
        <Kpi label="HOÀN THÀNH" val={String(doneCount)} color="#15803D" />
      </div>

      {/* Group summary */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:18 }}>
        {nhomGroups.map(nhom => {
          const gs = items.filter(t => t.nhom === nhom)
          const avg = Math.round(gs.reduce((s, t) => s + t.pct, 0) / gs.length)
          const tre = gs.filter(t => t.trang_thai === 'tre').length
          return (
            <div key={nhom} style={{ background:'#fff', border:'1px solid #E5E0D8', borderRadius:10, padding:'12px 14px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8, fontSize:12, fontWeight:700, color:'#1F2430' }}>
                <span>{nhom}</span>
                <span style={{ color: tre > 0 ? '#DC2626' : '#15803D' }}>{avg}%</span>
              </div>
              <div style={{ height:6, background:'#E5E7EB', borderRadius:3 }}>
                <div style={{ width:`${avg}%`, height:'100%', background: tre>0?'#DC2626':'#1C3557', borderRadius:3 }} />
              </div>
              <div style={{ fontSize:10.5, color:'#9ca3af', marginTop:5 }}>{gs.length} HM{tre>0 ? ` · ${tre} trễ` : ''}</div>
            </div>
          )
        })}
      </div>

      {/* Toolbar */}
      <div style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
        <input style={{ ...inp, flex:1, minWidth:150 }} placeholder="🔍 Tìm hạng mục, nhà thầu..." value={filter} onChange={e=>setFilter(e.target.value)} />
        <select style={{ ...inp, width:'auto' }} value={filterNhom} onChange={e=>setFilterNhom(e.target.value)}>
          <option value="">Tất cả nhóm</option>
          {nhomGroups.map(n => <option key={n}>{n}</option>)}
        </select>
        {canEdit && <button style={btnP} onClick={() => { setShowAdd(s=>!s); setEditKey(null); setForm(EMPTY) }}>➕ Thêm hạng mục</button>}
      </div>

      {/* Add/Edit form */}
      {(showAdd || editKey) && canEdit && (
        <div style={{ background:'#F5F8FC', border:'1px solid #D0DCE8', borderRadius:12, padding:'16px 18px', marginBottom:16 }}>
          <div style={{ fontWeight:700, color:'#1C3557', marginBottom:12, fontSize:13 }}>{editKey ? '✏️ Sửa hạng mục' : '➕ Thêm hạng mục thi công'}</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
            <F label="Mã HM"><input style={inp} value={form.ma} onChange={e=>set2('ma',e.target.value)} placeholder="GT-007"/></F>
            <F label="Tên hạng mục *"><input style={inp} value={form.ten} onChange={e=>set2('ten',e.target.value)} placeholder="Tên hạng mục"/></F>
            <F label="Nhóm">
              <select style={inp} value={form.nhom} onChange={e=>set2('nhom',e.target.value)}>
                {NHOM_LIST.map(n=><option key={n}>{n}</option>)}
              </select>
            </F>
            <F label="Nhà thầu"><input style={inp} value={form.nha_thau} onChange={e=>set2('nha_thau',e.target.value)}/></F>
            <F label="Gói thầu"><input style={inp} value={form.goi_thau} onChange={e=>set2('goi_thau',e.target.value)}/></F>
            <F label="Giá trị (tỷ)"><input style={inp} type="number" value={form.gia_tri} onChange={e=>set2('gia_tri',e.target.value)}/></F>
            <F label="KL kế hoạch (%)"><input style={inp} type="number" value={form.kl_ke_hoach} onChange={e=>set2('kl_ke_hoach',e.target.value)}/></F>
            <F label="KL thực tế (%)"><input style={inp} type="number" value={form.kl_thuc_te} onChange={e=>{ const v=Number(e.target.value); set2('kl_thuc_te',v); set2('pct',Math.round(v/(Number(form.kl_ke_hoach)||100)*100)) }}/></F>
            <F label="Tiến độ (%)"><input style={inp} type="number" value={form.pct} onChange={e=>set2('pct',e.target.value)} min="0" max="100"/></F>
            <F label="Ngày bắt đầu"><input style={inp} type="date" value={form.ngay_bd} onChange={e=>set2('ngay_bd',e.target.value)}/></F>
            <F label="Ngày kết thúc KH"><input style={inp} type="date" value={form.ngay_kt} onChange={e=>set2('ngay_kt',e.target.value)}/></F>
            <F label="Trạng thái">
              <select style={inp} value={form.trang_thai} onChange={e=>set2('trang_thai',e.target.value)}>
                {TT_LIST.map(([v,l])=><option key={v} value={v}>{l}</option>)}
              </select>
            </F>
            <F label="Số ngày trễ"><input style={inp} type="number" value={form.delay_days} onChange={e=>set2('delay_days',e.target.value)}/></F>
          </div>
          <div style={{ display:'flex', gap:8, marginTop:12, alignItems:'center' }}>
            <button style={btnP} onClick={save} disabled={saving||!form.ten}>{saving?'Đang lưu...':'💾 Lưu'}</button>
            <button style={btnO} onClick={()=>{ setShowAdd(false); setEditKey(null) }}>Hủy</button>
            {msg && <span style={{ fontSize:12, color:'#15803D' }}>{msg}</span>}
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{ background:'#fff', border:'1px solid #E5E0D8', borderRadius:12, overflow:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, minWidth:900 }}>
          <thead>
            <tr style={{ background:'#F5F8FC' }}>
              {['Mã','Tên hạng mục','Nhóm','Nhà thầu','Tiến độ','Ngày BD','Ngày KT','Trễ (ngày)','Trạng thái',''].map(h=>(
                <th key={h} style={{ padding:'10px 12px', textAlign:'left', fontWeight:700, color:'#6B7280', borderBottom:'1px solid #E5E0D8', whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length===0 && <tr><td colSpan={10} style={{ padding:32, textAlign:'center', color:'#9ca3af' }}>Chưa có dữ liệu</td></tr>}
            {filtered.map(t => {
              const [c, bg] = TT_COLOR[t.trang_thai] ?? ['#6B7280','#F9FAFB']
              return (
                <tr key={t.key} style={{ borderBottom:'1px solid #F3F4F6' }}>
                  <td style={{ padding:'9px 12px', fontFamily:'monospace', color:'#6B7280', fontSize:11 }}>{t.ma}</td>
                  <td style={{ padding:'9px 12px', fontWeight:600, color:'#1F2430', maxWidth:200 }}>{t.ten}</td>
                  <td style={{ padding:'9px 12px', color:'#374151' }}>{t.nhom}</td>
                  <td style={{ padding:'9px 12px', color:'#374151' }}>{t.nha_thau||'—'}</td>
                  <td style={{ padding:'9px 12px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                      <div style={{ width:60, height:5, background:'#E5E7EB', borderRadius:3 }}>
                        <div style={{ width:`${t.pct}%`, height:'100%', background: c, borderRadius:3 }} />
                      </div>
                      <span style={{ fontWeight:700, color: c, width:34 }}>{t.pct}%</span>
                    </div>
                  </td>
                  <td style={{ padding:'9px 12px', color:'#6B7280' }}>{t.ngay_bd||'—'}</td>
                  <td style={{ padding:'9px 12px', color:'#6B7280' }}>{t.ngay_kt||'—'}</td>
                  <td style={{ padding:'9px 12px', color: t.delay_days>0?'#DC2626':'#9ca3af', fontWeight: t.delay_days>0?700:400 }}>{t.delay_days>0?t.delay_days:'—'}</td>
                  <td style={{ padding:'9px 12px' }}><span style={{ background:bg, color:c, fontSize:10.5, fontWeight:700, padding:'3px 8px', borderRadius:5 }}>{TRANG_THAI_LABEL[t.trang_thai]??t.trang_thai}</span></td>
                  {canEdit && (
                    <td style={{ padding:'9px 12px', whiteSpace:'nowrap' }}>
                      <button style={btnSm} onClick={()=>{ setEditKey(t.key); setForm({ ma:t.ma, ten:t.ten, nhom:t.nhom, nha_thau:t.nha_thau, kl_ke_hoach:t.kl_ke_hoach, kl_thuc_te:t.kl_thuc_te, pct:t.pct, ngay_bd:t.ngay_bd, ngay_kt:t.ngay_kt, trang_thai:t.trang_thai, delay_days:t.delay_days, goi_thau:t.goi_thau, gia_tri:t.gia_tri }); setShowAdd(false); setMsg('') }}>✏️</button>
                      {' '}
                      <button style={{...btnSm,color:'#DC2626'}} onClick={()=>del(t.key)}>🗑</button>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Kpi({ label, val, color }: { label:string; val:string; color:string }) {
  return (
    <div style={{ background:'#fff', border:'1px solid #E5E0D8', borderRadius:10, padding:'12px 16px' }}>
      <div style={{ fontSize:10, fontWeight:700, color:'#9ca3af', letterSpacing:'.06em', marginBottom:5 }}>{label}</div>
      <div style={{ fontSize:28, fontWeight:800, color }}>{val}</div>
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
