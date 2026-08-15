'use client'

/**
 * EntitySelect
 * ─────────────────────────────────────────────────────────────
 * Dropdown chọn pháp nhân, dùng chung cho module Hạn mức (Dài hạn +
 * Ngắn hạn). Gộp danh sách pháp nhân đã biết (SAP, SAHS, ĐTSA, YANA,
 * Sao Việt, Cá nhân) với danh sách tuỳ chỉnh lưu ở Firestore
 * (hanMucCustomEntities) — có sẵn lựa chọn "+ Thêm pháp nhân khác…"
 * để tự thêm khi phát sinh pháp nhân mới, không cần sửa code.
 * ─────────────────────────────────────────────────────────────
 */

import { useEffect, useState, CSSProperties } from 'react'
import { subscribeCustomEntities, addCustomEntity } from '@/lib/han-muc-entities-store'
import type { EntityType } from '@/lib/han-muc-types'

const KNOWN_ENTITIES: string[] = ['SAP', 'SAHS', 'ĐTSA', 'YANA', 'Sao Việt', 'Cá nhân']
const ADD_NEW = '__add_new_entity__'

interface Props {
  value:      string
  onChange:   (v: EntityType) => void
  className?: string
  style?:     CSSProperties
}

export default function EntitySelect({ value, onChange, className, style }: Props) {
  const [custom, setCustom] = useState<string[]>([])
  const [adding, setAdding] = useState(false)
  const [newVal, setNewVal] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const unsub = subscribeCustomEntities(rows => setCustom(rows.map(r => r.ten)))
    return unsub
  }, [])

  const options = [...KNOWN_ENTITIES, ...custom.filter(c => !KNOWN_ENTITIES.includes(c))]
  // Nếu value hiện tại (VD: dữ liệu cũ) không nằm trong danh sách → vẫn hiển thị để không mất lựa chọn
  if (value && !options.includes(value)) options.push(value)

  const handleSelect = (v: string) => {
    if (v === ADD_NEW) { setAdding(true); setNewVal(''); return }
    onChange(v)
  }

  const handleAdd = async () => {
    const ten = newVal.trim()
    if (!ten) return
    setSaving(true)
    try {
      await addCustomEntity(ten)
      onChange(ten)
      setAdding(false)
      setNewVal('')
    } finally {
      setSaving(false)
    }
  }

  if (adding) {
    return (
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          autoFocus
          value={newVal}
          onChange={e => setNewVal(e.target.value)}
          placeholder="Tên pháp nhân mới…"
          className={className}
          style={{ ...style, flex: 1 }}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); handleAdd() }
            if (e.key === 'Escape') { setAdding(false); setNewVal('') }
          }}
        />
        <button
          type="button" onClick={handleAdd} disabled={saving || !newVal.trim()}
          style={{
            border: 'none', borderRadius: 6, background: saving ? '#93aec8' : '#1C3557',
            color: '#fff', padding: '0 12px', fontSize: 12, fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
          }}
        >
          {saving ? '…' : 'Thêm'}
        </button>
        <button
          type="button" onClick={() => { setAdding(false); setNewVal('') }}
          style={{ border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', padding: '0 10px', cursor: 'pointer' }}
        >
          ✕
        </button>
      </div>
    )
  }

  return (
    <select value={value} onChange={e => handleSelect(e.target.value)} className={className} style={style}>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
      <option value={ADD_NEW}>+ Thêm pháp nhân khác…</option>
    </select>
  )
}
