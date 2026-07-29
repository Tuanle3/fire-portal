'use client'
import { useState, useEffect, useCallback } from 'react'
import { getDb } from '@/lib/firebase'
import { ref, get, push, remove, set } from 'firebase/database'
import { useUserSession } from '@/contexts/user-session'

// ── Defaults (dùng nếu Firebase chưa có dữ liệu) ──────────────────────────
const DEFAULT_ROOT = { name: 'TẬP ĐOÀN SƠN AN', sub: 'Hội đồng Quản trị' }

const DEFAULT_DEPTS = [
  { name: 'Ban Tổng GĐ', sub: 'Điều hành chung'       },
  { name: 'Ban CFO',     sub: 'Tài chính – Kế toán'   },
  { name: 'Ban Dự án',   sub: 'Quản lý ĐT'            },
]

const DEFAULT_COMPANIES: OrgCompany[] = [
  { key:'', code:'SADT', don_vi:'SA.ĐT', name:'Công ty cổ phần ĐTPT Đô Thị Sơn An',       sector:'PHÁT TRIỂN NOXH',                       von:150 },
  { key:'', code:'SAP',  don_vi:'SAP',   name:'Công ty cổ phần Xây dựng Sơn An Phát',      sector:'NHÀ THẦU XÂY DỰNG',                     von:150 },
  { key:'', code:'SAHS', don_vi:'SA.HS', name:'Công ty cổ phần Sơn An Hương Sơn',          sector:'BĐS THƯƠNG MẠI, HẠ TẦNG CÔNG NGHIỆP',   von:150 },
  { key:'', code:'YANA', don_vi:'YANA',  name:'Công ty cổ phần Yana Dragon Holdings',      sector:'KHU/CỤM CÔNG NGHIỆP',                   von:300 },
  { key:'', code:'SV',   don_vi:'SV',    name:'Công ty cổ phần Tư vấn Dịch vụ Sao Việt',  sector:'TƯ VẤN & DỊCH VỤ',                      von: 20 },
]

// ── Types ──────────────────────────────────────────────────────────────────
type OrgDept    = { key: string; name: string; sub: string }
type OrgCompany = { key: string; code: string; don_vi: string; name: string; sector: string; von: number }

type CoDongRow  = {
  _key: string; Don_vi: string; Cong_ty: string; Loai: string
  Chuc_vu: string; Ho_va_ten: string; So_tien: number | null; Ty_le: number | null
}
type CompanyData = {
  donVi: string; code: string; sector: string; name: string; von: number; vonKey: string | null
  shareholders: { key: string; name: string; value: number; pct: number }[]
  hdqt:         { key: string; name: string; role: string }[]
  dieuhanhArr:  { key: string; name: string; role: string }[]
}
type EditTab = 'info' | 'shareholders' | 'hdqt' | 'dieuhành'

// ── Helpers ────────────────────────────────────────────────────────────────
function fbArr<T>(val: unknown, withKey = true): (T & { key: string })[] {
  if (!val || typeof val !== 'object') return []
  if (Array.isArray(val)) return (val as T[]).filter(Boolean).map((v, i) => ({ ...(v as object), key: String(i) } as T & { key: string }))
  return Object.entries(val as Record<string, unknown>).map(([k, v]) =>
    typeof v === 'object' && v !== null ? { key: k, ...(v as object) } as T & { key: string } : null
  ).filter(Boolean) as (T & { key: string })[]
}

function toCoDong(val: unknown): CoDongRow[] {
  if (!val || typeof val !== 'object') return []
  if (Array.isArray(val)) return (val as CoDongRow[]).filter(Boolean)
  return Object.entries(val as Record<string, unknown>).map(([k, v]) =>
    typeof v === 'object' && v !== null ? { _key: k, ...(v as object) } as CoDongRow : null
  ).filter(Boolean) as CoDongRow[]
}

function buildCompanies(rows: CoDongRow[], orgCos: OrgCompany[]): CompanyData[] {
  const grouped: Record<string, CoDongRow[]> = {}
  for (const r of rows) {
    if (!grouped[r.Don_vi]) grouped[r.Don_vi] = []
    grouped[r.Don_vi].push(r)
  }
  const metaMap: Record<string, OrgCompany> = {}
  for (const c of orgCos) metaMap[c.don_vi] = c

  const order = orgCos.length ? orgCos.map(c => c.don_vi) : DEFAULT_COMPANIES.map(c => c.don_vi)
  return order.filter(dv => grouped[dv] || metaMap[dv]).map(dv => {
    const meta   = metaMap[dv] ?? DEFAULT_COMPANIES.find(c => c.don_vi === dv) ?? { code:dv, don_vi:dv, name:dv, sector:'', von:0, key:'' }
    const list   = grouped[dv] ?? []
    const metaRow = list.find(r => r.Loai === 'Meta' && r.Chuc_vu === 'Von')
    const von    = metaRow ? (metaRow.So_tien ?? 0) / 1e9 : meta.von
    return {
      donVi: dv, code: meta.code, sector: meta.sector, name: meta.name, von,
      vonKey: metaRow?._key ?? null,
      shareholders: list.filter(r => r.Loai === 'Cổ đông' && r.So_tien != null)
        .map(r => ({ key: r._key, name: r.Ho_va_ten, value: (r.So_tien??0)/1e9, pct: (r.Ty_le??0)*100 })),
      hdqt: list.filter(r => r.Loai === 'HĐQT').map(r => ({ key: r._key, name: r.Ho_va_ten, role: r.Chuc_vu })),
      dieuhanhArr: list.filter(r => r.Loai === 'Điều hành').map(r => ({ key: r._key, name: r.Ho_va_ten, role: r.Chuc_vu })),
    }
  })
}

