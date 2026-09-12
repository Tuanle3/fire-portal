'use client'
import { useState, useEffect } from 'react'
import { useUserSession } from '@/contexts/user-session'
import { SAP_TABS, SapTab, SapProject } from './_lib/types'
import { subscribeProjects, createProject, deleteProject } from '@/lib/firebase-sap-thi-cong'
import { TabTienDo } from './_tabs/TabTienDo'
import { TabDongTien } from './_tabs/TabDongTien'
import { TabVatTu } from './_tabs/TabVatTu'
import { TabNhaThau } from './_tabs/TabNhaThau'
import { TabVay } from './_tabs/TabVay'
import { TabNguonVon } from './_tabs/TabNguonVon'

export default function SapThiCongPage() {
  const { loading, can } = useUserSession()
  const [projects, setProjects] = useState<SapProject[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<SapTab>('tien-do')
  const [showNew, setShowNew] = useState(false)

  useEffect(() => {
    const unsub = subscribeProjects(setProjects)
    return () => unsub()
  }, [])

  const project = projects.find(p => p.id === activeProjectId) || null

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Đang tải...</div>
  }

  if (!can('m:sap-thi-cong')) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', gap: 12 }}>
        <div style={{ fontSize: 40 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#1C3557' }}>Không có quyền truy cập</div>
        <div style={{ fontSize: 13, color: '#9CA3AF', textAlign: 'center' }}>Module này được giới hạn theo phân quyền. Liên hệ quản trị viên.</div>
      </div>
    )
  }

  return (
    <>
      <style>{`
        :root {
          --navy-dark:#0D1F33; --navy:#1C3557; --navy2:#2A4D7A; --navy3:#3E6E9F;
          --gold:#D4A64A; --gold2:#B08A3E; --gold-lt:#F0C870;
          --bg:#FAF8F3; --surface:#fff; --surf2:#EEF3FA; --surf3:#F5EDDC;
          --border:#E5E0D8; --border2:#D0CCC4; --border3:#D0DCE8;
          --txt:#1F2430; --txt2:#3D3D3D; --muted:#6B7280; --muted2:#9CA3AF;
          --green:#1F6B3D; --greenbg:#EAF6EE;
          --red:#8C1F1F; --redbg:#FDECEC;
          --amber:#8A5A12; --amberbg:#FFF4E0;
          --r:14px; --rm:10px; --rs:6px;
          --sh:0 1px 3px rgba(13,31,51,.06),0 4px 14px rgba(13,31,51,.07);
          --sh2:0 2px 8px rgba(13,31,51,.05),0 8px 28px rgba(13,31,51,.11);
        }

        .stc-main  { flex:1; display:flex; flex-direction:column; overflow-y:auto; overflow-x:hidden; font-family:'Be Vietnam Pro',sans-serif; font-size:13px; color:var(--txt); }

        /* buttons dùng chung */
        .btn-primary { background:var(--navy); color:#fff; border:none; padding:7px 14px; border-radius:var(--rm); font-size:12px; font-weight:600; cursor:pointer; font-family:inherit; display:flex; align-items:center; gap:5px; }
        .btn-primary:hover:not(:disabled) { background:var(--navy2); }
        .btn-primary:disabled { opacity:.6; cursor:not-allowed; }
        .btn-gold    { background:var(--gold); color:var(--navy); border:none; padding:7px 14px; border-radius:var(--rm); font-size:12px; font-weight:700; cursor:pointer; font-family:inherit; display:flex; align-items:center; gap:5px; }
        .btn-gold:hover { background:var(--gold2); color:#fff; }
        .btn-ghost   { background:#fff; border:1px solid var(--border); color:var(--txt2); padding:6px 14px; border-radius:8px; font-size:11px; font-weight:600; cursor:pointer; font-family:inherit; display:flex; align-items:center; gap:5px; transition:all .15s; }
        .btn-ghost:hover { border-color:var(--navy); background:var(--surf2); }
        .btn-del-icon { background:none; border:1px solid var(--border2); color:#DC2626; border-radius:6px; width:26px; height:26px; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:12px; }
        .btn-del-icon:hover { background:var(--redbg); border-color:#FECACA; }

        /* ── danh sách dự án ── */
        .stc-list-wrap { padding:24px; }
        .stc-list-head { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:18px; gap:12px; }
        .stc-title  { font-size:18px; font-weight:700; color:var(--navy); }
        .stc-sub    { font-size:12px; color:var(--muted); margin-top:3px; }
        .stc-empty  { padding:60px 20px; text-align:center; color:var(--muted2); background:var(--surface); border:1px dashed var(--border2); border-radius:var(--r); }
        .stc-grid   { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:14px; }
        .stc-card   { background:var(--surface); border:1px solid var(--border); border-radius:var(--r); box-shadow:var(--sh); padding:16px; cursor:pointer; transition:box-shadow .15s, border-color .15s; border-top:3px solid var(--navy); }
        .stc-card:hover { box-shadow:var(--sh2); border-color:var(--navy2); }
        .stc-card-name { font-size:14px; font-weight:700; color:var(--txt); margin-bottom:3px; }
        .stc-card-code { font-size:11px; color:var(--gold2); font-weight:700; margin-bottom:6px; }
        .stc-card-addr { font-size:12px; color:var(--muted); margin-bottom:10px; }
        .stc-card-foot { display:flex; align-items:center; justify-content:space-between; }
        .stc-badge      { font-size:10px; font-weight:700; padding:3px 9px; border-radius:999px; }
        .stc-badge-active   { background:var(--amberbg); color:var(--amber); }
        .stc-badge-upcoming { background:var(--surf2);   color:var(--navy2); }
        .stc-badge-done     { background:var(--greenbg); color:var(--green); }
        .stc-del { background:none; border:none; color:var(--muted2); cursor:pointer; font-size:13px; }
        .stc-del:hover { color:#DC2626; }

        /* ── shell dự án (breadcrumb + subtabs) ── */
        .stc-wrap { }
        .stc-topbar-sticky { position:sticky; top:0; z-index:50; background:linear-gradient(90deg,#FAF8F3 0%,#FFFFFF 60%); border-bottom:1px solid var(--border); box-shadow:0 2px 8px rgba(13,31,51,.07); }
        .stc-topbar { padding:0 24px; height:52px; display:flex; align-items:center; justify-content:space-between; }
        .stc-breadcrumb { display:flex; align-items:center; gap:6px; font-size:11.5px; color:var(--muted); margin-bottom:2px; }
        .stc-breadcrumb button { background:none; border:none; color:var(--navy2); font-weight:500; cursor:pointer; font-family:inherit; font-size:11.5px; padding:0; }
        .stc-breadcrumb button:hover { color:var(--navy); }
        .stc-subtabs { display:flex; align-items:center; gap:2px; overflow-x:auto; margin:0 24px; padding:0 4px; }
        .stc-subtabs::-webkit-scrollbar { height:0; }
        .stc-subtab { padding:10px 16px; font-size:12.5px; font-weight:600; color:var(--muted); cursor:pointer; border-bottom:2.5px solid transparent; background:none; border-top:none; border-left:none; border-right:none; font-family:inherit; white-space:nowrap; flex-shrink:0; transition:color .15s; }
        .stc-subtab:hover:not(.active) { color:var(--navy); background:var(--surf2); }
        .stc-subtab.active { color:var(--navy); font-weight:700; border-bottom-color:var(--gold); }
        .stc-content { padding:20px 24px; }

        /* ── panel / kpi / table dùng chung cho các tab ── */
        .stc-panel      { background:var(--surface); border:1px solid var(--border); border-radius:var(--r); box-shadow:var(--sh); margin-bottom:16px; overflow:hidden; }
        .stc-panel-head { padding:12px 16px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; background:var(--surf2); }
        .stc-panel-title{ font-size:12px; font-weight:700; color:var(--navy2); text-transform:uppercase; letter-spacing:.05em; }
        .stc-panel-body { padding:14px 16px; }

        .stc-kpi-row { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:12px; margin-bottom:16px; }
        .stc-kpi     { background:var(--surface); border-radius:var(--r); box-shadow:var(--sh); padding:14px 16px; border-top:3px solid var(--navy); }
        .stc-kpi.green { border-top-color:var(--green); }
        .stc-kpi.red   { border-top-color:#DC2626; }
        .stc-kpi.gold  { border-top-color:var(--gold); }
        .stc-kpi-label { font-size:10.5px; color:var(--muted); font-weight:600; text-transform:uppercase; letter-spacing:.06em; margin-bottom:6px; }
        .stc-kpi-val   { font-size:19px; font-weight:700; color:var(--navy); }

        .stc-table { width:100%; border-collapse:collapse; }
        .stc-table th { text-align:left; font-size:10.5px; font-weight:700; color:var(--navy2); text-transform:uppercase; letter-spacing:.05em; padding:9px 12px; background:var(--surf2); border-bottom:1px solid var(--border3); white-space:nowrap; }
        .stc-table td { padding:9px 12px; font-size:12.5px; border-bottom:1px solid var(--border); vertical-align:middle; }
        .stc-table tr:last-child td { border-bottom:none; }
        .stc-table tr:hover td { background:var(--surf2); }
        .stc-table .num { font-family:'Roboto Mono',monospace; font-variant-numeric:tabular-nums; text-align:right; }
        .stc-empty-row td { text-align:center; padding:24px; color:var(--muted2); }

        .stc-progress-bar  { height:6px; background:var(--surf2); border-radius:3px; overflow:hidden; flex:1; }
        .stc-progress-fill { height:100%; border-radius:3px; background:var(--navy); }
        .stc-progress-fill.done  { background:var(--green); }
        .stc-progress-fill.delay { background:#DC2626; }

        /* ── modal ── */
        .stc-modal-overlay { position:fixed; inset:0; background:rgba(13,31,51,.45); display:flex; align-items:center; justify-content:center; z-index:300; padding:16px; }
        .stc-modal    { width:min(520px,96vw); max-height:88vh; background:#fff; border-radius:14px; box-shadow:0 24px 60px rgba(13,31,51,.25); display:flex; flex-direction:column; overflow:hidden; }
        .stc-modal-head  { padding:16px 20px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; }
        .stc-modal-title { font-size:14px; font-weight:700; color:var(--navy); }
        .stc-modal-close { background:none; border:none; color:var(--muted); cursor:pointer; font-size:14px; }
        .stc-modal-body  { padding:16px 20px; overflow-y:auto; display:grid; grid-template-columns:1fr 1fr; gap:12px 14px; }
        .stc-field       { display:flex; flex-direction:column; gap:4px; }
        .stc-field--full { grid-column:1/-1; }
        .stc-field label { font-size:11px; font-weight:700; color:var(--muted); text-transform:uppercase; letter-spacing:.03em; }
        .stc-field input, .stc-field select, .stc-field textarea { font-family:inherit; font-size:13px; color:var(--txt); background:var(--surf2); border:1px solid var(--border); border-radius:7px; padding:8px 10px; width:100%; }
        .stc-field input:focus, .stc-field select:focus, .stc-field textarea:focus { border-color:var(--navy3); background:#fff; }
        .stc-modal-foot  { padding:12px 20px; border-top:1px solid var(--border); display:flex; justify-content:flex-end; gap:8px; }
        .stc-err  { grid-column:1/-1; background:#FEF2F2; color:#991B1B; border:1px solid #FECACA; border-radius:7px; padding:8px 12px; font-size:12px; font-weight:600; }
        .stc-hint { grid-column:1/-1; font-size:12px; color:var(--muted); background:var(--surf2); border-radius:7px; padding:8px 12px; }

        @media (max-width:640px) {
          .stc-modal-body { grid-template-columns:1fr; }
          .stc-field--full { grid-column:1; }
        }
      `}</style>

      <div className="stc-main">
        {!project ? (
          <ProjectListView
            projects={projects}
            onOpen={setActiveProjectId}
            onNew={() => setShowNew(true)}
            onDelete={async (id) => {
              if (confirm('Xoá dự án này? (Lưu ý: dữ liệu con trong Firestore cần dọn thủ công)')) {
                await deleteProject(id)
              }
            }}
          />
        ) : (
          <div className="stc-wrap">
            <div className="stc-topbar-sticky">
              <div className="stc-topbar">
                <div>
                  <div className="stc-breadcrumb">
                    <button onClick={() => setActiveProjectId(null)}>Dự án</button>
                    <span>›</span>
                    <span>{project.name}</span>
                  </div>
                  <div className="stc-title" style={{ fontSize: 16 }}>{project.name}</div>
                </div>
              </div>
              <div className="stc-subtabs">
                {SAP_TABS.map(t => (
                  <button
                    key={t.id}
                    className={`stc-subtab${activeTab === t.id ? ' active' : ''}`}
                    onClick={() => setActiveTab(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="stc-content">
              {activeTab === 'tien-do'   && <TabTienDo   projectId={project.id} />}
              {activeTab === 'dong-tien' && <TabDongTien projectId={project.id} />}
              {activeTab === 'vat-tu'    && <TabVatTu    projectId={project.id} />}
              {activeTab === 'nha-thau'  && <TabNhaThau  projectId={project.id} />}
              {activeTab === 'vay'       && <TabVay      projectId={project.id} />}
              {activeTab === 'nguon-von' && <TabNguonVon projectId={project.id} />}
            </div>
          </div>
        )}
      </div>

      {showNew && (
        <NewProjectModal
          onClose={() => setShowNew(false)}
          onCreated={(id) => { setShowNew(false); setActiveProjectId(id) }}
        />
      )}
    </>
  )
}

function ProjectListView({
  projects, onOpen, onNew, onDelete,
}: {
  projects: SapProject[]
  onOpen: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="stc-list-wrap">
      <div className="stc-list-head">
        <div>
          <div className="stc-title">🚧 SAP - Thi công</div>
          <div className="stc-sub">Quản lý tiến độ, dòng tiền, vật tư, nhà thầu phụ &amp; nguồn vốn theo từng dự án</div>
        </div>
        <button className="btn-gold" onClick={onNew}>+ Thêm dự án</button>
      </div>

      {!projects.length ? (
        <div className="stc-empty">Chưa có dự án nào. Bấm &quot;+ Thêm dự án&quot; để bắt đầu.</div>
      ) : (
        <div className="stc-grid">
          {projects.map(p => (
            <div key={p.id} className="stc-card" onClick={() => onOpen(p.id)}>
              <div className="stc-card-name">{p.name}</div>
              {p.code && <div className="stc-card-code">{p.code}</div>}
              {p.address && <div className="stc-card-addr">📍 {p.address}</div>}
              <div className="stc-card-foot">
                <span className={`stc-badge stc-badge-${p.status}`}>
                  {p.status === 'active' ? 'Đang thi công' : p.status === 'upcoming' ? 'Chuẩn bị' : 'Hoàn thành'}
                </span>
                <button className="stc-del" onClick={(e) => { e.stopPropagation(); onDelete(p.id) }}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function NewProjectModal({
  onClose, onCreated,
}: {
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [address, setAddress] = useState('')
  const [contractValue, setContractValue] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function handleSave() {
    if (!name.trim()) { setErr('Vui lòng nhập tên dự án'); return }
    setSaving(true)
    setErr('')
    try {
      const ref = await createProject({
        name: name.trim(),
        code: code.trim() || undefined,
        address: address.trim() || undefined,
        contractValue: contractValue ? Number(contractValue) : undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        status: 'active',
      })
      onCreated(ref.id)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Lưu thất bại')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="stc-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="stc-modal">
        <div className="stc-modal-head">
          <div className="stc-modal-title">+ Thêm dự án thi công</div>
          <button className="stc-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="stc-modal-body">
          {err && <div className="stc-err">{err}</div>}
          <div className="stc-field stc-field--full">
            <label>Tên dự án *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="VD: Khu công nghiệp SAP giai đoạn 2" />
          </div>
          <div className="stc-field">
            <label>Mã dự án</label>
            <input value={code} onChange={e => setCode(e.target.value)} placeholder="SAP-GD2" />
          </div>
          <div className="stc-field">
            <label>Tổng mức đầu tư (đ)</label>
            <input type="number" value={contractValue} onChange={e => setContractValue(e.target.value)} />
          </div>
          <div className="stc-field stc-field--full">
            <label>Địa điểm</label>
            <input value={address} onChange={e => setAddress(e.target.value)} />
          </div>
          <div className="stc-field">
            <label>Ngày khởi công</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div className="stc-field">
            <label>Dự kiến hoàn thành</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
        </div>
        <div className="stc-modal-foot">
          <button className="btn-ghost" onClick={onClose}>Huỷ</button>
          <button className="btn-primary" disabled={saving} onClick={handleSave}>{saving ? 'Đang lưu...' : 'Lưu dự án'}</button>
        </div>
      </div>
    </div>
  )
}
