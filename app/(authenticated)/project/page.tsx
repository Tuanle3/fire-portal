'use client'
import { useState, useEffect, useCallback } from 'react'
import { getDb } from '@/lib/firebase'
import { ref, get, push, set, remove } from 'firebase/database'
import { useUserSession } from '@/contexts/user-session'
import type {
  ProjectInfo, ThiCongItem, LienDanhMember, PhapLyDoc, BanHangUnit,
  ThanhToanRow, VonVayTranche, ProjectTask, Phase, ChungTuRow, ProjectUnit,
} from './_lib/types'
import {
  PREFIX, DEFAULT_INFO, DEFAULT_LIEN_DANH, DEFAULT_THI_CONG,
  DEFAULT_PHASES, DEFAULT_PHAP_LY, fmtU,
} from './_lib/types'
import TabCEO      from './_tabs/TabCEO'
import TabPhapLy   from './_tabs/TabPhapLy'
import TabTaiChinh from './_tabs/TabTaiChinh'
import TabThiCong  from './_tabs/TabThiCong'
import TabTienDo   from './_tabs/TabTienDo'
import TabBanHang  from './_tabs/TabBanHang'
import TabKeToan   from './_tabs/TabKeToan'
import TabChungTu  from './_tabs/TabChungTu'

type Tab = 'ceo'|'phap-ly'|'tai-chinh'|'thi-cong'|'tien-do'|'ban-hang'|'ke-toan'|'chung-tu'
const TABS: { key: Tab; label: string; icon: string }[] = [
  { key:'ceo',       label:'Tổng quan CEO',   icon:'🏢' },
  { key:'phap-ly',   label:'Pháp lý',         icon:'⚖️' },
  { key:'tai-chinh', label:'Tài chính',        icon:'💰' },
  { key:'thi-cong',  label:'Dự án / Thi công', icon:'🏗️' },
  { key:'tien-do',   label:'Tiến độ',          icon:'📅' },
  { key:'ban-hang',  label:'Bán hàng',         icon:'🏠' },
  { key:'ke-toan',   label:'Kế toán',          icon:'📋' },
  { key:'chung-tu',  label:'Chứng từ',         icon:'📄' },
]

function fbArr<T>(snap: unknown): (T & { key: string })[] {
  if (!snap || typeof snap !== 'object') return []
  return Object.entries(snap as Record<string, unknown>).map(([k, v]) =>
    typeof v === 'object' && v !== null ? { key: k, ...(v as object) } as T & { key: string } : null
  ).filter(Boolean) as (T & { key: string })[]
}

async function seedDefaults(db: ReturnType<typeof getDb>) {
  const seeds: [string, unknown[]][] = [
    [`${PREFIX}_ThiCong`,   DEFAULT_THI_CONG],
    [`${PREFIX}_LienDanh`,  DEFAULT_LIEN_DANH],
    [`${PREFIX}_TienDo`,    DEFAULT_PHASES],
    [`${PREFIX}_PhapLy`,    DEFAULT_PHAP_LY],
  ]
  for (const [path, items] of seeds) {
    const snap = await get(ref(db, path))
    if (!snap.exists()) {
      for (const item of items) await push(ref(db, path), item)
    }
  }
  // Info
  const infoSnap = await get(ref(db, `${PREFIX}_Info`))
  if (!infoSnap.exists()) {
    const { set } = await import('firebase/database')
    await set(ref(db, `${PREFIX}_Info`), DEFAULT_INFO)
  }
}

