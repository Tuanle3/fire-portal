'use client'
import { useState } from 'react'
import { getDb } from '@/lib/firebase'
import { ref, push, remove } from 'firebase/database'
import type { ThanhToanRow, ProjectUnit } from '../_lib/types'
import { PREFIX, fmtU } from '../_lib/types'

interface Props { payments: ThanhToanRow[]; canEdit: boolean; onReload: () => void; unit: ProjectUnit }

const NHOM_LIST = ['Thu','Chi nhà thầu','Chi trả NCC','Chi hoạt động','Chi khác']

export default function TabKeToan({ payments, canEdit, onReload, unit }: Props) {
  const [form,   setForm]   = useState({ nhom:'Chi nhà thầu', loai:'', so_tien:'', ngay:'', thang:new Date().getMonth()+1, nam:new Date().getFullYear(), trang_thai:'cho_duyet', ghi_chu:'', nha_thau:'' })
  const [saving, setSaving] = useState(false)
  const [msg,    setMsg]    = useState('')
  const [show,   setShow]   = useState(false)
  const [filter, setFilter] = useState('')

  const pending  = payments.filter(p => p.trang_thai === 'cho_duyet')
  const approved = payments.filter(p => p.trang_thai === 'da_thanh_toan')
  const filtered = payments.filter(p => !filter || p.nhom.toLowerCase().includes(filter.toLowerCase()) || p.nha_thau.toLowerCase().includes(filter.toLowerCase()) || p.loai.toLowerCase().includes(filter.toLowerCase()))

  async function save() {
    setSaving(true)
    await push(ref(getDb(), `${PREFIX}_ThanhToan`), {
      ...form, so_tien: parseFloat(form.so_tien)||0, thang: Number(form.thang), nam: Number(form.nam),
    })
    setSaving(false); setMsg('✓ Đã tạo phiếu'); onReload()
    setForm({ nhom:'Chi nhà thầu', loai:'', so_tien:'', ngay:'', thang:new Date().getMonth()+1, nam:new Date().getFullYear(), trang_thai:'cho_duyet', ghi_chu:'', nha_thau:'' })
    setShow(false)
  }

  async function approve(key: string) {
    const { set } = await import('firebase/database')
    const db = getDb()
    await set(ref(db, `${PREFIX}_ThanhToan/${key}/trang_thai`), 'da_thanh_toan')
    onReload()
  }

  const pendingAmt = pending.reduce((s, p) => s + p.so_tien, 0)

  return (
    <div>
      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:18 }}>
        <div style={{ background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:12, padding:'14px 16px' }}>
          <div style={{ fontSize:10, fontWeight:700, color:'#D97706', letterSpacing:'.06em', marginBottom:5 }}>PHIẾU CHỜ DUYỆT</div>
          <div style={{ fontSize:28, fontWeight:800, color:'#D97706' }}>{pending.length}</div>
          <div style={{ fontSize:11, color:'#92400E' }}>Tổng {fmtU(pendingAmt, unit)}</div>
        </div>
        <div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:12, padding:'14px 16px' }}>
          <div style={{ fontSize:10, fontWeight:700, color:'#15803D', letterSpacing:'.06em', marginBottom:5 }}>ĐÃ THANH TOÁN</div>
          <div style={{ fontSize:28, fontWeight:800, color:'#15803D' }}>{approved.length}</div>
          <div style={{ fontSize:11, color:'#15803D' }}>Tổng {fmtU(approved.reduce((s,p)=>s+p.so_tien,0), unit)}</div>
        </div>
        <div style={{ background:'#F5F8FC', border:'1px solid #D0DCE8', borderRadius:12, padding:'14px 16px' }}>
          <div style={{ fontSize:10, fontWeight:700, color:'#6B7280', letterSpacing:'.06em', marginBottom:5 }}>TỔNG PHIẾU</div>
          <div style={{ fontSize:28, fontWeight:800, color:'#374151' }}>{payments.length}</div>
        </div>
      </div>

      {/* Pending approval section */}
      {pending.length > 0 && (
        <div style={{ background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:12, padding:'16px 18px', marginBottom:18 }}>
          <div style={{ fontWeight:700, color:'#D97706', fontSize:13, marginBottom:12 }}>⚠️ Phiếu thanh toán chờ duyệt ({pending.length})</div>
          {pending.map(p => (
            <div key={p.key} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8, background:'#fff', borderRadius:8, padding:'10px 14px', border:'1px solid #FDE68A' }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:12, fontWeight:700, color:'#1F2430' }}>{p.nhom} — {p.nha_thau||p.loai||'—'}</div>
                <div style={{ fontSize:11, color:'#6B7280' }}>{p.ngay||`T${p.thang}/${p.nam}`}{p.ghi_chu?` · ${p.ghi_chu}`:''}</div>
              </div>
              <div style={{ fontWeight:800, color:'#D97706', fontSize:14 }}>{fmtU(p.so_tien, unit)}</div>
              {canEdit && (
                <button style={{ padding:'6px 14px', background:'#15803D', color:'#fff', border:'none', borderRadius:7, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}
                  onClick={() => approve(p.key)}>✓ Duyệt</button>
              )}
              {canEdit && (
                <button style={{ padding:'6px 10px', background:'#FEE2E2', color:'#DC2626', border:'1px solid #FECACA', borderRadius:7, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}
                  onClick={async()=>{ if(confirm('Hủy phiếu?')){ await remove(ref(getDb(),`${PREFIX}_ThanhToan/${p.key}`)); onReload() } }}>Hủy</button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display:'flex', gap:10, marginBottom:14, alignItems:'center' }}>
        <input style={{ ...inp, flex:1 }} placeholder="🔍 Tìm phiếu..." value={filter} onChange={e=>setFilter(e.target.value)} />
        {canEdit && <button style={btnP} onClick={()=>setShow(s=>!s)}>➕ Tạo phiếu TT</button>}
      </div>

      {/* Create form */}
      {show && canEdit && (
        <div style={{ background:'#F5F8FC', border:'1px solid #D0DCE8', borderRadius:12, padding:'16px 18px', marginBottom:16 }}>
          <div style={{ fontWeight:700, color:'#1C3557', marginBottom:12, fontSize:13 }}>📋 Tạo phiếu thanh toán mới</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
            <F label="Nhóm chi">
              <select style={inp} value={form.nhom} onChange={e=>setForm(p=>({...p,nhom:e.target.value}))}>
                {NHOM_LIST.map(n=><option key={n}>{n}</option>)}
              </select>
            </F>
            <F label="Chi tiết loại"><input style={inp} value={form.loai} onChange={e=>setForm(p=>({...p,loai:e.target.value}))}/></F>
            <F label="Nhà thầu / NCC"><input style={inp} value={form.nha_thau} onChange={e=>setForm(p=>({...p,nha_thau:e.target.value}))}/></F>
            <F label="Số tiền (tỷ)"><input style={inp} type="number" value={form.so_tien} onChange={e=>setForm(p=>({...p,so_tien:e.target.value}))}/></F>
            <F label="Ngày"><input style={inp} type="date" value={form.ngay} onChange={e=>{
              const d=new Date(e.target.value); setForm(p=>({...p,ngay:e.target.value,thang:d.getMonth()+1,nam:d.getFullYear()}))
            }}/></F>
            <F label="Ghi chú"><input style={inp} value={form.ghi_chu} onChange={e=>setForm(p=>({...p,ghi_chu:e.target.value}))}/></F>
          </div>
          <div style={{ display:'flex', gap:8, marginTop:10, alignItems:'center' }}>
            <button style={btnP} onClick={save} disabled={saving}>{saving?'Đang lưu...':'💾 Tạo phiếu'}</button>
            <button style={btnO} onClick={()=>setShow(false)}>Hủy</button>
            {msg&&<span style={{ fontSize:12,color:'#15803D'}}>{msg}</span>}
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{ background:'#fff', border:'1px solid #E5E0D8', borderRadius:12, overflow:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, minWidth:700 }}>
          <thead>
            <tr style={{ background:'#F5F8FC' }}>
              {['Ngày','Nhóm','Chi tiết','Nhà thầu/NCC','Số tiền','Ghi chú','Trạng thái',''].map(h=>(
                <th key={h} style={{ padding:'10px 12px', textAlign:'left', fontWeight:700, color:'#6B7280', borderBottom:'1px solid #E5E0D8' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length===0 && <tr><td colSpan={8} style={{ padding:32, textAlign:'center', color:'#9ca3af' }}>Chưa có phiếu thanh toán</td></tr>}
            {filtered.map(p => {
              const tt = p.trang_thai==='da_thanh_toan' ? ['#15803D','#F0FDF4'] : p.trang_thai==='cho_duyet' ? ['#D97706','#FFFBEB'] : ['#DC2626','#FEF2F2']
              return (
                <tr key={p.key} style={{ borderBottom:'1px solid #F3F4F6' }}>
                  <td style={{ padding:'9px 12px', color:'#6B7280' }}>{p.ngay||`T${p.thang}/${p.nam}`}</td>
                  <td style={{ padding:'9px 12px', fontWeight:600, color:'#1F2430' }}>{p.nhom}</td>
                  <td style={{ padding:'9px 12px', color:'#374151' }}>{p.loai||'—'}</td>
                  <td style={{ padding:'9px 12px', color:'#374151' }}>{p.nha_thau||'—'}</td>
                  <td style={{ padding:'9px 12px', fontWeight:700, color: p.nhom.startsWith('Thu')?'#1C3557':'#DC2626' }}>{fmtU(p.so_tien, unit)}</td>
                  <td style={{ padding:'9px 12px', color:'#6B7280' }}>{p.ghi_chu||'—'}</td>
                  <td style={{ padding:'9px 12px' }}><span style={{ background:tt[1], color:tt[0], fontSize:10.5, fontWeight:700, padding:'3px 8px', borderRadius:5 }}>{p.trang_thai==='da_thanh_toan'?'Đã TT':p.trang_thai==='cho_duyet'?'Chờ duyệt':'Hủy'}</span></td>
                  {canEdit && <td style={{ padding:'9px 12px' }}><button style={{...btnSm,color:'#DC2626'}} onClick={async()=>{ if(confirm('Xóa phiếu?')){ await remove(ref(getDb(),`${PREFIX}_ThanhToan/${p.key}`)); onReload() } }}>🗑</button></td>}
                </tr>
              )
            })}
          </tbody>
        </table>
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
