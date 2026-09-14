'use client'
import { useState, useEffect } from 'react'
import { DongTienItem, DongTienType, DoiTac, HangMuc, fmt } from '../_lib/types'
import { NumberInput } from '../_lib/NumberInput'
import { dongTienStore, doiTacStore, hangMucStore } from '@/lib/firebase-sap-thi-cong'

const SOURCE_LABEL: Record<NonNullable<DongTienItem['sourceType']>, string> = {
  'nghiem-thu': 'đợt nghiệm thu nhà thầu phụ (tab Nhà thầu phụ)',
  'vat-tu': 'thanh toán vật tư (tab Vật tư)',
  'khoan-vay': 'giải ngân vay (tab Vay & giải ngân)',
  'ky-tra-no': 'kỳ trả nợ vay (tab Vay & giải ngân)',
}

// Sắp xếp cây cha-con để hiện thụt lề trong dropdown chọn hạng mục — cùng cách làm với
// TabTienDo.tsx / TabNhaThau.tsx / TabVatTu.tsx.
function sortHierarchical(items: HangMuc[]): HangMuc[] {
  const byParent = new Map<string, HangMuc[]>()
  for (const item of items) {
    const key = item.parentId || ''
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key)!.push(item)
  }
  for (const list of byParent.values()) list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const result: HangMuc[] = []
  function walk(parentKey: string) {
    for (const item of byParent.get(parentKey) ?? []) {
      result.push(item)
      walk(item.id)
    }
  }
  walk('')
  return result
}

