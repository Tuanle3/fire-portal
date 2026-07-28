'use client'
import { useMemo, useState } from 'react'
import {
  BankRelation, BankProposal, BankNote, BankContact, CustomRow,
  DANH_GIA_LABEL, TRANG_THAI_NH_LABEL, LOAI_HINH_LABEL, LOAI_VAY_LABEL, TRANG_THAI_PA_LABEL, TRANG_THAI_GC_LABEL,
  EMPTY_BANK, EMPTY_PROPOSAL, EMPTY_NOTE, minLaiSuat, mucTaiTroDisplay, isHoSoDangXuLy,
} from '@/lib/bank-types'
import { exportHoSoVayVonWord } from '@/lib/bank-baocao-word'

function fmtN(v: number): string { return v.toLocaleString('vi-VN') }
function newId(prefix: string): string { return `${prefix}${Date.now()}` }

// Ô nhập số tiền — hiện dấu chấm phân cách hàng nghìn khi gõ (8.000.000.000) để dễ đọc,
// nhưng vẫn lưu/trả về number thuần cho state.
function MoneyInput({ value, onChange, placeholder }: { value: number; onChange: (n: number) => void; placeholder?: string }) {
  return (
    <input
      className="nh-input"
      type="text"
      inputMode="numeric"
      placeholder={placeholder}
      value={value ? fmtN(value) : ''}
      onChange={e => onChange(Number(e.target.value.replace(/\D/g, '')) || 0)}
    />
  )
}

function trangThaiCls(t: BankRelation['trangThai']): string {
  if (t === 'dang_hop_tac') return 'nh-b-green'
  if (t === 'tiem_nang') return 'nh-b-blue'
  return 'nh-b-grey'
}
function danhGiaCls(d: BankRelation['danhGia']): string {
  if (d === 'tot') return 'nh-b-green'
  if (d === 'can_cai_thien') return 'nh-b-red'
  return 'nh-b-amber'
}
function trangThaiGCCls(t: BankNote['trangThai']): string {
  if (t === 'hoan_tat') return 'nh-b-green'
  if (t === 'dang_xu_ly') return 'nh-b-blue'
  return 'nh-b-amber'
}

// Tiến trình xử lý hồ sơ theo đúng thứ tự thực tế — dùng để vẽ thanh tiến độ.
const STAGE_ORDER: BankProposal['trangThai'][] = ['soan_ho_so', 'da_nop', 'dang_tham_dinh', 'cho_phe_duyet', 'da_duyet', 'da_giai_ngan']

function StageStepper({ current }: { current: BankProposal['trangThai'] }) {
  if (current === 'tu_choi' || current === 'het_han') {
    return <span className={`nh-badge ${current === 'tu_choi' ? 'nh-b-red' : 'nh-b-grey'}`}>{TRANG_THAI_PA_LABEL[current]}</span>
  }
  const idx = STAGE_ORDER.indexOf(current)
  return (
    <div className="nh-stepper">
      {STAGE_ORDER.map((s, i) => (
        <div key={s} className="nh-step">
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span className={`nh-step-dot${i < idx ? ' done' : i === idx ? ' current' : ''}`}>{i < idx ? '✓' : i + 1}</span>
            <span className={`nh-step-label${i === idx ? ' current' : ''}`}>{TRANG_THAI_PA_LABEL[s]}</span>
          </div>
          {i < STAGE_ORDER.length - 1 && <span className="nh-step-line" style={{ background: i < idx ? '#1F6B3D' : '#E5E7EB' }} />}
        </div>
      ))}
    </div>
  )
}

interface Props {
  relations: BankRelation[]
  proposals: BankProposal[]
  notes: BankNote[]
  onSaveRelation: (r: BankRelation) => Promise<void>
  onDeleteRelation: (id: string) => Promise<void>
  onSaveProposal: (p: BankProposal) => Promise<void>
  onDeleteProposal: (id: string) => Promise<void>
  onSaveNote: (n: BankNote) => Promise<void>
  onDeleteNote: (id: string) => Promise<void>
}

