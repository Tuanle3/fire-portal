'use client'
import { useMemo, useState } from 'react'
import { BankRelation, BankNote, TRANG_THAI_GC_LABEL, EMPTY_NOTE } from '@/lib/bank-types'

function newId(prefix: string): string { return `${prefix}${Date.now()}` }

function trangThaiCls(t: BankNote['trangThai']): string {
  if (t === 'hoan_tat') return 'nh-b-green'
  if (t === 'dang_xu_ly') return 'nh-b-blue'
  return 'nh-b-amber'
}

interface Props {
  relations: BankRelation[]
  notes: BankNote[]
  onSaveNote: (n: BankNote) => Promise<void>
  onDeleteNote: (id: string) => Promise<void>
}

export function TabNhatKy({ relations, notes, onSaveNote, onDeleteNote }: Props) {
  const [filterBank, setFilterBank] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [editing, setEditing] = useState<BankNote | 'new' | null>(null)

  const bankName = (id: string) => relations.find(r => r.id === id)?.tenNganHang ?? '—'

  const filtered = useMemo(() => {
    return notes
      .filter(n => filterBank === 'all' || n.nganHangId === filterBank)
      .filter(n => filterStatus === 'all' || n.trangThai === filterStatus)
      .sort((a, b) => b.ngay.localeCompare(a.ngay))
  }, [notes, filterBank, filterStatus])

  return (
    <div className="nh-card">
      <div className="nh-card-head">
        <span className="nh-card-title">Nhật ký làm việc</span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select className="nh-select" value={filterBank} onChange={e => setFilterBank(e.target.value)}>
            <option value="all">Tất cả ngân hàng</option>
            {relations.map(r => <option key={r.id} value={r.id}>{r.tenNganHang}</option>)}
          </select>
          <select className="nh-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="all">Tất cả trạng thái</option>
            {Object.entries(TRANG_THAI_GC_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="btn-primary" disabled={relations.length === 0} onClick={() => setEditing('new')}>+ Thêm ghi chú</button>
        </div>
      </div>
      <div className="nh-card-body">
        {relations.length === 0 && (
          <div style={{ padding: 12, color: '#9CA3AF', fontSize: 12.5 }}>Cần thêm ít nhất 1 ngân hàng ở tab &quot;Ngân hàng &amp; Phương án&quot; trước khi ghi chú.</div>
        )}

        {editing && (
          <NoteForm
            initial={editing === 'new' ? null : editing}
            relations={relations}
            onCancel={() => setEditing(null)}
            onSave={async n => { await onSaveNote(n); setEditing(null) }}
          />
        )}

        {filtered.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#9CA3AF', fontSize: 12.5 }}>Không có ghi chú phù hợp.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(n => (
              <div key={n.id} style={{ border: '1px solid #E5E0D8', borderRadius: 10, padding: 12, display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: '#1C3557' }}>{bankName(n.nganHangId)}</span>
                    <span style={{ fontSize: 11, color: '#9CA3AF' }}>{n.ngay}</span>
                    {n.nguoiLienHe && <span style={{ fontSize: 11, color: '#9CA3AF' }}>· LH: {n.nguoiLienHe}</span>}
                    <span className={`nh-badge ${trangThaiCls(n.trangThai)}`}>{TRANG_THAI_GC_LABEL[n.trangThai]}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: '#374151', whiteSpace: 'pre-wrap' }}>{n.noiDung}</div>
                  {(n.viecCanLam || n.hanXuLy) && (
                    <div style={{ fontSize: 11.5, color: '#8A5A12', marginTop: 4 }}>
                      → {n.viecCanLam}{n.hanXuLy ? ` (hạn ${n.hanXuLy})` : ''}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, alignSelf: 'flex-start' }}>
                  <button className="btn-ghost" onClick={() => setEditing(n)}>Sửa</button>
                  <button className="btn-danger" onClick={() => { if (confirm('Xoá ghi chú này?')) onDeleteNote(n.id) }}>Xoá</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function NoteForm({ initial, relations, onCancel, onSave }: {
  initial: BankNote | null
  relations: BankRelation[]
  onCancel: () => void
  onSave: (n: BankNote) => Promise<void>
}) {
  const [form, setForm] = useState<Omit<BankNote, 'id'>>(
    initial ?? { ...EMPTY_NOTE, nganHangId: relations[0]?.id ?? '' }
  )
  const [saving, setSaving] = useState(false)

  return (
    <div style={{ border: '1px solid #D0DCE8', borderRadius: 10, padding: 14, marginBottom: 14, background: '#F8FAFC' }}>
      <div className="nh-form-grid">
        <div>
          <label className="nh-label">Ngân hàng *</label>
          <select className="nh-select" value={form.nganHangId} onChange={e => setForm({ ...form, nganHangId: e.target.value })}>
            {relations.map(r => <option key={r.id} value={r.id}>{r.tenNganHang}</option>)}
          </select>
        </div>
        <div>
          <label className="nh-label">Ngày</label>
          <input className="nh-input" type="date" value={form.ngay} onChange={e => setForm({ ...form, ngay: e.target.value })} />
        </div>
        <div>
          <label className="nh-label">Người liên hệ</label>
          <input className="nh-input" value={form.nguoiLienHe} onChange={e => setForm({ ...form, nguoiLienHe: e.target.value })} />
        </div>
        <div>
          <label className="nh-label">Trạng thái</label>
          <select className="nh-select" value={form.trangThai} onChange={e => setForm({ ...form, trangThai: e.target.value as BankNote['trangThai'] })}>
            {Object.entries(TRANG_THAI_GC_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="nh-label">Hạn xử lý</label>
          <input className="nh-input" type="date" value={form.hanXuLy} onChange={e => setForm({ ...form, hanXuLy: e.target.value })} />
        </div>
        <div>
          <label className="nh-label">Người phụ trách</label>
          <input className="nh-input" value={form.nguoiPhuTrach} onChange={e => setForm({ ...form, nguoiPhuTrach: e.target.value })} />
        </div>
      </div>
      <div style={{ marginBottom: 8 }}>
        <label className="nh-label">Nội dung trao đổi (mỗi dòng 1 ý — sẽ tách dòng riêng khi xuất Word)</label>
        <textarea className="nh-textarea" rows={5} value={form.noiDung} onChange={e => setForm({ ...form, noiDung: e.target.value })}
          placeholder={'VD:\n1. Đang thẩm định năng lực tài chính\n2. Yêu cầu giải trình công nợ phải thu/phải trả\n3. Phí tạm ứng thẩm định: 1.650.000 đồng'} />
      </div>
      <div style={{ marginBottom: 10 }}>
        <label className="nh-label">Việc cần làm tiếp theo</label>
        <input className="nh-input" value={form.viecCanLam} onChange={e => setForm({ ...form, viecCanLam: e.target.value })} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn-primary" disabled={!form.nganHangId || !form.noiDung.trim() || saving}
          onClick={async () => { setSaving(true); await onSave({ ...form, id: initial?.id ?? newId('gc') }); setSaving(false) }}>
          {saving ? 'Đang lưu...' : 'Lưu'}
        </button>
        <button className="btn-ghost" onClick={onCancel}>Huỷ</button>
      </div>
    </div>
  )
}
