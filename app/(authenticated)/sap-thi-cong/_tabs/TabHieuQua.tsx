'use client'
import { useState, useEffect, useMemo, type ReactElement } from 'react'
import { HangMuc, DongTienItem, DoiTac, fmt } from '../_lib/types'
import { hangMucStore, dongTienStore, doiTacStore } from '@/lib/firebase-sap-thi-cong'

// Gom hạng mục theo parentId + sắp xếp theo order — nền để dựng cây thu gọn/bung trong bảng
// (thay cho sortHierarchical phẳng cũ, vì giờ cần biết trực tiếp danh sách con của từng node).
function buildByParent(items: HangMuc[]): Map<string, HangMuc[]> {
  const byParent = new Map<string, HangMuc[]>()
  for (const item of items) {
    const key = item.parentId || ''
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key)!.push(item)
  }
  for (const list of byParent.values()) list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  return byParent
}

// Gom TOÀN BỘ id hạng mục con (đệ quy, không giới hạn số cấp) của 1 node gốc — để khi cộng dồn
// số liệu của 1 hạng mục CHA, số của các hạng mục CON bên dưới nó (dù dòng tiền được gắn ở cấp
// nào trong cây) cũng được tính vào.
function collectDescendantIds(rootId: string, all: HangMuc[]): Set<string> {
  const out = new Set<string>([rootId])
  let changed = true
  while (changed) {
    changed = false
    for (const h of all) {
      if (h.parentId && out.has(h.parentId) && !out.has(h.id)) {
        out.add(h.id)
        changed = true
      }
    }
  }
  return out
}

type RowData = {
  hangMuc: HangMuc
  thu: number
  chi: number
  chenhLech: number
  doiTacNames: string
}

