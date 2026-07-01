'use client'
import { useState } from 'react'
import { getDb } from '@/lib/firebase'
import { ref, push, remove, set } from 'firebase/database'
import type { BanHangUnit, ProjectInfo, ProjectUnit } from '../_lib/types'
import { PREFIX, fmtU } from '../_lib/types'

interface Props { units: BanHangUnit[]; info: ProjectInfo; canEdit: boolean; onReload: () => void; unit: ProjectUnit }

const TT_LIST = [['chua_ban','Chưa bán'],['dat_coc','Đặt cọc'],['ky_hop_dong','Ký HĐ'],['ban_giao','Bàn giao']]
const TT_COLOR: Record<string, [string,string]> = {
  chua_ban:    ['#6B7280','#F9FAFB'],
  dat_coc:     ['#D97706','#FFFBEB'],
  ky_hop_dong: ['#1C3557','#EFF6FF'],
  ban_giao:    ['#15803D','#F0FDF4'],
}
const LOAI_LIST = ['NOXH','Thương mại','Đất nền','Shophouse']

const EMPTY = { can_ho:'', loai:'NOXH', dien_tich:'', dien_tich_sd:'', gia:'', khach:'', ngay_ban:'', trang_thai:'chua_ban', tang:'' }

export default function TabBanHang({ units, info, canEdit, onReload, unit }: Props) {
  const [form,    setForm]    = useState(EMPTY)
  const [editKey, setEditKey] = useState<string|null>(null)
  const [saving,  setSaving]  = useState(false)
  const [msg,     setMsg]     = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [filter,  setFilter]  = useState('')
  const [filterTT,setFilterTT]= useState('')

  const sold  = units.filter(u => u.trang_thai !== 'chua_ban').length
  const revenue = units.filter(u => ['ky_hop_dong','ban_giao'].includes(u.trang_thai)).reduce((s, u) => s + u.gia, 0)

  const filtered = units.filter(u =>
    (!filter || u.can_ho.toLowerCase().includes(filter.toLowerCase()) || u.khach.toLowerCase().includes(filter.toLowerCase())) &&
    (!filterTT || u.trang_thai === filterTT)
  )

  function set2(k: string, v: string) { setForm(p => ({ ...p, [k]: v })) }

  async function save() {
    if (!form.can_ho) return
    setSaving(true)
    const data = { ...form, dien_tich: parseFloat(form.dien_tich)||0, dien_tich_sd: parseFloat(form.dien_tich_sd)||0, gia: parseFloat(form.gia)||0 }
    const db = getDb()
    if (editKey) await set(ref(db,`${PREFIX}_BanHang/${editKey}`), data)
    else         await push(ref(db,`${PREFIX}_BanHang`), data)
    setSaving(false); setMsg('✓'); onReload()
    setForm(EMPTY); setEditKey(null); setShowAdd(false)
  }

  return (
    <div>
      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:18 }}>
        <Kpi label="TỔNG SẢN PHẨM" val={String(info.totalUnits)} color="#374151" />
        <Kpi label="ĐÃ BÁN / GD" val={`${sold}`} color="#1C3557" sub={`Hấp thụ ${info.totalUnits>0?(sold/info.totalUnits*100).toFixed(1):0}%`} />
        <Kpi label="DOANH THU GHI NHẬN" val={fmtU(revenue, unit)} color="#15803D" />
        <Kpi label="CÒN LẠI" val={String(info.totalUnits - sold)} color="#D97706" />
      </div>

      {/* Status distribution */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:18 }}>
        {TT_LIST.map(([tt, label]) => {
          const cnt = units.filter(u => u.trang_thai === tt).length
          const [c, bg] = TT_COLOR[tt]
          return (
            <div key={tt} style={{ background:bg, border:`1px solid ${c}30`, borderRadius:10, padding:'12px 14px', textAlign:'center', cursor:'pointer' }}
              onClick={() => setFilterTT(filterTT===tt?'':tt)}>
              <div style={{ fontSize:10, fontWeight:700, color:c, letterSpacing:'.05em', marginBottom:6 }}>{label.toUpperCase()}</div>
              <div style={{ fontSize:28, fontWeight:800, color:c }}>{cnt}</div>
            </div>
          )
        })}
      </div>

      {/* Toolbar */}
      <div style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
        <input style={{ ...inp, flex:1, minWidth:140 }} placeholder="🔍 Mã căn, tên khách..." value={filter} onChange={e=>setFilter(e.target.value)} />
        <select style={{ ...inp, width:'auto' }} value={filterTT} onChange={e=>setFilterTT(e.target.value)}>
          <option value="">Tất cả trạng thái</option>
          {TT_LIST.map(([v,l])=><option key={v} value={v}>{l}</option>)}
        </select>
        {canEdit && <button style={btnP} onClick={()=>{ setShowAdd(s=>!s); setEditKey(null); setForm(EMPTY) }}>➕ Thêm căn hộ</button>}
      </div>

      {/* Add/Edit form */}
      {(showAdd || editKey) && canEdit && (
        <div style={{ background:'#F5F8FC', border:'1px solid #D0DCE8', borderRadius:12, padding:'16px 18px', marginBottom:16 }}>
          <div style={{ fontWeight:700, color:'#1C3557', marginBottom:12, fontSize:13 }}>{editKey ? '✏️ Sửa căn hộ' : '➕ Thêm căn hộ'}</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
            <F label="Mã căn *"><input style={inp} value={form.can_ho} onChange={e=>set2('can_ho',e.target.value)} placeholder="A01-T05"/></F>
            <F label="Loại">
              <select style={inp} value={form.loai} onChange={e=>set2('loai',e.target.value)}>
                {LOAI_LIST.map(l=><option key={l}>{l}</option>)}
              </select>
            </F>
            <F label="Tầng"><input style={inp} value={form.tang} onChange={e=>set2('tang',e.target.value)} placeholder="5"/></F>
            <F label="Diện tích XD (m²)"><input style={inp} type="number" value={form.dien_tich} onChange={e=>set2('dien_tich',e.target.value)}/></F>
            <F label="Diện tích SD (m²)"><input style={inp} type="number" value={form.dien_tich_sd} onChange={e=>set2('dien_tich_sd',e.target.value)}/></F>
            <F label="Giá bán (tỷ)"><input style={inp} type="number" value={form.gia} onChange={e=>set2('gia',e.target.value)}/></F>
            <F label="Khách hàng"><input style={inp} value={form.khach} onChange={e=>set2('khach',e.target.value)}/></F>
            <F label="Ngày giao dịch"><input style={inp} type="date" value={form.ngay_ban} onChange={e=>set2('ngay_ban',e.target.value)}/></F>
            <F label="Trạng thái">
              <select style={inp} value={form.trang_thai} onChange={e=>set2('trang_thai',e.target.value)}>
                {TT_LIST.map(([v,l])=><option key={v} value={v}>{l}</option>)}
              </select>
            </F>
          </div>
          <div style={{ display:'flex', gap:8, marginTop:12, alignItems:'center' }}>
            <button style={btnP} onClick={save} disabled={saving||!form.can_ho}>{saving?'Đang lưu...':'💾 Lưu'}</button>
            <button style={btnO} onClick={()=>{ setShowAdd(false); setEditKey(null) }}>Hủy</button>
            {msg&&<span style={{ fontSize:12, color:'#15803D' }}>{msg}</span>}
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{ background:'#fff', border:'1px solid #E5E0D8', borderRadius:12, overflow:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, minWidth:800 }}>
          <thead>
            <tr style={{ background:'#F5F8FC' }}>
              {['Mã căn','Loại','Tầng','DT XD','DT SD','Giá','Khách hàng','Ngày GD','Trạng thái',''].map(h=>(
                <th key={h} style={{ padding:'10px 12px', textAlign:'left', fontWeight:700, color:'#6B7280', borderBottom:'1px solid #E5E0D8', whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length===0 && <tr><td colSpan={10} style={{ padding:32, textAlign:'center', color:'#9ca3af' }}>Chưa có dữ liệu</td></tr>}
            {filtered.map(u => {
              const [c, bg] = TT_COLOR[u.trang_thai]
              return (
                <tr key={u.key} style={{ borderBottom:'1px solid #F3F4F6' }}>
                  <td style={{ padding:'9px 12px', fontWeight:700, color:'#1F2430' }}>{u.can_ho}</td>
                  <td style={{ padding:'9px 12px', color:'#374151' }}>{u.loai}</td>
                  <td style={{ padding:'9px 12px', color:'#374151' }}>{u.tang||'—'}</td>
                  <td style={{ padding:'9px 12px', color:'#374151' }}>{u.dien_tich ? `${u.dien_tich}m²` : '—'}</td>
                  <td style={{ padding:'9px 12px', color:'#374151' }}>{u.dien_tich_sd ? `${u.dien_tich_sd}m²` : '—'}</td>
                  <td style={{ padding:'9px 12px', fontWeight:700, color:'#1C3557' }}>{u.gia ? fmtU(u.gia, unit) : '—'}</td>
                  <td style={{ padding:'9px 12px', color:'#374151' }}>{u.khach||'—'}</td>
                  <td style={{ padding:'9px 12px', color:'#6B7280' }}>{u.ngay_ban||'—'}</td>
                  <td style={{ padding:'9px 12px' }}><span style={{ background:bg, color:c, fontSize:10.5, fontWeight:700, padding:'3px 8px', borderRadius:5 }}>{TT_LIST.find(([v])=>v===u.trang_thai)?.[1]??u.trang_thai}</span></td>
                  {canEdit && (
                    <td style={{ padding:'9px 12px', whiteSpace:'nowrap' }}>
                      <button style={btnSm} onClick={()=>{ setEditKey(u.key); setForm({ can_ho:u.can_ho, loai:u.loai, dien_tich:String(u.dien_tich), dien_tich_sd:String(u.dien_tich_sd), gia:String(u.gia), khach:u.khach, ngay_ban:u.ngay_ban, trang_thai:u.trang_thai, tang:u.tang }); setShowAdd(false) }}>✏️</button>
                      {' '}
                      <button style={{...btnSm,color:'#DC2626'}} onClick={async()=>{ if(confirm('Xóa?')){ await remove(ref(getDb(),`${PREFIX}_BanHang/${u.key}`)); onReload() } }}>🗑</button>
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

function Kpi({ label, val, color, sub }: { label:string; val:string; color:string; sub?:string }) {
  return (
    <div style={{ background:'#fff', border:'1px solid #E5E0D8', borderRadius:10, padding:'12px 16px' }}>
      <div style={{ fontSize:10, fontWeight:700, color:'#9ca3af', letterSpacing:'.06em', marginBottom:5 }}>{label}</div>
      <div style={{ fontSize:24, fontWeight:800, color }}>{val}</div>
      {sub && <div style={{ fontSize:11, color:'#6B7280', marginTop:2 }}>{sub}</div>}
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
