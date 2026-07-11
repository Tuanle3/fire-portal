'use client'
import React, { useState, useEffect, useMemo } from 'react'
import { useUserSession } from '@/contexts/user-session'
import { subscribeDashLayouts, saveDashLayout, DashGridState } from '@/lib/dien-nuoc-store'

// Khu vực card cho phép NGƯỜI DÙNG tự kéo-thả đổi vị trí & co-giãn kích thước, lưu theo tài khoản (Firestore).
// React 19 đã bỏ findDOMNode nên KHÔNG dùng thư viện grid — tự làm bằng HTML5 drag + CSS resize (an toàn, nhẹ).
// Dùng: <DashArea gridKey="dh2-ketqua"> <div key="a">…</div> <div key="b">…</div> </DashArea>
// Mỗi con trực tiếp là 1 card, PHẢI có `key` ổn định. Card nên tự đặt height:100% để lấp đầy ô khi co giãn.
export function DashArea({ gridKey, minWidth = 240, children }: { gridKey: string; minWidth?: number; children: React.ReactNode }) {
  const { username } = useUserSession()
  const [state, setState] = useState<DashGridState>({ order: [], size: {} })
  const [edit, setEdit] = useState(false)
  const [dragKey, setDragKey] = useState<string | null>(null)

  useEffect(() => {
    const unsub = subscribeDashLayouts(username, all => {
      const g = all?.[gridKey]
      setState(g ? { order: g.order ?? [], size: g.size ?? {} } : { order: [], size: {} })
    })
    return unsub
  }, [username, gridKey])

  const items = useMemo(() => React.Children.toArray(children).filter(React.isValidElement) as React.ReactElement[], [children])
  const keyOf = (el: React.ReactElement) => String(el.key)

  // Thứ tự hiển thị = order đã lưu (lọc card còn tồn tại) + card mới thêm vào cuối.
  const ordered = useMemo(() => {
    const byKey = new Map(items.map(el => [keyOf(el), el]))
    const saved = (state.order ?? []).filter(k => byKey.has(k))
    const rest = items.map(keyOf).filter(k => !saved.includes(k))
    return [...saved, ...rest].map(k => byKey.get(k)!).filter(Boolean)
  }, [items, state.order])

  const persist = (next: DashGridState) => { setState(next); saveDashLayout(username, gridKey, next) }
  const curOrder = () => ordered.map(keyOf)

  const reorder = (from: string, to: string) => {
    if (from === to) return
    const arr = curOrder()
    const a = arr.indexOf(from); if (a < 0) return
    arr.splice(a, 1)
    const b = arr.indexOf(to)
    arr.splice(b < 0 ? arr.length : b, 0, from)
    persist({ order: arr, size: state.size })
  }
  const setSize = (key: string, w: number, h: number) => persist({ order: curOrder(), size: { ...state.size, [key]: { w, h } } })
  const clearSize = (key: string) => { const s = { ...state.size }; delete s[key]; persist({ order: curOrder(), size: s }) }
  const resetAll = () => persist({ order: [], size: {} })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 6, alignItems: 'center' }}>
        {edit && <span style={{ fontSize: 11, color: 'var(--muted)', marginRight: 'auto', fontStyle: 'italic' }}>Kéo ⠿ để đổi chỗ · kéo góc dưới-phải để co giãn · ↺ bỏ co giãn 1 ô</span>}
        {edit && <button className="btn-ghost" onClick={resetAll} title="Đặt lại bố cục mặc định">↺ Mặc định</button>}
        <button className="btn-ghost" onClick={() => setEdit(v => !v)}
          style={edit ? { borderColor: 'var(--navy)', background: '#EEF3FA', color: 'var(--navy)', fontWeight: 700 } : undefined}>
          {edit ? '✓ Xong' : '⤢ Sắp xếp'}
        </button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'stretch' }}>
        {ordered.map(el => {
          const key = keyOf(el)
          const sz = state.size[key]
          return (
            <div key={key}
              onDragOver={edit ? e => { if (dragKey && dragKey !== key) e.preventDefault() } : undefined}
              onDrop={edit ? e => { e.preventDefault(); if (dragKey) reorder(dragKey, key); setDragKey(null) } : undefined}
              onMouseUp={edit ? e => {
                const r = e.currentTarget.getBoundingClientRect()
                const w = Math.round(r.width), h = Math.round(r.height)
                if (!sz || Math.abs((sz.w ?? 0) - w) > 4 || Math.abs((sz.h ?? 0) - h) > 4) setSize(key, w, h)
              } : undefined}
              style={{
                flex: sz?.w ? `0 0 ${sz.w}px` : `1 1 ${minWidth}px`,
                minWidth: 0,
                ...(sz?.h ? { height: sz.h } : {}),
                overflow: (edit || sz?.h) ? 'auto' : 'visible',
                ...(edit ? { resize: 'both' as const } : {}),
                position: 'relative', display: 'flex', flexDirection: 'column',
                outline: edit ? (dragKey === key ? '2px dashed var(--gold)' : '1.5px dashed var(--navy3)') : undefined,
                outlineOffset: edit ? 2 : undefined,
                opacity: dragKey === key ? 0.45 : 1, transition: 'opacity .12s',
              }}>
              {edit && (
                <div style={{ position: 'absolute', top: 3, right: 3, zIndex: 5, display: 'flex', gap: 4 }}>
                  {sz && <button onClick={() => clearSize(key)} title="Bỏ co giãn ô này (về tự động)" style={{ cursor: 'pointer', fontSize: 11, lineHeight: 1, border: 'none', background: '#8A5A12', color: '#fff', borderRadius: 5, padding: '3px 6px' }}>↺</button>}
                  <span draggable onDragStart={() => setDragKey(key)} onDragEnd={() => setDragKey(null)}
                    title="Kéo để đổi vị trí" style={{ cursor: 'grab', fontSize: 11, fontWeight: 700, background: 'var(--navy)', color: '#fff', borderRadius: 5, padding: '3px 8px', userSelect: 'none' }}>⠿ kéo</span>
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>{el}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