export function TabHieuQua({ projectId }: { projectId: string }) {
  const [hangMucs, setHangMucs] = useState<HangMuc[]>([])
  const [dongTiens, setDongTiens] = useState<DongTienItem[]>([])
  const [doiTacs, setDoiTacs] = useState<DoiTac[]>([])
  // Mặc định KHÔNG có id nào trong set này => tất cả hạng mục cha tự đóng (thu gọn) con.
  // Bấm vào mũi tên để bung/đóng từng nhánh khi cần đối chiếu chi tiết.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => { const unsub = hangMucStore.subscribe(projectId, setHangMucs); return () => unsub() }, [projectId])
  useEffect(() => { const unsub = dongTienStore.subscribe(projectId, setDongTiens); return () => unsub() }, [projectId])
  // Giả định doiTacStore.subscribe(projectId, cb) — cùng chữ ký với hangMucStore/dongTienStore.
  // Nếu Đối tác trong dự án này KHÔNG theo projectId (dùng chung toàn hệ thống), sửa dòng dưới
  // thành doiTacStore.subscribe(setDoiTacs) hoặc theo đúng chữ ký thực tế trong firebase-sap-thi-cong.ts.
  useEffect(() => { const unsub = doiTacStore.subscribe(projectId, setDoiTacs); return () => unsub() }, [projectId])

  const byParent = useMemo(() => buildByParent(hangMucs), [hangMucs])
  const doiTacNameById = useMemo(() => new Map(doiTacs.map(d => [d.id, d.name])), [doiTacs])

  const rowsById = useMemo(() => {
    const map = new Map<string, RowData>()
    for (const h of hangMucs) {
      const ids = collectDescendantIds(h.id, hangMucs)
      const items = dongTiens.filter(d => d.hangMucId && ids.has(d.hangMucId))
      const thu = items.filter(d => d.type === 'thu').reduce((s, d) => s + d.amount, 0)
      const chi = items.filter(d => d.type === 'chi').reduce((s, d) => s + d.amount, 0)
      // Nhà thầu / NCC liên quan tới hạng mục này (kể cả hạng mục con bên dưới) — lấy theo
      // Đối tác gắn trên các dòng tiền chi thuộc hạng mục, để đối chiếu ai chi cho khoản nào.
      const doiTacIds = new Set(
        items.filter(d => d.type === 'chi' && d.doiTacId).map(d => d.doiTacId as string)
      )
      const doiTacNames = Array.from(doiTacIds).map(id => doiTacNameById.get(id) ?? id).sort().join(', ')
      map.set(h.id, { hangMuc: h, thu, chi, chenhLech: thu - chi, doiTacNames })
    }
    return map
  }, [hangMucs, dongTiens, doiTacNameById])

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const expandAll = () => setExpanded(new Set(hangMucs.filter(h => byParent.get(h.id)?.length).map(h => h.id)))
  const collapseAll = () => setExpanded(new Set())

  function renderRows(parentKey: string, depth: number): ReactElement[] {
    const kids = byParent.get(parentKey) ?? []
    const out: ReactElement[] = []
    for (const h of kids) {
      const r = rowsById.get(h.id)
      if (!r) continue
      const childList = byParent.get(h.id) ?? []
      const hasChildren = childList.length > 0
      const isOpen = expanded.has(h.id)
      out.push(
        <tr key={h.id}>
          <td>
            <span style={{ display: 'inline-flex', alignItems: 'center', paddingLeft: depth * 16 }}>
              {hasChildren ? (
                <button
                  onClick={() => toggle(h.id)}
                  aria-label={isOpen ? 'Thu gọn hạng mục con' : 'Bung hạng mục con'}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', marginRight: 4, fontSize: 11, color: 'var(--muted)', padding: 0, width: 14 }}
                >
                  {isOpen ? '▾' : '▸'}
                </button>
              ) : depth > 0 ? (
                <span style={{ color: 'var(--muted)', marginRight: 4 }}>↳</span>
              ) : (
                <span style={{ display: 'inline-block', width: 14 }} />
              )}
              <span style={depth === 0 ? { fontWeight: 700 } : undefined}>{h.name}</span>
              {hasChildren && !isOpen && (
                <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--muted)' }}>({childList.length} hạng mục con)</span>
              )}
            </span>
          </td>
          <td className="num">{h.progressPct}%</td>
          <td style={{ fontSize: 12.5 }}>{r.doiTacNames || <span style={{ color: 'var(--muted)' }}>—</span>}</td>
          <td className="num" style={{ color: 'var(--green)' }}>{fmt(r.thu)}</td>
          <td className="num" style={{ color: '#DC2626' }}>{fmt(r.chi)}</td>
          <td className="num" style={{ fontWeight: 700, color: r.chenhLech < 0 ? '#DC2626' : 'var(--green)' }}>{fmt(r.chenhLech)}</td>
        </tr>
      )
      if (hasChildren && isOpen) out.push(...renderRows(h.id, depth + 1))
    }
    return out
  }

  const bodyRows = renderRows('', 0)

  // Dòng tiền chưa gắn hạng mục nào — gom riêng để người dùng biết còn bao nhiêu chưa phân loại.
  const unlinked = dongTiens.filter(d => !d.hangMucId)
  const unlinkedThu = unlinked.filter(d => d.type === 'thu').reduce((s, d) => s + d.amount, 0)
  const unlinkedChi = unlinked.filter(d => d.type === 'chi').reduce((s, d) => s + d.amount, 0)

  const grandThu = dongTiens.filter(d => d.type === 'thu').reduce((s, d) => s + d.amount, 0)
  const grandChi = dongTiens.filter(d => d.type === 'chi').reduce((s, d) => s + d.amount, 0)
  const linkedCount = dongTiens.filter(d => d.hangMucId).length
  const linkedPct = dongTiens.length ? Math.round(linkedCount / dongTiens.length * 100) : 0

  return (
    <>
      <div className="stc-kpi-row">
        <div className="stc-kpi green"><div className="stc-kpi-label">Tổng thu</div><div className="stc-kpi-val">{fmt(grandThu)} đ</div></div>
        <div className="stc-kpi red"><div className="stc-kpi-label">Tổng chi</div><div className="stc-kpi-val">{fmt(grandChi)} đ</div></div>
        <div className="stc-kpi gold"><div className="stc-kpi-label">Chênh lệch</div><div className="stc-kpi-val">{fmt(grandThu - grandChi)} đ</div></div>
        <div className="stc-kpi"><div className="stc-kpi-label">Dòng tiền đã gắn hạng mục</div><div className="stc-kpi-val">{linkedPct}%</div></div>
      </div>

      <div className="stc-panel">
        <div className="stc-panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="stc-panel-title">Thu / Chi theo hạng mục thi công</span>
          <span style={{ display: 'flex', gap: 8 }}>
            <button onClick={expandAll} style={{ fontSize: 12, background: 'none', border: '1px solid var(--border, #ddd)', borderRadius: 4, padding: '3px 8px', cursor: 'pointer' }}>Bung tất cả</button>
            <button onClick={collapseAll} style={{ fontSize: 12, background: 'none', border: '1px solid var(--border, #ddd)', borderRadius: 4, padding: '3px 8px', cursor: 'pointer' }}>Thu gọn tất cả</button>
          </span>
        </div>
        <div className="stc-panel-body" style={{ padding: 0 }}>
          <table className="stc-table">
            <thead>
              <tr><th>Hạng mục</th><th>% hoàn thành</th><th>Nhà thầu / NCC</th><th>Tổng thu (đ)</th><th>Tổng chi (đ)</th><th>Chênh lệch (đ)</th></tr>
            </thead>
            <tbody>
              {!bodyRows.length && <tr className="stc-empty-row"><td colSpan={6}>Chưa có hạng mục nào. Vào tab &quot;Gói thầu / Tiến độ&quot; để thêm hạng mục trước.</td></tr>}
              {bodyRows}
              {(unlinkedThu > 0 || unlinkedChi > 0) && (
                <tr>
                  <td style={{ fontStyle: 'italic', color: 'var(--muted)' }}>— Chưa gắn hạng mục —</td>
                  <td className="num">—</td>
                  <td>—</td>
                  <td className="num" style={{ color: 'var(--green)' }}>{fmt(unlinkedThu)}</td>
                  <td className="num" style={{ color: '#DC2626' }}>{fmt(unlinkedChi)}</td>
                  <td className="num">{fmt(unlinkedThu - unlinkedChi)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '0 16px 14px', fontSize: 11, color: 'var(--muted)' }}>
          Số của mỗi hạng mục CHA đã cộng dồn cả các hạng mục CON bên dưới nó (dù dòng tiền được gắn ở cấp cha hay cấp con). Hạng mục con mặc định thu gọn — bấm mũi tên ▸ đầu dòng (hoặc &quot;Bung tất cả&quot;) để xem chi tiết. Cột &quot;Nhà thầu / NCC&quot; liệt kê các đối tác có khoản chi gắn với hạng mục (và hạng mục con của nó). Dòng &quot;Chưa gắn hạng mục&quot; gom các khoản thu/chi chưa được chọn hạng mục.
        </div>
      </div>
    </>
  )
}
