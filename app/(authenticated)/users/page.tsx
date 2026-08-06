'use client'
import { useState, useEffect, useMemo } from 'react'
import {
  Department, DEFAULT_COLORS,
  subscribeToDepartments, saveDepartment, deleteDepartment,
} from '@/lib/departments-store'
import {
  Project, DEFAULT_PROJECT_COLORS,
  subscribeToProjects, saveProject, deleteProject,
} from '@/lib/projects-store'

// ── Types ─────────────────────────────────────────────────────────────────────
type UserRole  = 'ceo' | 'admin' | 'viewer'
type StaffLevel = 'giam_doc' | 'truong_phong' | 'nhan_vien'

interface PortalUser {
  id: string
  username: string
  full_name: string
  role: UserRole
  active: boolean
  created_at: string
  tabs?: string[] | null
  department?: string
  level?: StaffLevel
  position?: string
}

const LEVEL_LABEL: Record<StaffLevel, string> = {
  giam_doc:     'Giám đốc',
  truong_phong: 'Trưởng phòng',
  nhan_vien:    'Nhân viên',
}
const LEVEL_COLOR: Record<StaffLevel, { bg: string; color: string; border: string }> = {
  giam_doc:     { bg: '#FFF7ED', color: '#9A3412', border: '#FED7AA' },
  truong_phong: { bg: '#EFF6FF', color: '#1E40AF', border: '#BFDBFE' },
  nhan_vien:    { bg: '#F0FDF4', color: '#166534', border: '#BBF7D0' },
}

// ── Permission model ──────────────────────────────────────────────────────────
const ROLE_LABEL: Record<UserRole, string> = { ceo: 'CEO', admin: 'Quản trị', viewer: 'Xem' }
const ROLE_COLOR: Record<UserRole, { bg: string; color: string }> = {
  ceo:    { bg: '#1C3557', color: '#fff' },
  admin:  { bg: '#6366F1', color: '#fff' },
  viewer: { bg: '#E5E7EB', color: '#374151' },
}

interface PermModule { id: string; label: string; icon: string; alwaysOn?: boolean }

const MODULES: PermModule[] = [
  { id: 'm:dashboard',   label: 'Dashboard',              icon: '⊞'  },
  { id: 'm:tasks',       label: 'Công việc',               icon: '✓'  },
  { id: 'm:finance',     label: 'Tài chính – Kế toán',    icon: '💰' },
  { id: 'm:assets',      label: 'Tài sản đảm bảo',        icon: '🏦' },
  { id: 'm:data',        label: 'Nhật ký dòng tiền',      icon: '📊' },
  { id: 'm:ngan-sach',   label: 'Ngân sách dòng tiền',    icon: '📋' },
  { id: 'm:nganhang',    label: 'List ngân hàng',         icon: '🏛️' },
  { id: 'm:ccn-pricing', label: 'Tính giá thuê CCN',      icon: '🏭' },
  { id: 'm:noxh',        label: 'NOXH Nguyễn Trãi',       icon: '🏘️' },
  { id: 'm:dien-nuoc',   label: 'Điện nước SA.ĐT',        icon: '⚡' },
  { id: 'm:users',       label: 'Quản lý User',            icon: '👥' },
]

const DEFAULT_PERMS: Record<UserRole, string[]> = {
  ceo:    MODULES.map(m => m.id),
  admin:  MODULES.map(m => m.id),
  viewer: ['m:dashboard'],
}

function resolvePerms(role: UserRole, tabs: string[] | null | undefined): string[] {
  if (!tabs || tabs.length === 0) return DEFAULT_PERMS[role]
  return tabs
}

function permChips(user: PortalUser): string[] {
  const perms = resolvePerms(user.role, user.tabs)
  return MODULES.filter(m => perms.includes(m.id)).map(m => m.label)
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const palette = ['#4F6BED','#E85D75','#0D9488','#D97706','#7C3AED','#0891B2','#DC2626','#16A34A']
const avatarColor = (n: string) => palette[(n.charCodeAt(0) + (n.charCodeAt(n.length - 1) || 0)) % palette.length]
const initials    = (n: string) => n.split(' ').filter(Boolean).map(w => w[0]).slice(-2).join('').toUpperCase()

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: avatarColor(name || '?'),
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * .33), fontWeight: 700, color: '#fff', flexShrink: 0 }}>
      {initials(name || '?')}
    </div>
  )
}

