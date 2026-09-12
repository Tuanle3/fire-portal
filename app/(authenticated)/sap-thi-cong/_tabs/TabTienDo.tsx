'use client'
import { useState, useEffect } from 'react'
import { HangMuc, HangMucStatus } from '../_lib/types'
import { hangMucStore } from '@/lib/firebase-sap-thi-cong'

const STATUS_LABEL: Record<HangMucStatus, string> = {
  todo: 'Chưa bắt đầu', active: 'Đang thi công', done: 'Hoàn thành', delay: 'Trễ tiến độ',
}
const STATUS_CLASS: Record<HangMucStatus, string> = {
  todo: '', active: '', done: 'done', delay: 'delay',
}

// Sắp xếp theo cây cha-con: mỗi cha đi kèm ngay các con của nó (theo order
// riêng trong nhóm anh em), thay vì sort phẳng toàn bộ theo `order` chung —
// cách cũ khiến hạng mục con bị rơi lạc chỗ khi order của nó lớn hơn các
// hạng mục cha khác được tạo sau.
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

export function TabTienDo({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<HangMuc[]>([])
  const [editing, setEditing] = useState<HangMuc | 'new' | null>(null)

  useEffect(() => {
    const unsub = hangMucStore.subscribe(projectId, setItems)
    return () => unsub()
  }, [projectId])

  const sorted = sortHierarchical(items)
  const avgPct = items.length ? Math.round(items.reduce((s, i) => s + (i.progressPct || 0), 0) / items.length) : 0
  const delayCount = items.filter(i => i.status === 'delay').length
  const doneCount = items.filter(i => i.status === 'done').length

  return (
    <>
      <div className="stc-kpi-row">
        <div className="stc-kpi"><div className="stc-kpi-label">Tổng hạng mục</div><div className="stc-kpi-val">{items.length}</div></div>
        <div className="stc-kpi green"><div className="stc-kpi-label">Đã hoàn thành</div><div className="stc-kpi-val">{doneCount}</div></div>
        <div className="stc-kpi red"><div className="stc-kpi-label">Trễ tiến độ</div><div className="stc-kpi-val">{delayCount}</div></div>
        <div className="stc-kpi gold"><div className="stc-kpi-label">% hoàn thành TB</div><div className="stc-kpi-val">{avgPct}%</div></div>
      </div>

      <div className="stc-panel">
        <div className="stc-panel-head">
          <span className="stc-panel-title">Danh sách hạng mục thi công</span>
          <button className="btn-primary" onClick={() => setEditing('new')}>+ Thêm hạng mục</button>
        </div>
        <div className="stc-panel-body" style={{ padding: 0 }}>
          <table className="stc-table">
            <thead>
              <tr>
                <th>Hạng mục</th><th>Bắt đầu</th><th>Kết thúc</th><th style={{ width: 200 }}>Tiến độ</th><th>Trạng thái</th><th></th>
              </tr>
            </thead>
            <tbody>
              {!sorted.length && (
                <tr className="stc-empty-row"><td colSpan={6}>Chưa có hạng mục nào. Bấm &quot;+ Thêm hạng mục&quot; để nhập.</td></tr>
              )}
              {sorted.map(i => (
                <tr key={i.id} onClick={() => setEditing(i)} style={{ cursor: 'pointer' }}>
                  <td>{i.parentId ? <span style={{ paddingLeft: 16, color: 'var(--muted)' }}>↳ </span> : null}{i.name}</td>
                  <td>{i.startDate || '—'}</td>
                  <td>{i.endDate || '—'}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="stc-progress-bar"><div className={`stc-progress-fill ${STATUS_CLASS[i.status]}`} style={{ width: `${i.progressPct}%` }} /></div>
                      <span style={{ fontSize: 11, fontWeight: 700, width: 30, textAlign: 'right' }}>{i.progressPct}%</span>
                    </div>
                  </td>
                  <td><span className={`stc-badge stc-badge-${i.status === 'done' ? 'done' : i.status === 'delay' ? 'active' : 'upcoming'}`}>{STATUS_LABEL[i.status]}</span></td>
                  <td onClick={e => e.stopPropagation()}>
                    <button className="btn-del-icon" onClick={() => { if (confirm('Xoá hạng mục này?')) hangMucStore.remove(projectId, i.id) }}>🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <HangMucModal
          projectId={projectId}
          items={items}
          value={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}

function HangMucModal({
  projectId, items, value, onClose,
}: {
  projectId: string
  items: HangMuc[]
  value: HangMuc | null
  onClose: () => void
}) {
  const [name, setName] = useState(value?.name ?? '')
  const [parentId, setParentId] = useState(value?.parentId ?? '')
  const [startDate, setStartDate] = useState(value?.startDate ?? '')
  const [endDate, setEndDate] = useState(value?.endDate ?? '')
  const [progressPct, setProgressPct] = useState(String(value?.progressPct ?? 0))
  const [status, setStatus] = useState<HangMucStatus>(value?.status ?? 'todo')
  const [note, setNote] = useState(value?.note ?? '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function handleSave() {
    if (!name.trim()) { setErr('Vui lòng nhập tên hạng mục'); return }
    setSaving(true)
    setErr('')
    try {
      const data = {
        name: name.trim(),
        parentId: parentId || null,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        progressPct: Math.max(0, Math.min(100, Number(progressPct) || 0)),
        status,
        note: note.trim() || undefined,
      }
      if (value) await hangMucStore.update(projectId, value.id, data)
      else await hangMucStore.add(projectId, { ...data, order: items.length })
      onClose()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Lưu thất bại')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="stc-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="stc-modal">
        <div className="stc-modal-head">
          <div className="stc-modal-title">{value ? 'Sửa hạng mục' : '+ Thêm hạng mục thi công'}</div>
          <button className="stc-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="stc-modal-body">
          {err && <div className="stc-err">{err}</div>}
          <div className="stc-field stc-field--full">
            <label>Tên hạng mục *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="VD: San lấp mặt bằng" />
          </div>
          <div className="stc-field stc-field--full">
            <label>Thuộc hạng mục cha (nếu là hạng mục con)</label>
            <select value={parentId ?? ''} onChange={e => setParentId(e.target.value)}>
              <option value="">— Hạng mục gốc —</option>
              {items.filter(i => !value || i.id !== value.id).map(i => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
          </div>
          <div className="stc-field"><label>Ngày bắt đầu</label><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
          <div className="stc-field"><label>Ngày kết thúc</label><input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></div>
          <div className="stc-field">
            <label>% hoàn thành</label>
            <input type="number" min={0} max={100} value={progressPct} onChange={e => setProgressPct(e.target.value)} />
          </div>
          <div className="stc-field">
            <label>Trạng thái</label>
            <select value={status} onChange={e => setStatus(e.target.value as HangMucStatus)}>
              <option value="todo">Chưa bắt đầu</option>
              <option value="active">Đang thi công</option>
              <option value="done">Hoàn thành</option>
              <option value="delay">Trễ tiến độ</option>
            </select>
          </div>
          <div className="stc-field stc-field--full">
            <label>Ghi chú</label>
            <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} />
          </div>
        </div>
        <div className="stc-modal-foot">
          {value && <button className="btn-ghost" style={{ color: '#DC2626', marginRight: 'auto' }} onClick={() => { if (confirm('Xoá hạng mục này?')) { hangMucStore.remove(projectId, value.id); onClose() } }}>Xoá</button>}
          <button className="btn-ghost" onClick={onClose}>Huỷ</button>
          <button className="btn-primary" disabled={saving} onClick={handleSave}>{saving ? 'Đang lưu...' : 'Lưu'}</button>
        </div>
      </div>
    </div>
  )
}