export function TabNganHang({
  relations, proposals, notes,
  onSaveRelation, onDeleteRelation, onSaveProposal, onDeleteProposal, onSaveNote, onDeleteNote,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingBank, setEditingBank] = useState<BankRelation | 'new' | null>(null)
  const [editingProposal, setEditingProposal] = useState<{ bankId: string; proposal: BankProposal | 'new' } | null>(null)
  const [editingNote, setEditingNote] = useState<{ bankId: string; note: BankNote | 'new' } | null>(null)
  const [notesExpanded, setNotesExpanded] = useState<Set<string>>(new Set())
  const [exporting, setExporting] = useState(false)

  const kpi = useMemo(() => {
    const dangHopTac = relations.filter(r => r.trangThai === 'dang_hop_tac')
    const tongHanMuc = dangHopTac.reduce((s, r) => s + r.hanMucHienTai, 0)
    const tongDuNo   = dangHopTac.reduce((s, r) => s + r.duNoHienTai, 0)
    const laiSuatBq  = dangHopTac.length ? dangHopTac.reduce((s, r) => s + r.laiSuatBinhQuan, 0) / dangHopTac.length : 0
    const dangXuLy   = proposals.filter(p => isHoSoDangXuLy(p.trangThai)).length
    return { soLuong: dangHopTac.length, tongHanMuc, tongDuNo, laiSuatBq, dangXuLy }
  }, [relations, proposals])

  const doExportHoSo = async () => {
    setExporting(true)
    try {
      await exportHoSoVayVonWord({ printDate: new Date().toLocaleDateString('vi-VN'), relations, proposals, notes })
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn-primary" disabled={exporting} onClick={doExportHoSo}>
          {exporting ? 'Đang xuất...' : '⬇ Xuất báo cáo hồ sơ vay vốn hôm nay'}
        </button>
      </div>

      <div className="nh-kpi-row">
        <div className="nh-kpi">
          <span className="nh-kpi-label">Ngân hàng đang hợp tác</span>
          <span className="nh-kpi-val">{kpi.soLuong}</span>
          <span className="nh-kpi-sub">{kpi.dangXuLy} hồ sơ/phương án đang xử lý</span>
        </div>
        <div className="nh-kpi">
          <span className="nh-kpi-label">Tổng hạn mức hiện tại</span>
          <span className="nh-kpi-val">{fmtN(kpi.tongHanMuc)}<span style={{ fontSize: 11, marginLeft: 2 }}>đ</span></span>
          <span className="nh-kpi-sub">Trên các NH đang hợp tác</span>
        </div>
        <div className="nh-kpi">
          <span className="nh-kpi-label">Tổng dư nợ hiện tại</span>
          <span className="nh-kpi-val" style={{ color: kpi.tongDuNo > 0 ? '#8C1F1F' : undefined }}>{fmtN(kpi.tongDuNo)}<span style={{ fontSize: 11, marginLeft: 2 }}>đ</span></span>
          <span className="nh-kpi-sub">{kpi.tongHanMuc > 0 ? (kpi.tongDuNo / kpi.tongHanMuc * 100).toFixed(1) : '0.0'}% hạn mức đã dùng</span>
        </div>
        <div className="nh-kpi">
          <span className="nh-kpi-label">Lãi suất bình quân</span>
          <span className="nh-kpi-val">{kpi.laiSuatBq.toFixed(2)}<span style={{ fontSize: 11, marginLeft: 2 }}>%/năm</span></span>
          <span className="nh-kpi-sub">Trung bình các NH đang hợp tác</span>
        </div>
      </div>

      <div className="nh-card">
        <div className="nh-card-head">
          <span className="nh-card-title">Danh sách ngân hàng</span>
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
              const rNotesAll = notes.filter(n => n.nganHangId === r.id).sort((a, b) => b.ngay.localeCompare(a.ngay))
              const showAllNotes = notesExpanded.has(r.id)
              const rNotes = showAllNotes ? rNotesAll : rNotesAll.slice(0, 3)
              const open = expandedId === r.id
              return (
                <div key={r.id} style={{ border: '1px solid #E5E0D8', borderRadius: 10, marginBottom: 10, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#FBFAF7', cursor: 'pointer', gap: 8, flexWrap: 'wrap' }}
                    onClick={() => setExpandedId(open ? null : r.id)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, color: '#1C3557' }}>{open ? '▾' : '▸'} {r.tenNganHang}</span>
                      {r.chiNhanh && <span style={{ fontSize: 11, color: '#6B7280' }}>{r.chiNhanh}</span>}
                      <span className="nh-badge nh-b-grey">{LOAI_HINH_LABEL[r.loaiHinh]}</span>
                      <span className={`nh-badge ${trangThaiCls(r.trangThai)}`}>{TRANG_THAI_NH_LABEL[r.trangThai]}</span>
                      <span className={`nh-badge ${danhGiaCls(r.danhGia)}`}>{DANH_GIA_LABEL[r.danhGia]}</span>
                      <span style={{ fontSize: 11, color: '#6B7280' }}>{rProposals.length} phương án · {rNotesAll.length} ghi chú</span>
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

                      {/* Phương án vay — thẻ + thanh tiến độ */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span className="nh-label" style={{ margin: 0 }}>Phương án vay — tiến độ hồ sơ</span>
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
                        <div style={{ padding: 12, textAlign: 'center', color: '#9CA3AF', fontSize: 12, marginBottom: 8 }}>Chưa có phương án nào.</div>
                      ) : (
                        <div style={{ marginBottom: 16 }}>
                          {rProposals.map(p => (
                            <div key={p.id} className="nh-proposal-card">
                              <div className="nh-pc-head">
                                <span className="nh-pc-title">{p.tenPhuongAn}</span>
                                <span className={`nh-badge ${p.loaiVay === 'ngan_han' ? 'nh-b-blue' : p.loaiVay === 'bao_lanh' ? 'nh-b-amber' : 'nh-b-purple'}`}>{LOAI_VAY_LABEL[p.loaiVay]}</span>
                                <span style={{ flex: 1 }} />
                                <button className="btn-ghost" onClick={() => setEditingProposal({ bankId: r.id, proposal: p })}>Sửa</button>
                                <button className="btn-danger" onClick={() => { if (confirm(`Xoá phương án "${p.tenPhuongAn}"?`)) onDeleteProposal(p.id) }}>×</button>
                              </div>
                              <div className="nh-pc-meta">
                                {minLaiSuat(p) ? `Lãi suất ưu đãi thấp nhất: ${minLaiSuat(p).toFixed(2)}%` : 'Chưa có lãi suất'} · Mức tài trợ: {mucTaiTroDisplay(p, fmtN)}
                                {p.ngayNopHoSo && ` · Nộp hồ sơ: ${p.ngayNopHoSo}`}
                              </div>
                              <StageStepper current={p.trangThai} />
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Nhật ký làm việc — gộp vào ngay trong thẻ ngân hàng */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span className="nh-label" style={{ margin: 0 }}>Nhật ký làm việc</span>
                        <button className="btn-ghost" onClick={() => setEditingNote({ bankId: r.id, note: 'new' })}>+ Ghi chú</button>
                      </div>

                      {editingNote?.bankId === r.id && (
                        <NoteForm
                          initial={editingNote.note === 'new' ? null : editingNote.note}
                          onCancel={() => setEditingNote(null)}
                          onSave={async n => { await onSaveNote({ ...n, nganHangId: r.id }); setEditingNote(null) }}
                        />
                      )}

                      {rNotesAll.length === 0 ? (
                        <div style={{ padding: 12, textAlign: 'center', color: '#9CA3AF', fontSize: 12 }}>Chưa có ghi chú nào.</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {rNotes.map(n => (
                            <div key={n.id} style={{ border: '1px solid #E5E0D8', borderRadius: 10, padding: 10, display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                              <div style={{ flex: 1, minWidth: 200 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: 11, color: '#9CA3AF' }}>{n.ngay}</span>
                                  {n.nguoiLienHe && <span style={{ fontSize: 11, color: '#9CA3AF' }}>· LH: {n.nguoiLienHe}</span>}
                                  <span className={`nh-badge ${trangThaiGCCls(n.trangThai)}`}>{TRANG_THAI_GC_LABEL[n.trangThai]}</span>
                                </div>
                                <div style={{ fontSize: 12.5, color: '#374151', whiteSpace: 'pre-wrap' }}>{n.noiDung}</div>
                                {(n.viecCanLam || n.hanXuLy) && (
                                  <div style={{ fontSize: 11.5, color: '#8A5A12', marginTop: 4 }}>
                                    → {n.viecCanLam}{n.hanXuLy ? ` (hạn ${n.hanXuLy})` : ''}
                                  </div>
                                )}
                              </div>
                              <div style={{ display: 'flex', gap: 6, alignSelf: 'flex-start' }}>
                                <button className="btn-ghost" onClick={() => setEditingNote({ bankId: r.id, note: n })}>Sửa</button>
                                <button className="btn-danger" onClick={() => { if (confirm('Xoá ghi chú này?')) onDeleteNote(n.id) }}>Xoá</button>
                              </div>
                            </div>
                          ))}
                          {rNotesAll.length > 3 && (
                            <button className="btn-ghost" onClick={() => {
                              const next = new Set(notesExpanded)
                              if (showAllNotes) next.delete(r.id); else next.add(r.id)
                              setNotesExpanded(next)
                            }}>
                              {showAllNotes ? 'Thu gọn' : `Xem tất cả ${rNotesAll.length} ghi chú`}
                            </button>
                          )}
                        </div>
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
          <label className="nh-label">Loại hình</label>
          <select className="nh-select" value={form.loaiHinh} onChange={e => setForm({ ...form, loaiHinh: e.target.value as BankRelation['loaiHinh'] })}>
            {Object.entries(LOAI_HINH_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
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
          <MoneyInput value={form.hanMucHienTai} onChange={v => setForm({ ...form, hanMucHienTai: v })} />
        </div>
        <div>
          <label className="nh-label">Dư nợ hiện tại (đ)</label>
          <MoneyInput value={form.duNoHienTai} onChange={v => setForm({ ...form, duNoHienTai: v })} />
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
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10.5, fontWeight: 700, color: '#1C3557', textTransform: 'uppercase', letterSpacing: '.05em', margin: '14px 0 8px', borderTop: '1px dashed #D0DCE8', paddingTop: 10 }}>{children}</div>
}

function ProposalForm({ initial, onCancel, onSave }: { initial: BankProposal | null; onCancel: () => void; onSave: (p: Omit<BankProposal, 'nganHangId'>) => Promise<void> }) {
  const [form, setForm] = useState<Omit<BankProposal, 'id' | 'nganHangId' | 'ngayCapNhat'>>(initial ?? EMPTY_PROPOSAL)
  const [uuDiemStr, setUuDiemStr] = useState((initial?.uuDiem ?? []).join('\n'))
  const [nhuocDiemStr, setNhuocDiemStr] = useState((initial?.nhuocDiem ?? []).join('\n'))
  const [saving, setSaving] = useState(false)

  const setBac = (i: number, patch: Partial<{ kyHan: string; laiSuat: number }>) => {
    const list = [...form.laiSuatBacThang]
    list[i] = { ...list[i], ...patch }
    setForm({ ...form, laiSuatBacThang: list })
  }
  const setCustom = (i: number, patch: Partial<CustomRow>) => {
    const list = [...form.customRows]
    list[i] = { ...list[i], ...patch }
    setForm({ ...form, customRows: list })
  }

  return (
    <div style={{ border: '1px solid #D0DCE8', borderRadius: 10, padding: 14, marginBottom: 14, background: '#F8FAFC' }}>
      {/* Thông tin chung */}
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
          <label className="nh-label">Trạng thái xử lý hồ sơ</label>
          <select className="nh-select" value={form.trangThai} onChange={e => setForm({ ...form, trangThai: e.target.value as BankProposal['trangThai'] })}>
            {Object.entries(TRANG_THAI_PA_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="nh-label">Ẩn hạn / Kỳ hạn vay</label>
          <input className="nh-input" value={form.thoiHan} onChange={e => setForm({ ...form, thoiHan: e.target.value })} placeholder="VD: 2-5 năm tùy nhu cầu KH" />
        </div>
        <div>
          <label className="nh-label">Người phụ trách</label>
          <input className="nh-input" value={form.nguoiPhuTrach} onChange={e => setForm({ ...form, nguoiPhuTrach: e.target.value })} />
        </div>
        <div>
          <label className="nh-label">Ngày nộp hồ sơ</label>
          <input className="nh-input" type="date" value={form.ngayNopHoSo} onChange={e => setForm({ ...form, ngayNopHoSo: e.target.value })} />
        </div>
      </div>

      {/* Lãi suất */}
      <SectionLabel>Lãi suất</SectionLabel>
      {form.laiSuatBacThang.map((b, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginBottom: 6 }}>
          <input className="nh-input" placeholder="Kỳ hạn (VD: 12 tháng)" value={b.kyHan} onChange={e => setBac(i, { kyHan: e.target.value })} />
          <input className="nh-input" type="number" step="0.01" placeholder="Lãi suất %/năm" value={b.laiSuat || ''} onChange={e => setBac(i, { laiSuat: Number(e.target.value) })} />
          <button className="btn-danger" onClick={() => setForm({ ...form, laiSuatBacThang: form.laiSuatBacThang.filter((_, j) => j !== i) })}>×</button>
        </div>
      ))}
      <button className="btn-ghost" style={{ marginBottom: 10 }} onClick={() => setForm({ ...form, laiSuatBacThang: [...form.laiSuatBacThang, { kyHan: '', laiSuat: 0 }] })}>+ Thêm bậc lãi suất</button>
      <div style={{ marginBottom: 4 }}>
        <label className="nh-label">Lãi suất thả nổi sau ưu đãi</label>
        <input className="nh-input" value={form.laiSuatThaNoi} onChange={e => setForm({ ...form, laiSuatThaNoi: e.target.value })} placeholder="VD: LS huy động + 1,5%" />
      </div>

      {/* Hạn mức & Tài sản đảm bảo */}
      <SectionLabel>Hạn mức &amp; Tài sản đảm bảo</SectionLabel>
      <div className="nh-form-grid">
        <div>
          <label className="nh-label">Hạn mức/mức tài trợ (đ)</label>
          <MoneyInput value={form.hanMucDeXuat} onChange={v => setForm({ ...form, hanMucDeXuat: v })} />
        </div>
        <div>
          <label className="nh-label">Mức tài trợ (mô tả khác, vd %)</label>
          <input className="nh-input" value={form.mucTaiTroMoTa} onChange={e => setForm({ ...form, mucTaiTroMoTa: e.target.value })} placeholder="VD: 80-100% giá trị mua bán" />
        </div>
        <div>
          <label className="nh-label">Tỷ lệ TSĐB (%)</label>
          <input className="nh-input" type="number" step="0.01" value={form.tyLeTSDB || ''} onChange={e => setForm({ ...form, tyLeTSDB: Number(e.target.value) })} />
        </div>
      </div>
      <div className="nh-form-grid">
        <div>
          <label className="nh-label">TSĐB yêu cầu / chấp nhận</label>
          <textarea className="nh-textarea" rows={2} value={form.tsdbDieuKien} onChange={e => setForm({ ...form, tsdbDieuKien: e.target.value })} />
        </div>
        <div>
          <label className="nh-label">TSĐB từ chối / loại trừ</label>
          <textarea className="nh-textarea" rows={2} value={form.tsdbTuChoi} onChange={e => setForm({ ...form, tsdbTuChoi: e.target.value })} placeholder="VD: gần nghĩa trang, không có đường vào, đường vào < 2m" />
        </div>
      </div>

      {/* Điều kiện & Hỗ trợ */}
      <SectionLabel>Điều kiện &amp; Hỗ trợ</SectionLabel>
      <div className="nh-form-grid">
        <div>
          <label className="nh-label">Phí dịch vụ</label>
          <input className="nh-input" value={form.phiDichVu} onChange={e => setForm({ ...form, phiDichVu: e.target.value })} />
        </div>
        <div>
          <label className="nh-label">Phương thức thanh toán/trả nợ</label>
          <input className="nh-input" value={form.phuongThucTT} onChange={e => setForm({ ...form, phuongThucTT: e.target.value })} placeholder="VD: Trả gốc + lãi hàng tháng, dư nợ giảm dần" />
        </div>
      </div>
      <div style={{ marginBottom: 10 }}>
        <label className="nh-label">Hỗ trợ đặc biệt</label>
        <input className="nh-input" value={form.hoTroDacBiet} onChange={e => setForm({ ...form, hoTroDacBiet: e.target.value })} placeholder="VD: hỗ trợ mượn tách sổ, hỗ trợ chuyển đổi chủ vay" />
      </div>
      <div style={{ marginBottom: 10 }}>
        <label className="nh-label">Điều kiện khác</label>
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

      {/* Tiêu chí tuỳ chỉnh */}
      <SectionLabel>Tiêu chí tuỳ chỉnh (cho đặc thù riêng, vd đối tác cho thuê tài chính)</SectionLabel>
      {form.customRows.map((cr, i) => (
        <div key={cr.id} style={{ display: 'grid', gridTemplateColumns: '200px 1fr auto', gap: 8, marginBottom: 6 }}>
          <input className="nh-input" placeholder="Tên tiêu chí" value={cr.label} onChange={e => setCustom(i, { label: e.target.value })} />
          <input className="nh-input" placeholder="Nội dung" value={cr.noiDung} onChange={e => setCustom(i, { noiDung: e.target.value })} />
          <button className="btn-danger" onClick={() => setForm({ ...form, customRows: form.customRows.filter((_, j) => j !== i) })}>×</button>
        </div>
      ))}
      <button className="btn-ghost" style={{ marginBottom: 10 }} onClick={() => setForm({ ...form, customRows: [...form.customRows, { id: newId('cr'), label: '', noiDung: '' }] })}>+ Thêm tiêu chí tuỳ chỉnh</button>

      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <button className="btn-primary" disabled={!form.tenPhuongAn.trim() || saving}
          onClick={async () => {
            setSaving(true)
            await onSave({
              ...form,
              id: initial?.id ?? newId('pa'),
              ngayCapNhat: initial?.ngayCapNhat ?? '',
              uuDiem: uuDiemStr.split('\n').map(s => s.trim()).filter(Boolean),
              nhuocDiem: nhuocDiemStr.split('\n').map(s => s.trim()).filter(Boolean),
              customRows: form.customRows.filter(cr => cr.label.trim()),
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

// ── Form: Ghi chú / nhật ký làm việc ─────────────────────────────────────────
function NoteForm({ initial, onCancel, onSave }: {
  initial: BankNote | null
  onCancel: () => void
  onSave: (n: Omit<BankNote, 'nganHangId'>) => Promise<void>
}) {
  const [form, setForm] = useState<Omit<BankNote, 'id' | 'nganHangId'>>(initial ?? EMPTY_NOTE)
  const [saving, setSaving] = useState(false)

  return (
    <div style={{ border: '1px solid #D0DCE8', borderRadius: 10, padding: 14, marginBottom: 14, background: '#F8FAFC' }}>
      <div className="nh-form-grid">
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
        <textarea className="nh-textarea" rows={4} value={form.noiDung} onChange={e => setForm({ ...form, noiDung: e.target.value })}
          placeholder={'VD:\n1. Đang thẩm định năng lực tài chính\n2. Yêu cầu giải trình công nợ phải thu/phải trả\n3. Phí tạm ứng thẩm định: 1.650.000 đồng'} />
      </div>
      <div style={{ marginBottom: 10 }}>
        <label className="nh-label">Việc cần làm tiếp theo</label>
        <input className="nh-input" value={form.viecCanLam} onChange={e => setForm({ ...form, viecCanLam: e.target.value })} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn-primary" disabled={!form.noiDung.trim() || saving}
          onClick={async () => { setSaving(true); await onSave({ ...form, id: initial?.id ?? newId('gc') }); setSaving(false) }}>
          {saving ? 'Đang lưu...' : 'Lưu'}
        </button>
        <button className="btn-ghost" onClick={onCancel}>Huỷ</button>
      </div>
    </div>
  )
}
