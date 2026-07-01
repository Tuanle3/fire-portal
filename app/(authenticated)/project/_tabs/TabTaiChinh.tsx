'use client'
import { useState } from 'react'
import { getDb } from '@/lib/firebase'
import { ref, push, remove, set } from 'firebase/database'
import type { LienDanhMember, ThanhToanRow, VonVayTranche, ProjectInfo, ProjectUnit } from '../_lib/types'
import { PREFIX, fmtU } from '../_lib/types'

interface Props {
  info: ProjectInfo; lienDanh: LienDanhMember[]; payments: ThanhToanRow[]
  vonVay: VonVayTranche[]; canEdit: boolean; onReload: () => void; unit: ProjectUnit
}

type SubTab = 'tong-hop' | 'von-gop' | 'thanh-toan' | 'von-vay'

const NHOM_LIST = ['Thu','Chi nhà thầu','Chi trả NCC','Chi hoạt động','Chi khác']
const TT_TP     = [['da_thanh_toan','Đã TT'],['cho_duyet','Chờ duyệt'],['huy','Hủy']]
const TT_VV     = [['da_giai_ngan','Đã GN'],['chua_giai_ngan','Chưa GN'],['dang_xet','Đang xét']]

const COLOR_TT: Record<string, [string, string]> = {
  da_thanh_toan:  ['#15803D','#F0FDF4'],
  cho_duyet:      ['#D97706','#FFFBEB'],
  huy:            ['#DC2626','#FEF2F2'],
  da_giai_ngan:   ['#1C3557','#EFF6FF'],
  chua_giai_ngan: ['#6B7280','#F9FAFB'],
  dang_xet:       ['#D97706','#FFFBEB'],
}

export default function TabTaiChinh({ info, lienDanh, payments, vonVay, canEdit, onReload, unit }: Props) {
  const [sub, setSub] = useState<SubTab>('tong-hop')

  const totalThu = payments.filter(p => p.nhom.startsWith('Thu') && p.trang_thai === 'da_thanh_toan').reduce((s, p) => s + p.so_tien, 0)
  const totalChi = payments.filter(p => !p.nhom.startsWith('Thu') && p.trang_thai === 'da_thanh_toan').reduce((s, p) => s + p.so_tien, 0)
  const tongGopVon = lienDanh.reduce((s, m) => s + m.da_gop, 0)
  const tongThieu  = lienDanh.reduce((s, m) => s + Math.max(0, m.cam_ket - m.da_gop), 0)
  const tongGiaiNgan = vonVay.filter(v => v.trang_thai === 'da_giai_ngan').reduce((s, v) => s + v.so_tien, 0)

  return (
    <div>
      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:18 }}>
        <Kpi label="THỰC THU" val={fmtU(totalThu, unit)} sub={`/${fmtU(info.totalCap, unit)} kế hoạch`} color="#1C3557" />
        <Kpi label="TỔNG CHI" val={fmtU(totalChi, unit)} sub={`${info.totalCap > 0 ? (totalChi/info.totalCap*100).toFixed(1) : 0}% tổng VĐT`} color="#DC2626" />
        <Kpi label="VỐN GÓP ĐÃ NỘP" val={fmtU(tongGopVon, unit)} sub={`Còn thiếu ${fmtU(tongThieu, unit)}`} color="#D97706" />
        <Kpi label="ĐÃ GIẢI NGÂN NH" val={fmtU(tongGiaiNgan, unit)} sub={`HM ${fmtU(info.loan, unit)}`} color="#1F6B3D" />
      </div>

      {/* Sub-tabs */}
      <div style={{ display:'flex', gap:4, borderBottom:'2px solid #E5E0D8', marginBottom:18 }}>
        {([['tong-hop','Tổng hợp'],['von-gop','Vốn góp LD'],['thanh-toan','Thu / Chi'],['von-vay','Vốn vay NH']] as [SubTab, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setSub(k)}
            style={{ padding:'7px 16px', fontSize:12, fontWeight: sub===k ? 700 : 500, color: sub===k ? '#1C3557' : '#6B7280',
              background:'none', border:'none', borderBottom: sub===k ? '2px solid #1C3557' : '2px solid transparent',
              marginBottom:-2, cursor:'pointer', fontFamily:'inherit' }}>{l}</button>
        ))}
      </div>

      {sub === 'tong-hop' && <TongHop info={info} lienDanh={lienDanh} payments={payments} vonVay={vonVay} unit={unit} />}
      {sub === 'von-gop' && <VonGop lienDanh={lienDanh} canEdit={canEdit} onReload={onReload} unit={unit} />}
      {sub === 'thanh-toan' && <ThanhToanList payments={payments} canEdit={canEdit} onReload={onReload} unit={unit} />}
      {sub === 'von-vay' && <VonVayList vonVay={vonVay} canEdit={canEdit} onReload={onReload} info={info} unit={unit} />}
    </div>
  )
}