export default function ProjectPage() {
  const { role, loading: sessLoading } = useUserSession()
  const canEdit = !sessLoading && (role === 'admin' || role === 'ceo')

  const [tab,      setTab]      = useState<Tab>('ceo')
  const [unit,     setUnit]     = useState<ProjectUnit>('ty')
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string|null>(null)
  const [editInfo, setEditInfo] = useState(false)
  const [savingInfo, setSavingInfo] = useState(false)
  const [infoForm, setInfoForm] = useState<ProjectInfo>(DEFAULT_INFO)
  const [syncing,   setSyncing]  = useState(false)
  const [syncLog,   setSyncLog]  = useState<string[]>([])
  const [lastSync,  setLastSync] = useState<string|null>(null)

  const [info,     setInfo]     = useState<ProjectInfo>(DEFAULT_INFO)
  const [thiCong,  setThiCong]  = useState<ThiCongItem[]>([])
  const [lienDanh, setLienDanh] = useState<LienDanhMember[]>([])
  const [phapLy,   setPhapLy]   = useState<PhapLyDoc[]>([])
  const [banHang,  setBanHang]  = useState<BanHangUnit[]>([])
  const [payments, setPayments] = useState<ThanhToanRow[]>([])
  const [vonVay,   setVonVay]   = useState<VonVayTranche[]>([])
  const [tasks,    setTasks]    = useState<ProjectTask[]>([])
  const [phases,   setPhases]   = useState<Phase[]>([])
  const [chungTu,  setChungTu]  = useState<ChungTuRow[]>([])

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const db = getDb()
      await seedDefaults(db)
      const [
        infoSnap, tcSnap, ldSnap, plSnap, bhSnap, ttSnap, vvSnap, taskSnap, tdSnap, ctSnap, slSnap
      ] = await Promise.all([
        get(ref(db, `${PREFIX}_Info`)),
        get(ref(db, `${PREFIX}_ThiCong`)),
        get(ref(db, `${PREFIX}_LienDanh`)),
        get(ref(db, `${PREFIX}_PhapLy`)),
        get(ref(db, `${PREFIX}_BanHang`)),
        get(ref(db, `${PREFIX}_ThanhToan`)),
        get(ref(db, `${PREFIX}_VonVay`)),
        get(ref(db, `${PREFIX}_Tasks`)),
        get(ref(db, `${PREFIX}_TienDo`)),
        get(ref(db, `${PREFIX}_ChungTu`)),
        get(ref(db, `${PREFIX}_SyncLog`)),
      ])
      const infoVal = infoSnap.exists() ? (infoSnap.val() as ProjectInfo) : DEFAULT_INFO
      const tc      = fbArr<ThiCongItem>(tcSnap.exists()   ? tcSnap.val()   : null)
      const ld      = fbArr<LienDanhMember>(ldSnap.exists() ? ldSnap.val()   : null)

      // Compute derived info
      const treCount   = tc.filter(t => t.trang_thai === 'tre').length
      const avgPct     = tc.length ? Math.round(tc.reduce((s, t) => s + t.pct, 0) / tc.length) : infoVal.progress
      const soldUnits  = fbArr<BanHangUnit>(bhSnap.exists() ? bhSnap.val() : null).filter(u => u.trang_thai !== 'chua_ban').length
      const thucThu    = fbArr<ThanhToanRow>(ttSnap.exists() ? ttSnap.val() : null).filter(p => p.nhom.startsWith('Thu') && p.trang_thai === 'da_thanh_toan').reduce((s, p) => s + p.so_tien, 0)
      const giaiNgan   = fbArr<VonVayTranche>(vvSnap.exists() ? vvSnap.val() : null).filter(v => v.trang_thai === 'da_giai_ngan').reduce((s, v) => s + v.so_tien, 0)

      const merged: ProjectInfo = { ...infoVal, progress: avgPct, soldUnits, thucThu, giaiNgan }

      setInfo(merged)
      setInfoForm(infoVal)
      setThiCong(tc)
      setLienDanh(ld)
      setPhapLy(fbArr<PhapLyDoc>(plSnap.exists()   ? plSnap.val()   : null))
      setBanHang(fbArr<BanHangUnit>(bhSnap.exists() ? bhSnap.val()   : null))
      setPayments(fbArr<ThanhToanRow>(ttSnap.exists() ? ttSnap.val() : null))
      setVonVay(fbArr<VonVayTranche>(vvSnap.exists() ? vvSnap.val() : null))
      setTasks(fbArr<ProjectTask>(taskSnap.exists()  ? taskSnap.val() : null))
      setPhases(fbArr<Phase>(tdSnap.exists()         ? tdSnap.val()   : null))
      setChungTu(fbArr<ChungTuRow>(ctSnap.exists()   ? ctSnap.val()   : null))
      if (slSnap.exists()) setLastSync((slSnap.val() as any).last_sync ?? null)
    } catch (e: any) { setError(e.message) }
    setLoading(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  async function saveInfo() {
    setSavingInfo(true)
    await set(ref(getDb(), `${PREFIX}_Info`), infoForm)
    setSavingInfo(false); setEditInfo(false); loadAll()
  }

  async function syncFromSheet() {
    if (!confirm('Đồng bộ sẽ XÓA toàn bộ dữ liệu Firebase và nhập lại từ Google Sheet. Tiếp tục?')) return
    setSyncing(true)
    setSyncLog(['⏳ Đang tải dữ liệu từ Google Sheet...'])

    try {
      const res  = await fetch('/api/sync-noxh-sheet')
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)

      const db   = getDb()
      const log  = (msg: string) => setSyncLog(prev => [...prev, msg])
      const { thongTin, phapLy, thiCong, lienDanh, vonVay, banHang, congNo, thanhToan } = json.data

      // Helper: clear node then push all rows
      async function replaceNode(path: string, rows: object[]) {
        const snap = await get(ref(db, path))
        if (snap.exists()) {
          for (const k of Object.keys(snap.val())) await remove(ref(db, `${path}/${k}`))
        }
        for (const row of rows) await push(ref(db, path), row)
      }

      // Thông tin dự án (merge with existing)
      if (Object.keys(thongTin).length > 0) {
        const infoSnap = await get(ref(db, `${PREFIX}_Info`))
        const current  = infoSnap.exists() ? infoSnap.val() : DEFAULT_INFO
        await set(ref(db, `${PREFIX}_Info`), { ...current, ...thongTin })
        log(`✓ Thông tin dự án: cập nhật ${Object.keys(thongTin).length} trường`)
      }

      // Pháp lý
      await replaceNode(`${PREFIX}_PhapLy`, phapLy)
      log(`✓ Pháp lý: ${phapLy.length} hồ sơ`)

      // Thi công
      await replaceNode(`${PREFIX}_ThiCong`, thiCong)
      log(`✓ Thi công: ${thiCong.length} hạng mục`)

      // Liên danh
      await replaceNode(`${PREFIX}_LienDanh`, lienDanh)
      log(`✓ Liên danh: ${lienDanh.length} thành viên`)

      // Vốn vay
      await replaceNode(`${PREFIX}_VonVay`, vonVay)
      log(`✓ Vốn vay: ${vonVay.length} đợt`)

      // Bán hàng
      await replaceNode(`${PREFIX}_BanHang`, banHang)
      log(`✓ Bán hàng: ${banHang.length} căn hộ`)

      // Chứng từ Thu (từ sheet Công nợ)
      await replaceNode(`${PREFIX}_ChungTu`, congNo)
      log(`✓ Chứng từ Thu: ${congNo.length} phiếu`)

      // Thanh toán (Chi)
      await replaceNode(`${PREFIX}_ThanhToan`, thanhToan)
      log(`✓ Thanh toán Chi: ${thanhToan.length} phiếu`)

      log('🎉 Đồng bộ hoàn tất!')
      await loadAll()
    } catch (e: any) {
      setSyncLog(prev => [...prev, `❌ Lỗi: ${e.message}`])
    }
    setSyncing(false)
  }

  async function exportCSV() {
    const rows = payments.map(p => `${p.ngay||''},${p.nhom},${p.loai||''},${p.nha_thau||''},${p.so_tien},${p.trang_thai}`)
    const csv  = 'Ngày,Nhóm,Loại,Nhà thầu,Số tiền (tỷ),Trạng thái\n' + rows.join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a'); a.href = url; a.download = `NOXH_NT_BaoCao.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const treCount  = thiCong.filter(t => t.trang_thai === 'tre').length
  const gvThieu   = lienDanh.reduce((s, m) => s + Math.max(0, m.cam_ket - m.da_gop), 0)
  const choDuyet  = payments.filter(p => p.trang_thai === 'cho_duyet').length

  return (
    <>
      <style>{`
        .prj-main { flex:1; overflow-y:auto; display:flex; flex-direction:column; }
        .prj-topbar { background:#fff; border-bottom:1px solid #E5E0D8; padding:0 24px; display:flex; align-items:center; gap:0; overflow-x:auto; flex-shrink:0; }
        .prj-tab { padding:14px 16px; font-size:12px; font-weight:500; color:#9ca3af; white-space:nowrap;
          border:none; background:none; cursor:pointer; border-bottom:3px solid transparent;
          margin-bottom:-1px; font-family:inherit; display:inline-flex; align-items:center; gap:5px; transition:all .15s; }
        .prj-tab:hover:not(.active) { color:#1C3557; background:#F5F8FC; }
        .prj-tab.active { color:#1C3557; font-weight:700; border-bottom-color:#1C3557; }
        .prj-body { flex:1; padding:24px 28px; overflow-y:auto; }
        .prj-header { background:#1C3557; color:#fff; padding:18px 28px 14px; }
        .prj-breadcrumb { font-size:11px; color:rgba(255,255,255,.5); margin-bottom:4px; }
        .prj-title { font-size:22px; font-weight:800; letter-spacing:-.01em; }
        .prj-meta { display:flex; gap:16px; margin-top:8px; font-size:11px; color:rgba(255,255,255,.55); }
        .prj-actions { display:flex; gap:8px; align-items:center; }
        .prj-unit-btn { padding:5px 12px; border:1.5px solid rgba(255,255,255,.25); background:transparent; color:rgba(255,255,255,.65); border-radius:6px; font-size:11px; font-weight:600; cursor:pointer; font-family:inherit; transition:all .15s; }
        .prj-unit-btn.active { background:rgba(255,255,255,.18); color:#fff; border-color:rgba(255,255,255,.5); }
        .prj-btn-export { padding:7px 16px; background:#D4A64A; color:#1C3557; border:none; border-radius:8px; font-size:11.5px; font-weight:800; cursor:pointer; font-family:inherit; }
        .prj-btn-edit { padding:5px 12px; background:rgba(255,255,255,.15); border:1px solid rgba(255,255,255,.25); color:#fff; border-radius:7px; font-size:11px; cursor:pointer; font-family:inherit; }
        @media(max-width:900px){ .prj-body{ padding:16px 12px; } }
      `}</style>

      <div className="prj-main">
        {/* Header */}
        <div className="prj-header">
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div>
              <div className="prj-breadcrumb">Dự án › NOXH Nguyễn Trãi</div>
              <div className="prj-title">NOXH Nguyễn Trãi</div>
              <div className="prj-meta">
                <span>📍 P. Sơn Qui, Đồng Tháp</span>
                <span>📐 {info.area}</span>
                <span>💰 {fmtU(info.totalCap, unit)} VĐT</span>
                <span>📅 {info.startDate} → {info.estEnd}</span>
                {lastSync && <span title="Tự đồng bộ mỗi 30 phút từ Google Sheet">🔄 {new Date(lastSync).toLocaleString('vi-VN',{dateStyle:'short',timeStyle:'short'})}</span>}
              </div>
            </div>
            <div className="prj-actions">
              <div style={{ display:'flex', gap:4 }}>
                {(['ty','trieu','dong'] as ProjectUnit[]).map(u => (
                  <button key={u} className={`prj-unit-btn${unit===u?' active':''}`} onClick={()=>setUnit(u)}>
                    {u==='ty'?'Tỷ':u==='trieu'?'Triệu':'Đồng'}
                  </button>
                ))}
              </div>
              {canEdit && <button className="prj-btn-edit" onClick={()=>setEditInfo(e=>!e)}>⚙️ Cài đặt</button>}
              {canEdit && (
                <button className="prj-btn-export"
                  style={{ background: syncing ? '#9ca3af' : '#22C55E', color:'#fff', display:'flex', alignItems:'center', gap:6 }}
                  onClick={syncFromSheet} disabled={syncing}>
                  {syncing ? '⏳ Đang đồng bộ...' : '🔄 Đồng bộ GSheet'}
                </button>
              )}
              <button className="prj-btn-export" onClick={exportCSV}>⬇️ Xuất báo cáo</button>
            </div>
          </div>

          {/* Alert strip */}
          {(treCount > 0 || gvThieu > 0.01 || choDuyet > 0) && (
            <div style={{ display:'flex', gap:8, marginTop:10, flexWrap:'wrap' }}>
              {treCount > 0   && <Alert msg={`${treCount} hạng mục thi công đang trễ tiến độ`} />}
              {gvThieu > 0.01 && <Alert msg={`Thiếu vốn góp liên danh ${fmtU(gvThieu, unit)}`} />}
              {choDuyet > 0   && <Alert msg={`${choDuyet} phiếu thanh toán chờ duyệt`} />}
            </div>
          )}
        </div>

        {/* Settings panel */}
        {editInfo && canEdit && (
          <div style={{ background:'#FAFCFF', borderBottom:'1px solid #D0DCE8', padding:'16px 28px' }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#1C3557', marginBottom:12 }}>⚙️ Thông tin dự án</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:10 }}>
              {([
                ['Diện tích','area','text'],['VĐT (tỷ)','totalCap','number'],['Hạn mức vay (tỷ)','loan','number'],
                ['Tổng căn hộ','totalUnits','number'],['Ngày khởi công','startDate','date'],['Ngày dự kiến HT','estEnd','date'],
              ] as [string, keyof ProjectInfo, string][]).map(([label, key, type]) => (
                <div key={key}>
                  <label style={{ fontSize:11, fontWeight:700, color:'#374151', display:'block', marginBottom:4 }}>{label}</label>
                  <input style={{ width:'100%', padding:'7px 10px', border:'1px solid #D1D5DB', borderRadius:7, fontSize:12, fontFamily:'inherit', color:'#1F2430', boxSizing:'border-box' as const }}
                    type={type} value={String(infoForm[key] ?? '')}
                    onChange={e => setInfoForm(p => ({ ...p, [key]: type === 'number' ? parseFloat(e.target.value)||0 : e.target.value }))} />
                </div>
              ))}
            </div>
            <div style={{ display:'flex', gap:8, marginTop:12 }}>
              <button style={{ padding:'8px 18px', background:'#1C3557', color:'#fff', border:'none', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }} onClick={saveInfo} disabled={savingInfo}>{savingInfo?'Đang lưu...':'💾 Lưu'}</button>
              <button style={{ padding:'8px 14px', background:'transparent', color:'#6B7280', border:'1px solid #D1D5DB', borderRadius:8, fontSize:12, cursor:'pointer', fontFamily:'inherit' }} onClick={()=>setEditInfo(false)}>Hủy</button>
            </div>
          </div>
        )}

        {/* Sync log */}
        {syncLog.length > 0 && (
          <div style={{ background:'#F0FDF4', borderBottom:'1px solid #BBF7D0', padding:'12px 28px', display:'flex', gap:12, flexWrap:'wrap', alignItems:'center' }}>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', flex:1 }}>
              {syncLog.map((msg, i) => (
                <span key={i} style={{ fontSize:11.5, color: msg.startsWith('❌')?'#DC2626': msg.startsWith('🎉')?'#15803D':'#374151', fontWeight: msg.startsWith('🎉')||msg.startsWith('❌')?700:400 }}>{msg}</span>
              ))}
            </div>
            {!syncing && <button onClick={()=>setSyncLog([])} style={{ fontSize:11, color:'#6B7280', background:'none', border:'none', cursor:'pointer' }}>✕ Đóng</button>}
          </div>
        )}

        {/* Tab bar */}
        <div className="prj-topbar">
          {TABS.map(t => (
            <button key={t.key} className={`prj-tab${tab===t.key?' active':''}`} onClick={()=>setTab(t.key)}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Tab body */}
        <div className="prj-body">
          {loading && <div style={{ textAlign:'center', padding:40, color:'#9ca3af', fontSize:14 }}>⏳ Đang tải dữ liệu...</div>}
          {error   && <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:10, padding:'12px 16px', color:'#DC2626', fontSize:13 }}>❌ {error}</div>}

          {!loading && !error && (
            <>
              {tab === 'ceo'       && <TabCEO      info={info} thiCong={thiCong} lienDanh={lienDanh} payments={payments} tasks={tasks} unit={unit} />}
              {tab === 'phap-ly'   && <TabPhapLy   docs={phapLy}  canEdit={false} onReload={loadAll} unit={unit} />}
              {tab === 'tai-chinh' && <TabTaiChinh info={info} lienDanh={lienDanh} payments={payments} vonVay={vonVay} canEdit={false} onReload={loadAll} unit={unit} />}
              {tab === 'thi-cong'  && <TabThiCong  items={thiCong} canEdit={false} onReload={loadAll} unit={unit} />}
              {tab === 'tien-do'   && <TabTienDo   phases={phases} canEdit={false} onReload={loadAll} unit={unit} />}
              {tab === 'ban-hang'  && <TabBanHang  units={banHang} info={info} canEdit={false} onReload={loadAll} unit={unit} />}
              {tab === 'ke-toan'   && <TabKeToan   payments={payments} canEdit={false} onReload={loadAll} unit={unit} />}
              {tab === 'chung-tu'  && <TabChungTu  rows={chungTu} canEdit={false} onReload={loadAll} unit={unit} />}
            </>
          )}
        </div>
      </div>
    </>
  )
}

function Alert({ msg }: { msg: string }) {
  return (
    <div style={{ background:'rgba(251,191,36,.15)', border:'1px solid rgba(251,191,36,.35)', borderRadius:6, padding:'4px 12px', fontSize:11, color:'rgba(255,255,255,.8)', display:'flex', alignItems:'center', gap:5 }}>
      ⚠️ {msg}
    </div>
  )
}