// ── Component ──────────────────────────────────────────────────────────────
export default function EcosystemPage() {
  const { role, loading: sessLoading } = useUserSession()
  const canEdit = !sessLoading && (role === 'admin' || role === 'ceo')

  const [tab,       setTab]       = useState<'org' | 'companies'>('org')
  const [coDongRows,setCoDongRows]= useState<CoDongRow[]>([])
  const [orgDepts,  setOrgDepts]  = useState<OrgDept[]>([])
  const [orgCos,    setOrgCos]    = useState<OrgCompany[]>([])
  const [companies, setCompanies] = useState<CompanyData[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)

  // Org chart edit panel
  const [orgPanel,  setOrgPanel]  = useState<'none'|'dept'|'company'>('none')
  const [deptName,  setDeptName]  = useState('')
  const [deptSub,   setDeptSub]   = useState('')
  const [coCode,    setCoCode]    = useState('')
  const [coDonVi,   setCoDonVi]   = useState('')
  const [coName,    setCoName]    = useState('')
  const [coSector,  setCoSector]  = useState('')
  const [coVon,     setCoVon]     = useState('')
  const [orgSaving, setOrgSaving] = useState(false)
  const [orgMsg,    setOrgMsg]    = useState('')

  // Company detail modal
  const [editCo,  setEditCo]  = useState<CompanyData | null>(null)
  const [editTab, setEditTab] = useState<EditTab>('info')
  const [saving,  setSaving]  = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [fVon,    setFVon]    = useState('')
  const [shName,  setShName]  = useState('')
  const [shVal,   setShVal]   = useState('')
  const [memName, setMemName] = useState('')
  const [memRole, setMemRole] = useState('')

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const db = getDb()
      const [snapCoDong, snapDepts, snapCos] = await Promise.all([
        get(ref(db, 'Data_CoDong')),
        get(ref(db, 'Data_OrgDepts')),
        get(ref(db, 'Data_CongTy')),
      ])
      const rows    = snapCoDong.exists() ? toCoDong(snapCoDong.val())  : []
      const depts   = snapDepts.exists()  ? fbArr<OrgDept>(snapDepts.val()) : []
      const coList  = snapCos.exists()    ? fbArr<OrgCompany>(snapCos.val()) : []
      setCoDongRows(rows)
      setOrgDepts(depts.length ? depts : DEFAULT_DEPTS.map((d,i) => ({ ...d, key: String(i) })))
      setOrgCos(coList.length ? coList : DEFAULT_COMPANIES)
      setCompanies(buildCompanies(rows, coList.length ? coList : DEFAULT_COMPANIES))
    } catch (e: any) { setError(e.message) }
    setLoading(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  // ── Org chart: add dept ──────────────────────────────────────────────────
  async function addDept() {
    if (!deptName) return
    setOrgSaving(true)
    const db = getDb()
    // Nếu đang dùng default (chưa có trong Firebase), push hết defaults trước
    const snap = await get(ref(db, 'Data_OrgDepts'))
    if (!snap.exists()) {
      for (const d of DEFAULT_DEPTS) await push(ref(db, 'Data_OrgDepts'), d)
    }
    await push(ref(db, 'Data_OrgDepts'), { name: deptName, sub: deptSub })
    setDeptName(''); setDeptSub('')
    setOrgMsg('✓ Đã thêm Ban'); setOrgSaving(false)
    loadAll()
  }

  async function deleteDept(key: string) {
    if (!confirm('Xóa Ban này?')) return
    const db = getDb()
    // If using defaults, push them first
    const snap = await get(ref(db, 'Data_OrgDepts'))
    if (!snap.exists()) {
      for (const d of DEFAULT_DEPTS) await push(ref(db, 'Data_OrgDepts'), d)
      await loadAll(); return
    }
    await remove(ref(db, `Data_OrgDepts/${key}`))
    loadAll()
  }

  // ── Org chart: add company ───────────────────────────────────────────────
  async function addCompany() {
    if (!coCode || !coDonVi || !coName) return
    setOrgSaving(true)
    const db = getDb()
    const snap = await get(ref(db, 'Data_CongTy'))
    if (!snap.exists()) {
      for (const c of DEFAULT_COMPANIES) {
        if (c.don_vi) await push(ref(db, 'Data_CongTy'), { code:c.code, don_vi:c.don_vi, name:c.name, sector:c.sector, von:c.von })
      }
    }
    await push(ref(db, 'Data_CongTy'), { code: coCode.toUpperCase(), don_vi: coDonVi, name: coName, sector: coSector, von: parseFloat(coVon)||0 })
    setCoCode(''); setCoDonVi(''); setCoName(''); setCoSector(''); setCoVon('')
    setOrgMsg('✓ Đã thêm Công ty'); setOrgSaving(false)
    loadAll()
  }

  async function deleteCompany(key: string) {
    if (!confirm('Xóa công ty này khỏi sơ đồ tổ chức?')) return
    const db = getDb()
    const snap = await get(ref(db, 'Data_CongTy'))
    if (!snap.exists()) {
      for (const c of DEFAULT_COMPANIES) {
        if (c.don_vi) await push(ref(db, 'Data_CongTy'), { code:c.code, don_vi:c.don_vi, name:c.name, sector:c.sector, von:c.von })
      }
      await loadAll(); return
    }
    await remove(ref(db, `Data_CongTy/${key}`))
    loadAll()
  }

  // ── Company detail edit ──────────────────────────────────────────────────
  function openEdit(co: CompanyData) {
    setEditCo(co); setEditTab('info'); setFVon(String(co.von))
    setShName(''); setShVal(''); setMemName(''); setMemRole(''); setSaveMsg('')
  }
  function refreshEditCo(rows: CoDongRow[], cos: OrgCompany[], donVi: string) {
    const fresh = buildCompanies(rows, cos).find(c => c.donVi === donVi)
    if (fresh) setEditCo(fresh)
  }
  async function reloadAndRefresh(donVi: string) {
    const db = getDb()
    const [s1,s2] = await Promise.all([get(ref(db,'Data_CoDong')), get(ref(db,'Data_CongTy'))])
    const rows  = s1.exists() ? toCoDong(s1.val()) : []
    const coList = s2.exists() ? fbArr<OrgCompany>(s2.val()) : DEFAULT_COMPANIES
    setCoDongRows(rows); setOrgCos(coList)
    setCompanies(buildCompanies(rows, coList))
    refreshEditCo(rows, coList, donVi)
  }

  async function saveVon() {
    if (!editCo) return
    setSaving(true); setSaveMsg('')
    const db = getDb()
    if (editCo.vonKey) await remove(ref(db, `Data_CoDong/${editCo.vonKey}`))
    await push(ref(db,'Data_CoDong'), { Don_vi:editCo.donVi, Cong_ty:editCo.donVi, Loai:'Meta', Chuc_vu:'Von', Ho_va_ten:'', So_tien:parseFloat(fVon)*1e9, Ty_le:null })
    setSaving(false); setSaveMsg('✓ Đã lưu vốn điều lệ')
    reloadAndRefresh(editCo.donVi)
  }
  async function addShareholder() {
    if (!editCo || !shName || !shVal) return
    setSaving(true); setSaveMsg('')
    const valTy = parseFloat(shVal)
    await push(ref(getDb(),'Data_CoDong'), { Don_vi:editCo.donVi, Cong_ty:editCo.donVi, Loai:'Cổ đông', Chuc_vu:'', Ho_va_ten:shName, So_tien:valTy*1e9, Ty_le: editCo.von>0?valTy/editCo.von:0 })
    setShName(''); setShVal(''); setSaving(false); setSaveMsg('✓ Đã thêm cổ đông')
    reloadAndRefresh(editCo.donVi)
  }
  async function addMember(loai: 'HĐQT'|'Điều hành') {
    if (!editCo || !memName || !memRole) return
    setSaving(true); setSaveMsg('')
    await push(ref(getDb(),'Data_CoDong'), { Don_vi:editCo.donVi, Cong_ty:editCo.donVi, Loai:loai, Chuc_vu:memRole, Ho_va_ten:memName, So_tien:null, Ty_le:null })
    setMemName(''); setMemRole(''); setSaving(false); setSaveMsg(`✓ Đã thêm thành viên ${loai}`)
    reloadAndRefresh(editCo.donVi)
  }
  async function deleteRow(key: string) {
    if (!editCo || !confirm('Xóa dòng này?')) return
    setSaving(true)
    await remove(ref(getDb(), `Data_CoDong/${key}`))
    setSaving(false)
    reloadAndRefresh(editCo.donVi)
  }

  // ── Render ─────────────────────────────────────────────────────────────
  const displayDepts = orgDepts
  const displayCos   = orgCos.length ? orgCos : DEFAULT_COMPANIES

  return (
    <>
      <style>{`
        .eco-main { flex:1; padding:28px 32px; overflow-y:auto; }
        .eco-head  { margin-bottom:20px; }
        .eco-title { font-size:22px; font-weight:700; color:#1F2430; margin-bottom:4px; }
        .eco-sub   { font-size:12px; color:#9ca3af; }
        .eco-tabs { display:flex; gap:4px; margin-bottom:24px; border-bottom:1px solid #E5E0D8; }
        .eco-tab  { padding:8px 18px; font-size:12px; font-weight:500; color:#9ca3af;
          border:none; background:none; cursor:pointer; border-bottom:2px solid transparent;
          margin-bottom:-1px; font-family:inherit; display:inline-flex; align-items:center; gap:6px; transition:all .15s; }
        .eco-tab:hover:not(.active) { color:#1C3557; background:#EEF3FA; border-radius:8px 8px 0 0; }
        .eco-tab.active { color:#fff; font-weight:700; background:#1C3557; border-radius:8px 8px 0 0; border-bottom-color:#1C3557; }
        .eco-status { font-size:12px; color:#9ca3af; margin-bottom:16px; }
        .eco-error  { color:#f87171; font-size:12px; margin-bottom:16px; }

        /* ── Org chart ── */
        .org-wrap  { background:#fff; border:1px solid #E5E0D8; border-radius:14px; padding:40px 24px 30px; overflow-x:auto; }
        .org-tree  { display:flex; flex-direction:column; align-items:center; min-width:600px; }
        .org-root  { background:#1C3557; color:#fff; border-radius:10px; padding:14px 28px;
          text-align:center; font-size:13px; font-weight:700; line-height:1.4; min-width:180px; box-shadow:0 4px 12px rgba(28,53,87,.18); }
        .org-root-sub { font-size:10px; font-weight:400; color:rgba(255,255,255,.65); margin-top:2px; }
        .org-line-v { width:2px; height:32px; background:#D0DCE8; }
        .org-dept-row { display:flex; align-items:flex-start; flex-wrap:wrap; justify-content:center; }
        .org-dept-col { display:flex; flex-direction:column; align-items:center; padding:0 16px; position:relative; }
        .org-dept-col::after { content:''; position:absolute; top:0; left:0; right:0; height:2px; background:#D0DCE8; }
        .org-dept-col:first-child::after { left:50%; }
        .org-dept-col:last-child::after  { right:50%; }
        .org-dept-line { width:2px; height:24px; background:#D0DCE8; }
        .org-dept-node { background:#F5F8FC; border:1px solid #D0DCE8; border-radius:8px;
          padding:10px 16px; text-align:center; font-size:12px; font-weight:600; color:#1F2430; min-width:120px; position:relative; }
        .org-dept-sub  { font-size:10px; color:#9ca3af; margin-top:2px; font-weight:400; }
        .org-co-row  { display:flex; align-items:flex-start; flex-wrap:wrap; justify-content:center; }
        .org-co-col  { display:flex; flex-direction:column; align-items:center; padding:0 10px; position:relative; }
        .org-co-col::after { content:''; position:absolute; top:0; left:0; right:0; height:2px; background:#D0DCE8; }
        .org-co-col:first-child::after { left:50%; }
        .org-co-col:last-child::after  { right:50%; }
        .org-co-line { width:2px; height:24px; background:#D0DCE8; }
        .org-co-node { background:#F5F8FC; border:1px solid #D0DCE8; border-radius:8px;
          padding:10px 12px; text-align:center; font-size:11px; color:#374151;
          min-width:130px; max-width:170px; line-height:1.5; position:relative; }
        .org-co-label { font-size:9px; color:#9ca3af; margin-top:3px; }
        .org-del-btn  { position:absolute; top:-7px; right:-7px; width:18px; height:18px;
          border-radius:50%; background:#DC2626; color:#fff; border:none; cursor:pointer;
          font-size:10px; display:flex; align-items:center; justify-content:center; line-height:1; }
        .org-add-row { display:flex; justify-content:center; gap:10px; margin-top:20px; padding-top:16px; border-top:1px dashed #D0DCE8; }
        .org-add-btn { padding:7px 16px; border:1.5px dashed #1C3557; background:transparent;
          color:#1C3557; border-radius:8px; font-size:11.5px; font-weight:600; cursor:pointer;
          font-family:inherit; display:flex; align-items:center; gap:5px; transition:background .15s; }
        .org-add-btn:hover { background:#EEF3FA; }
        .org-panel { margin-top:20px; background:#F5F8FC; border:1px solid #D0DCE8; border-radius:12px; padding:18px 20px; }
        .org-panel-title { font-size:12px; font-weight:700; color:#1C3557; margin-bottom:14px; }
        .org-panel-row2 { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
        .org-panel-row3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; }
        .org-panel-actions { display:flex; gap:8px; margin-top:12px; align-items:center; }
        .org-msg { font-size:12px; color:#15803D; }

        /* ── Company cards ── */
        .co-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(300px,1fr)); gap:20px; }
        .co-card { background:#2A4A6B; border-radius:14px; overflow:hidden;
          box-shadow:0 4px 24px rgba(0,0,0,.18); display:flex; flex-direction:column; position:relative; }
        .co-edit-btn { position:absolute; top:12px; right:12px; background:rgba(255,255,255,.15);
          border:1px solid rgba(255,255,255,.25); color:#fff; border-radius:7px; padding:5px 10px;
          font-size:11px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:5px;
          transition:background .15s; font-family:inherit; z-index:1; }
        .co-edit-btn:hover { background:rgba(255,255,255,.28); }
        .co-card-head   { padding:20px 22px 16px; }
        .co-card-meta   { display:flex; align-items:center; gap:7px; margin-bottom:10px; }
        .co-card-code   { font-size:10px; font-weight:800; letter-spacing:.1em; color:#fff;
          background:rgba(255,255,255,.14); border-radius:5px; padding:3px 8px; }
        .co-card-sector { font-size:10px; font-weight:600; color:rgba(255,255,255,.45); letter-spacing:.04em; }
        .co-card-name   { font-size:clamp(10px,0.9vw,13.5px); font-weight:700; color:#fff;
          line-height:1.45; margin-bottom:16px; word-break:break-word; }
        .co-von { display:flex; align-items:center; gap:10px;
          background:rgba(212,166,74,.1); border:1px solid rgba(212,166,74,.3); border-radius:10px; padding:10px 14px; }
        .co-von-label { font-size:10px; font-weight:700; letter-spacing:.06em; color:rgba(255,255,255,.45); }
        .co-von-amount { margin-left:auto; display:flex; align-items:baseline; gap:4px; }
        .co-von-val { font-size:20px; color:#D4A64A; font-weight:800; }
        .co-von-unit { font-size:10px; color:rgba(212,166,74,.65); font-weight:600; }
        .co-divider { height:1px; background:rgba(255,255,255,.08); }
        .co-card-body { padding:16px 22px 22px; flex:1; }
        .co-sh-title { font-size:9.5px; font-weight:700; letter-spacing:.1em; color:rgba(255,255,255,.35); margin-bottom:12px; text-transform:uppercase; }
        .co-sh-table { width:100%; border-collapse:collapse; }
        .co-sh-table th { font-size:10px; font-weight:700; color:rgba(255,255,255,.3);
          letter-spacing:.05em; padding:0 0 10px; text-align:left; border-bottom:1px solid rgba(255,255,255,.1); }
        .co-sh-table th:not(:first-child) { text-align:right; }
        .co-sh-table td { font-size:13px; padding:10px 0 9px; border-bottom:1px solid rgba(255,255,255,.06); vertical-align:middle; }
        .co-sh-table td:not(:first-child) { text-align:right; }
        .co-sh-table tr:last-child td { border-bottom:none; }
        .co-sh-name { color:rgba(255,255,255,.75); font-size:13px; }
        .co-sh-val  { color:#fff; font-weight:700; font-size:13.5px; white-space:nowrap; }
        .co-sh-pct  { display:inline-block; border-radius:6px; padding:3px 10px; font-size:12px; font-weight:700; min-width:46px; text-align:center; }
        .co-sh-pct:not(.co-sh-pct-high) { background:rgba(255,255,255,.1); color:rgba(255,255,255,.7); }
        .co-sh-pct-high { background:rgba(212,166,74,.3); color:#D4A64A; }
        .co-gov-wrap { background:rgba(255,255,255,.08); border-top:2px solid rgba(255,255,255,.1); }
        .co-gov-grid { display:flex; flex-direction:column; }
        .co-gov-section { padding:10px 14px 10px; }
        .co-gov-section:first-child { border-bottom:1px solid rgba(255,255,255,.08); }
        .co-gov-title { font-size:8px; font-weight:700; letter-spacing:.1em; color:rgba(255,255,255,.45);
          text-transform:uppercase; margin-bottom:7px; display:flex; align-items:center; gap:4px; }
        .co-gov-title-dot { width:4px; height:4px; border-radius:50%; flex-shrink:0; }
        .co-gov-row { display:flex; align-items:baseline; justify-content:space-between;
          gap:6px; padding:3px 0; border-bottom:1px solid rgba(255,255,255,.05); }
        .co-gov-row:last-child { border-bottom:none; padding-bottom:0; }
        .co-gov-name { font-size:10.5px; font-weight:600; color:rgba(255,255,255,.75);
          white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1; min-width:0; }
        .co-gov-role { font-size:9px; color:rgba(255,255,255,.4); white-space:nowrap; flex-shrink:0; }
        .co-gov-empty { font-size:10px; color:rgba(255,255,255,.25); font-style:italic; }

        /* ── Modal ── */
        .eco-overlay { position:fixed; inset:0; background:rgba(0,0,0,.55); z-index:1000;
          display:flex; align-items:center; justify-content:center; padding:24px; }
        .eco-modal { background:#fff; border-radius:16px; width:100%; max-width:580px;
          max-height:90vh; display:flex; flex-direction:column; box-shadow:0 20px 60px rgba(0,0,0,.35); overflow:hidden; }
        .eco-modal-hdr { background:#1C3557; color:#fff; padding:16px 20px;
          display:flex; align-items:center; justify-content:space-between; flex-shrink:0; }
        .eco-modal-title { font-size:14px; font-weight:700; }
        .eco-modal-sub { font-size:11px; color:rgba(255,255,255,.55); margin-top:2px; }
        .eco-modal-close { background:rgba(255,255,255,.15); border:none; color:#fff;
          width:28px; height:28px; border-radius:7px; cursor:pointer; font-size:16px;
          display:flex; align-items:center; justify-content:center; font-family:inherit; }
        .eco-modal-close:hover { background:rgba(255,255,255,.28); }
        .eco-modal-tabs { display:flex; border-bottom:1px solid #E5E0D8; background:#F8F7F4; flex-shrink:0; overflow-x:auto; }
        .eco-modal-tab { padding:9px 14px; font-size:11.5px; font-weight:500; color:#6B7280; white-space:nowrap;
          border:none; background:none; cursor:pointer; border-bottom:2px solid transparent;
          margin-bottom:-1px; font-family:inherit; transition:all .15s; }
        .eco-modal-tab.active { color:#1C3557; font-weight:700; border-bottom-color:#1C3557; }
        .eco-modal-body { padding:20px; overflow-y:auto; flex:1; }
        .eco-field { margin-bottom:13px; }
        .eco-label { font-size:11px; font-weight:700; color:#374151; margin-bottom:5px; display:block; }
        .eco-input { width:100%; padding:8px 11px; border:1px solid #D1D5DB; border-radius:8px;
          font-size:13px; font-family:inherit; color:#1F2430; background:#fff; box-sizing:border-box; }
        .eco-input:focus { outline:none; border-color:#1C3557; }
        .eco-row2 { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
        .eco-btn { padding:8px 18px; border:none; border-radius:8px; font-size:12px;
          font-weight:700; cursor:pointer; font-family:inherit; transition:opacity .15s; }
        .eco-btn:disabled { opacity:.5; cursor:not-allowed; }
        .eco-btn-primary { background:#1C3557; color:#fff; }
        .eco-btn-primary:not(:disabled):hover { opacity:.85; }
        .eco-btn-danger { background:#FEF2F2; color:#DC2626; border:1px solid #FECACA; }
        .eco-btn-danger:not(:disabled):hover { background:#FEE2E2; }
        .eco-save-msg { font-size:12px; color:#15803D; margin-bottom:12px;
          background:#F0FDF4; border:1px solid #BBF7D0; border-radius:7px; padding:7px 12px; }
        .eco-list-item { display:flex; align-items:center; justify-content:space-between;
          padding:9px 12px; background:#F8F7F4; border:1px solid #E5E0D8; border-radius:8px; margin-bottom:6px; gap:8px; }
        .eco-list-name { font-size:12.5px; font-weight:600; color:#1F2430; }
        .eco-list-sub  { font-size:11px; color:#6B7280; margin-top:1px; }
        .eco-add-box { border:1.5px dashed #D0DCE8; border-radius:10px; padding:14px 16px; margin-top:14px; background:#FAFCFF; }
        .eco-add-title { font-size:11px; font-weight:700; color:#1C3557; margin-bottom:12px; }
        @media(max-width:1024px){
          .org-wrap{padding:24px 14px 20px;}
          .org-dept-col{padding:0 8px;}
          .org-dept-node{min-width:100px;padding:8px 10px;font-size:11px;}
          .org-co-col{padding:0 6px;}
          .org-co-node{min-width:110px;max-width:150px;padding:8px 10px;font-size:10px;}
          .org-root{min-width:150px;padding:12px 20px;font-size:12px;}
        }
        @media(max-width:700px){
          .eco-main{padding:16px 12px;}
          .eco-modal{max-width:100%;}
          .eco-row2{grid-template-columns:1fr;}
          .org-panel-row2,.org-panel-row3{grid-template-columns:1fr;}
        }
        @media(max-width:480px){
          .org-tree{min-width:420px;}
          .co-grid{grid-template-columns:1fr;}
        }
      `}</style>

      <div className="eco-main">
        <div className="eco-head">
          <div className="eco-title">Hệ sinh thái SAG</div>
          <div className="eco-sub">Cơ cấu tổ chức &amp; công ty thành viên</div>
        </div>

        <div className="eco-tabs">
          <button className={`eco-tab${tab==='org'?' active':''}`} onClick={() => { setTab('org'); setOrgPanel('none'); setOrgMsg('') }}>🏢 Cơ cấu tổ chức</button>
          <button className={`eco-tab${tab==='companies'?' active':''}`} onClick={() => setTab('companies')}>🏦 Công ty Thành viên</button>
        </div>

        {loading && <div className="eco-status">Đang tải dữ liệu...</div>}
        {error   && <div className="eco-error">Lỗi: {error}</div>}

        {/* ── Tab: Cơ cấu tổ chức ── */}
        {tab === 'org' && !loading && (
          <div className="org-wrap">
            <div className="org-tree">
              {/* Root */}
              <div className="org-root">{DEFAULT_ROOT.name}<div className="org-root-sub">{DEFAULT_ROOT.sub}</div></div>
              <div className="org-line-v" />

              {/* Departments */}
              <div className="org-dept-row">
                {displayDepts.map(d => (
                  <div key={d.key} className="org-dept-col">
                    <div className="org-dept-line" />
                    <div className="org-dept-node">
                      {canEdit && <button className="org-del-btn" onClick={() => deleteDept(d.key)} title="Xóa">✕</button>}
                      {d.name}
                      <div className="org-dept-sub">{d.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="org-line-v" />

              {/* Companies */}
              <div className="org-co-row">
                {displayCos.map(c => (
                  <div key={c.key || c.don_vi} className="org-co-col">
                    <div className="org-co-line" />
                    <div className="org-co-node">
                      {canEdit && c.key && <button className="org-del-btn" onClick={() => deleteCompany(c.key)} title="Xóa">✕</button>}
                      {c.name}
                      <div className="org-co-label">Công ty TV</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Add buttons */}
            {canEdit && (
              <div className="org-add-row">
                <button className="org-add-btn" onClick={() => { setOrgPanel(orgPanel==='dept'?'none':'dept'); setOrgMsg('') }}>
                  ➕ Thêm Ban
                </button>
                <button className="org-add-btn" onClick={() => { setOrgPanel(orgPanel==='company'?'none':'company'); setOrgMsg('') }}>
                  🏢 Thêm Công ty
                </button>
                {orgMsg && <span className="org-msg">{orgMsg}</span>}
              </div>
            )}

            {/* Add dept panel */}
            {canEdit && orgPanel === 'dept' && (
              <div className="org-panel">
                <div className="org-panel-title">➕ Thêm Ban mới vào sơ đồ</div>
                <div className="org-panel-row2">
                  <div className="eco-field">
                    <label className="eco-label">Tên Ban</label>
                    <input className="eco-input" value={deptName} onChange={e=>setDeptName(e.target.value)} placeholder="Ban Pháp chế"/>
                  </div>
                  <div className="eco-field">
                    <label className="eco-label">Mô tả chức năng</label>
                    <input className="eco-input" value={deptSub} onChange={e=>setDeptSub(e.target.value)} placeholder="Quản lý pháp lý"/>
                  </div>
                </div>
                <div className="org-panel-actions">
                  <button className="eco-btn eco-btn-primary" onClick={addDept} disabled={orgSaving||!deptName}>
                    {orgSaving?'Đang lưu...':'💾 Thêm Ban'}
                  </button>
                  <button className="eco-btn eco-btn-danger" onClick={() => setOrgPanel('none')}>Hủy</button>
                </div>
              </div>
            )}

            {/* Add company panel */}
            {canEdit && orgPanel === 'company' && (
              <div className="org-panel">
                <div className="org-panel-title">🏢 Thêm Công ty thành viên mới</div>
                <div className="org-panel-row3">
                  <div className="eco-field">
                    <label className="eco-label">Mã viết tắt (Don_vi)</label>
                    <input className="eco-input" value={coDonVi} onChange={e=>setCoDonVi(e.target.value)} placeholder="SA.NT"/>
                  </div>
                  <div className="eco-field">
                    <label className="eco-label">Mã code</label>
                    <input className="eco-input" value={coCode} onChange={e=>setCoCode(e.target.value)} placeholder="SANT"/>
                  </div>
                  <div className="eco-field">
                    <label className="eco-label">Vốn điều lệ (tỷ)</label>
                    <input className="eco-input" type="number" value={coVon} onChange={e=>setCoVon(e.target.value)} placeholder="100"/>
                  </div>
                </div>
                <div className="eco-field">
                  <label className="eco-label">Tên đầy đủ công ty</label>
                  <input className="eco-input" value={coName} onChange={e=>setCoName(e.target.value)} placeholder="Công ty cổ phần Sơn An Nguyễn Trãi"/>
                </div>
                <div className="eco-field">
                  <label className="eco-label">Lĩnh vực / Ngành</label>
                  <input className="eco-input" value={coSector} onChange={e=>setCoSector(e.target.value)} placeholder="PHÁT TRIỂN BẤT ĐỘNG SẢN"/>
                </div>
                <div className="org-panel-actions">
                  <button className="eco-btn eco-btn-primary" onClick={addCompany} disabled={orgSaving||!coCode||!coDonVi||!coName}>
                    {orgSaving?'Đang lưu...':'💾 Thêm Công ty'}
                  </button>
                  <button className="eco-btn eco-btn-danger" onClick={() => setOrgPanel('none')}>Hủy</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Công ty Thành viên ── */}
        {tab === 'companies' && !loading && (
          <div className="co-grid">
            {companies.map(co => (
              <div key={co.code} className="co-card">
                {canEdit && <button className="co-edit-btn" onClick={() => openEdit(co)}>✏️ Chỉnh sửa</button>}
                <div className="co-card-head">
                  <div className="co-card-meta">
                    <span className="co-card-code">{co.code}</span>
                    <span className="co-card-sector">{co.sector}</span>
                  </div>
                  <div className="co-card-name">{co.name}</div>
                  <div className="co-von">
                    <span className="co-von-label">VỐN ĐIỀU LỆ</span>
                    <div className="co-von-amount">
                      <span className="co-von-val">{co.von}</span>
                      <span className="co-von-unit">tỷ đồng</span>
                    </div>
                  </div>
                </div>
                <div className="co-divider" />
                <div className="co-card-body">
                  <div className="co-sh-title">Cơ cấu cổ đông</div>
                  <table className="co-sh-table">
                    <thead><tr><th>Cổ đông</th><th>Giá trị</th><th>Tỷ lệ</th></tr></thead>
                    <tbody>
                      {co.shareholders.length === 0
                        ? <tr><td colSpan={3} style={{color:'rgba(255,255,255,.3)',fontStyle:'italic',fontSize:12}}>Chưa có dữ liệu</td></tr>
                        : co.shareholders.map(sh => (
                          <tr key={sh.key}>
                            <td className="co-sh-name">{sh.name}</td>
                            <td className="co-sh-val">{sh.value.toLocaleString('vi-VN',{minimumFractionDigits:1,maximumFractionDigits:1})} tỷ</td>
                            <td><span className={`co-sh-pct${sh.pct>=50?' co-sh-pct-high':''}`}>
                              {sh.pct%1===0?sh.pct:sh.pct.toFixed(2).replace(/\.?0+$/,'')}%
                            </span></td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <div className="co-gov-wrap">
                  <div className="co-gov-grid">
                    <div className="co-gov-section">
                      <div className="co-gov-title"><span className="co-gov-title-dot" style={{background:'#60A5FA'}}/>Hội đồng quản trị</div>
                      {co.hdqt.length===0 ? <div className="co-gov-empty">Chưa có dữ liệu</div>
                        : co.hdqt.map(m => <div key={m.key} className="co-gov-row"><span className="co-gov-name">{m.name}</span><span className="co-gov-role">{m.role}</span></div>)}
                    </div>
                    <div className="co-gov-section">
                      <div className="co-gov-title"><span className="co-gov-title-dot" style={{background:'#34D399'}}/>Ban điều hành</div>
                      {co.dieuhanhArr.length===0 ? <div className="co-gov-empty">Chưa có dữ liệu</div>
                        : co.dieuhanhArr.map(m => <div key={m.key} className="co-gov-row"><span className="co-gov-name">{m.name}</span><span className="co-gov-role">{m.role}</span></div>)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Edit Modal ── */}
      {editCo && (
        <div className="eco-overlay" onClick={e => { if (e.target===e.currentTarget) setEditCo(null) }}>
          <div className="eco-modal">
            <div className="eco-modal-hdr">
              <div>
                <div className="eco-modal-title">✏️ Chỉnh sửa: {editCo.code}</div>
                <div className="eco-modal-sub">{editCo.name}</div>
              </div>
              <button className="eco-modal-close" onClick={() => setEditCo(null)}>✕</button>
            </div>
            <div className="eco-modal-tabs">
              {(['info','shareholders','hdqt','dieuhành'] as EditTab[]).map(t => (
                <button key={t} className={`eco-modal-tab${editTab===t?' active':''}`}
                  onClick={() => { setEditTab(t); setSaveMsg('') }}>
                  {t==='info'?'🏢 Thông tin':t==='shareholders'?'👥 Cổ đông':t==='hdqt'?'⚖️ HĐQT':'👔 Ban điều hành'}
                </button>
              ))}
            </div>
            <div className="eco-modal-body">
              {saveMsg && <div className="eco-save-msg">{saveMsg}</div>}

              {editTab==='info' && (
                <div>
                  <div className="eco-field">
                    <label className="eco-label">Vốn điều lệ (tỷ đồng)</label>
                    <input className="eco-input" type="number" value={fVon} onChange={e=>setFVon(e.target.value)} placeholder="150"/>
                  </div>
                  <button className="eco-btn eco-btn-primary" onClick={saveVon} disabled={saving}>
                    {saving?'Đang lưu...':'💾 Lưu vốn điều lệ'}
                  </button>
                </div>
              )}

              {editTab==='shareholders' && (
                <div>
                  {editCo.shareholders.length===0 && <p style={{fontSize:12,color:'#6B7280',marginBottom:10}}>Chưa có cổ đông nào.</p>}
                  {editCo.shareholders.map(sh => (
                    <div key={sh.key} className="eco-list-item">
                      <div style={{flex:1}}>
                        <div className="eco-list-name">{sh.name}</div>
                        <div className="eco-list-sub">{sh.value.toLocaleString('vi-VN',{maximumFractionDigits:1})} tỷ · {sh.pct.toFixed(2)}%</div>
                      </div>
                      <button className="eco-btn eco-btn-danger" onClick={() => deleteRow(sh.key)} disabled={saving}>Xóa</button>
                    </div>
                  ))}
                  <div className="eco-add-box">
                    <div className="eco-add-title">➕ Thêm cổ đông mới</div>
                    <div className="eco-field">
                      <label className="eco-label">Họ và tên cổ đông</label>
                      <input className="eco-input" value={shName} onChange={e=>setShName(e.target.value)} placeholder="Nguyễn Văn A"/>
                    </div>
                    <div className="eco-field">
                      <label className="eco-label">Giá trị góp vốn (tỷ đồng)</label>
                      <input className="eco-input" type="number" value={shVal} onChange={e=>setShVal(e.target.value)} placeholder="112.5"/>
                    </div>
                    {shVal && editCo.von > 0 && (
                      <div style={{fontSize:12,color:'#6B7280',marginBottom:10,padding:'6px 10px',background:'#F0F4FB',borderRadius:6}}>
                        Tỷ lệ tự tính: <strong style={{color:'#1C3557'}}>{(parseFloat(shVal)/editCo.von*100).toFixed(2)}%</strong> ({shVal} / {editCo.von} tỷ)
                      </div>
                    )}
                    <button className="eco-btn eco-btn-primary" onClick={addShareholder} disabled={saving||!shName||!shVal}>
                      {saving?'Đang lưu...':'➕ Thêm cổ đông'}
                    </button>
                  </div>
                </div>
              )}

              {editTab==='hdqt' && (
                <div>
                  {editCo.hdqt.length===0 && <p style={{fontSize:12,color:'#6B7280',marginBottom:10}}>Chưa có thành viên HĐQT.</p>}
                  {editCo.hdqt.map(m => (
                    <div key={m.key} className="eco-list-item">
                      <div style={{flex:1}}><div className="eco-list-name">{m.name}</div><div className="eco-list-sub">{m.role}</div></div>
                      <button className="eco-btn eco-btn-danger" onClick={() => deleteRow(m.key)} disabled={saving}>Xóa</button>
                    </div>
                  ))}
                  <div className="eco-add-box">
                    <div className="eco-add-title">➕ Thêm thành viên HĐQT</div>
                    <div className="eco-row2">
                      <div className="eco-field"><label className="eco-label">Họ và tên</label><input className="eco-input" value={memName} onChange={e=>setMemName(e.target.value)} placeholder="Nguyễn Văn A"/></div>
                      <div className="eco-field"><label className="eco-label">Chức vụ</label><input className="eco-input" value={memRole} onChange={e=>setMemRole(e.target.value)} placeholder="Chủ tịch HĐQT"/></div>
                    </div>
                    <button className="eco-btn eco-btn-primary" onClick={() => addMember('HĐQT')} disabled={saving||!memName||!memRole}>
                      {saving?'Đang lưu...':'➕ Thêm thành viên'}
                    </button>
                  </div>
                </div>
              )}

              {editTab==='dieuhành' && (
                <div>
                  {editCo.dieuhanhArr.length===0 && <p style={{fontSize:12,color:'#6B7280',marginBottom:10}}>Chưa có thành viên ban điều hành.</p>}
                  {editCo.dieuhanhArr.map(m => (
                    <div key={m.key} className="eco-list-item">
                      <div style={{flex:1}}><div className="eco-list-name">{m.name}</div><div className="eco-list-sub">{m.role}</div></div>
                      <button className="eco-btn eco-btn-danger" onClick={() => deleteRow(m.key)} disabled={saving}>Xóa</button>
                    </div>
                  ))}
                  <div className="eco-add-box">
                    <div className="eco-add-title">➕ Thêm thành viên Ban điều hành</div>
                    <div className="eco-row2">
                      <div className="eco-field"><label className="eco-label">Họ và tên</label><input className="eco-input" value={memName} onChange={e=>setMemName(e.target.value)} placeholder="Nguyễn Văn A"/></div>
                      <div className="eco-field"><label className="eco-label">Chức vụ</label><input className="eco-input" value={memRole} onChange={e=>setMemRole(e.target.value)} placeholder="Tổng giám đốc"/></div>
                    </div>
                    <button className="eco-btn eco-btn-primary" onClick={() => addMember('Điều hành')} disabled={saving||!memName||!memRole}>
                      {saving?'Đang lưu...':'➕ Thêm thành viên'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
