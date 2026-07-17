'use client'
import { useState } from 'react'
import { NganSachThang, NganSachItem } from '@/lib/ngan-sach-types'
import { addItem, removeItem, updateItem } from '@/lib/ngan-sach-store'

const SECTION_COLORS: Record<string, string> = {
  A: '#ECFDF5', B: '#EFF6FF', C: '#FFF7ED', D: '#FEF3C7', E: '#F0FDF4',
}

interface Props {
  data: NganSachThang
  onChange: (d: NganSachThang) => void
  onSave: () => void
  saving: boolean
}

export function TabKeHoach({ data, onChange, onSave, saving }: Props) {
  const [editId, setEditId] = useState<string | null>(null)

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#1C3557' }}>Nhập kế hoạch & thực hiện</div>
          <div style={{ fontSize: 11.5, color: '#9CA3AF', marginTop: 2 }}>Nhập số tiền kế hoạch và thực hiện cho từng mục. Mục "Tồn quỹ" thực hiện được tự động lấy từ Firebase.</div>
        </div>
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

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr style={{ background: '#1C3557', color: '#fff' }}>
              <th style={TH(36)}>STT</th>
              <th style={{ ...TH(), textAlign: 'left', paddingLeft: 10 }}>Diễn giải</th>
              <th style={TH(80)}>KMCP</th>
              <th style={TH(150)}>Kế hoạch (₫)</th>
              <th style={TH(150)}>Thực hiện (₫)</th>
              <th style={{ ...TH(), textAlign: 'left', paddingLeft: 10 }}>Ghi chú</th>
              <th style={TH(60)}></th>
            </tr>
          </thead>
          <tbody>
            {data.items.map(it => {
              if (it.is_section) {
                const bg = SECTION_COLORS[it.nhom] ?? '#F9FAFB'
                return (
                  <tr key={it.id} style={{ background: bg }}>
                    <td style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 700, color: '#1C3557' }}>{it.stt}</td>
                    <td style={{ padding: '7px 10px', fontWeight: 700, color: '#1C3557', letterSpacing: '.02em' }} colSpan={5}>
                      {it.dien_giai}
                    </td>
                    <td style={{ padding: '7px 6px', textAlign: 'center' }}>
                      {it.nhom !== 'A' && it.nhom !== 'D' && (
                        <button
                          title="Thêm dòng"
                          onClick={() => onChange(addItem(data, it.id, it.nhom))}
                          style={BtnSmall('#EFF6FF', '#1C3557')}
                        >＋</button>
                      )}
                    </td>
                  </tr>
                )
              }

              const isAutoTonQuy = it.nhom === 'A' && !it.thuc_hien_manual
              return (
                <tr key={it.id} style={{ borderBottom: '1px solid #F3F4F6' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  <td style={{ padding: '5px 10px', textAlign: 'center' }}>
                    <input value={it.stt} onChange={e => upd(it.id, 'stt', e.target.value)}
                      style={{ width: 32, textAlign: 'center', border: '1px solid #E5E7EB', borderRadius: 4, padding: '2px 4px', fontSize: 12 }} />
                  </td>
                  <td style={{ padding: '5px 10px' }}>
                    <input value={it.dien_giai} onChange={e => upd(it.id, 'dien_giai', e.target.value)}
                      style={{ width: '100%', border: '1px solid #E5E7EB', borderRadius: 5, padding: '4px 6px', fontSize: 12.5, fontFamily: 'inherit' }} />
                  </td>
                  <td style={{ padding: '5px 6px' }}>
                    <input value={it.kmcp} onChange={e => upd(it.id, 'kmcp', e.target.value)}
                      style={{ width: '100%', textAlign: 'center', border: '1px solid #E5E7EB', borderRadius: 5, padding: '4px 4px', fontSize: 11.5, fontFamily: 'monospace' }} />
                  </td>
                  <td style={{ padding: '5px 6px' }}>{numInput(it.id, 'ke_hoach', it.ke_hoach)}</td>
                  <td style={{ padding: '5px 6px', position: 'relative' }}>
                    {isAutoTonQuy
                      ? <div style={{ textAlign: 'right', color: '#9CA3AF', fontSize: 11.5, padding: '4px 6px' }}>Tự động từ Quỹ</div>
                      : numInput(it.id, 'thuc_hien', it.thuc_hien)}
                  </td>
                  <td style={{ padding: '5px 6px' }}>
                    <input value={it.ghi_chu} onChange={e => upd(it.id, 'ghi_chu', e.target.value)}
                      style={{ width: '100%', border: '1px solid #E5E7EB', borderRadius: 5, padding: '4px 6px', fontSize: 12, fontFamily: 'inherit' }} />
                  </td>
                  <td style={{ padding: '5px 6px', textAlign: 'center' }}>
                    <button
                      title="Xóa dòng"
                      onClick={() => onChange(removeItem(data, it.id))}
                      style={BtnSmall('#FEE2E2', '#991B1B')}
                    >✕</button>
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
