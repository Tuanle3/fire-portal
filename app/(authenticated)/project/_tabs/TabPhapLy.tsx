'use client'
import { useState } from 'react'
import { getDb } from '@/lib/firebase'
import { ref, push, remove, set } from 'firebase/database'
import type { PhapLyDoc, ProjectUnit } from '../_lib/types'
import { PREFIX, TRANG_THAI_LABEL } from '../_lib/types'

const LOAI_LIST = ['Quyết định','Giấy phép','Hợp đồng','Báo cáo','Biên bản','Thông báo','Khác']
const TT_LIST   = [
  { val:'hieu_luc',  label:'Hiệu lực',          color:'#15803D', bg:'#F0FDF4' },
  { val:'het_han',   label:'Hết hạn',            color:'#DC2626', bg:'#FEF2F2' },
  { val:'cho_duyet', label:'Chờ duyệt',          color:'#D97706', bg:'#FFFBEB' },
  { val:'dang_lam',  label:'Đang thực hiện',     color:'#2563EB', bg:'#EFF6FF' },
]

interface Props { docs: PhapLyDoc[]; canEdit: boolean; onReload: () => void; unit: ProjectUnit }

const EMPTY: Omit<PhapLyDoc,'key'> = { ten:'', loai:'Quyết định', so_hieu:'', ngay_cap:'', han:'', trang_thai:'hieu_luc', don_vi:'', ghi_chu:'' }

