'use client'
import { useState } from 'react'
import {
  BankRelation, BankProposal, BankContact,
  DANH_GIA_LABEL, TRANG_THAI_NH_LABEL, LOAI_VAY_LABEL, TRANG_THAI_PA_LABEL,
  EMPTY_BANK, EMPTY_PROPOSAL,
} from '@/lib/bank-types'

function fmtN(v: number): string { return v.toLocaleString('vi-VN') }
function newId(prefix: string): string { return `${prefix}${Date.now()}` }

interface Props {
  relations: BankRelation[]
  proposals: BankProposal[]
  onSaveRelation: (r: BankRelation) => Promise<void>
  onDeleteRelation: (id: string) => Promise<void>
  onSaveProposal: (p: BankProposal) => Promise<void>
  onDeleteProposal: (id: string) => Promise<void>
}

export function TabNganHang({ relations, proposals, onSaveRelation, onDeleteRelation, onSaveProposal, onDeleteProposal }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingBank, setEditingBank] = useState<BankRelation | 'new' | null>(null)
  const [editingProposal, setEditingProposal] = useState<{ bankId: string; proposal: BankProposal | 'new' } | null>(null)

  return (
    <>
      <div className="nh-card">
        <div className="nh-card-head">
          <span className="nh-card-title">Ngân hàng &amp; phương án vay</span>
          <button className="btn-primary" onClick={() => setEditingBank('new')}>+ Thêm ngân hàng</button>
        </div>
        <div className="nh-card-body">
          {editingBank && (
            <BankForm
              initial={editingBank === 'new' ? null : editingBank}
              onCancel={() => setEditingBank(null)}
              onSave={async r => { await onSaveRelation(r); setEditingBank(null) }}
            />
          )}

          {relations.length === 0 && !editingBank ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#9CA3AF', fontSize: 12.5 }}>Chưa có ngân hàng nào.</div>
          ) : (
            relations.map(r => {
              const rProposals = proposals.filter(p => p.nganHangId === r.id)
              const open = expandedId === r.id
              return (
                <div key={r.id} style={{ border: '1px solid #E5E0D8', borderRadius: 10, marginBottom: 10, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#FBFAF7', cursor: 'pointer', gap: 8, flexWrap: 'wrap' }}
                    onClick={() => setExpandedId(open ? null : r.id)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, color: '#1C3557' }}>{open ? '▾' : '▸'} {r.tenNganHang}</span>
                      {r.chiNhanh && <span style={{ fontSize: 11, color: '#6B7280' }}>{r.chiNhanh}</span>}
                      <span className={`nh-badge ${r.trangThai === 'dang_hop_tac' ? 'nh-b-green' : r.trangThai === 'tiem_nang' ? 'nh-b-blue' : 'nh-b-grey'}`}>{TRANG_THAI_NH_LABEL[r.trangThai]}</span>
                      <span className={`nh-badge ${r.danhGia === 'tot' ? 'nh-b-green' : r.danhGia === 'can_cai_thien' ? 'nh-b-red' : 'nh-b-amber'}`}>{DANH_GIA_LABEL[r.danhGia]}</span>
                      <span style={{ fontSize: 11, color: '#6B7280' }}>{rProposals.length} phương án</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                      <button className="btn-ghost" onClick={() => setEditingBank(r)}>Sửa</button>
                      <button className="btn-danger" onClick={() => { if (confirm(`Xoá ngân hàng "${r.tenNganHang}"? (${rProposals.length} phương án liên quan sẽ không bị xoá tự động)`)) onDeleteRelation(r.id) }}>Xoá</button>
                    </div>
                  </div>

                  {open && (
                    <div style={{ padding: 14, borderTop: '1px solid #E5E0D8' }}>
                      {r.nguoiLienHe.length > 0 && (
                        <div style={{ marginBottom: 12, fontSize: 12 }}>
                          <div className="nh-label">Người liên hệ</div>
                          {r.nguoiLienHe.map((c, i) => (
                            <div key={i} style={{ color: '#374151' }}>
                              {c.ten}{c.chucVu ? ` — ${c.chucVu}` : ''}{c.sdt ? ` · ${c.sdt}` : ''}{c.email ? ` · ${c.email}` : ''}
                            </div>
                          ))}
                        </div>
                      )}
                      {r.ghiChuChung && (
                        <div style={{ marginBottom: 12, fontSize: 12, color: '#374151', whiteSpace: 'pre-wrap' }}>
                          <div className="nh-label">Ghi chú chung</div>{r.ghiChuChung}
                        </div>
                      )}

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span className="nh-label" style={{ margin: 0 }}>Phương án vay</span>
                        <button className="btn-ghost" onClick={() => setEditingProposal({ bankId: r.id, proposal: 'new' })}>+ Thêm phương án</button>
                      </div>

                      {editingProposal?.bankId === r.id && (
                        <ProposalForm
                          initial={editingProposal.proposal === 'new' ? null : editingProposal.proposal}
                          onCancel={() => setEditingProposal(null)}
                          onSave={async p => { await onSaveProposal({ ...p, nganHangId: r.id }); setEditingProposal(null) }}
                        />
                      )}

                      {rProposals.length === 0 ? (
                        <div style={{ padding: 12, textAlign: 'center', color: '#9CA3AF', fontSize: 12 }}>Chưa có phương án nào.</div>
                      ) : (
                        <table className="nh-tbl">
                          <thead>
                            <tr>
                              <th>TÊN PHƯƠNG ÁN</th>
                              <th>LOẠI VAY</th>
                              <th className="r">LÃI SUẤT</th>
                              <th className="r">HẠN MỨC (đ)</th>
                              <th>TRẠNG THÁI</th>
                              <th style={{ width: 110 }}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {rProposals.map(p => (
                              <tr key={p.id}>
                                <td style={{ fontWeight: 600 }}>{p.tenPhuongAn}</td>
                                <td><span className={`nh-badge ${p.loaiVay === 'ngan_han' ? 'nh-b-blue' : p.loaiVay === 'bao_lanh' ? 'nh-b-amber' : 'nh-b-purple'}`}>{LOAI_VAY_LABEL[p.loaiVay]}</span></td>
                                <td className="r">{p.laiSuat ? p.laiSuat.toFixed(2) + '%' : '—'}</td>
                                <td className="r">{p.hanMucDeXuat ? fmtN(p.hanMucDeXuat) : '—'}</td>
                                <td style={{ fontSize: 11 }}>{TRANG_THAI_PA_LABEL[p.trangThai]}</td>
                                <td>
                                  <div style={{ display: 'flex', gap: 6 }}>
                                    <button className="btn-ghost" onClick={() => setEditingProposal({ bankId: r.id, proposal: p })}>Sửa</button>
                                    <button className="btn-danger" onClick={() => { if (confirm(`Xoá phương án "${p.tenPhuongAn}"?`)) onDeleteProposal(p.id) }}>×</button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </>
  )
}

// ── Form: Ngân hàng ─────────────────────────────────────────────────────────
function BankForm({ initial, onCancel, onSave }: { initial: BankRelation | null; onCancel: () => void; onSave: (r: BankRelation) => Promise<void> }) {
  const [form, setForm] = useState<Omit<BankRelation, 'id' | 'updatedAt'>>(initial ?? EMPTY_BANK)
  const [saving, setSaving] = useState(false)

  const setContact = (i: number, patch: Partial<BankContact>) => {
    const list = [...form.nguoiLienHe]
    list[i] = { ...list[i], ...patch }
    setForm({ ...form, nguoiLienHe: list })
  }

  return (
    <div style={{ border: '1px solid #D0DCE8', borderRadius: 10, padding: 14, marginBottom: 14, background: '#F8FAFC' }}>
      <div className="nh-form-grid">
        <div>
          <label className="nh-label">Tên ngân hàng *</label>
          <input className="nh-input" value={form.tenNganHang} onChange={e => setForm({ ...form, tenNganHang: e.target.value })} placeholder="VD: BIDV Hà Tĩnh" />
        </div>
        <div>
          <label className="nh-label">Chi nhánh</label>
          <input className="nh-input" value={form.chiNhanh} onChange={e => setForm({ ...form, chiNhanh: e.target.value })} />
        </div>
        <div>
          <label className="nh-label">Trạng thái</label>
          <select className="nh-select" value={form.trangThai} onChange={e => setForm({ ...form, trangThai: e.target.value as BankRelation['trangThai'] })}>
            {Object.entries(TRANG_THAI_NH_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="nh-label">Đánh giá</label>
          <select className="nh-select" value={form.danhGia} onChange={e => setForm({ ...form, danhGia: e.target.value as BankRelation['danhGia'] })}>
            {Object.entries(DANH_GIA_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="nh-label">Hạn mức hiện tại (đ)</label>
          <input className="nh-input" type="number" value={form.hanMucHienTai || ''} onChange={e => setForm({ ...form, hanMucHienTai: Number(e.target.value) })} />
        </div>
        <div>
          <label className="nh-label">Dư nợ hiện tại (đ)</label>
          <input className="nh-input" type="number" value={form.duNoHienTai || ''} onChange={e => setForm({ ...form, duNoHienTai: Number(e.target.value) })} />
        </div>
        <div>
          <label className="nh-label">Lãi suất bình quân (%/năm)</label>
          <input className="nh-input" type="number" step="0.01" value={form.laiSuatBinhQuan || ''} onChange={e => setForm({ ...form, laiSuatBinhQuan: Number(e.target.value) })} />
        </div>
      </div>

      <label className="nh-label">Người liên hệ</label>
      {form.nguoiLienHe.map((c, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr) auto', gap: 8, marginBottom: 6 }}>
          <input className="nh-input" placeholder="Tên" value={c.ten} onChange={e => setContact(i, { ten: e.target.value })} />
          <input className="nh-input" placeholder="Chức vụ" value={c.chucVu} onChange={e => setContact(i, { chucVu: e.target.value })} />
          <input className="nh-input" placeholder="SĐT" value={c.sdt} onChange={e => setContact(i, { sdt: e.target.value })} />
          <input className="nh-input" placeholder="Email" value={c.email} onChange={e => setContact(i, { email: e.target.value })} />
          <button className="btn-danger" onClick={() => setForm({ ...form, nguoiLienHe: form.nguoiLienHe.filter((_, j) => j !== i) })}>×</button>
        </div>
      ))}
      <button className="btn-ghost" style={{ marginBottom: 10 }} onClick={() => setForm({ ...form, nguoiLienHe: [...form.nguoiLienHe, { ten: '', chucVu: '', sdt: '', email: '' }] })}>+ Thêm người liên hệ</button>

      <div style={{ marginBottom: 10 }}>
        <label className="nh-label">Ghi chú chung</label>
        <textarea className="nh-textarea" rows={2} value={form.ghiChuChung} onChange={e => setForm({ ...form, ghiChuChung: e.target.value })} />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn-primary" disabled={!form.tenNganHang.trim() || saving}
          onClick={async () => { setSaving(true); await onSave({ ...form, id: initial?.id ?? newId('nh'), updatedAt: '' }); setSaving(false) }}>
          {saving ? 'Đang lưu...' : 'Lưu'}
        </button>
        <button className="btn-ghost" onClick={onCancel}>Huỷ</button>
      </div>
    </div>
  )
}

// ── Form: Phương án vay ──────────────────────────────────────────────────────
function ProposalForm({ initial, onCancel, onSave }: { initial: BankProposal | null; onCancel: () => void; onSave: (p: Omit<BankProposal, 'nganHangId'>) => Promise<void> }) {
  const [form, setForm] = useState<Omit<BankProposal, 'id' | 'nganHangId' | 'ngayCapNhat'>>(initial ?? EMPTY_PROPOSAL)
  const [uuDiemStr, setUuDiemStr] = useState((initial?.uuDiem ?? []).join('\n'))
  const [nhuocDiemStr, setNhuocDiemStr] = useState((initial?.nhuocDiem ?? []).join('\n'))
  const [saving, setSaving] = useState(false)

  return (
    <div style={{ border: '1px solid #D0DCE8', borderRadius: 10, padding: 14, marginBottom: 14, background: '#F8FAFC' }}>
      <div className="nh-form-grid">
        <div>
          <label className="nh-label">Tên phương án *</label>
          <input className="nh-input" value={form.tenPhuongAn} onChange={e => setForm({ ...form, tenPhuongAn: e.target.value })} placeholder="VD: Vay bổ sung vốn lưu động 50 tỷ" />
        </div>
        <div>
          <label className="nh-label">Loại vay</label>
          <select className="nh-select" value={form.loaiVay} onChange={e => setForm({ ...form, loaiVay: e.target.value as BankProposal['loaiVay'] })}>
            {Object.entries(LOAI_VAY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="nh-label">Trạng thái</label>
          <select className="nh-select" value={form.trangThai} onChange={e => setForm({ ...form, trangThai: e.target.value as BankProposal['trangThai'] })}>
            {Object.entries(TRANG_THAI_PA_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="nh-label">Lãi suất (%/năm)</label>
          <input className="nh-input" type="number" step="0.01" value={form.laiSuat || ''} onChange={e => setForm({ ...form, laiSuat: Number(e.target.value) })} />
        </div>
        <div>
          <label className="nh-label">Hạn mức đề xuất (đ)</label>
          <input className="nh-input" type="number" value={form.hanMucDeXuat || ''} onChange={e => setForm({ ...form, hanMucDeXuat: Number(e.target.value) })} />
        </div>
        <div>
          <label className="nh-label">Tỷ lệ TSĐB (%)</label>
          <input className="nh-input" type="number" step="0.01" value={form.tyLeTSDB || ''} onChange={e => setForm({ ...form, tyLeTSDB: Number(e.target.value) })} />
        </div>
        <div>
          <label className="nh-label">Thời hạn</label>
          <input className="nh-input" value={form.thoiHan} onChange={e => setForm({ ...form, thoiHan: e.target.value })} placeholder="VD: 12 tháng" />
        </div>
        <div>
          <label className="nh-label">Phí dịch vụ</label>
          <input className="nh-input" value={form.phiDichVu} onChange={e => setForm({ ...form, phiDichVu: e.target.value })} />
        </div>
        <div>
          <label className="nh-label">Người phụ trách</label>
          <input className="nh-input" value={form.nguoiPhuTrach} onChange={e => setForm({ ...form, nguoiPhuTrach: e.target.value })} />
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <label className="nh-label">Điều kiện kèm theo</label>
        <textarea className="nh-textarea" rows={2} value={form.dieuKien} onChange={e => setForm({ ...form, dieuKien: e.target.value })} />
      </div>
      <div className="nh-form-grid">
        <div>
          <label className="nh-label">Ưu điểm (mỗi dòng 1 ý)</label>
          <textarea className="nh-textarea" rows={3} value={uuDiemStr} onChange={e => setUuDiemStr(e.target.value)} />
        </div>
        <div>
          <label className="nh-label">Nhược điểm (mỗi dòng 1 ý)</label>
          <textarea className="nh-textarea" rows={3} value={nhuocDiemStr} onChange={e => setNhuocDiemStr(e.target.value)} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn-primary" disabled={!form.tenPhuongAn.trim() || saving}
          onClick={async () => {
            setSaving(true)
            await onSave({
              ...form,
              id: initial?.id ?? newId('pa'),
              ngayCapNhat: initial?.ngayCapNhat ?? '',
              uuDiem: uuDiemStr.split('\n').map(s => s.trim()).filter(Boolean),
              nhuocDiem: nhuocDiemStr.split('\n').map(s => s.trim()).filter(Boolean),
            })
            setSaving(false)
          }}>
          {saving ? 'Đang lưu...' : 'Lưu'}
        </button>
        <button className="btn-ghost" onClick={onCancel}>Huỷ</button>
      </div>
    </div>
  )
}
