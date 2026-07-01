'use client'
import { useState, useCallback } from 'react'
import { getDb } from '@/lib/firebase'
import { ref, push, remove, get } from 'firebase/database'
import type { ChungTuRow, ProjectUnit } from '../_lib/types'
import { PREFIX, fmtU } from '../_lib/types'
import { parseCSV, fetchSheetCSV, writeToGAS, SHEET_ID } from '@/lib/gasClient'

interface Props { rows: ChungTuRow[]; canEdit: boolean; onReload: () => void; unit: ProjectUnit }

const NHOM_LIST = ['Thu nhà ở','Thu HDMB','Chi nhà thầu','Chi NCC','Chi hoạt động','Chi thuế','Chi khác']
const LOAI_LIST: ['Thu','Chi'] = ['Thu','Chi']

const EMPTY: Omit<ChungTuRow,'key'> = { ngay:'', loai:'Thu', nhom:'Thu nhà ở', mo_ta:'', so_tien:0, don_vi:'NOXH_NT', trang_thai:'da_xac_nhan', chung_tu_so:'' }

export default function TabChungTu({ rows, canEdit, onReload, unit }: Props) {
  const [loaiFilter, setLoaiFilter] = useState<'all'|'Thu'|'Chi'>('all')
  const [filter,     setFilter]     = useState('')
  const [showAdd,    setShowAdd]    = useState(false)
  const [form,       setForm]       = useState<Omit<ChungTuRow,'key'>>(EMPTY)
  const [saving,     setSaving]     = useState(false)
  const [msg,        setMsg]        = useState('')
  const [syncing,    setSyncing]    = useState(false)
  const [syncMsg,    setSyncMsg]    = useState('')
  const [sheetTab,   setSheetTab]   = useState('Chung_Tu')

  const filtered = rows.filter(r =>
    (loaiFilter === 'all' || r.loai === loaiFilter) &&
    (!filter || r.mo_ta.toLowerCase().includes(filter.toLowerCase()) || r.nhom.toLowerCase().includes(filter.toLowerCase()) || r.chung_tu_so.toLowerCase().includes(filter.toLowerCase()))
  )

  const totalThu = rows.filter(r => r.loai === 'Thu').reduce((s, r) => s + r.so_tien, 0)
  const totalChi = rows.filter(r => r.loai === 'Chi').reduce((s, r) => s + r.so_tien, 0)

  // Add row to Firebase
  async function addRow() {
    if (!form.mo_ta && !form.nhom) return
    setSaving(true)
    const db = getDb()
    const newRow = { ...form, so_tien: Number(form.so_tien) }
    const fbRef  = await push(ref(db, `${PREFIX}_ChungTu`), newRow)
    // Also write to Google Sheets via GAS
    try {
      await writeToGAS({ action: 'addChungTu', prefix: PREFIX, ...newRow })
    } catch { /* GAS write is best-effort */ }
    setSaving(false); setMsg('✓ Đã thêm'); onReload()
    setForm(EMPTY); setShowAdd(false)
  }

  // Import from Google Sheets → Firebase
  async function importFromSheets() {
    setSyncing(true); setSyncMsg('Đang kết nối Google Sheets...')
    try {
      const csv  = await fetchSheetCSV(sheetTab)
      const data = parseCSV(csv)
      if (data.length === 0) { setSyncMsg('⚠️ Không tìm thấy dữ liệu trong Sheet'); setSyncing(false); return }

      setSyncMsg(`Đang nhập ${data.length} dòng vào Firebase...`)
      const db = getDb()
      // Clear existing
      const snap = await get(ref(db, `${PREFIX}_ChungTu`))
      if (snap.exists()) {
        const existing = snap.val() as Record<string, unknown>
        for (const k of Object.keys(existing)) {
          await remove(ref(db, `${PREFIX}_ChungTu/${k}`))
        }
      }
      // Push new rows
      for (const row of data) {
        const loai: 'Thu'|'Chi' = (row['Loại']??row['Loai']??'').trim() === 'Thu' ? 'Thu' : 'Chi'
        await push(ref(db, `${PREFIX}_ChungTu`), {
          ngay:       row['Ngày']??row['Ngay']??'',
          loai,
          nhom:       row['Nhóm']??row['Nhom']??'',
          mo_ta:      row['Mô tả']??row['Mo_ta']??row['Nội dung']??'',
          so_tien:    parseFloat((row['Số tiền']??row['So_tien']??'0').replace(/,/g,''))||0,
          don_vi:     row['Đơn vị']??row['Don_vi']??'',
          trang_thai: row['Trạng thái']??row['Trang_thai']??'',
          chung_tu_so:row['Số CT']??row['Chung_tu_so']??'',
        })
      }
      setSyncMsg(`✓ Đã nhập ${data.length} dòng từ Google Sheets`)
      onReload()
    } catch (e: any) {
      setSyncMsg(`❌ Lỗi: ${e.message}`)
    }
    setSyncing(false)
  }

  // Export Firebase → Google Sheets
  async function exportToSheets() {
    setSyncing(true); setSyncMsg('Đang ghi lên Google Sheets...')
    try {
      await writeToGAS({ action: 'syncChungTu', prefix: PREFIX, rows: rows.map(r => ({
        ngay: r.ngay, loai: r.loai, nhom: r.nhom, mo_ta: r.mo_ta,
        so_tien: r.so_tien, don_vi: r.don_vi, trang_thai: r.trang_thai, chung_tu_so: r.chung_tu_so,
      })) })
      setSyncMsg('✓ Đã gửi lên Google Sheets (GAS sẽ cập nhật Sheet)')
    } catch (e: any) {
      setSyncMsg(`❌ Lỗi: ${e.message}`)
    }
    setSyncing(false)
  }

  return (
    <div>
      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:18 }}>
        <div style={{ background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:12, padding:'14px 16px' }}>
          <div style={{ fontSize:10, fontWeight:700, color:'#1C3557', letterSpacing:'.06em', marginBottom:5 }}>TỔNG THU</div>
          <div style={{ fontSize:22, fontWeight:800, color:'#1C3557' }}>{fmtU(totalThu/1e9, unit)}</div>
        </div>
        <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:12, padding:'14px 16px' }}>
          <div style={{ fontSize:10, fontWeight:700, color:'#DC2626', letterSpacing:'.06em', marginBottom:5 }}>TỔNG CHI</div>
          <div style={{ fontSize:22, fontWeight:800, color:'#DC2626' }}>{fmtU(totalChi/1e9, unit)}</div>
        </div>
        <div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:12, padding:'14px 16px' }}>
          <div style={{ fontSize:10, fontWeight:700, color:'#15803D', letterSpacing:'.06em', marginBottom:5 }}>CÒN LẠI</div>
          <div style={{ fontSize:22, fontWeight:800, color:'#15803D' }}>{fmtU((totalThu-totalChi)/1e9, unit)}</div>
        </div>
      </div>

      {/* Google Sheets Sync Panel */}
      <div style={{ background:'#F5F8FC', border:'1px solid #D0DCE8', borderRadius:12, padding:'16px 18px', marginBottom:18 }}>
        <div style={{ fontSize:12, fontWeight:700, color:'#1C3557', marginBottom:12 }}>🔗 Đồng bộ Google Sheets</div>
        <div style={{ fontSize:11, color:'#6B7280', marginBottom:10 }}>
          Sheet ID: <code style={{ background:'#E5E7EB', padding:'1px 6px', borderRadius:4, fontSize:10 }}>{SHEET_ID}</code>
        </div>
        <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap', marginBottom:10 }}>
          <div>
            <label style={{ fontSize:11, fontWeight:600, color:'#374151', marginBottom:4, display:'block' }}>Tên tab trong Sheet</label>
            <input style={{ ...inp, width:180 }} value={sheetTab} onChange={e=>setSheetTab(e.target.value)} placeholder="Chung_Tu" />
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'flex-end', paddingBottom:1 }}>
            <button style={btnGS} onClick={importFromSheets} disabled={syncing}>
              ⬇️ Nhập từ Google Sheets
            </button>
            <button style={{ ...btnGS, background:'#15803D' }} onClick={exportToSheets} disabled={syncing}>
              ⬆️ Ghi lên Google Sheets
            </button>
          </div>
        </div>
        {syncMsg && (
          <div style={{ fontSize:12, padding:'7px 12px', borderRadius:7, background: syncMsg.startsWith('✓')?'#F0FDF4':syncMsg.startsWith('❌')?'#FEF2F2':'#FFFBEB', color: syncMsg.startsWith('✓')?'#15803D':syncMsg.startsWith('❌')?'#DC2626':'#D97706' }}>
            {syncing && '⏳ '}{syncMsg}
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div style={{ display:'flex', gap:8, marginBottom:14, alignItems:'center', flexWrap:'wrap' }}>
        <div style={{ display:'flex', gap:4 }}>
          {(['all','Thu','Chi'] as const).map(t => (
            <button key={t} onClick={()=>setLoaiFilter(t)}
              style={{ padding:'6px 14px', fontSize:12, fontWeight: loaiFilter===t?700:500,
                color: loaiFilter===t?'#fff':'#374151',
                background: loaiFilter===t ? (t==='Thu'?'#1C3557':t==='Chi'?'#DC2626':'#374151') : '#F3F4F6',
                border:'none', borderRadius:7, cursor:'pointer', fontFamily:'inherit' }}>
              {t==='all'?'Tất cả':t}
            </button>
          ))}
        </div>
        <input style={{ ...inp, flex:1, minWidth:140 }} placeholder="🔍 Tìm chứng từ..." value={filter} onChange={e=>setFilter(e.target.value)} />
        {canEdit && <button style={btnP} onClick={()=>setShowAdd(s=>!s)}>➕ Thêm chứng từ</button>}
      </div>

      {/* Add form */}
      {showAdd && canEdit && (
        <div style={{ background:'#F5F8FC', border:'1px solid #D0DCE8', borderRadius:12, padding:'16px 18px', marginBottom:16 }}>
          <div style={{ fontWeight:700, color:'#1C3557', marginBottom:12, fontSize:13 }}>➕ Thêm chứng từ</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
            <F label="Loại">
              <select style={inp} value={form.loai} onChange={e=>setForm(p=>({...p,loai:e.target.value as 'Thu'|'Chi'}))}>
                {LOAI_LIST.map(l=><option key={l}>{l}</option>)}
              </select>
            </F>
            <F label="Nhóm">
              <select style={inp} value={form.nhom} onChange={e=>setForm(p=>({...p,nhom:e.target.value}))}>
                {NHOM_LIST.map(n=><option key={n}>{n}</option>)}
              </select>
            </F>
            <F label="Số chứng từ"><input style={inp} value={form.chung_tu_so} onChange={e=>setForm(p=>({...p,chung_tu_so:e.target.value}))} placeholder="CT-001"/></F>
            <F label="Mô tả"><input style={inp} value={form.mo_ta} onChange={e=>setForm(p=>({...p,mo_ta:e.target.value}))}/></F>
            <F label="Số tiền (VNĐ)"><input style={inp} type="number" value={form.so_tien||''} onChange={e=>setForm(p=>({...p,so_tien:parseFloat(e.target.value)||0}))}/></F>
            <F label="Ngày"><input style={inp} type="date" value={form.ngay} onChange={e=>setForm(p=>({...p,ngay:e.target.value}))}/></F>
            <F label="Đơn vị"><input style={inp} value={form.don_vi} onChange={e=>setForm(p=>({...p,don_vi:e.target.value}))}/></F>
          </div>
          <div style={{ display:'flex', gap:8, marginTop:12, alignItems:'center' }}>
            <button style={btnP} onClick={addRow} disabled={saving}>{saving?'Đang lưu...':'💾 Lưu & ghi GSheet'}</button>
            <button style={btnO} onClick={()=>setShowAdd(false)}>Hủy</button>
            {msg&&<span style={{ fontSize:12, color:'#15803D' }}>{msg}</span>}
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{ background:'#fff', border:'1px solid #E5E0D8', borderRadius:12, overflow:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, minWidth:700 }}>
          <thead>
            <tr style={{ background:'#F5F8FC' }}>
              {['Ngày','Loại','Nhóm','Mô tả','Số CT','Số tiền','Đơn vị',''].map(h=>(
                <th key={h} style={{ padding:'10px 12px', textAlign:'left', fontWeight:700, color:'#6B7280', borderBottom:'1px solid #E5E0D8', whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length===0 && <tr><td colSpan={8} style={{ padding:32, textAlign:'center', color:'#9ca3af' }}>Chưa có dữ liệu. Nhập từ Google Sheets hoặc thêm trực tiếp.</td></tr>}
            {filtered.map(r => (
              <tr key={r.key} style={{ borderBottom:'1px solid #F3F4F6' }}>
                <td style={{ padding:'9px 12px', color:'#6B7280' }}>{r.ngay||'—'}</td>
                <td style={{ padding:'9px 12px' }}>
                  <span style={{ background:r.loai==='Thu'?'#EFF6FF':'#FEF2F2', color:r.loai==='Thu'?'#1C3557':'#DC2626', fontSize:10.5, fontWeight:700, padding:'2px 8px', borderRadius:5 }}>{r.loai}</span>
                </td>
                <td style={{ padding:'9px 12px', color:'#374151' }}>{r.nhom}</td>
                <td style={{ padding:'9px 12px', color:'#1F2430', maxWidth:240 }}>{r.mo_ta}</td>
                <td style={{ padding:'9px 12px', color:'#6B7280', fontFamily:'monospace', fontSize:11 }}>{r.chung_tu_so||'—'}</td>
                <td style={{ padding:'9px 12px', fontWeight:700, color:r.loai==='Thu'?'#1C3557':'#DC2626' }}>
                  {(r.so_tien/1e6).toLocaleString('vi-VN',{maximumFractionDigits:0})} tr
                </td>
                <td style={{ padding:'9px 12px', color:'#6B7280' }}>{r.don_vi||'—'}</td>
                {canEdit && (
                  <td style={{ padding:'9px 12px' }}>
                    <button style={{...btnSm,color:'#DC2626'}} onClick={async()=>{ if(confirm('Xóa chứng từ này?')){ await remove(ref(getDb(),`${PREFIX}_ChungTu/${r.key}`)); onReload() } }}>🗑</button>
                  </td>
                )}
              </tr>
            ))}
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
const btnGS:React.CSSProperties = { padding:'8px 16px', background:'#1C3557', color:'#fff', border:'none', borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit', display:'inline-flex', alignItems:'center', gap:6 }
