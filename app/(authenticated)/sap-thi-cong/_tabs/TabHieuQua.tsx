'use client'
import { useState, useEffect } from 'react'
import { HangMuc, DongTienItem, fmt } from '../_lib/types'
import { hangMucStore, dongTienStore } from '@/lib/firebase-sap-thi-cong'

// Sắp xếp cây cha-con để hiện thụt lề trong bảng — cùng cách làm với các tab khác
// (TabTienDo.tsx / TabNhaThau.tsx / TabVatTu.tsx / TabDongTien.tsx).
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

// Gom TOÀN BỘ id hạng mục con (đệ quy, không giới hạn số cấp) của 1 node gốc — để khi cộng dồn
// số liệu của 1 hạng mục CHA, số của các hạng mục CON bên dưới nó (dù dòng tiền được gắn ở cấp
// nào trong cây) cũng được tính vào, đúng như câu hỏi "hạng mục con có tính vào hạng mục cha khi
// đối chiếu hiệu quả không" — có, nhờ hàm này duyệt hết cây thay vì chỉ so đúng 1 id.
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

export function TabHieuQua({ projectId }: { projectId: string }) {
  const [hangMucs, setHangMucs] = useState<HangMuc[]>([])
  const [dongTiens, setDongTiens] = useState<DongTienItem[]>([])

  useEffect(() => { const unsub = hangMucStore.subscribe(projectId, setHangMucs); return () => unsub() }, [projectId])
  useEffect(() => { const unsub = dongTienStore.subscribe(projectId, setDongTiens); return () => unsub() }, [projectId])

  const sorted = sortHierarchical(hangMucs)

  const rows = sorted.map(h => {
    const ids = collectDescendantIds(h.id, hangMucs)
    const items = dongTiens.filter(d => d.hangMucId && ids.has(d.hangMucId))
    const thu = items.filter(d => d.type === 'thu').reduce((s, d) => s + d.amount, 0)
    const chi = items.filter(d => d.type === 'chi').reduce((s, d) => s + d.amount, 0)
    return { hangMuc: h, thu, chi, chenhLech: thu - chi }
  })

  // Dòng tiền chưa gắn hạng mục nào — gom riêng để người dùng biết còn bao nhiêu chưa phân loại,
  // tránh hiểu nhầm là bảng trên đã đủ 100% số liệu.
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
        <div className="stc-panel-head">
          <span className="stc-panel-title">Thu / Chi theo hạng mục thi công</span>
        </div>
        <div className="stc-panel-body" style={{ padding: 0 }}>
          <table className="stc-table">
            <thead>
              <tr><th>Hạng mục</th><th>% hoàn thành</th><th>Tổng thu (đ)</th><th>Tổng chi (đ)</th><th>Chênh lệch (đ)</th></tr>
            </thead>
            <tbody>
              {!rows.length && <tr className="stc-empty-row"><td colSpan={5}>Chưa có hạng mục nào. Vào tab &quot;Gói thầu / Tiến độ&quot; để thêm hạng mục trước.</td></tr>}
              {rows.map(r => (
                <tr key={r.hangMuc.id}>
                  <td>
                    {r.hangMuc.parentId ? <span style={{ paddingLeft: 16, color: 'var(--muted)' }}>↳ </span> : null}
                    <span style={!r.hangMuc.parentId ? { fontWeight: 700 } : undefined}>{r.hangMuc.name}</span>
                  </td>
                  <td className="num">{r.hangMuc.progressPct}%</td>
                  <td className="num" style={{ color: 'var(--green)' }}>{fmt(r.thu)}</td>
                  <td className="num" style={{ color: '#DC2626' }}>{fmt(r.chi)}</td>
                  <td className="num" style={{ fontWeight: 700, color: r.chenhLech < 0 ? '#DC2626' : 'var(--green)' }}>{fmt(r.chenhLech)}</td>
                </tr>
              ))}
              {(unlinkedThu > 0 || unlinkedChi > 0) && (
                <tr>
                  <td style={{ fontStyle: 'italic', color: 'var(--muted)' }}>— Chưa gắn hạng mục —</td>
                  <td className="num">—</td>
                  <td className="num" style={{ color: 'var(--green)' }}>{fmt(unlinkedThu)}</td>
                  <td className="num" style={{ color: '#DC2626' }}>{fmt(unlinkedChi)}</td>
                  <td className="num">{fmt(unlinkedThu - unlinkedChi)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '0 16px 14px', fontSize: 11, color: 'var(--muted)' }}>
          Số của mỗi hạng mục CHA đã cộng dồn cả các hạng mục CON bên dưới nó (dù dòng tiền được gắn ở cấp cha hay cấp con trong cây, đều được tính vào đây). Dòng &quot;Chưa gắn hạng mục&quot; gom các khoản thu/chi (kể cả tự động lẫn nhập tay) chưa được chọn hạng mục — vào tab Dòng tiền để gán nốt nếu muốn số liệu đầy đủ 100%.
        </div>
      </div>
    </>
  )
}
