'use client'
import { NganSachThang, GiaiPhap } from '@/lib/ngan-sach-types'
import { addGiaiPhap, removeGiaiPhap, updateGiaiPhap } from '@/lib/ngan-sach-store'

const fmt = (n: number) => n === 0 ? '' : n.toLocaleString('vi-VN')

interface Props {
  data: NganSachThang
  onChange: (d: NganSachThang) => void
  onSave: () => void
  saving: boolean
}

export function TabGiaiPhap({ data, onChange, onSave, saving }: Props) {
  const upd = (id: string, patch: Partial<GiaiPhap>) =>
    onChange(updateGiaiPhap(data, id, patch))

  const totalKH = data.giai_phap.filter(g => g.trang_thai !== 'no').reduce((s, g) => s + g.so_tien_ke_hoach, 0)
  const totalTH = data.giai_phap.filter(g => g.trang_thai !== 'no').reduce((s, g) => s + g.so_tien_thuc_hien, 0)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#1C3557' }}>Giải pháp cân đối dòng tiền</div>
          <div style={{ fontSize: 11.5, color: '#6B7280', marginTop: 2 }}>
            Nhập các nguồn tiền bổ sung khi thiếu hụt. Trạng thái Yes = đã xác nhận, No = bỏ qua, ? = đang xem xét.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => onChange(addGiaiPhap(data))}
            style={{ padding: '7px 16px', background: '#EFF6FF', color: '#1C3557', border: '1px solid #BFDBFE', borderRadius: 7, fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}
          >＋ Thêm giải pháp</button>
          <button
            onClick={onSave}
            disabled={saving}
            style={{ padding: '7px 18px', background: saving ? '#9CA3AF' : '#1C3557', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer' }}
          >{saving ? 'Đang lưu…' : '💾 Lưu'}</button>
        </div>
      </div>

      {/* Summary */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Tổng kế hoạch', val: totalKH, color: '#1C3557' },
          { label: 'Đã thực hiện', val: totalTH, color: '#166534' },
          { label: 'Còn lại', val: totalKH - totalTH, color: totalKH - totalTH > 0 ? '#D97706' : '#166534' },
        ].map(c => (
          <div key={c.label} style={{ flex: 1, background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, padding: '10px 14px' }}>
            <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 3 }}>{c.label}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: c.color }}>{c.val.toLocaleString('vi-VN')} ₫</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {data.giai_phap.map((gp, idx) => (
          <div key={gp.id} style={{
            border: '1px solid',
            borderColor: gp.trang_thai === 'yes' ? '#86EFAC' : gp.trang_thai === 'no' ? '#FCA5A5' : '#FCD34D',
            borderRadius: 10,
            background: gp.trang_thai === 'yes' ? '#F0FDF4' : gp.trang_thai === 'no' ? '#FFF1F2' : '#FFFBEB',
            padding: '12px 14px',
          }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              {/* Status toggle */}
              <div style={{ display: 'flex', gap: 4, paddingTop: 2 }}>
                {(['yes', 'no', 'pending'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => upd(gp.id, { trang_thai: s })}
                    style={{
                      padding: '3px 8px', fontSize: 11, fontWeight: 700, borderRadius: 4, cursor: 'pointer',
                      border: '1px solid',
                      borderColor: gp.trang_thai === s ? (s === 'yes' ? '#166534' : s === 'no' ? '#991B1B' : '#854D0E') : '#D1D5DB',
                      background: gp.trang_thai === s ? (s === 'yes' ? '#166534' : s === 'no' ? '#991B1B' : '#854D0E') : '#fff',
                      color: gp.trang_thai === s ? '#fff' : '#6B7280',
                    }}
                  >{s === 'yes' ? 'Yes' : s === 'no' ? 'No' : '?'}</button>
                ))}
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Description */}
                <textarea
                  rows={2}
                  value={gp.mo_ta}
                  onChange={e => upd(gp.id, { mo_ta: e.target.value })}
                  placeholder="Mô tả giải pháp…"
                  style={{ width: '100%', border: '1px solid #E5E7EB', borderRadius: 6, padding: '6px 8px', fontSize: 12.5, fontFamily: 'inherit', resize: 'vertical' }}
                />
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 3 }}>Số tiền kế hoạch (₫)</div>
                    <input
                      type="text"
                      value={fmt(gp.so_tien_ke_hoach)}
                      placeholder="0"
                      onChange={e => {
                        const raw = e.target.value.replace(/[^0-9]/g, '')
                        upd(gp.id, { so_tien_ke_hoach: raw ? parseInt(raw) : 0 })
                      }}
                      style={{ width: '100%', textAlign: 'right', border: '1px solid #D1D5DB', borderRadius: 6, padding: '5px 8px', fontSize: 13, fontFamily: 'inherit' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 3 }}>Đã thực hiện (₫)</div>
                    <input
                      type="text"
                      value={fmt(gp.so_tien_thuc_hien)}
                      placeholder="0"
                      onChange={e => {
                        const raw = e.target.value.replace(/[^0-9]/g, '')
                        upd(gp.id, { so_tien_thuc_hien: raw ? parseInt(raw) : 0 })
                      }}
                      style={{ width: '100%', textAlign: 'right', border: '1px solid #D1D5DB', borderRadius: 6, padding: '5px 8px', fontSize: 13, fontFamily: 'inherit' }}
                    />
                  </div>
                  <div style={{ flex: 2 }}>
                    <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 3 }}>Ghi chú / tiến độ</div>
                    <textarea
                      rows={2}
                      value={gp.ghi_chu}
                      onChange={e => upd(gp.id, { ghi_chu: e.target.value })}
                      placeholder="VD: Lần 3 (01/04 – 31/05): 1,025,000,000 đồng…"
                      style={{ width: '100%', border: '1px solid #D1D5DB', borderRadius: 6, padding: '5px 8px', fontSize: 12, fontFamily: 'inherit', resize: 'vertical' }}
                    />
                  </div>
                </div>
              </div>

              <button
                onClick={() => onChange(removeGiaiPhap(data, gp.id))}
                title="Xóa giải pháp"
                style={{ width: 24, height: 24, background: '#FEE2E2', color: '#991B1B', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 13, fontWeight: 700, flexShrink: 0 }}
              >✕</button>
            </div>
          </div>
        ))}
      </div>

      {data.giai_phap.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9CA3AF', fontSize: 13 }}>
          Chưa có giải pháp nào.{' '}
          <button onClick={() => onChange(addGiaiPhap(data))} style={{ color: '#1C3557', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>
            Thêm giải pháp đầu tiên →
          </button>
        </div>
      )}
    </div>
  )
}