function Kpi({ label, val, sub, color }: { label:string; val:string; sub:string; color:string }) {
  return (
    <div style={{ background:'#fff', border:'1px solid #E5E0D8', borderRadius:12, padding:'14px 16px' }}>
      <div style={{ fontSize:10, fontWeight:700, color:'#9ca3af', letterSpacing:'.06em', marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:22, fontWeight:800, color, marginBottom:2 }}>{val}</div>
      <div style={{ fontSize:11, color:'#6B7280' }}>{sub}</div>
    </div>
  )
}

function TongHop({ info, lienDanh, payments, vonVay, unit }: { info:ProjectInfo; lienDanh:LienDanhMember[]; payments:ThanhToanRow[]; vonVay:VonVayTranche[]; unit:ProjectUnit }) {
  const months = Array.from(new Set(payments.map(p => `${p.nam}-${String(p.thang).padStart(2,'0')}`))).sort()
  const summary = months.map(m => {
    const [y, mo] = m.split('-').map(Number)
    const ps = payments.filter(p => p.nam === y && p.thang === mo && p.trang_thai === 'da_thanh_toan')
    const thu = ps.filter(p => p.nhom.startsWith('Thu')).reduce((s, p) => s + p.so_tien, 0)
    const chi = ps.filter(p => !p.nhom.startsWith('Thu')).reduce((s, p) => s + p.so_tien, 0)
    return { m: `T${mo}/${y}`, thu, chi, net: thu - chi }
  })
  return (
    <div style={{ background:'#fff', border:'1px solid #E5E0D8', borderRadius:12, overflow:'hidden' }}>
      {summary.length === 0
        ? <div style={{ padding:32, textAlign:'center', color:'#9ca3af', fontSize:13 }}>Chưa có dữ liệu thu/chi</div>
        : <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
          <thead>
            <tr style={{ background:'#F5F8FC' }}>
              {['Tháng','Thu','Chi','Còn lại'].map(h => (
                <th key={h} style={{ padding:'10px 14px', textAlign: h==='Tháng' ? 'left' : 'right', fontWeight:700, color:'#6B7280', borderBottom:'1px solid #E5E0D8' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {summary.map(r => (
              <tr key={r.m} style={{ borderBottom:'1px solid #F3F4F6' }}>
                <td style={{ padding:'10px 14px', fontWeight:600, color:'#374151' }}>{r.m}</td>
                <td style={{ padding:'10px 14px', textAlign:'right', color:'#1C3557', fontWeight:700 }}>{fmtU(r.thu, unit)}</td>
                <td style={{ padding:'10px 14px', textAlign:'right', color:'#DC2626', fontWeight:700 }}>{fmtU(r.chi, unit)}</td>
                <td style={{ padding:'10px 14px', textAlign:'right', color: r.net >= 0 ? '#15803D' : '#DC2626', fontWeight:700 }}>{fmtU(r.net, unit)}</td>
              </tr>
            ))}
          </tbody>
        </table>}
    </div>
  )
}

function VonGop({ lienDanh, canEdit, onReload, unit }: { lienDanh:LienDanhMember[]; canEdit:boolean; onReload:()=>void; unit:ProjectUnit }) {
  const [form, setForm] = useState({ ten:'', cam_ket:'', da_gop:'' })
  const [editKey, setEditKey] = useState<string|null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  async function save() {
    if (!form.ten) return
    setSaving(true)
    const data = { ten: form.ten, cam_ket: parseFloat(form.cam_ket)||0, da_gop: parseFloat(form.da_gop)||0 }
    const db = getDb()
    if (editKey) await set(ref(db, `${PREFIX}_LienDanh/${editKey}`), data)
    else         await push(ref(db, `${PREFIX}_LienDanh`), data)
    setSaving(false); setMsg('✓ Đã lưu'); onReload()
    setForm({ ten:'', cam_ket:'', da_gop:'' }); setEditKey(null)
  }

  return (
    <div>
      {canEdit && (
        <div style={{ background:'#F5F8FC', border:'1px solid #D0DCE8', borderRadius:12, padding:'16px 18px', marginBottom:16 }}>
          <div style={{ fontWeight:700, color:'#1C3557', marginBottom:12, fontSize:13 }}>
            {editKey ? '✏️ Sửa thành viên' : '➕ Thêm thành viên liên danh'}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
            <F label="Tên thành viên"><input style={inp} value={form.ten} onChange={e=>setForm(p=>({...p,ten:e.target.value}))}/></F>
            <F label="Cam kết (tỷ)"><input style={inp} type="number" value={form.cam_ket} onChange={e=>setForm(p=>({...p,cam_ket:e.target.value}))}/></F>
            <F label="Đã góp (tỷ)"><input style={inp} type="number" value={form.da_gop} onChange={e=>setForm(p=>({...p,da_gop:e.target.value}))}/></F>
          </div>
          <div style={{ display:'flex', gap:8, marginTop:10, alignItems:'center' }}>
            <button style={btnP} onClick={save} disabled={saving||!form.ten}>{saving?'Đang lưu...':'💾 Lưu'}</button>
            {editKey && <button style={btnO} onClick={()=>{setEditKey(null);setForm({ten:'',cam_ket:'',da_gop:''})}}>Hủy</button>}
            {msg && <span style={{ fontSize:12, color:'#15803D' }}>{msg}</span>}
          </div>
        </div>
      )}

      <div style={{ background:'#fff', border:'1px solid #E5E0D8', borderRadius:12, overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
          <thead>
            <tr style={{ background:'#F5F8FC' }}>
              {['Thành viên','Cam kết','Đã góp','Còn lại','Tỷ lệ',''].map(h => (
                <th key={h} style={{ padding:'10px 12px', textAlign: h==='Thành viên'?'left':'right', fontWeight:700, color:'#6B7280', borderBottom:'1px solid #E5E0D8' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lienDanh.map(m => {
              const con = m.cam_ket - m.da_gop
              const pct = m.cam_ket > 0 ? m.da_gop / m.cam_ket * 100 : 0
              return (
                <tr key={m.key} style={{ borderBottom:'1px solid #F3F4F6' }}>
                  <td style={{ padding:'10px 12px', fontWeight:600, color:'#1F2430' }}>{m.ten}</td>
                  <td style={{ padding:'10px 12px', textAlign:'right', color:'#374151' }}>{fmtU(m.cam_ket, unit)}</td>
                  <td style={{ padding:'10px 12px', textAlign:'right', color:'#1C3557', fontWeight:700 }}>{fmtU(m.da_gop, unit)}</td>
                  <td style={{ padding:'10px 12px', textAlign:'right', color: con > 0.01 ? '#DC2626' : '#15803D', fontWeight:700 }}>{fmtU(con, unit)}</td>
                  <td style={{ padding:'10px 12px', textAlign:'right' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6, justifyContent:'flex-end' }}>
                      <div style={{ width:60, height:5, background:'#E5E7EB', borderRadius:3 }}>
                        <div style={{ width:`${pct}%`, height:'100%', background:'#1C3557', borderRadius:3 }} />
                      </div>
                      <span style={{ fontWeight:700, color:'#374151' }}>{pct.toFixed(0)}%</span>
                    </div>
                  </td>
                  {canEdit && (
                    <td style={{ padding:'10px 12px', whiteSpace:'nowrap' }}>
                      <button style={btnSm} onClick={()=>{ setEditKey(m.key); setForm({ ten:m.ten, cam_ket:String(m.cam_ket), da_gop:String(m.da_gop) }) }}>✏️</button>
                      {' '}
                      <button style={{...btnSm,color:'#DC2626'}} onClick={async()=>{ if(confirm('Xóa?')) { await remove(ref(getDb(),`${PREFIX}_LienDanh/${m.key}`)); onReload() } }}>🗑</button>
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

function ThanhToanList({ payments, canEdit, onReload, unit }: { payments:ThanhToanRow[]; canEdit:boolean; onReload:()=>void; unit:ProjectUnit }) {
  const EMPTY = { nhom:'Thu', loai:'', so_tien:'', ngay:'', thang:new Date().getMonth()+1, nam:new Date().getFullYear(), trang_thai:'da_thanh_toan', ghi_chu:'', nha_thau:'' }
  const [form,    setForm]    = useState(EMPTY)
  const [saving,  setSaving]  = useState(false)
  const [msg,     setMsg]     = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [filter,  setFilter]  = useState('')

  const filtered = payments.filter(p => !filter || p.nhom.toLowerCase().includes(filter.toLowerCase()) || p.nha_thau.toLowerCase().includes(filter.toLowerCase()))

  async function save() {
    setSaving(true)
    await push(ref(getDb(), `${PREFIX}_ThanhToan`), {
      ...form, so_tien: parseFloat(form.so_tien)||0,
      thang: parseInt(String(form.thang)), nam: parseInt(String(form.nam)),
    })
    setSaving(false); setMsg('✓ Đã thêm'); onReload()
    setForm(EMPTY); setShowAdd(false)
  }

  return (
    <div>
      <div style={{ display:'flex', gap:10, marginBottom:14, alignItems:'center' }}>
        <input style={inp} placeholder="🔍 Tìm..." value={filter} onChange={e=>setFilter(e.target.value)} />
        {canEdit && <button style={btnP} onClick={()=>setShowAdd(s=>!s)}>➕ Thêm giao dịch</button>}
      </div>

      {showAdd && canEdit && (
        <div style={{ background:'#F5F8FC', border:'1px solid #D0DCE8', borderRadius:12, padding:'16px 18px', marginBottom:14 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
            <F label="Nhóm">
              <select style={inp} value={form.nhom} onChange={e=>setForm(p=>({...p,nhom:e.target.value}))}>
                {NHOM_LIST.map(n=><option key={n}>{n}</option>)}
              </select>
            </F>
            <F label="Loại chi tiết"><input style={inp} value={form.loai} onChange={e=>setForm(p=>({...p,loai:e.target.value}))}/></F>
            <F label="Nhà thầu / NCC"><input style={inp} value={form.nha_thau} onChange={e=>setForm(p=>({...p,nha_thau:e.target.value}))}/></F>
            <F label="Số tiền (tỷ)"><input style={inp} type="number" value={form.so_tien} onChange={e=>setForm(p=>({...p,so_tien:e.target.value}))}/></F>
            <F label="Ngày"><input style={inp} type="date" value={form.ngay} onChange={e=>{
              const d=new Date(e.target.value); setForm(p=>({...p,ngay:e.target.value,thang:d.getMonth()+1,nam:d.getFullYear()}))
            }}/></F>
            <F label="Trạng thái">
              <select style={inp} value={form.trang_thai} onChange={e=>setForm(p=>({...p,trang_thai:e.target.value}))}>
                {TT_TP.map(([v,l])=><option key={v} value={v}>{l}</option>)}
              </select>
            </F>
            <F label="Ghi chú" ><input style={inp} value={form.ghi_chu} onChange={e=>setForm(p=>({...p,ghi_chu:e.target.value}))}/></F>
          </div>
          <div style={{ display:'flex', gap:8, marginTop:10, alignItems:'center' }}>
            <button style={btnP} onClick={save} disabled={saving}>{saving?'Đang lưu...':'💾 Lưu'}</button>
            <button style={btnO} onClick={()=>setShowAdd(false)}>Hủy</button>
            {msg&&<span style={{ fontSize:12,color:'#15803D'}}>{msg}</span>}
          </div>
        </div>
      )}

      <div style={{ background:'#fff', border:'1px solid #E5E0D8', borderRadius:12, overflow:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, minWidth:700 }}>
          <thead>
            <tr style={{ background:'#F5F8FC' }}>
              {['Ngày','Nhóm','Loại','Nhà thầu/NCC','Số tiền','Trạng thái',''].map(h => (
                <th key={h} style={{ padding:'10px 12px', textAlign:'left', fontWeight:700, color:'#6B7280', borderBottom:'1px solid #E5E0D8' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={7} style={{ padding:32, textAlign:'center', color:'#9ca3af' }}>Chưa có dữ liệu</td></tr>}
            {filtered.map(p => {
              const [c, bg] = COLOR_TT[p.trang_thai] ?? ['#6B7280','#F9FAFB']
              return (
                <tr key={p.key} style={{ borderBottom:'1px solid #F3F4F6' }}>
                  <td style={{ padding:'9px 12px', color:'#6B7280' }}>{p.ngay || `T${p.thang}/${p.nam}`}</td>
                  <td style={{ padding:'9px 12px', fontWeight:600, color:'#1F2430' }}>{p.nhom}</td>
                  <td style={{ padding:'9px 12px', color:'#374151' }}>{p.loai||'—'}</td>
                  <td style={{ padding:'9px 12px', color:'#374151' }}>{p.nha_thau||'—'}</td>
                  <td style={{ padding:'9px 12px', fontWeight:700, color: p.nhom.startsWith('Thu') ? '#1C3557' : '#DC2626' }}>{fmtU(p.so_tien, unit)}</td>
                  <td style={{ padding:'9px 12px' }}><span style={{ background:bg, color:c, fontSize:10.5, fontWeight:700, padding:'3px 8px', borderRadius:5 }}>{p.trang_thai==='da_thanh_toan'?'Đã TT':p.trang_thai==='cho_duyet'?'Chờ duyệt':'Hủy'}</span></td>
                  {canEdit && <td style={{ padding:'9px 12px' }}><button style={{...btnSm,color:'#DC2626'}} onClick={async()=>{ if(confirm('Xóa?')) { await remove(ref(getDb(),`${PREFIX}_ThanhToan/${p.key}`)); onReload() } }}>🗑</button></td>}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function VonVayList({ vonVay, canEdit, onReload, info, unit }: { vonVay:VonVayTranche[]; canEdit:boolean; onReload:()=>void; info:ProjectInfo; unit:ProjectUnit }) {
  const [form, setForm]     = useState({ goi:'', so_tien:'', ngay_giai_ngan:'', trang_thai:'chua_giai_ngan', ghi_chu:'', lai_suat:'' })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg]       = useState('')
  const [show, setShow]     = useState(false)

  async function save() {
    setSaving(true)
    await push(ref(getDb(), `${PREFIX}_VonVay`), { ...form, so_tien: parseFloat(form.so_tien)||0, lai_suat: parseFloat(form.lai_suat)||0 })
    setSaving(false); setMsg('✓'); onReload(); setForm({ goi:'', so_tien:'', ngay_giai_ngan:'', trang_thai:'chua_giai_ngan', ghi_chu:'', lai_suat:'' }); setShow(false)
  }

  const tongGN = vonVay.filter(v=>v.trang_thai==='da_giai_ngan').reduce((s,v)=>s+v.so_tien,0)

  return (
    <div>
      <div style={{ background:'#fff', border:'1px solid #E5E0D8', borderRadius:10, padding:'12px 16px', marginBottom:14, display:'flex', gap:24, fontSize:12 }}>
        <span>Hạn mức: <b>{fmtU(info.loan, unit)}</b></span>
        <span>Đã giải ngân: <b style={{color:'#1C3557'}}>{fmtU(tongGN, unit)}</b></span>
        <span>Còn lại: <b style={{color:'#15803D'}}>{fmtU(info.loan - tongGN, unit)}</b></span>
        <span>Đã sử dụng: <b>{info.loan > 0 ? (tongGN/info.loan*100).toFixed(1) : 0}%</b></span>
      </div>
      <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:12 }}>
        {canEdit && <button style={btnP} onClick={()=>setShow(s=>!s)}>➕ Thêm đợt giải ngân</button>}
      </div>
      {show && canEdit && (
        <div style={{ background:'#F5F8FC', border:'1px solid #D0DCE8', borderRadius:12, padding:'16px 18px', marginBottom:14 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
            <F label="Gói / Đợt"><input style={inp} value={form.goi} onChange={e=>setForm(p=>({...p,goi:e.target.value}))} placeholder="Đợt 1"/></F>
            <F label="Số tiền (tỷ)"><input style={inp} type="number" value={form.so_tien} onChange={e=>setForm(p=>({...p,so_tien:e.target.value}))}/></F>
            <F label="Lãi suất (%/năm)"><input style={inp} type="number" value={form.lai_suat} onChange={e=>setForm(p=>({...p,lai_suat:e.target.value}))}/></F>
            <F label="Ngày giải ngân"><input style={inp} type="date" value={form.ngay_giai_ngan} onChange={e=>setForm(p=>({...p,ngay_giai_ngan:e.target.value}))}/></F>
            <F label="Trạng thái">
              <select style={inp} value={form.trang_thai} onChange={e=>setForm(p=>({...p,trang_thai:e.target.value}))}>
                {TT_VV.map(([v,l])=><option key={v} value={v}>{l}</option>)}
              </select>
            </F>
            <F label="Ghi chú"><input style={inp} value={form.ghi_chu} onChange={e=>setForm(p=>({...p,ghi_chu:e.target.value}))}/></F>
          </div>
          <div style={{ display:'flex', gap:8, marginTop:10 }}>
            <button style={btnP} onClick={save} disabled={saving}>{saving?'Đang lưu...':'💾 Lưu'}</button>
            <button style={btnO} onClick={()=>setShow(false)}>Hủy</button>
            {msg&&<span style={{fontSize:12,color:'#15803D'}}>{msg}</span>}
          </div>
        </div>
      )}
      <div style={{ background:'#fff', border:'1px solid #E5E0D8', borderRadius:12, overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
          <thead>
            <tr style={{ background:'#F5F8FC' }}>
              {['Gói','Số tiền','Lãi suất','Ngày GN','Trạng thái','Ghi chú',''].map(h=>(
                <th key={h} style={{ padding:'10px 12px', textAlign:'left', fontWeight:700, color:'#6B7280', borderBottom:'1px solid #E5E0D8' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vonVay.length === 0 && <tr><td colSpan={7} style={{ padding:32, textAlign:'center', color:'#9ca3af' }}>Chưa có dữ liệu</td></tr>}
            {vonVay.map(v => {
              const [c, bg] = COLOR_TT[v.trang_thai] ?? ['#6B7280','#F9FAFB']
              return (
                <tr key={v.key} style={{ borderBottom:'1px solid #F3F4F6' }}>
                  <td style={{ padding:'9px 12px', fontWeight:600, color:'#1F2430' }}>{v.goi}</td>
                  <td style={{ padding:'9px 12px', fontWeight:700, color:'#1C3557' }}>{fmtU(v.so_tien, unit)}</td>
                  <td style={{ padding:'9px 12px', color:'#374151' }}>{v.lai_suat ? `${v.lai_suat}%` : '—'}</td>
                  <td style={{ padding:'9px 12px', color:'#6B7280' }}>{v.ngay_giai_ngan||'—'}</td>
                  <td style={{ padding:'9px 12px' }}><span style={{ background:bg, color:c, fontSize:10.5, fontWeight:700, padding:'3px 8px', borderRadius:5 }}>{TT_VV.find(([k])=>k===v.trang_thai)?.[1]??v.trang_thai}</span></td>
                  <td style={{ padding:'9px 12px', color:'#6B7280' }}>{v.ghi_chu||'—'}</td>
                  {canEdit && <td style={{ padding:'9px 12px' }}><button style={{...btnSm,color:'#DC2626'}} onClick={async()=>{ if(confirm('Xóa?')){ await remove(ref(getDb(),`${PREFIX}_VonVay/${v.key}`)); onReload() } }}>🗑</button></td>}
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