// ── Permission Modal ──────────────────────────────────────────────────────────
function PermModal({ user, departments, onClose, onSaved }: {
  user: PortalUser | null   // null = create new
  departments: Department[]
  onClose: () => void
  onSaved: () => void
}) {
  const isNew = !user
  const [name,     setName]     = useState(user?.full_name ?? '')
  const [email,    setEmail]    = useState(user?.username  ?? '')
  const [password, setPassword] = useState('')
  const [role,     setRole]     = useState<UserRole>(user?.role ?? 'viewer')
  const [dept,     setDept]     = useState(user?.department ?? '')
  const [level,    setLevel]    = useState<StaffLevel>(user?.level ?? 'nhan_vien')
  const [position, setPosition] = useState(user?.position ?? '')
  const [perms,    setPerms]    = useState<string[]>(() => resolvePerms(user?.role ?? 'viewer', user?.tabs))
  const [isCustom, setIsCustom] = useState(() => !!(user?.tabs && user.tabs.length > 0))
  const [saving,   setSaving]   = useState(false)
  const [err,      setErr]      = useState('')

  function handleRoleChange(r: UserRole) {
    setRole(r)
    if (!isCustom) setPerms(DEFAULT_PERMS[r])
  }

  function resetToRole() {
    setPerms(DEFAULT_PERMS[role])
    setIsCustom(false)
  }

  function togglePerm(id: string) {
    setIsCustom(true)
    setPerms(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id])
  }

  const customTabs = perms

  async function handleSave() {
    if (!name.trim())  return setErr('Vui lòng nhập họ tên')
    if (!email.trim()) return setErr('Vui lòng nhập tài khoản')
    if (isNew && !password) return setErr('Vui lòng nhập mật khẩu')
    setSaving(true); setErr('')
    try {
      const body: Record<string, unknown> = {
        full_name:  name.trim(),
        username:   email.trim(),
        role,
        tabs:       isCustom ? customTabs : null,
        department: dept || null,
        level:      level || null,
        position:   position.trim() || null,
      }
      if (password) body.password = password

      const res = await fetch(
        isNew ? '/api/users' : `/api/users/${user!.id}`,
        { method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Lỗi không xác định')
      onSaved(); onClose()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Có lỗi xảy ra')
    } finally { setSaving(false) }
  }

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:1000 }} />
      <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)',
        background:'#fff', borderRadius:12, width:960, maxWidth:'97vw', maxHeight:'92vh',
        display:'flex', flexDirection:'column', zIndex:1001, overflow:'hidden',
        boxShadow:'0 20px 60px rgba(0,0,0,.2)' }}>

        {/* Header */}
        <div style={{ padding:'20px 24px 16px', borderBottom:'1px solid #E5E7EB', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ fontWeight:700, fontSize:16, color:'#1C3557' }}>
            {isNew ? '+ Tạo tài khoản mới' : `Phân quyền: ${user!.full_name}`}
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:20, lineHeight:1, padding:4 }}>✕</button>
        </div>

        <div style={{ display:'flex', flex:1, overflow:'hidden' }}>
          {/* Left: user info */}
          <div style={{ width:300, padding:'20px 24px', borderRight:'1px solid #F3F4F6', display:'flex', flexDirection:'column', gap:12, flexShrink:0, overflowY:'auto' }}>
            <div>
              <label style={lblStyle}>Họ và tên *</label>
              <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Nguyễn Văn A" />
            </div>
            <div>
              <label style={lblStyle}>Tài khoản (email) *</label>
              <input style={inputStyle} value={email} onChange={e => setEmail(e.target.value)} placeholder="email@company.vn" type="email" />
            </div>
            <div>
              <label style={lblStyle}>Mật khẩu mới {isNew ? '*' : '(để trống nếu không đổi)'}</label>
              <input style={inputStyle} value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="••••••••" />
            </div>
            <div>
              <label style={lblStyle}>Vai trò *</label>
              <select style={inputStyle} value={role} onChange={e => handleRoleChange(e.target.value as UserRole)}>
                <option value="ceo">CEO — Toàn quyền</option>
                <option value="admin">Quản trị — Toàn quyền</option>
                <option value="viewer">Xem — Tuỳ chỉnh</option>
              </select>
            </div>

            {/* Divider */}
            <div style={{ borderTop:'1px solid #F3F4F6', margin:'2px 0' }} />
            <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em' }}>Thông tin nhân sự</div>

            <div>
              <label style={lblStyle}>Phòng ban</label>
              <select style={inputStyle} value={dept} onChange={e => setDept(e.target.value)}>
                <option value="">— Chọn phòng ban —</option>
                {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label style={lblStyle}>Chức vụ (RBAC)</label>
              <select style={inputStyle} value={level} onChange={e => setLevel(e.target.value as StaffLevel)}>
                <option value="giam_doc">Giám đốc</option>
                <option value="truong_phong">Trưởng phòng</option>
                <option value="nhan_vien">Nhân viên</option>
              </select>
            </div>
            <div>
              <label style={lblStyle}>Chức danh (hiển thị)</label>
              <input style={inputStyle} value={position} onChange={e => setPosition(e.target.value)} placeholder="VD: Kế toán trưởng, PM…" />
            </div>

            {isCustom && (
              <button onClick={resetToRole} style={{ fontSize:12, color:'#6366F1', background:'none', border:'1px solid #C7D2FE', borderRadius:6, padding:'6px 10px', cursor:'pointer', textAlign:'left' }}>
                ↺ Reset về mặc định vai trò
              </button>
            )}
            {!isCustom && (
              <div style={{ fontSize:11, color:'#9CA3AF', background:'#F9FAFB', borderRadius:6, padding:'8px 10px', lineHeight:1.6 }}>
                Đang theo mặc định vai trò. Tick bất kỳ để tuỳ chỉnh.
              </div>
            )}
            {err && <div style={{ fontSize:12, color:'#DC2626', background:'#FEF2F2', borderRadius:6, padding:'8px 10px' }}>{err}</div>}
          </div>

          {/* Right: permission tree */}
          <div style={{ flex:1, padding:'20px 24px', overflowY:'auto' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#6B7280', letterSpacing:'.08em', marginBottom:14, textTransform:'uppercase' }}>
              Phân quyền chi tiết theo Module
            </div>

            {/* Section: Module chính */}
            <div style={{ fontSize:11, fontWeight:700, color:'#374151', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>Module chính</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6 }}>
              {MODULES.map(m => (
                <PermRow key={m.id} module={m}
                  checked={perms.includes(m.id)}
                  disabled={role !== 'viewer' && !isCustom}
                  onToggle={() => togglePerm(m.id)} />
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding:'14px 24px', borderTop:'1px solid #E5E7EB', display:'flex', justifyContent:'flex-end', gap:8 }}>
          <button onClick={onClose} style={{ padding:'8px 18px', borderRadius:8, border:'1px solid #E5E7EB', background:'#fff', cursor:'pointer', fontSize:13, fontWeight:500 }}>Huỷ</button>
          <button onClick={handleSave} disabled={saving} style={{ padding:'8px 20px', borderRadius:8, background:'#1C3557', color:'#fff', border:'none', cursor:'pointer', fontSize:13, fontWeight:600 }}>
            {saving ? 'Đang lưu…' : 'Lưu phân quyền'}
          </button>
        </div>
      </div>
    </>
  )
}

function PermRow({ module: m, checked, disabled, onToggle, label }: {
  module: PermModule; checked: boolean; disabled: boolean; onToggle: () => void; label?: string
}) {
  return (
    <label style={{ display:'flex', alignItems:'center', gap:8, cursor: disabled ? 'default' : 'pointer',
      padding:'8px 10px', borderRadius:8, border:`1px solid ${checked ? '#BFDBFE' : '#E5E7EB'}`,
      background: checked ? '#EFF6FF' : '#F9FAFB', transition:'all .12s' }}>
      <input type="checkbox" checked={checked} onChange={onToggle} disabled={disabled}
        style={{ accentColor:'#1C3557', width:14, height:14 }} />
      <span style={{ fontSize:13 }}>{m.icon}</span>
      <span style={{ fontSize:13, fontWeight: checked ? 600 : 400, color: checked ? '#1E40AF' : '#374151', flex:1 }}>{m.label}</span>
      {label && <span style={{ fontSize:10, color:'#9CA3AF', whiteSpace:'nowrap' }}>{label}</span>}
    </label>
  )
}

const lblStyle: React.CSSProperties = { display:'block', fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:5 }
const inputStyle: React.CSSProperties = { width:'100%', padding:'8px 10px', border:'1px solid #E5E7EB', borderRadius:8, fontSize:13, boxSizing:'border-box', outline:'none', background:'#F9FAFB', color:'#111' }

// ── Main page ─────────────────────────────────────────────────────────────────
type TabKey = 'accounts' | 'dept' | 'project'

export default function UsersPage() {
  const [tab,       setTab]       = useState<TabKey>('accounts')
  const [accounts,  setAccounts]  = useState<PortalUser[]>([])
  const [loading,   setLoading]   = useState(true)
  const [selected,  setSelected]  = useState<PortalUser | null | 'new'>(null)
  const [myRole,    setMyRole]    = useState<string>('')
  const canManage = ['ceo', 'admin'].includes(myRole)

  // Dept state
  const [departments, setDepartments] = useState<Department[]>([])
  const [deptInput,   setDeptInput]   = useState('')
  const [deptColor,   setDeptColor]   = useState(DEFAULT_COLORS[0])
  const [editDept,    setEditDept]    = useState<Department | null>(null)

  // Project state
  const [projects,  setProjects]  = useState<Project[]>([])
  const [projInput, setProjInput] = useState('')
  const [projColor, setProjColor] = useState(DEFAULT_PROJECT_COLORS[0])
  const [editProj,  setEditProj]  = useState<Project | null>(null)

  async function loadAccounts() {
    setLoading(true)
    try {
      const res = await fetch('/api/users')
      if (res.ok) setAccounts(await res.json())
    } finally { setLoading(false) }
  }

  useEffect(() => {
    loadAccounts()
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(s => { if (s?.role) setMyRole(s.role) }).catch(() => {})
  }, [])

  useEffect(() => { return subscribeToDepartments(setDepartments) }, [])
  useEffect(() => { return subscribeToProjects(setProjects) }, [])

  async function toggleActive(u: PortalUser) {
    await fetch(`/api/users/${u.id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ active: !u.active }) })
    loadAccounts()
  }

  async function handleDelete(u: PortalUser) {
    if (!confirm(`Xoá tài khoản "${u.full_name}"?`)) return
    await fetch(`/api/users/${u.id}`, { method: 'DELETE' })
    loadAccounts()
  }

  // Dept handlers
  async function handleSaveDept() {
    const name = deptInput.trim(); if (!name) return
    const id = editDept?.id ?? `dept-${Date.now()}`
    await saveDepartment({ id, name, color: deptColor, createdAt: editDept?.createdAt ?? new Date().toISOString().slice(0,10) })
    setDeptInput(''); setDeptColor(DEFAULT_COLORS[0]); setEditDept(null)
  }
  async function handleDeleteDept(d: Department) {
    if (!confirm(`Xóa phòng ban "${d.name}"?`)) return
    await deleteDepartment(d.id)
    if (editDept?.id === d.id) { setEditDept(null); setDeptInput(''); setDeptColor(DEFAULT_COLORS[0]) }
  }

  // Project handlers
  async function handleSaveProj() {
    const name = projInput.trim(); if (!name) return
    const id = editProj?.id ?? `proj-${Date.now()}`
    await saveProject({ id, name, color: projColor, createdAt: editProj?.createdAt ?? new Date().toISOString().slice(0,10) })
    setProjInput(''); setProjColor(DEFAULT_PROJECT_COLORS[0]); setEditProj(null)
  }
  async function handleDeleteProj(p: Project) {
    if (!confirm(`Xóa dự án "${p.name}"?`)) return
    await deleteProject(p.id)
    if (editProj?.id === p.id) { setEditProj(null); setProjInput(''); setProjColor(DEFAULT_PROJECT_COLORS[0]) }
  }

  return (
    <div style={{ padding:'24px 32px' }}>
      <style>{`
        .up-tab { padding:8px 18px; border-radius:8px; border:none; background:transparent; cursor:pointer; font-size:13px; font-weight:500; color:var(--muted); transition:all .15s; }
        .up-tab--on { background:var(--navy); color:#fff; }
        .up-tab:hover:not(.up-tab--on) { background:var(--surf2); }
        .usr-table { width:100%; border-collapse:collapse; }
        .usr-table th { font-size:11px; font-weight:700; color:var(--muted); text-transform:uppercase; letter-spacing:.06em; padding:10px 12px; text-align:left; border-bottom:1px solid var(--border2); white-space:nowrap; }
        .usr-table td { padding:12px 12px; border-bottom:1px solid var(--border); vertical-align:middle; font-size:13px; }
        .usr-table tr:last-child td { border-bottom:none; }
        .usr-table tr:hover td { background:var(--surf2); }
        .chip { display:inline-flex; align-items:center; padding:2px 8px; border-radius:999px; font-size:11px; font-weight:500; margin:2px; border:1px solid transparent; }
        .btn-act { padding:5px 10px; border-radius:6px; border:1px solid var(--border2); background:#fff; cursor:pointer; font-size:12px; font-weight:500; color:var(--txt); transition:all .12s; }
        .btn-act:hover { background:var(--surf2); }
        .btn-del { color:#DC2626; border-color:#FECACA; }
        .btn-del:hover { background:#FEF2F2; }
        .btn-lock { color:#D97706; border-color:#FDE68A; }
        .btn-lock:hover { background:#FFFBEB; }
        .dept-wrap { max-width:600px; }
        .dept-form { background:var(--surf2); border:1px solid var(--border2); border-radius:10px; padding:16px; margin-bottom:16px; }
        .dept-form-row { display:flex; gap:8px; align-items:flex-end; margin-bottom:12px; }
        .dept-list { display:flex; flex-direction:column; gap:8px; }
        .dept-item { display:flex; align-items:center; gap:10px; padding:10px 14px; background:#fff; border:1px solid var(--border2); border-radius:8px; }
        .dept-dot { width:12px; height:12px; border-radius:50%; flex-shrink:0; }
        .dept-name { flex:1; font-size:13px; font-weight:600; color:var(--navy); }
        .dept-count { font-size:12px; color:var(--muted); }
        .dept-actions { display:flex; gap:6px; }
        .dept-btn { padding:4px 10px; border-radius:6px; border:1px solid var(--border2); background:#fff; cursor:pointer; font-size:12px; color:var(--txt); }
        .dept-btn--del { color:#DC2626; border-color:#FECACA; }
        .color-row { display:flex; gap:6px; flex-wrap:wrap; }
        .color-swatch { width:24px; height:24px; border-radius:50%; cursor:pointer; transition:transform .1s; border:2px solid transparent; }
        .color-swatch:hover { transform:scale(1.15); }
        .color-swatch--on { border-color:#fff; box-shadow:0 0 0 2px var(--navy); }
        .up-s { padding:8px 12px; border:1px solid var(--border2); border-radius:8px; font-size:13px; width:100%; box-sizing:border-box; background:#fff; }
        .up-add { padding:8px 16px; background:var(--navy); color:#fff; border:none; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; white-space:nowrap; }
      `}</style>

      {/* Page header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:24 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:700, color:'var(--navy)', margin:0 }}>Quản lý User</h1>
          <p style={{ fontSize:13, color:'var(--muted)', margin:'4px 0 0' }}>Tạo tài khoản và phân quyền truy cập – Module · Dự án · Thẻ</p>
        </div>
        {canManage && (
          <button onClick={() => setSelected('new')} className="up-add" style={{ display:'flex', alignItems:'center', gap:6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Tạo tài khoản
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:20, borderBottom:'1px solid var(--border2)', paddingBottom:4 }}>
        <button className={`up-tab${tab==='accounts'?' up-tab--on':''}`} onClick={() => setTab('accounts')}>👤 Tài khoản ({accounts.length})</button>
        <button className={`up-tab${tab==='dept'?' up-tab--on':''}`} onClick={() => setTab('dept')}>🏢 Phòng ban ({departments.length})</button>
        <button className={`up-tab${tab==='project'?' up-tab--on':''}`} onClick={() => setTab('project')}>📁 Dự án ({projects.length})</button>
      </div>

      {/* ── Tab: Tài khoản ── */}
      {tab === 'accounts' && (
        <div style={{ background:'#fff', border:'1px solid var(--border2)', borderRadius:12, overflow:'hidden' }}>
          {loading ? (
            <div style={{ padding:40, textAlign:'center', color:'var(--muted)' }}>Đang tải…</div>
          ) : (
            <table className="usr-table">
              <thead>
                <tr>
                  <th>Họ tên</th>
                  <th>Tài khoản</th>
                  <th>Vai trò</th>
                  <th>Phòng ban</th>
                  <th>Chức vụ</th>
                  <th>Quyền truy cập</th>
                  <th>Trạng thái</th>
                  <th>Ngày tạo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {accounts.map(u => {
                  const chips = permChips(u)
                  return (
                    <tr key={u.id}>
                      <td>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <Avatar name={u.full_name} size={34} />
                          <span style={{ fontWeight:600, color:'var(--navy)' }}>{u.full_name}</span>
                        </div>
                      </td>
                      <td style={{ color:'var(--muted)', fontSize:12 }}>{u.username}</td>
                      <td>
                        <span className="chip" style={{ background: ROLE_COLOR[u.role].bg, color: ROLE_COLOR[u.role].color, borderColor:'transparent' }}>
                          {ROLE_LABEL[u.role]}
                        </span>
                      </td>
                      <td style={{ fontSize:12, color:'var(--navy)', fontWeight:500 }}>
                        {u.department
                          ? <span style={{ display:'inline-flex', alignItems:'center', gap:5 }}>
                              <span style={{ width:7, height:7, borderRadius:'50%', background:'#6366F1', display:'inline-block', flexShrink:0 }} />
                              {u.department}
                            </span>
                          : <span style={{ color:'var(--muted)', fontStyle:'italic' }}>—</span>}
                      </td>
                      <td>
                        {u.level
                          ? <span className="chip" style={{ background: LEVEL_COLOR[u.level].bg, color: LEVEL_COLOR[u.level].color, border:`1px solid ${LEVEL_COLOR[u.level].border}` }}>
                              {LEVEL_LABEL[u.level]}
                            </span>
                          : <span style={{ fontSize:12, color:'var(--muted)', fontStyle:'italic' }}>—</span>}
                      </td>
                      <td>
                        {u.tabs && u.tabs.length > 0
                          ? chips.map(c => (
                              <span key={c} className="chip" style={{ background:'#EFF6FF', color:'#1E40AF', borderColor:'#BFDBFE' }}>{c}</span>
                            ))
                          : <span style={{ fontSize:12, color:'var(--muted)', fontStyle:'italic' }}>Theo vai trò</span>
                        }
                      </td>
                      <td>
                        <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:12, fontWeight:600,
                          color: u.active ? '#16A34A' : '#9CA3AF' }}>
                          <span style={{ width:7, height:7, borderRadius:'50%', background: u.active ? '#22C55E' : '#D1D5DB', display:'inline-block' }} />
                          {u.active ? 'Hoạt động' : 'Vô hiệu'}
                        </span>
                      </td>
                      <td style={{ color:'var(--muted)', fontSize:12 }}>
                        {u.created_at ? new Date(u.created_at).toLocaleDateString('vi-VN') : '—'}
                      </td>
                      <td>
                        {canManage && (
                          <div style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
                            <button className="btn-act" onClick={() => setSelected(u)}>Phân quyền</button>
                            <button className={`btn-act btn-lock`} onClick={() => toggleActive(u)}>
                              {u.active ? 'Khoá' : 'Mở'}
                            </button>
                            <button className="btn-act btn-del" onClick={() => handleDelete(u)}>Xoá</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {accounts.length === 0 && (
                  <tr><td colSpan={7} style={{ textAlign:'center', padding:40, color:'var(--muted)' }}>Chưa có tài khoản nào</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Tab: Phòng ban ── */}
      {tab === 'dept' && (
        <div className="dept-wrap">
          <div className="dept-form">
            <div style={{ fontSize:13, fontWeight:700, color:'var(--navy)', marginBottom:8 }}>
              {editDept ? `Sửa: ${editDept.name}` : '+ Thêm phòng ban mới'}
            </div>
            <div className="dept-form-row">
              <div style={{ flex:1 }}>
                <label style={{ fontSize:11, fontWeight:700, color:'var(--muted)', display:'block', marginBottom:5, textTransform:'uppercase', letterSpacing:'.05em' }}>Tên phòng ban</label>
                <input className="up-s" value={deptInput} onChange={e => setDeptInput(e.target.value)}
                  placeholder="VD: Kế toán, Marketing…" onKeyDown={e => e.key==='Enter' && handleSaveDept()} />
              </div>
              <button className="up-add" style={{ height:38 }} onClick={handleSaveDept}>{editDept ? 'Cập nhật' : 'Thêm'}</button>
              {editDept && <button className="dept-btn" style={{ height:38 }} onClick={() => { setEditDept(null); setDeptInput(''); setDeptColor(DEFAULT_COLORS[0]) }}>Hủy</button>}
            </div>
            <label style={{ fontSize:11, fontWeight:700, color:'var(--muted)', display:'block', marginBottom:7, textTransform:'uppercase', letterSpacing:'.05em' }}>Màu đại diện</label>
            <div className="color-row">
              {DEFAULT_COLORS.map(c => <div key={c} className={`color-swatch${deptColor===c?' color-swatch--on':''}`} style={{ background:c }} onClick={() => setDeptColor(c)} />)}
            </div>
          </div>
          {departments.length === 0
            ? <div style={{ textAlign:'center', padding:40, color:'var(--muted)' }}>Chưa có phòng ban nào</div>
            : <div className="dept-list">
                {departments.map(d => (
                  <div key={d.id} className="dept-item">
                    <div className="dept-dot" style={{ background:d.color }} />
                    <div className="dept-name">{d.name}</div>
                    <div className="dept-actions">
                      <button className="dept-btn" onClick={() => { setEditDept(d); setDeptInput(d.name); setDeptColor(d.color) }}>Sửa</button>
                      <button className="dept-btn dept-btn--del" onClick={() => handleDeleteDept(d)}>Xóa</button>
                    </div>
                  </div>
                ))}
              </div>
          }
        </div>
      )}

      {/* ── Tab: Dự án ── */}
      {tab === 'project' && (
        <div className="dept-wrap">
          <div className="dept-form">
            <div style={{ fontSize:13, fontWeight:700, color:'var(--navy)', marginBottom:8 }}>
              {editProj ? `Sửa: ${editProj.name}` : '+ Thêm dự án mới'}
            </div>
            <div className="dept-form-row">
              <div style={{ flex:1 }}>
                <label style={{ fontSize:11, fontWeight:700, color:'var(--muted)', display:'block', marginBottom:5, textTransform:'uppercase', letterSpacing:'.05em' }}>Tên dự án</label>
                <input className="up-s" value={projInput} onChange={e => setProjInput(e.target.value)}
                  placeholder="VD: Dự án Hà Nội, Nội bộ…" onKeyDown={e => e.key==='Enter' && handleSaveProj()} />
              </div>
              <button className="up-add" style={{ height:38 }} onClick={handleSaveProj}>{editProj ? 'Cập nhật' : 'Thêm'}</button>
              {editProj && <button className="dept-btn" style={{ height:38 }} onClick={() => { setEditProj(null); setProjInput(''); setProjColor(DEFAULT_PROJECT_COLORS[0]) }}>Hủy</button>}
            </div>
            <label style={{ fontSize:11, fontWeight:700, color:'var(--muted)', display:'block', marginBottom:7, textTransform:'uppercase', letterSpacing:'.05em' }}>Màu đại diện</label>
            <div className="color-row">
              {DEFAULT_PROJECT_COLORS.map(c => <div key={c} className={`color-swatch${projColor===c?' color-swatch--on':''}`} style={{ background:c }} onClick={() => setProjColor(c)} />)}
            </div>
          </div>
          {projects.length === 0
            ? <div style={{ textAlign:'center', padding:40, color:'var(--muted)' }}>Chưa có dự án nào</div>
            : <div className="dept-list">
                {projects.map(p => (
                  <div key={p.id} className="dept-item">
                    <div className="dept-dot" style={{ background:p.color }} />
                    <div className="dept-name">{p.name}</div>
                    <div className="dept-actions">
                      <button className="dept-btn" onClick={() => { setEditProj(p); setProjInput(p.name); setProjColor(p.color) }}>Sửa</button>
                      <button className="dept-btn dept-btn--del" onClick={() => handleDeleteProj(p)}>Xóa</button>
                    </div>
                  </div>
                ))}
              </div>
          }
        </div>
      )}

      {/* Perm modal */}
      {selected !== null && (
        <PermModal
          user={selected === 'new' ? null : selected}
          departments={departments}
          onClose={() => setSelected(null)}
          onSaved={loadAccounts}
        />
      )}
    </div>
  )
}