export default function TabPhapLy({ docs, canEdit, onReload }: Props) {
  const [form,    setForm]    = useState<Omit<PhapLyDoc,'key'>>(EMPTY)
  const [editKey, setEditKey] = useState<string | null>(null)
  const [saving,  setSaving]  = useState(false)
  const [msg,     setMsg]     = useState('')
  const [filter,  setFilter]  = useState('')

  const ttMap = Object.fromEntries(TT_LIST.map(t => [t.val, t]))

  const filtered = docs.filter(d =>
    !filter || d.ten.toLowerCase().includes(filter.toLowerCase()) ||
    d.loai.toLowerCase().includes(filter.toLowerCase()) ||
    d.don_vi.toLowerCase().includes(filter.toLowerCase())
  )

  function openAdd() { setForm(EMPTY); setEditKey(null); setMsg('') }
  function openEdit(d: PhapLyDoc) { const { key, ...rest } = d; setForm(rest); setEditKey(key); setMsg('') }
  function closeForm() { setEditKey(null); setMsg('') }

  async function save() {
    if (!form.ten) return
    setSaving(true); setMsg('')
    const db = getDb()
    if (editKey) await set(ref(db, `${PREFIX}_PhapLy/${editKey}`), form)
    else         await push(ref(db, `${PREFIX}_PhapLy`), form)
    setSaving(false); setMsg('✓ Đã lưu'); onReload()
    if (!editKey) { setForm(EMPTY); setMsg('✓ Đã thêm hồ sơ') }
  }

  async function del(key: string) {
    if (!confirm('Xóa hồ sơ pháp lý này?')) return
    await remove(ref(getDb(), `${PREFIX}_PhapLy/${key}`))
    onReload()
  }

  const kpiCounts = { hieu_luc: 0, het_han: 0, cho_duyet: 0, dang_lam: 0 }
  docs.forEach(d => { if (d.trang_thai in kpiCounts) kpiCounts[d.trang_thai as keyof typeof kpiCounts]++ })

  return (
    <div>
      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:18 }}>
        {TT_LIST.map(t => (
          <div key={t.val} style={{ background:t.bg, border:`1px solid ${t.color}30`, borderRadius:10, padding:'12px 16px' }}>
            <div style={{ fontSize:10, fontWeight:700, color:t.color, letterSpacing:'.06em', marginBottom:6 }}>{t.label.toUpperCase()}</div>
            <div style={{ fontSize:28, fontWeight:800, color:t.color }}>{kpiCounts[t.val as keyof typeof kpiCounts]}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display:'flex', gap:10, marginBottom:14, alignItems:'center' }}>
        <input style={inputStyle} placeholder="🔍 Tìm kiếm hồ sơ..." value={filter} onChange={e=>setFilter(e.target.value)} />
        {canEdit && <button style={btnPrimary} onClick={openAdd}>➕ Thêm hồ sơ</button>}
      </div>

      {/* Add/Edit form */}
      {(editKey !== null || (editKey === null && form.ten !== undefined && canEdit && msg === '')) && editKey !== null && (
        <AddForm form={form} setForm={setForm} saving={saving} msg={msg} onSave={save} onClose={closeForm} isEdit />
      )}

      {/* Table */}
      <div style={{ background:'#fff', border:'1px solid #E5E0D8', borderRadius:12, overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
          <thead>
            <tr style={{ background:'#F5F8FC' }}>
              {['#','Tên hồ sơ','Loại','Số hiệu','Ngày cấp','Hạn','Đơn vị','Trạng thái',''].map(h => (
                <th key={h} style={{ padding:'10px 12px', textAlign:'left', fontWeight:700, color:'#6B7280', fontSize:11, whiteSpace:'nowrap', borderBottom:'1px solid #E5E0D8' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={9} style={{ padding:'32px', textAlign:'center', color:'#9ca3af' }}>Không có hồ sơ pháp lý</td></tr>
            )}
            {filtered.map((d, i) => {
              const tt = ttMap[d.trang_thai]
              return (
                <tr key={d.key} style={{ borderBottom:'1px solid #F3F4F6' }}>
                  <td style={{ padding:'10px 12px', color:'#9ca3af' }}>{i+1}</td>
                  <td style={{ padding:'10px 12px', fontWeight:600, color:'#1F2430', maxWidth:220 }}>{d.ten}</td>
                  <td style={{ padding:'10px 12px', color:'#374151' }}>{d.loai}</td>
                  <td style={{ padding:'10px 12px', color:'#374151', fontFamily:'monospace', fontSize:11 }}>{d.so_hieu || '—'}</td>
                  <td style={{ padding:'10px 12px', color:'#374151' }}>{d.ngay_cap || '—'}</td>
                  <td style={{ padding:'10px 12px', color: d.han ? '#374151' : '#9ca3af' }}>{d.han || '—'}</td>
                  <td style={{ padding:'10px 12px', color:'#374151' }}>{d.don_vi || '—'}</td>
                  <td style={{ padding:'10px 12px' }}>
                    <span style={{ background:tt?.bg, color:tt?.color, fontSize:10.5, fontWeight:700, padding:'3px 9px', borderRadius:6 }}>
                      {tt?.label ?? d.trang_thai}
                    </span>
                  </td>
                  {canEdit && (
                    <td style={{ padding:'10px 12px', whiteSpace:'nowrap' }}>
                      <button style={btnSm} onClick={() => openEdit(d)}>✏️</button>
                      {' '}
                      <button style={{...btnSm, color:'#DC2626'}} onClick={() => del(d.key)}>🗑</button>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Floating add form */}
      {editKey === null && canEdit && msg.startsWith('✓') === false && form !== EMPTY && (
        null /* handled below */
      )}

      {/* Add form panel (shown when openAdd clicked) */}
      {editKey === null && canEdit && !msg && (
        <div id="add-form-anchor" />
      )}
    </div>
  )
}

// Inline form for add/edit shown as a panel
function AddForm({ form, setForm, saving, msg, onSave, onClose, isEdit }: {
  form: Omit<PhapLyDoc,'key'>; setForm: (f: Omit<PhapLyDoc,'key'>) => void
  saving: boolean; msg: string; onSave: () => void; onClose: () => void; isEdit?: boolean
}) {
  const set = (k: keyof Omit<PhapLyDoc,'key'>, v: string) => setForm({ ...form, [k]: v })
  return (
    <div style={{ background:'#F5F8FC', border:'1px solid #D0DCE8', borderRadius:12, padding:'18px 20px', marginBottom:16 }}>
      <div style={{ fontWeight:700, fontSize:13, color:'#1C3557', marginBottom:14 }}>{isEdit ? '✏️ Sửa hồ sơ' : '➕ Thêm hồ sơ pháp lý'}</div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
        <Field label="Tên hồ sơ" required><input style={inputStyle} value={form.ten} onChange={e=>set('ten',e.target.value)} placeholder="Tên hồ sơ" /></Field>
        <Field label="Loại">
          <select style={inputStyle} value={form.loai} onChange={e=>set('loai',e.target.value)}>
            {LOAI_LIST.map(l => <option key={l}>{l}</option>)}
          </select>
        </Field>
        <Field label="Số hiệu / Mã"><input style={inputStyle} value={form.so_hieu} onChange={e=>set('so_hieu',e.target.value)} placeholder="QĐ-001/2024"/></Field>
        <Field label="Đơn vị cấp"><input style={inputStyle} value={form.don_vi} onChange={e=>set('don_vi',e.target.value)} placeholder="UBND Tỉnh"/></Field>
        <Field label="Ngày cấp"><input style={inputStyle} type="date" value={form.ngay_cap} onChange={e=>set('ngay_cap',e.target.value)}/></Field>
        <Field label="Hạn hiệu lực"><input style={inputStyle} type="date" value={form.han} onChange={e=>set('han',e.target.value)}/></Field>
        <Field label="Trạng thái">
          <select style={inputStyle} value={form.trang_thai} onChange={e=>set('trang_thai',e.target.value as any)}>
            {[['hieu_luc','Hiệu lực'],['het_han','Hết hạn'],['cho_duyet','Chờ duyệt'],['dang_lam','Đang thực hiện']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Ghi chú"><input style={inputStyle} value={form.ghi_chu} onChange={e=>set('ghi_chu',e.target.value)} placeholder="Ghi chú thêm"/></Field>
      </div>
      <div style={{ display:'flex', gap:8, marginTop:12, alignItems:'center' }}>
        <button style={btnPrimary} onClick={onSave} disabled={saving||!form.ten}>{saving?'Đang lưu...':'💾 Lưu'}</button>
        <button style={btnOutline} onClick={onClose}>Hủy</button>
        {msg && <span style={{ fontSize:12, color:'#15803D' }}>{msg}</span>}
      </div>
    </div>
  )
}

function Field({ label, required, children }: { label:string; required?:boolean; children:React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize:11, fontWeight:700, color:'#374151', display:'block', marginBottom:4 }}>{label}{required&&' *'}</label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = { width:'100%', padding:'7px 10px', border:'1px solid #D1D5DB', borderRadius:7, fontSize:12, fontFamily:'inherit', color:'#1F2430', boxSizing:'border-box' }
const btnPrimary: React.CSSProperties = { padding:'8px 18px', background:'#1C3557', color:'#fff', border:'none', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }
const btnOutline: React.CSSProperties = { padding:'8px 16px', background:'transparent', color:'#1C3557', border:'1.5px solid #1C3557', borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }
const btnSm:      React.CSSProperties = { padding:'4px 8px', background:'#F3F4F6', border:'1px solid #E5E7EB', borderRadius:5, cursor:'pointer', fontSize:12, fontFamily:'inherit' }