export function TabDongTien({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<DongTienItem[]>([])
  const [doiTacs, setDoiTacs] = useState<DoiTac[]>([])
  const [hangMucs, setHangMucs] = useState<HangMuc[]>([])
  const [editing, setEditing] = useState<DongTienItem | 'new' | null>(null)
  const [filter, setFilter] = useState<'all' | DongTienType>('all')

  useEffect(() => { const unsub = dongTienStore.subscribe(projectId, setItems); return () => unsub() }, [projectId])
  useEffect(() => { const unsub = doiTacStore.subscribe(projectId, setDoiTacs); return () => unsub() }, [projectId])
  useEffect(() => { const unsub = hangMucStore.subscribe(projectId, setHangMucs); return () => unsub() }, [projectId])

  const totalThu = items.filter(i => i.type === 'thu').reduce((s, i) => s + i.amount, 0)
  const totalChi = items.filter(i => i.type === 'chi').reduce((s, i) => s + i.amount, 0)
  const shown = [...items]
    .filter(i => filter === 'all' || i.type === filter)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
  const doiTacName = (id?: string) => doiTacs.find(d => d.id === id)?.name
  const hangMucName = (id?: string) => hangMucs.find(h => h.id === id)?.name

  function handleRowClick(item: DongTienItem) {
    if (item.auto) {
      alert(`Bản ghi này được tự động tạo từ ${SOURCE_LABEL[item.sourceType!] || 'nghiệp vụ khác'}. Vui lòng sửa/xoá tại đúng màn hình nguồn để số liệu luôn khớp nhau.`)
      return
    }
    setEditing(item)
  }

  return (
    <>
      <div className="stc-kpi-row">
        <div className="stc-kpi green"><div className="stc-kpi-label">Tổng thu</div><div className="stc-kpi-val">{fmt(totalThu)} đ</div></div>
        <div className="stc-kpi red"><div className="stc-kpi-label">Tổng chi</div><div className="stc-kpi-val">{fmt(totalChi)} đ</div></div>
        <div className="stc-kpi gold"><div className="stc-kpi-label">Chênh lệch</div><div className="stc-kpi-val">{fmt(totalThu - totalChi)} đ</div></div>
      </div>

      <div className="stc-panel">
        <div className="stc-panel-head">
          <div style={{ display: 'flex', gap: 6 }}>
            {(['all', 'thu', 'chi'] as const).map(f => (
              <button key={f} className="btn-ghost" style={filter === f ? { background: 'var(--navy)', color: '#fff', borderColor: 'var(--navy)' } : undefined} onClick={() => setFilter(f)}>
                {f === 'all' ? 'Tất cả' : f === 'thu' ? 'Khoản thu' : 'Khoản chi'}
              </button>
            ))}
          </div>
          <button className="btn-primary" onClick={() => setEditing('new')}>+ Thêm khoản</button>
        </div>
        <div className="stc-panel-body" style={{ padding: 0 }}>
          <table className="stc-table">
            <thead>
              <tr><th>Ngày</th><th>Loại</th><th>Hạng mục / Diễn giải</th><th>Hạng mục CT</th><th>Đối tác</th><th>Số tiền (đ)</th><th>Ghi chú</th><th></th></tr>
            </thead>
            <tbody>
              {!shown.length && <tr className="stc-empty-row"><td colSpan={8}>Chưa có dữ liệu dòng tiền.</td></tr>}
              {shown.map(i => (
                <tr key={i.id} onClick={() => handleRowClick(i)} style={{ cursor: 'pointer' }}>
                  <td>{i.date}</td>
                  <td><span className={`stc-badge stc-badge-${i.type === 'thu' ? 'done' : 'active'}`}>{i.type === 'thu' ? 'Thu' : 'Chi'}</span></td>
                  <td>
                    {i.category}
                    {i.auto && <span className="stc-badge stc-badge-upcoming" style={{ marginLeft: 6 }} title="Tự động tạo từ nghiệp vụ khác, không sửa/xoá trực tiếp ở đây">🔗 Tự động</span>}
                  </td>
                  <td style={{ fontSize: 11 }}>{i.hangMucId ? <span className="stc-badge stc-badge-upcoming">{hangMucName(i.hangMucId) || '—'}</span> : <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                  <td style={{ fontSize: 11.5, color: 'var(--muted)' }}>{doiTacName(i.doiTacId) || '—'}</td>
                  <td className="num" style={{ color: i.type === 'thu' ? 'var(--green)' : '#DC2626', fontWeight: 700 }}>{fmt(i.amount)}</td>
                  <td style={{ color: 'var(--muted)', fontSize: 11.5 }}>{i.note || '—'}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <button
                      className="btn-del-icon"
                      disabled={i.auto}
                      title={i.auto ? 'Xoá tại màn hình nguồn' : 'Xoá'}
                      style={i.auto ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
                      onClick={() => { if (!i.auto && confirm('Xoá khoản này?')) dongTienStore.remove(projectId, i.id) }}
                    >🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing && <DongTienModal projectId={projectId} doiTacs={doiTacs} hangMucs={hangMucs} value={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function DongTienModal({
  projectId, doiTacs, hangMucs, value, onClose,
}: {
  projectId: string
  doiTacs: DoiTac[]
  hangMucs: HangMuc[]
  value: DongTienItem | null
  onClose: () => void
}) {
  const [date, setDate] = useState(value?.date ?? new Date().toISOString().slice(0, 10))
  const [type, setType] = useState<DongTienType>(value?.type ?? 'chi')
  const [category, setCategory] = useState(value?.category ?? '')
  const [amount, setAmount] = useState(String(value?.amount ?? ''))
  const [doiTacId, setDoiTacId] = useState(value?.doiTacId)
  const [hangMucId, setHangMucId] = useState(value?.hangMucId)
  const [note, setNote] = useState(value?.note ?? '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function handleSave() {
    if (!category.trim() || !amount) { setErr('Vui lòng nhập đầy đủ diễn giải và số tiền'); return }
    setSaving(true); setErr('')
    try {
      const data = { date, type, category: category.trim(), amount: Number(amount), doiTacId, hangMucId, note: note.trim() || undefined }
      if (value) await dongTienStore.update(projectId, value.id, data)
      else await dongTienStore.add(projectId, data)
      onClose()
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Lưu thất bại') } finally { setSaving(false) }
  }

  return (
    <div className="stc-modal-overlay" onClick={(e) => e.stopPropagation()}>
      <div className="stc-modal">
        <div className="stc-modal-head">
          <div className="stc-modal-title">{value ? 'Sửa khoản dòng tiền' : '+ Thêm khoản dòng tiền'}</div>
          <button className="stc-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="stc-modal-body">
          {err && <div className="stc-err">{err}</div>}
          <div className="stc-field"><label>Ngày</label><input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
          <div className="stc-field">
            <label>Loại</label>
            <select value={type} onChange={e => setType(e.target.value as DongTienType)}>
              <option value="thu">Khoản thu</option>
              <option value="chi">Khoản chi</option>
            </select>
          </div>
          <div className="stc-field stc-field--full"><label>Hạng mục / Diễn giải *</label><input value={category} onChange={e => setCategory(e.target.value)} placeholder="VD: Tạm ứng nhà thầu, thu tiền khách hàng..." /></div>
          <div className="stc-field"><label>Số tiền (đ) *</label><NumberInput value={amount} onChange={setAmount} /></div>
          <div className="stc-field">
            <label>Đối tác liên quan</label>
            <select value={doiTacId ?? ''} onChange={e => setDoiTacId(e.target.value || undefined)}>
              <option value="">— Không chọn —</option>
              {doiTacs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="stc-field stc-field--full">
            <label>Hạng mục thi công liên quan</label>
            <select value={hangMucId ?? ''} onChange={e => setHangMucId(e.target.value || undefined)}>
              <option value="">— Không chọn —</option>
              {sortHierarchical(hangMucs).map(h => (
                <option key={h.id} value={h.id}>{h.parentId ? `\u00A0\u00A0↳ ${h.name}` : h.name}</option>
              ))}
            </select>
            <div className="stc-hint" style={{ marginTop: 6, fontSize: 11 }}>Gắn hạng mục để sau này lọc/tổng hợp thu-chi theo từng đầu việc, kiểm tra hiệu quả từng hạng mục dễ hơn.</div>
          </div>
          <div className="stc-field stc-field--full"><label>Ghi chú</label><textarea rows={2} value={note} onChange={e => setNote(e.target.value)} /></div>
        </div>
        <div className="stc-modal-foot">
          {value && <button className="btn-ghost" style={{ color: '#DC2626', marginRight: 'auto' }} onClick={() => { if (confirm('Xoá khoản này?')) { dongTienStore.remove(projectId, value.id); onClose() } }}>Xoá</button>}
          <button className="btn-ghost" onClick={onClose}>Huỷ</button>
          <button className="btn-primary" disabled={saving} onClick={handleSave}>{saving ? 'Đang lưu...' : 'Lưu'}</button>
        </div>
      </div>
    </div>
  )
}
