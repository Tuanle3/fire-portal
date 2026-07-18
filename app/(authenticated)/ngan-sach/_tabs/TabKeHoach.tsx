'use client'
import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { NganSachThang, NganSachItem, GiaiPhap } from '@/lib/ngan-sach-types'
import { addItem, removeItem, updateItem, addGroup, addChildItem, removeGroup, makeDefault } from '@/lib/ngan-sach-store'

function parseExcel(file: File): Promise<{ items: NganSachItem[]; giai_phap: GiaiPhap[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })

        // ── Sheet "Kế hoạch" ──
        const ws1 = wb.Sheets['Kế hoạch'] ?? wb.Sheets[wb.SheetNames[0]]
        const rows: unknown[][] = XLSX.utils.sheet_to_json(ws1, { header: 1, defval: '' })
        // Row 0 = title, Row 1 = header, Row 2+ = data
        const template = makeDefault('__parse__')
        const templateItems = template.items
        const items: NganSachItem[] = []

        // Build a lookup: stt → template item, so we preserve is_section / nhom / id
        const bySTT = new Map<string, NganSachItem>()
        for (const it of templateItems) bySTT.set(String(it.stt).trim(), it)

        let templateIdx = 0
        for (let r = 2; r < rows.length; r++) {
          const row = rows[r] as unknown[]
          const stt        = String(row[0] ?? '').trim()
          const dien_giai  = String(row[1] ?? '').trim()
          const kmcp       = String(row[2] ?? '').trim()
          const ke_hoach   = Math.abs(Number(String(row[3]).replace(/[^0-9.-]/g, '')) || 0)
          const thuc_hien  = Math.abs(Number(String(row[4]).replace(/[^0-9.-]/g, '')) || 0)
          const ghi_chu    = String(row[5] ?? '').trim()

          if (!stt && !dien_giai) continue  // blank row

          // Match to template by stt or sequential
          const tmpl = bySTT.get(stt) ?? templateItems[templateIdx]
          templateIdx++

          items.push({
            id:               tmpl?.id ?? Math.random().toString(36).slice(2),
            nhom:             tmpl?.nhom ?? 'C',
            is_section:       tmpl?.is_section ?? false,
            stt,
            dien_giai:        dien_giai || (tmpl?.dien_giai ?? ''),
            kmcp:             kmcp || (tmpl?.kmcp ?? ''),
            ke_hoach,
            thuc_hien,
            thuc_hien_manual: tmpl ? !tmpl.is_section && tmpl.nhom !== 'A' : true,
            ghi_chu,
          })
        }

        // ── Sheet "Giải pháp" ──
        const ws2 = wb.Sheets['Giải pháp'] ?? wb.Sheets[wb.SheetNames[1]]
        const giai_phap: GiaiPhap[] = []
        if (ws2) {
          const gpRows: unknown[][] = XLSX.utils.sheet_to_json(ws2, { header: 1, defval: '' })
          for (let r = 2; r < gpRows.length; r++) {
            const row = gpRows[r] as unknown[]
            const raw_tt   = String(row[0] ?? '').trim().toLowerCase()
            const mo_ta    = String(row[1] ?? '').trim()
            const so_kh    = Math.abs(Number(String(row[2]).replace(/[^0-9.-]/g, '')) || 0)
            const so_th    = Math.abs(Number(String(row[3]).replace(/[^0-9.-]/g, '')) || 0)
            const ghi_chu  = String(row[4] ?? '').trim()
            if (!mo_ta && so_kh === 0) continue
            const trang_thai: GiaiPhap['trang_thai'] =
              raw_tt === 'yes' ? 'yes' : raw_tt === 'no' ? 'no' : 'pending'
            giai_phap.push({
              id: Math.random().toString(36).slice(2),
              mo_ta, so_tien_ke_hoach: so_kh,
              so_tien_thuc_hien: so_th, trang_thai, ghi_chu,
            })
          }
        }

        resolve({ items: items.length ? items : templateItems, giai_phap })
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error('Không đọc được file'))
    reader.readAsArrayBuffer(file)
  })
}

const SECTION_COLORS: Record<string, string> = {
  A: '#ECFDF5', B: '#EFF6FF', C: '#FFF7ED', D: '#FEF3C7', E: '#F0FDF4',
}

interface Props {
  data: NganSachThang
  onChange: (d: NganSachThang) => void
  onSave: () => void
  saving: boolean
  kmcpActual: Record<string, number>
  tonQuySoDu: number
}

export function TabKeHoach({ data, onChange, onSave, saving, kmcpActual, tonQuySoDu }: Props) {
  const [editId, setEditId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(data.items.filter(it => it.is_group).map(it => it.id))
  )
  const toggleCollapse = (id: string) =>
    setCollapsed(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportMsg('')
    try {
      const { items, giai_phap } = await parseExcel(file)
      onChange({ ...data, items, giai_phap })
      setImportMsg(`✓ Đã import ${items.length} dòng${giai_phap.length ? ` + ${giai_phap.length} giải pháp` : ''}. Nhớ nhấn Lưu.`)
    } catch (err: unknown) {
      setImportMsg('Lỗi: ' + (err instanceof Error ? err.message : 'Không đọc được file'))
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // Sum ke_hoach / thuc_hien of all direct children of a group
  const groupSum = (groupId: string) => {
    let kh = 0, th = 0
    for (const it of data.items) {
      if (it.parent_id === groupId) {
        kh += it.ke_hoach
        // use auto value if available
        const autoVal = it.kmcp ? kmcpActual[it.kmcp] : undefined
        th += autoVal !== undefined ? autoVal : it.thuc_hien
      }
    }
    return { kh, th }
  }

  const upd = (id: string, field: keyof NganSachItem, val: string | number | boolean) => {
    onChange(updateItem(data, id, { [field]: val }))
  }

  const numInput = (id: string, field: 'ke_hoach' | 'thuc_hien', val: number, readOnly = false) => (
    <input
      type="text"
      value={val === 0 ? '' : val.toLocaleString('vi-VN')}
      readOnly={readOnly}
      placeholder="0"
      onChange={e => {
        const raw = e.target.value.replace(/[^0-9-]/g, '')
        upd(id, field, raw === '' ? 0 : parseInt(raw, 10))
      }}
      style={{
        width: '100%', textAlign: 'right', border: readOnly ? 'none' : '1px solid #D1D5DB',
        borderRadius: 5, padding: '4px 6px', fontSize: 12.5, fontFamily: 'inherit',
        background: readOnly ? 'transparent' : '#fff', color: readOnly ? '#9CA3AF' : 'inherit',
      }}
    />
  )

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#1C3557' }}>Nhập kế hoạch & thực hiện</div>
          <div style={{ fontSize: 11.5, color: '#9CA3AF', marginTop: 2 }}>Nhập trực tiếp hoặc import từ file Excel theo mẫu. Mục "Tồn quỹ" thực hiện tự động từ Firebase.</div>
          {importMsg && (
            <div style={{ marginTop: 6, fontSize: 12, color: importMsg.startsWith('Lỗi') ? '#991B1B' : '#166534', fontWeight: 600 }}>
              {importMsg}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Download template */}
          <a
            href="/api/ngan-sach-template"
            download="mau-ngan-sach.xlsx"
            style={{
              padding: '8px 14px', background: '#F0FDF4', color: '#166534',
              border: '1px solid #86EFAC', borderRadius: 7, fontWeight: 600, fontSize: 12.5,
              textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            ⬇ Tải mẫu Excel
          </a>

          {/* Import button */}
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: 'none' }}
            onChange={handleImport}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            style={{
              padding: '8px 14px', background: importing ? '#F3F4F6' : '#EFF6FF', color: importing ? '#9CA3AF' : '#1D4ED8',
              border: '1px solid #BFDBFE', borderRadius: 7, fontWeight: 600, fontSize: 12.5, cursor: importing ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            {importing ? '⏳ Đang đọc…' : '📂 Import Excel'}
          </button>

          {/* Save */}
          <button
            onClick={onSave}
            disabled={saving}
            style={{
              padding: '8px 20px', background: saving ? '#9CA3AF' : '#1C3557', color: '#fff',
              border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Đang lưu…' : '💾 Lưu'}
          </button>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr style={{ background: '#1C3557', color: '#fff' }}>
              <th style={TH(44)}>STT</th>
              <th style={{ ...TH(), textAlign: 'left', paddingLeft: 10 }}>Diễn giải</th>
              <th style={TH(80)}>KMCP</th>
              <th style={TH(175)}>Kế hoạch (₫)</th>
              <th style={TH(175)}>Thực hiện (₫)</th>
              <th style={{ ...TH(), textAlign: 'left', paddingLeft: 10 }}>Ghi chú</th>
              <th style={TH(72)}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map(it => {
              // Hide child rows when parent group is collapsed
              if (it.parent_id && collapsed.has(it.parent_id)) return null
              // ── MAJOR SECTION ───────────────────────────────────────────────
              if (it.is_section) {
                const bg = SECTION_COLORS[it.nhom] ?? '#F9FAFB'
                // Tồn quỹ (nhóm A): lấy trực tiếp từ tonQuySoDu
                const isA = it.nhom === 'A'
                // Sum standalone items (no parent_id) + group subtotals for this nhom
                const standaloneKh = data.items
                  .filter(x => x.nhom === it.nhom && !x.is_section && !x.is_group && !x.parent_id)
                  .reduce((s, x) => s + x.ke_hoach, 0)
                const standaloneTh = data.items
                  .filter(x => x.nhom === it.nhom && !x.is_section && !x.is_group && !x.parent_id)
                  .reduce((s, x) => {
                    const auto = x.kmcp ? kmcpActual[x.kmcp] : undefined
                    return s + (auto !== undefined ? auto : x.thuc_hien)
                  }, 0)
                const groupsKh = data.items
                  .filter(x => x.nhom === it.nhom && x.is_group)
                  .reduce((s, g) => s + groupSum(g.id).kh, 0)
                const groupsTh = data.items
                  .filter(x => x.nhom === it.nhom && x.is_group)
                  .reduce((s, g) => s + groupSum(g.id).th, 0)
                const secKh = isA ? 0 : standaloneKh + groupsKh
                const secTh = isA ? tonQuySoDu : standaloneTh + groupsTh
                const fmt = (n: number) => n ? n.toLocaleString('vi-VN') : '—'
                return (
                  <tr key={it.id} style={{ background: bg }}>
                    <td style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 700, color: '#1C3557' }}>{it.stt}</td>
                    <td style={{ padding: '7px 10px', fontWeight: 700, color: '#1C3557', letterSpacing: '.02em' }} colSpan={2}>
                      {it.dien_giai}
                    </td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 700, color: '#1C3557', fontSize: 13 }}>
                      {isA ? '—' : fmt(secKh)}
                    </td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 700, color: '#166534', fontSize: 13 }}>
                      {fmt(secTh)}{isA && <span style={{ marginLeft: 4, fontSize: 9, fontWeight: 700, background: '#DCFCE7', color: '#166534', padding: '1px 4px', borderRadius: 3 }}>AUTO</span>}
                    </td>
                    <td />
                    <td style={{ padding: '7px 6px', textAlign: 'center' }}>
                      {(it.nhom === 'B' || it.nhom === 'C') && (
                        <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
                          <button title="Thêm nhóm con" onClick={() => onChange(addGroup(data, it.id, it.nhom))}
                            style={{ ...BtnSmall('#DBEAFE', '#1D4ED8'), fontSize: 10, width: 'auto', padding: '2px 6px' }}>＋Nhóm</button>
                          <button title="Thêm dòng" onClick={() => onChange(addItem(data, it.id, it.nhom))}
                            style={{ ...BtnSmall('#EFF6FF', '#1C3557'), fontSize: 10, width: 'auto', padding: '2px 6px' }}>＋Dòng</button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              }

              // ── SUB-GROUP HEADER ─────────────────────────────────────────────
              if (it.is_group) {
                const bg = it.nhom === 'B' ? '#DBEAFE' : it.nhom === 'C' ? '#FFEDD5' : '#F3F4F6'
                return (
                  <tr key={it.id} style={{ background: bg, fontWeight: 600 }}>
                    <td style={{ padding: '5px 6px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'center' }}>
                        <button title={collapsed.has(it.id) ? 'Mở rộng' : 'Thu gọn'} onClick={() => toggleCollapse(it.id)}
                          style={{ ...BtnSmall('#F3F4F6', '#374151'), fontSize: 13, fontFamily: 'monospace', flexShrink: 0 }}>
                          {collapsed.has(it.id) ? '＋' : '－'}
                        </button>
                        <input value={it.stt} onChange={e => upd(it.id, 'stt', e.target.value)}
                          style={{ width: 32, textAlign: 'center', border: '1px solid #BFDBFE', borderRadius: 4, padding: '2px 4px', fontSize: 12, background: 'transparent' }} />
                      </div>
                    </td>
                    <td style={{ padding: '5px 10px' }}>
                      <input value={it.dien_giai} onChange={e => upd(it.id, 'dien_giai', e.target.value)}
                        placeholder="Tên nhóm…"
                        style={{ width: '100%', border: '1px solid #BFDBFE', borderRadius: 5, padding: '4px 8px', fontSize: 12.5, fontFamily: 'inherit', fontWeight: 600, background: 'transparent' }} />
                    </td>
                    <td style={{ padding: '5px 6px' }}>
                      <input value={it.kmcp} onChange={e => upd(it.id, 'kmcp', e.target.value)}
                        placeholder="DT-..."
                        style={{ width: '100%', textAlign: 'center', border: '1px solid #BFDBFE', borderRadius: 5, padding: '4px 4px', fontSize: 11.5, fontFamily: 'monospace', background: 'transparent' }} />
                    </td>
                    {(() => {
                      const { kh, th } = groupSum(it.id)
                      const fmt = (n: number) => n ? n.toLocaleString('vi-VN') : '—'
                      return (
                        <>
                          <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700, color: '#1C3557', fontSize: 12.5 }}>
                            {fmt(kh)}
                          </td>
                          <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700, color: '#166534', fontSize: 12.5 }}>
                            {fmt(th)}
                          </td>
                        </>
                      )
                    })()}
                    <td style={{ padding: '5px 6px' }}>
                      <input value={it.ghi_chu} onChange={e => upd(it.id, 'ghi_chu', e.target.value)}
                        style={{ width: '100%', border: '1px solid #BFDBFE', borderRadius: 5, padding: '4px 6px', fontSize: 12, fontFamily: 'inherit', background: 'transparent' }} />
                    </td>
                    <td style={{ padding: '5px 6px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
                        <button title="Thêm dòng con" onClick={() => onChange(addChildItem(data, it.id))}
                          style={{ ...BtnSmall('#DCFCE7', '#166534'), fontSize: 14 }}>＋</button>
                        <button title="Xóa nhóm và tất cả dòng con" onClick={() => { if (confirm('Xóa nhóm và tất cả dòng con?')) onChange(removeGroup(data, it.id)) }}
                          style={BtnSmall('#FEE2E2', '#991B1B')}>✕</button>
                      </div>
                    </td>
                  </tr>
                )
              }

              // ── DETAIL ITEM ──────────────────────────────────────────────────
              const isAutoTonQuy = it.nhom === 'A' && !it.is_section
              const autoVal = it.kmcp ? kmcpActual[it.kmcp] : undefined
              const hasAuto = isAutoTonQuy || autoVal !== undefined
              const isChild = !!it.parent_id

              return (
                <tr key={it.id} style={{ borderBottom: '1px solid #F3F4F6', background: hasAuto ? '#FAFFF8' : undefined }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
                  onMouseLeave={e => (e.currentTarget.style.background = hasAuto ? '#FAFFF8' : '')}
                >
                  <td style={{ padding: '5px 6px', textAlign: 'center', paddingLeft: isChild ? 16 : 6 }}>
                    {isChild && <span style={{ color: '#D1D5DB', marginRight: 2 }}>└</span>}
                    <input value={it.stt} onChange={e => upd(it.id, 'stt', e.target.value)}
                      style={{ width: 28, textAlign: 'center', border: '1px solid #E5E7EB', borderRadius: 4, padding: '2px 3px', fontSize: 12 }} />
                  </td>
                  <td style={{ padding: '5px 10px', paddingLeft: isChild ? 24 : 10 }}>
                    <input value={it.dien_giai} onChange={e => upd(it.id, 'dien_giai', e.target.value)}
                      style={{ width: '100%', border: '1px solid #E5E7EB', borderRadius: 5, padding: '4px 6px', fontSize: 12.5, fontFamily: 'inherit' }} />
                  </td>
                  <td style={{ padding: '5px 6px' }}>
                    <input value={it.kmcp} onChange={e => upd(it.id, 'kmcp', e.target.value)}
                      style={{ width: '100%', textAlign: 'center', border: '1px solid #E5E7EB', borderRadius: 5, padding: '4px 4px', fontSize: 11.5, fontFamily: 'monospace' }} />
                  </td>
                  <td style={{ padding: '5px 6px' }}>{numInput(it.id, 'ke_hoach', it.ke_hoach)}</td>
                  <td style={{ padding: '5px 6px' }}>
                    {hasAuto ? (
                      <div style={{ textAlign: 'right', padding: '4px 6px' }}>
                        <span style={{ fontWeight: 600, color: '#166534', fontSize: 12.5 }}>
                          {(isAutoTonQuy ? 0 : autoVal ?? 0).toLocaleString('vi-VN')}
                        </span>
                        <span style={{ marginLeft: 5, fontSize: 9, fontWeight: 700, background: '#DCFCE7', color: '#166534', padding: '1px 4px', borderRadius: 3 }}>AUTO</span>
                        {isAutoTonQuy && <div style={{ fontSize: 10, color: '#9CA3AF' }}>Tồn quỹ TT</div>}
                      </div>
                    ) : numInput(it.id, 'thuc_hien', it.thuc_hien)}
                  </td>
                  <td style={{ padding: '5px 6px' }}>
                    <input value={it.ghi_chu} onChange={e => upd(it.id, 'ghi_chu', e.target.value)}
                      style={{ width: '100%', border: '1px solid #E5E7EB', borderRadius: 5, padding: '4px 6px', fontSize: 12, fontFamily: 'inherit' }} />
                  </td>
                  <td style={{ padding: '5px 6px', textAlign: 'center' }}>
                    <button title="Xóa dòng" onClick={() => onChange(removeItem(data, it.id))}
                      style={BtnSmall('#FEE2E2', '#991B1B')}>✕</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TH(w?: number): React.CSSProperties {
  return {
    padding: '8px 6px', textAlign: 'center', fontSize: 11.5,
    fontWeight: 600, whiteSpace: 'nowrap',
    ...(w ? { width: w, minWidth: w } : {}),
  }
}

function BtnSmall(bg: string, color: string): React.CSSProperties {
  return {
    width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: bg, color, border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13, fontWeight: 700,
  }
}
