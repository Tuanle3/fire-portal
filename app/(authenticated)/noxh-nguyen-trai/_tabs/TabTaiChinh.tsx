'use client'
import { useState, useEffect, useRef } from 'react'
import { fetchNoxhTable } from '@/lib/noxhData'
import { Project, UnitKey, UNITS } from '../_lib/types'

export function TabTaiChinh({ p, donVi='ty' }: { p: Project; donVi?: 'ty'|'trieu'|'dong' }) {
  const lineRef  = useRef<HTMLCanvasElement>(null)
  const chartInst= useRef<any>(null)
  const [vonVay,    setVonVay]    = useState<any[]>([])
  const [lienDanh,  setLienDanh]  = useState<any[]>([])
  const [loadTC,    setLoadTC]    = useState(true)
  const [tabVV,     setTabVV]     = useState<'all'|'giai-ngan'|'cho-duyet'>('all')
  const [thanhToan, setThanhToan] = useState<any[]>([])
  const [congNoThu, setCongNoThu] = useState<any[]>([])
  const [filterYear,setFilterYear]= useState(2026)
  const [nhomView,  setNhomView]  = useState<'thu'|'chi'>('thu')
  // Đồng bộ đơn vị theo toggle Tỷ/Triệu/Đồng ở topbar (donVi) — không dùng toggle riêng nữa
  const unitKey: UnitKey = donVi
  const unit = UNITS.find(u => u.key === unitKey)!

  useEffect(() => {
    Promise.all([
      fetchNoxhTable(`${p.prefix}_Von_Vay`),
      fetchNoxhTable(`${p.prefix}_Lien_Danh`),
      fetchNoxhTable(`${p.prefix}_Thanh_Toan_NT`),
      fetchNoxhTable(`${p.prefix}_Cong_No_Thu`),
    ]).then(([r1, r2, r3, r4]) => {
      setVonVay(r1.data ?? [])
      setLienDanh(r2.data ?? [])
      setThanhToan(r3.data ?? [])
      setCongNoThu(r4.data ?? [])
      setLoadTC(false)
    })
  }, [])

  // build chart after data loads — uses Firestore-derived monthly totals
  useEffect(() => {
    if (!lineRef.current) return
    const build = () => {
      const Chart = (window as any).Chart
      if (!Chart || !lineRef.current) return
      chartInst.current?.destroy()
      const ctx = lineRef.current.getContext('2d')!

      // ── compute per-month totals from raw state (mirrors table aggregation) ──
      const _parseMY = (d: string) => {
        if (!d || d==='NULL'||d==='EMPTY') return null
        const a=d.match(/^(\d{4})-(\d{2})/); if(a) return {y:+a[1],m:+a[2]}
        const b=d.match(/(\d{2})\/(\d{2})\/(\d{4})/); if(b) return {y:+b[3],m:+b[2]}
        return null
      }
      const _fk = (r: any, ...ps: string[]) => {
        for(const p of ps){if(r[p]!==undefined)return r[p]}
        for(const p of ps){const f=Object.keys(r).find(k=>k.toLowerCase().startsWith(p.toLowerCase()));if(f!==undefined)return r[f]}
        return null
      }
      const thuM = new Map<string,number>(), chiM = new Map<string,number>()
      const addM = (map: Map<string,number>, k: string, v: number) => map.set(k,(map.get(k)||0)+v)

      lienDanh.forEach(r=>{
        const my=_parseMY(String(r['ngay_chuyen_tien']??'')); if(!my) return
        const raw=_fk(r,'so_tien_gop_thuc_te','so_tien_gop_thu_te'); if(!raw) return
        const v=Number(raw)>=1000?Number(raw)/1e9:Number(raw); if(v<=0) return
        addM(thuM,`${my.y}-${String(my.m).padStart(2,'0')}`,v)
      })
      vonVay.forEach(r=>{
        const my=_parseMY(String(_fk(r,'ngay_ngan_hang_gn','ngay_giai_ngan','ngay_gn')??'')); if(!my) return
        const raw=_fk(r,'so_tien_thuc_nhan','so_tien_thuc','so_tien_giai_ngan'); if(!raw) return
        const v=Number(raw)>=1000?Number(raw)/1e9:Number(raw); if(v<=0) return
        addM(thuM,`${my.y}-${String(my.m).padStart(2,'0')}`,v)
      })
      congNoThu.forEach(r=>{
        const my=_parseMY(String(_fk(r,'ngay_tt_thuc_te','ngay_tt')??'')); if(!my) return
        const raw=_fk(r,'so_tien_thuc_thu','so_tien_thu'); if(!raw) return
        const v=Number(raw)>=1000?Number(raw)/1e9:Number(raw); if(v<=0) return
        addM(thuM,`${my.y}-${String(my.m).padStart(2,'0')}`,v)
      })
      thanhToan.forEach(r=>{
        const my=_parseMY(String(_fk(r,'ngay_tt_thuc_te','ngay_tt_thuc','ngay_tt_th','ngay_tt')??'')); if(!my) return
        const raw=_fk(r,'so_tien_thuc_tt','so_tien_thuc','so_tien_thu','so_tien_th'); if(!raw) return
        const v=Number(raw)>=1000?Number(raw)/1e9:Number(raw); if(v<=0) return
        addM(chiM,`${my.y}-${String(my.m).padStart(2,'0')}`,v)
      })

      const keys = Array.from(new Set([...thuM.keys(),...chiM.keys()])).sort()
      const dec = unit.key==='dong'?0:2
      const labels = keys.map(k=>{ const[,m]=k.split('-'); return `T${m}/${k.slice(2,4)}` })
      const thuData = keys.map(k=>+(((thuM.get(k)||0)*unit.mult).toFixed(dec)))
      const chiData = keys.map(k=>+(((chiM.get(k)||0)*unit.mult).toFixed(dec)))

      chartInst.current = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [
            { label:'Thu', data:thuData, borderColor:'#16A34A', backgroundColor:'rgba(22,163,74,.12)', fill:true, tension:.45, pointRadius:4, pointBackgroundColor:'#16A34A', borderWidth:2 },
            { label:'Chi', data:chiData, borderColor:'#DC2626', backgroundColor:'rgba(220,38,38,.10)', fill:true, tension:.45, pointRadius:4, pointBackgroundColor:'#DC2626', borderWidth:2 },
          ],
        },
        options: {
          responsive:true, maintainAspectRatio:false,
          plugins:{
            legend:{ labels:{ font:{size:11}, color:'#6B7280', boxWidth:12, padding:16 } },
            tooltip:{ callbacks:{ label:(ctx: any) => ` ${ctx.dataset.label}: ${ctx.parsed.y?.toLocaleString('vi-VN', {minimumFractionDigits:dec, maximumFractionDigits:dec})}${unit.suffix}` } },
          },
          scales:{
            x:{grid:{display:false},ticks:{font:{size:10}}},
            y:{grid:{color:'#F0F0F0'},ticks:{font:{size:10},callback:(v: any) => unit.key==='dong'?Number(v).toLocaleString('vi-VN'):v}},
          },
        },
      })
    }
    if ((window as any).Chart) { build() } else {
      const ex = document.querySelector('script[data-chartjs]')
      if (!ex) {
        const s = document.createElement('script')
        s.src='https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js'
        s.setAttribute('data-chartjs','1'); s.onload=build; document.head.appendChild(s)
      } else { const t=setInterval(()=>{if((window as any).Chart){clearInterval(t);build()}},100) }
    }
    return () => { chartInst.current?.destroy(); chartInst.current=null }
  }, [loadTC, unitKey, vonVay, lienDanh, thanhToan, congNoThu])

  // flexible accessors
  const gv = (r: any, ...ks: string[]) => { for(const k of ks){if(r[k]!==undefined&&r[k]!==null)return r[k]}; return null }
  const getVVDot    = (r:any) => gv(r,'Đợt','dot','STT')?? '–'
  const getVVNH     = (r:any) => gv(r,'Ngân hàng','ngan_hang','Ngân Hàng')?? '–'
  const getVVNgayDN = (r:any) => gv(r,'Ngày DN','ngay_dn','Ngày ĐN')?? '–'
  const getVVNgayGN = (r:any) => gv(r,'Ngày GN','ngay_gn')?? '–'
  const getVVHanMuc = (r:any) => {
    const raw = gv(r,'han_muc_giai_ngan','Hạn mức(TỶ)','Han_muc_TY','han_muc','Hạn mức')
    if (raw === null || raw === undefined) return 0
    const n = Number(raw)
    return n >= 1000 ? n / 1e9 : n   // VND → tỷ
  }
  const getVVThucNhan=(r:any)=> {
    const raw = gv(r,'so_tien_thuc_nhan','Thực nhận(TỶ)','Thuc_nhan_TY','thuc_nhan','Thực nhận')
    if (raw === null || raw === undefined) return 0
    const n = Number(raw)
    return n >= 1000 ? n / 1e9 : n   // VND → tỷ
  }
  const getVVTiLe   = (r:any) => { const v=Number(gv(r,'Tỉ lệ','ti_le','Tỷ lệ','ty_le')??0); return v<=1&&v>0?Math.round(v*100):v }
  const getVVTienDo = (r:any) => { const v=Number(gv(r,'Tiến độ','tien_do')??0); return v<=1&&v>0?Math.round(v*100):v }
  const getVVTT     = (r:any) => gv(r,'TT','trang_thai','Trạng thái')?? '–'
  const getVVSoHD   = (r:any) => gv(r,'Số HĐ','so_hd','Số hợp đồng')?? '–'
  // column names in NOXH_NT_Lien_Danh use snake_case with VND amounts
  const getLDName   = (r:any) => gv(r,'thanh_vien_lien_danh','Thành viên','thanh_vien','Ten','ten')?? '–'
  const getLDCamKet = (r:any) => {
    const raw = gv(r,'so_tien_cam_ket')
    if (raw !== null && raw !== undefined) return Number(raw) / 1e9
    return Number(gv(r,'Cam kết','cam_ket','Cam Kết')??0)
  }
  const getLDDaGop  = (r:any) => {
    const raw = gv(r,'so_tien_gop_thuc_te','so_tien_gop_thu_te','so_tien_gop_thu')
    if (raw !== null && raw !== undefined) return Number(raw) / 1e9
    return Number(gv(r,'Đã góp','da_gop','Da Gop')??0)
  }

  const hanMuc     = vonVay.reduce((s,r)=>s+getVVHanMuc(r),0)
  const daGiaiNgan = vonVay.reduce((s,r)=>s+getVVThucNhan(r),0)
  const duNo       = daGiaiNgan
  const laiThang   = duNo>0?(duNo*0.008).toFixed(3)+' tỷ':'–'

  // group lienDanh by member name (each member has 6 đợt rows in DB)
  const ldMemberMap = new Map<string,{ck:number,dg:number}>()
  lienDanh.forEach(r => {
    const name = getLDName(r)
    const cur  = ldMemberMap.get(name) ?? {ck:0, dg:0}
    ldMemberMap.set(name, {ck: cur.ck+getLDCamKet(r), dg: cur.dg+getLDDaGop(r)})
  })
  const ldRows = lienDanh.length>0
    ? Array.from(ldMemberMap.entries()).map(([name,{ck,dg}])=>{
        const cl=Math.max(0,ck-dg), pct=ck>0?Math.round(dg/ck*100):0
        return {name, ck, dg, cl, pct}
      })
    : []   // Lien_Danh rỗng → không bịa số mẫu, để trống

  const ldCamKet  = ldRows.reduce((s,r)=>s+r.ck,0)
  const ldDaGop   = ldRows.reduce((s,r)=>s+r.dg,0)
  const ldConLai  = ldRows.reduce((s,r)=>s+r.cl,0)
  const thuBanHang = 0
  const thuGopVon  = ldDaGop
  const tongThu    = thuBanHang+thuGopVon
  // Cơ cấu chi: phân loại theo cột ghi_chu ("Chi nhà thầu" / "Chi trả NCC" / "Chi hoạt động")
  const _toTy=(raw:any)=>{const n=Number(raw??0);return isNaN(n)?0:(n>=1000?n/1e9:n)}
  const _chi =(r:any)=>_toTy(r['so_tien_thuc_tt']??r['so_tien_thuc']??r['so_tien_thu']??r['so_tien_th'])
  const _loai=(r:any)=>String(r['ghi_chu']??'').toLowerCase()
  const chiNT =thanhToan.filter(r=>{const l=_loai(r);return !l.includes('ncc')&&!l.includes('hoạt động')}).reduce((s,r)=>s+_chi(r),0)
  const chiNCC=thanhToan.filter(r=>_loai(r).includes('ncc')).reduce((s,r)=>s+_chi(r),0)
  const chiHD =thanhToan.filter(r=>_loai(r).includes('hoạt động')).reduce((s,r)=>s+_chi(r),0)
  const tongChi    = chiNT+chiNCC+chiHD
  const dongTien   = tongThu-tongChi
  const fmtU  = (v: number) => {
    if (v === 0) return '0'
    const scaled = v * unit.mult
    if (unit.key === 'dong') return scaled.toLocaleString('vi-VN') + unit.suffix
    return scaled.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + unit.suffix
  }
  const fmt = fmtU  // alias kept for existing call sites

  // ── Monthly aggregation helpers ────────────────────────────────────────────
  const parseMY = (d: string): {m:number,y:number}|null => {
    if (!d || d === 'NULL' || d === 'EMPTY') return null
    const a = d.match(/^(\d{4})-(\d{2})/)
    if (a) return {y:+a[1], m:+a[2]}
    const b = d.match(/(\d{2})\/(\d{2})\/(\d{4})/)
    if (b) return {y:+b[3], m:+b[2]}
    return null
  }
  // Dynamic key finder — handles truncated column names
  const findKey = (r: any, ...prefixes: string[]) => {
    for (const p of prefixes) {
      if (r[p] !== undefined) return r[p]
    }
    for (const p of prefixes) {
      const found = Object.keys(r).find(k => k.toLowerCase().startsWith(p.toLowerCase()))
      if (found !== undefined) return r[found]
    }
    return null
  }

  // NOXH_NT_Thanh_Toan_NT: so_tien_thuc_tt (VND), ngay_tt_thuc_te (date), ghi_chu (nhóm)
  const getThucChi = (r: any) => {
    const raw = findKey(r, 'so_tien_thuc_tt', 'so_tien_thuc', 'so_tien_thu', 'so_tien_th')
    if (raw === null || raw === undefined) return 0
    const n = Number(raw)
    return n >= 1000 ? n / 1e9 : n
  }
  const getNgayChi  = (r: any) => String(findKey(r, 'ngay_tt_thuc_te', 'ngay_tt_thuc', 'ngay_tt_th', 'ngay_tt') ?? '')
  const getGhiChu   = (r: any) => String(r['ghi_chu'] ?? r['Ghi chú'] ?? '').trim()

  // NOXH_NT_Cong_No_Thu: so_tien_thuc_thu (VND), ngay_tt_thuc_te (date)
  const getThuCN    = (r: any) => {
    const raw = r['so_tien_thuc_thu'] ?? r['so_tien_thu'] ?? null
    if (raw === null || raw === undefined) return 0
    const n = Number(raw)
    return n >= 1000 ? n / 1e9 : n
  }
  const getNgayCN   = (r: any) => String(r['ngay_tt_thuc_te'] ?? r['ngay_tt'] ?? '')

  // Thu per month: Map<"YYYY-MM", Map<nhom, tỷ>>
  const thuByMonth = new Map<string, Map<string,number>>()
  const addThu = (k: string, nhom: string, v: number) => {
    if (!thuByMonth.has(k)) thuByMonth.set(k, new Map())
    thuByMonth.get(k)!.set(nhom, (thuByMonth.get(k)!.get(nhom)||0) + v)
  }
  // 1. Thu góp vốn — lienDanh: ngay_chuyen_tien, so_tien_gop_thuc_te (VND→tỷ via getLDDaGop)
  lienDanh.forEach(r => {
    const my = parseMY(String(r['ngay_chuyen_tien'] ?? ''))
    if (!my) return
    const v = getLDDaGop(r)
    if (v <= 0) return
    const k = `${my.y}-${String(my.m).padStart(2,'0')}`
    addThu(k, getLDName(r), v)
  })
  // 2. Thu từ vay — vonVay: ngay_ngan_hang_gn, so_tien_thuc_nhan (VND→tỷ)
  vonVay.forEach(r => {
    const dateRaw = findKey(r, 'ngay_ngan_hang_gn', 'ngay_giai_ngan', 'ngay_gn')
    const my = parseMY(String(dateRaw ?? ''))
    if (!my) return
    const raw = findKey(r, 'so_tien_thuc_nhan', 'so_tien_thuc', 'so_tien_giai_ngan')
    if (raw === null || raw === undefined) return
    const v = Number(raw) >= 1000 ? Number(raw)/1e9 : Number(raw)
    if (v <= 0) return
    const k = `${my.y}-${String(my.m).padStart(2,'0')}`
    addThu(k, 'Thu từ vay ngân hàng', v)
  })
  // 3. Thu bán hàng — congNoThu: ngay_tt_thuc_te, so_tien_thuc_thu (VND→tỷ)
  congNoThu.forEach(r => {
    const my = parseMY(getNgayCN(r))
    if (!my) return
    const v = getThuCN(r)
    if (v <= 0) return
    const k = `${my.y}-${String(my.m).padStart(2,'0')}`
    addThu(k, 'Thu từ bán hàng', v)
  })

  // Chi per month: Map<"YYYY-MM", Map<nhom=ghi_chu, tỷ>>
  // thanhToan: ngay_tt_thuc, so_tien_thuc (VND), ghi_chu
  const chiByMonth = new Map<string, Map<string,number>>()
  thanhToan.forEach(r => {
    const my = parseMY(getNgayChi(r))
    if (!my) return
    const v = getThucChi(r)
    if (v <= 0) return
    const k = `${my.y}-${String(my.m).padStart(2,'0')}`
    const nhom = getGhiChu(r) || 'Chi khác'
    if (!chiByMonth.has(k)) chiByMonth.set(k, new Map())
    chiByMonth.get(k)!.set(nhom, (chiByMonth.get(k)!.get(nhom)||0) + v)
  })

  // All months with data across all years
  const allMonthKeys = Array.from(new Set([...thuByMonth.keys(), ...chiByMonth.keys()])).sort()
  const availableYears = Array.from(new Set(allMonthKeys.map(k => +k.split('-')[0]))).sort()
  if (availableYears.length > 0 && !availableYears.includes(filterYear)) {
    // don't auto-set (avoid infinite render), just filter to available
  }
  const monthKeysForYear = allMonthKeys.filter(k => k.startsWith(String(filterYear)))

  // Monthly summary rows
  const monthlyRows = monthKeysForYear.map(k => {
    const tMap = thuByMonth.get(k) || new Map()
    const cMap = chiByMonth.get(k) || new Map()
    const thu  = Array.from(tMap.values()).reduce((s,v)=>s+v, 0)
    const chi  = Array.from(cMap.values()).reduce((s,v)=>s+v, 0)
    const m    = +k.split('-')[1]
    return { k, m, thu, chi, rong: thu-chi, ratio: thu>0 ? chi/thu*100 : 0 }
  })

  // All nhóm for nhóm table
  const allThuNhom = Array.from(new Set(
    Array.from(thuByMonth.values()).flatMap(m => Array.from(m.keys()))
  ))
  const allChiNhom = Array.from(new Set(
    Array.from(chiByMonth.values()).flatMap(m => Array.from(m.keys()))
  ))

  // ── Cân đối T6 kế hoạch ─────────────────────────────────────────────────────
  const fcastKey = `${filterYear}-06`
  const toTy = (n: number) => n >= 1000 ? n / 1e9 : n

  // Thu KH T6: congNoThu → so_tien_phai_thu, lọc ngay_den_han = T6
  const thuBanHangKH = congNoThu
    .filter(r => String(r['ngay_den_han'] ?? '').startsWith(fcastKey))
    .reduce((s, r) => s + toTy(Number(r['so_tien_phai_thu'] ?? 0)), 0)

  // Thu góp vốn KH T6: lienDanh → so_tien_cam_ket, lọc ngay_cam_ket_gop = T6
  const thuGopVonKH = lienDanh
    .filter(r => String(r['ngay_cam_ket_gop'] ?? '').startsWith(fcastKey))
    .reduce((s, r) => s + toTy(Number(r['so_tien_cam_ket'] ?? 0)), 0)

  // Thu vay KH T6: vonVay → han_muc_giai_ngan, lọc ngay_de_nghi_gn = T6
  const thuVayKH = vonVay
    .filter(r => String(r['ngay_de_nghi_gn'] ?? '').startsWith(fcastKey))
    .reduce((s, r) => s + toTy(Number(r['han_muc_giai_ngan'] ?? 0)), 0)

  // Chi KH T6: phiếu có ngày duyệt trong T6, CỘNG THÊM phiếu chờ duyệt chưa có ngày duyệt
  // (vd GT-021/GT-022 chưa lên lịch nhưng vẫn có thể phải chi trong kỳ).
  const chiKH = thanhToan
    .filter(r => {
      const ndc = String(r['ngay_duyet_chi'] ?? '').trim()
      const inT6 = ndc.startsWith(fcastKey)
      const chuaCoNgay = !ndc || ndc === '–'
      const chuaThanhToan = !String(r['trang_thai_tt'] ?? '').toLowerCase().includes('đã thanh toán')
      return inT6 || (chuaCoNgay && chuaThanhToan)
    })
    .reduce((s, r) => {
      const raw = findKey(r, 'gia_tri_de_nghi', 'so_tien_thuc', 'so_tien_thu', 'so_tien_th')
      return s + toTy(Number(raw ?? 0))
    }, 0)

  // Lãi vay tháng
  const laiThangKH = duNo * 0.008

  const tongThuKH = thuBanHangKH + thuGopVonKH + thuVayKH
  const tongChiKH = chiKH + laiThangKH
  const cb2Net    = tongThuKH - tongChiKH

  const filteredVV = vonVay.filter(r=>{
    if(tabVV==='giai-ngan') return getVVThucNhan(r)>0
    if(tabVV==='cho-duyet') return getVVTT(r)==='Chờ duyệt'
    return true
  })

  return (
    <div className={donVi==='dong' ? 'fin-dong' : undefined}>
      <style>{`
        /* Khi đơn vị = Đồng: số rất dài → nowrap + thu nhỏ font cho khỏi xuống dòng */
        .fin-dong .legal-table td, .fin-dong .mb-table td,
        .fin-dong .dt2-row span, .fin-dong .dt2-tot span,
        .fin-dong .cb2-row span, .fin-dong .tc2-val { white-space:nowrap; }
        .fin-dong .legal-table td, .fin-dong .mb-table td { font-size:11px; }
        .fin-dong .tc2-val { font-size:17px; }
        .fin-dong .dt2-row span, .fin-dong .dt2-tot span, .fin-dong .cb2-row span { font-size:11.5px; }
        .tc2-kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px}
        .tc2-card{background:#fff;border-radius:12px;overflow:hidden;border:1px solid #E0E7F0}
        .tc2-ch{padding:9px 14px;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;border-bottom:1px solid}
        .tc2-cb{padding:10px 14px 12px}
        .tc2-val{font-size:22px;font-weight:800;line-height:1.1}
        .tc2-sub{font-size:11px;color:#6B7280;margin-top:3px}
        .tc2-row2{display:grid;grid-template-columns:2fr 1fr;gap:12px;margin-bottom:12px}
        .tc2-row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px}
        .tc2-panel{background:#fff;border:1px solid #E0E7F0;border-radius:12px;overflow:hidden}
        .tc2-ph{padding:10px 14px;background:#EEF3FA;border-bottom:.5px solid #D0DCE8;font-size:11px;font-weight:700;letter-spacing:.07em;color:#4B6A8A;text-transform:uppercase;display:flex;align-items:center;justify-content:space-between}
        .tc2-pb{padding:12px 14px}
        .dt2-row{display:flex;justify-content:space-between;padding:6px 0;font-size:13px;border-bottom:.5px solid #F3F6FB}
        .dt2-row:last-child{border-bottom:none}
        .dt2-tot{display:flex;justify-content:space-between;padding:7px 0;font-size:13.5px;font-weight:700;border-top:1.5px solid #E0E7F0;margin-top:4px}
        .dt2-net{display:flex;justify-content:space-between;padding:8px 12px;border-radius:8px;font-size:14px;font-weight:800;margin-top:8px}
        .ld2-bar{height:5px;background:#EEF3FA;border-radius:3px;overflow:hidden;flex:1}
        .ld2-fill{height:100%;border-radius:3px;background:#D4A64A}
        .rec2-item{display:flex;align-items:flex-start;gap:9px;padding:8px 0;border-bottom:.5px solid #F3F6FB;font-size:13.5px;line-height:1.5}
        .rec2-item:last-child{border-bottom:none}
        .rec2-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0;margin-top:4px}
        .cb2-row{display:flex;justify-content:space-between;padding:6px 0;font-size:13px;border-bottom:.5px solid #F3F6FB}
        .cb2-row:last-child{border-bottom:none}
        .vv2-tabs{display:flex;gap:6px;margin-bottom:8px}
        .vv2-tab{padding:4px 11px;font-size:11px;font-weight:600;border-radius:6px;border:1px solid #E0E7F0;background:#fff;cursor:pointer;color:#6B7280}
        .vv2-tab.active{background:#1C3557;color:#fff;border-color:#1C3557}
        .vv2-sum{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px}
        .vv2-si{background:#F8FAFC;border:1px solid #E0E7F0;border-radius:8px;padding:7px 11px}
        .vv2-sl{font-size:10px;color:#6B7280;font-weight:600;text-transform:uppercase;letter-spacing:.05em}
        .vv2-sv{font-size:13px;font-weight:800;color:#1C3557;margin-top:2px}
        .mb-table{width:100%;border-collapse:collapse;font-size:12px}
        .mb-table th{padding:7px 12px;background:#EEF3FA;font-size:10px;font-weight:700;letter-spacing:.07em;color:#4B6A8A;text-transform:uppercase;border-bottom:1px solid #D0DCE8;white-space:nowrap}
        .mb-table th:not(:first-child){text-align:right}
        .mb-table td{padding:6px 12px;border-bottom:.5px solid #F0F4F8;color:#374151;white-space:nowrap}
        .mb-table td:not(:first-child){text-align:right;font-variant-numeric:tabular-nums}
        .mb-table tr:last-child td{border-bottom:none}
        .mb-table tfoot td{font-weight:700;background:#F8FAFC;border-top:1.5px solid #D0DCE8}
        .mb-table tr:hover td{background:#F5F8FF}
        .mb-neg{color:#DC2626}
        .mb-pos{color:#16A34A}
        .mb-muted{color:#9CA3AF}
        .yr-sel{padding:4px 10px;font-size:11px;font-weight:600;border:1px solid #D1D9E0;border-radius:6px;background:#fff;color:#374151;cursor:pointer}
        .nhom-toggle{display:inline-flex;border:1px solid #D1D9E0;border-radius:7px;overflow:hidden}
        .nhom-btn{padding:4px 14px;font-size:11px;font-weight:600;border:none;background:#fff;color:#6B7280;cursor:pointer;transition:all .15s}
        .nhom-btn.active{background:#1C3557;color:#fff}
      `}</style>

      {/* KPI */}
      <div className="tc2-kpi">
        <div className="tc2-card">
          <div className="tc2-ch" style={{background:'#EEF3FA',borderBottomColor:'#D0DCE8',color:'#4B6A8A'}}>🏦 Hạn mức vay NH</div>
          <div className="tc2-cb"><div className="tc2-val" style={{color:'#1C3557'}}>{hanMuc>0?fmtU(hanMuc):'–'}</div><div className="tc2-sub">Đã giải ngân: {fmtU(daGiaiNgan)}</div></div>
        </div>
        <div className="tc2-card">
          <div className="tc2-ch" style={{background:'#FDECEC',borderBottomColor:'#FECACA',color:'#8C1F1F'}}>📉 Dư nợ hiện tại</div>
          <div className="tc2-cb"><div className="tc2-val" style={{color:duNo>0?'#DC2626':'#374151'}}>{duNo>0?fmtU(duNo):'0'}</div><div className="tc2-sub">Lãi: {duNo>0?fmtU(duNo*0.008)+'/tháng':'–/tháng'}</div></div>
        </div>
        <div className="tc2-card">
          <div className="tc2-ch" style={{background:'#FFF4E0',borderBottomColor:'#FDE68A',color:'#8A5A12'}}>⚠️ Vốn liên danh thiếu</div>
          <div className="tc2-cb"><div className="tc2-val" style={{color:ldConLai>0?'#D97706':'#16A34A'}}>{loadTC?'…':ldConLai>0?fmtU(ldConLai):'0'}</div><div className="tc2-sub">{ldConLai>0?'Chưa đủ cam kết':'Đã đủ vốn'}</div></div>
        </div>
        <div className="tc2-card">
          <div className="tc2-ch" style={{background:'#F0FDF4',borderBottomColor:'#BBF7D0',color:'#1F6B3D'}}>📆 Trả nợ tiếp theo</div>
          <div className="tc2-cb"><div className="tc2-val" style={{color:'#374151'}}>{duNo>0?fmtU(duNo*0.25):'0'}</div><div className="tc2-sub">15/06/2026</div></div>
        </div>
      </div>

      {/* Chart + Dòng tiền */}
      <div className="tc2-row2">
        <div className="tc2-panel">
          <div className="tc2-ph">
            <span>📈 Thu / Chi theo tháng ({unit.label})<span style={{fontSize:10,color:'#9CA3AF',fontWeight:400,marginLeft:6}}>{p.thuChi.labels[0]} – {p.thuChi.labels[p.thuChi.labels.length-1]}</span></span>
          </div>
          <div className="tc2-pb" style={{height:220}}><canvas ref={lineRef}/></div>
        </div>
        <div className="tc2-panel">
          <div className="tc2-ph">🗂️ Tổng hợp dòng tiền</div>
          <div className="tc2-pb">
            <div className="dt2-row"><span style={{color:'#6B7280'}}>– Thu bán hàng</span><span>{fmt(thuBanHang)}</span></div>
            <div className="dt2-row"><span style={{color:'#6B7280'}}>– Thu góp vốn liên danh</span><span style={{color:'#1C3557',fontWeight:600}}>{fmt(thuGopVon)}</span></div>
            <div className="dt2-tot"><span>Tổng thu</span><span style={{color:'#16A34A'}}>{fmt(tongThu)}</span></div>
            <div style={{marginTop:7}}>
              <div className="dt2-row"><span style={{color:'#6B7280'}}>– Chi nhà thầu</span><span>{fmt(chiNT)}</span></div>
              <div className="dt2-row"><span style={{color:'#6B7280'}}>– Chi trả NCC</span><span>{fmt(chiNCC)}</span></div>
              <div className="dt2-row"><span style={{color:'#6B7280'}}>– Chi hoạt động</span><span>{fmt(chiHD)}</span></div>
            </div>
            <div className="dt2-tot"><span>Tổng chi</span><span style={{color:'#DC2626'}}>{fmt(tongChi)}</span></div>
            <div className="dt2-net" style={{background:dongTien>=0?'#F0FDF4':'#FDECEC',color:dongTien>=0?'#1F6B3D':'#DC2626'}}>
              <span>Dòng tiền thuần</span><span>{dongTien>=0?'+':''}{fmt(dongTien)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Góp vốn + Khuyến nghị + Cân đối */}
      <div className="tc2-row3">
        <div className="tc2-panel">
          <div className="tc2-ph">🤝 Góp vốn liên danh{ldConLai>0&&<span style={{background:'#FFF4E0',color:'#8A5A12',padding:'1px 7px',borderRadius:5,fontSize:10,fontWeight:700}}>Thiếu {fmtU(ldConLai)}</span>}</div>
          <div style={{padding:0,overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
            <table className="legal-table" style={{minWidth:440}}>
              <thead><tr><th>Thành viên</th><th style={{textAlign:'right'}}>Cam kết</th><th style={{textAlign:'right'}}>Đã góp</th><th style={{textAlign:'right'}}>Còn lại</th><th style={{textAlign:'center'}}>Tiến độ</th></tr></thead>
              <tbody>
                {ldRows.map((r,i)=>(
                  <tr key={i}>
                    <td style={{fontWeight:500,fontSize:11}}>{r.name}</td>
                    <td style={{textAlign:'right',fontWeight:700,color:'#1C3557'}}>{fmtU(r.ck)}</td>
                    <td style={{textAlign:'right',fontWeight:700,color:'#16A34A'}}>{fmtU(r.dg)}</td>
                    <td style={{textAlign:'right',fontWeight:700,color:r.cl>0?'#DC2626':'#16A34A'}}>{fmtU(r.cl)}</td>
                    <td><div style={{display:'flex',alignItems:'center',gap:4}}><div className="ld2-bar"><div className="ld2-fill" style={{width:`${r.pct}%`}}/></div><span style={{fontSize:10,fontWeight:700,color:'#B08A3E',width:24}}>{r.pct}%</span></div></td>
                  </tr>
                ))}
                <tr style={{background:'#F8FAFC'}}>
                  <td><strong>Tổng</strong></td>
                  <td style={{textAlign:'right',fontWeight:700}}>{fmtU(ldCamKet)}</td>
                  <td style={{textAlign:'right',fontWeight:700,color:'#16A34A'}}>{fmtU(ldDaGop)}</td>
                  <td style={{textAlign:'right',fontWeight:700,color:'#DC2626'}}>{fmtU(ldConLai)}</td>
                  <td/>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div className="tc2-panel">
          <div className="tc2-ph">💡 Khuyến nghị CEO / CFO</div>
          <div className="tc2-pb">
            {ldConLai>0&&<div className="rec2-item"><div className="rec2-dot" style={{background:'#DC2626'}}/><span>Đôn đốc thành viên góp nốt <strong style={{color:'#DC2626'}}>{ldConLai.toFixed(2)} tỷ</strong>.</span></div>}
            {hanMuc>0&&<div className="rec2-item"><div className="rec2-dot" style={{background:daGiaiNgan>0?'#3B82F6':'#F59E0B'}}/><span>Hạn mức NH <strong>{fmtU(hanMuc)}</strong> — đã giải ngân <strong style={{color:'#16A34A'}}>{fmtU(daGiaiNgan)}</strong> — còn lại <strong style={{color:hanMuc-daGiaiNgan>0?'#D97706':'#6B7280'}}>{fmtU(hanMuc-daGiaiNgan)}</strong>{hanMuc-daGiaiNgan>0?' chưa giải ngân.':' (đã dùng hết).'}</span></div>}
            <div className="rec2-item"><div className="rec2-dot" style={{background:'#F59E0B'}}/><span>Thu bán hàng {fmt(thuBanHang)} – chi nhà thầu {fmt(chiNT)} – chi NCC {fmt(chiNCC)}.</span></div>
            <div className="rec2-item"><div className="rec2-dot" style={{background:dongTien>=0?'#16A34A':'#DC2626'}}/><span>Dòng tiền thuần <strong style={{color:dongTien>=0?'#16A34A':'#DC2626'}}>{dongTien>=0?'+':''}{fmt(dongTien)}</strong>. {dongTien>=0?'Ổn định.':'Cần bổ sung.'}</span></div>
          </div>
        </div>
        <div className="tc2-panel">
          <div className="tc2-ph">📊 Cân đối dòng tiền T6 (kế hoạch)<span style={{background:cb2Net>=0?'#EAF6EE':'#FEE2E2',color:cb2Net>=0?'#1F6B3D':'#DC2626',padding:'2px 8px',borderRadius:5,fontSize:10,fontWeight:700}}>{cb2Net>=0?'DƯƠNG':'ÂM'}</span></div>
          <div className="tc2-pb">
            <div style={{fontSize:10,color:'#9CA3AF',marginBottom:6,fontStyle:'italic'}}>Kế hoạch tháng 6/{filterYear}</div>
            <div className="cb2-row"><span style={{color:'#6B7280'}}>Thu từ KH (đến hạn T6)</span><span style={{fontWeight:600,color:thuBanHangKH>0?'#16A34A':'#9CA3AF'}}>+{fmt(thuBanHangKH)}</span></div>
            <div className="cb2-row"><span style={{color:'#6B7280'}}>Vốn góp TVLĐ (cam kết T6)</span><span style={{fontWeight:600,color:thuGopVonKH>0?'#16A34A':'#9CA3AF'}}>+{fmt(thuGopVonKH)}</span></div>
            <div className="cb2-row"><span style={{color:'#6B7280'}}>Vay NH (đề nghị T6)</span><span style={{fontWeight:600,color:thuVayKH>0?'#16A34A':'#9CA3AF'}}>+{fmt(thuVayKH)}</span></div>
            <div className="cb2-row" style={{borderTop:'1px solid #E5EAF0',marginTop:4,paddingTop:4}}><span style={{fontWeight:600}}>Tổng thu kế hoạch</span><span style={{fontWeight:700,color:'#16A34A'}}>+{fmt(tongThuKH)}</span></div>
            <div className="cb2-row" style={{marginTop:6}}><span style={{color:'#6B7280'}}>Chi nhà thầu (duyệt T6)</span><span style={{fontWeight:600,color:'#DC2626'}}>-{fmt(chiKH)}</span></div>
            <div className="cb2-row"><span style={{color:'#6B7280'}}>Trả nợ gốc + lãi NH</span><span style={{fontWeight:600,color:laiThangKH>0?'#DC2626':'#9CA3AF'}}>-{fmt(laiThangKH)}</span></div>
            <div className="cb2-row" style={{borderTop:'1px solid #E5EAF0',marginTop:4,paddingTop:4}}><span style={{fontWeight:600}}>Tổng chi kế hoạch</span><span style={{fontWeight:700,color:'#DC2626'}}>-{fmt(tongChiKH)}</span></div>
            {/* Scenario 1: TVLĐ góp đủ */}
            <div style={{display:'flex',justifyContent:'space-between',padding:'6px 10px',borderRadius:8,background:cb2Net>=0?'#F0FDF4':'#FDECEC',color:cb2Net>=0?'#1F6B3D':'#DC2626',fontSize:12.5,fontWeight:800,marginTop:7}}>
              <span>Dòng tiền thuần (đủ TVLĐ)</span><span>{cb2Net>=0?'+':''}{fmt(cb2Net)}</span>
            </div>
            {/* Scenario 2: TVLĐ không góp */}
            {thuGopVonKH>0&&(()=>{
              const netKhongGop = cb2Net - thuGopVonKH
              return (
                <div style={{marginTop:6,border:`1.5px solid ${netKhongGop<0?'#FECACA':'#BBF7D0'}`,borderRadius:8,overflow:'hidden'}}>
                  <div style={{background:netKhongGop<0?'#FDECEC':'#F0FDF4',padding:'5px 10px',fontSize:10.5,fontWeight:700,color:netKhongGop<0?'#8C1F1F':'#1F6B3D',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span>⚠ Nếu TVLĐ <strong>không</strong> góp đủ T6</span>
                    <span style={{fontSize:13}}>{netKhongGop>=0?'+':''}{fmt(netKhongGop)}</span>
                  </div>
                  {netKhongGop<0&&(
                    <div style={{background:'#FFF4E0',padding:'4px 10px',fontSize:11,color:'#8A5A12',borderTop:'1px solid #FDE68A'}}>
                      Thiếu hụt <strong style={{color:'#DC2626'}}>{fmt(Math.abs(netKhongGop))}</strong> — cần bổ sung ngay
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        </div>
      </div>

      {/* ── Shared header: year filter + nhóm toggle ── */}
      <div style={{display:'flex',alignItems:'center',gap:10,margin:'14px 0 6px',flexWrap:'wrap'}}>
        <span style={{fontWeight:700,color:'#1C3557',fontSize:13}}>📊 Diễn biến Thu / Chi</span>
        <select className="yr-sel" value={filterYear} onChange={e=>setFilterYear(+e.target.value)}>
          {(availableYears.length>0?availableYears:[2026]).map(y=>(
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <div className="nhom-toggle" style={{marginLeft:'auto'}}>
          <button className={`nhom-btn${nhomView==='thu'?' active':''}`} onClick={()=>setNhomView('thu')}>Thu theo nhóm</button>
          <button className={`nhom-btn${nhomView==='chi'?' active':''}`} onClick={()=>setNhomView('chi')}>Chi theo nhóm</button>
        </div>
      </div>

      {/* ── Two panels side by side, equal height ── */}
      <div className="tc2-row2" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14,alignItems:'stretch'}}>

        {/* Left: Monthly summary */}
        <div className="tc2-panel" style={{margin:0,display:'flex',flexDirection:'column'}}>
          <div className="tc2-ph"><span>📅 Thu / Chi theo tháng</span></div>
          <div style={{overflowX:'auto',overflowY:'auto',flex:1,maxHeight:300}}>
            {loadTC ? (
              <div style={{padding:20,textAlign:'center',color:'#9CA3AF',fontSize:12}}>Đang tải…</div>
            ) : monthlyRows.length===0 ? (
              <div style={{padding:20,textAlign:'center',color:'#9CA3AF',fontSize:12}}>Chưa có dữ liệu cho năm {filterYear}</div>
            ) : (
              <table className="mb-table">
                <thead style={{position:'sticky',top:0,zIndex:1}}>
                  <tr>
                    <th style={{textAlign:'left'}}>Tháng</th>
                    <th>Thu</th>
                    <th>Chi</th>
                    <th>Ròng</th>
                    <th>Chi/Thu</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyRows.map(r=>(
                    <tr key={r.k}>
                      <td style={{fontWeight:600}}>T{String(r.m).padStart(2,'0')}/{String(filterYear).slice(2)}</td>
                      <td className="mb-pos">{fmtU(r.thu)}</td>
                      <td className="mb-neg">{fmtU(r.chi)}</td>
                      <td className={r.rong>=0?'mb-pos':'mb-neg'}>{r.rong>=0?'+':''}{fmtU(r.rong)}</td>
                      <td style={{color:r.ratio>100?'#DC2626':r.ratio>90?'#D97706':'#374151',fontWeight:600}}>{r.thu>0?r.ratio.toFixed(1)+'%':'–'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr>
                  <td>Tổng</td>
                  <td className="mb-pos">{fmtU(monthlyRows.reduce((s,r)=>s+r.thu,0))}</td>
                  <td className="mb-neg">{fmtU(monthlyRows.reduce((s,r)=>s+r.chi,0))}</td>
                  {(()=>{const net=monthlyRows.reduce((s,r)=>s+r.rong,0);return<td className={net>=0?'mb-pos':'mb-neg'}>{net>=0?'+':''}{fmtU(net)}</td>})()}
                  <td style={{fontWeight:700}}>
                    {(()=>{const t=monthlyRows.reduce((s,r)=>s+r.thu,0),c=monthlyRows.reduce((s,r)=>s+r.chi,0);return t>0?(c/t*100).toFixed(1)+'%':'–'})()}
                  </td>
                </tr></tfoot>
              </table>
            )}
          </div>
        </div>

        {/* Right: Nhóm × month matrix */}
        <div className="tc2-panel" style={{margin:0,display:'flex',flexDirection:'column'}}>
          <div className="tc2-ph"><span>📋 {nhomView==='thu'?'Nguồn thu':'Khoản chi'} theo nhóm</span></div>
          <div style={{overflowX:'auto',overflowY:'auto',flex:1,maxHeight:300}}>
            {loadTC ? (
              <div style={{padding:20,textAlign:'center',color:'#9CA3AF',fontSize:12}}>Đang tải…</div>
            ) : (
              <table className="mb-table">
                <thead style={{position:'sticky',top:0,zIndex:1}}>
                  <tr>
                    <th style={{textAlign:'left',minWidth:160}}>Nhóm</th>
                    {monthKeysForYear.map(k=>{
                      const m=+k.split('-')[1]
                      return <th key={k}>T{String(m).padStart(2,'0')}</th>
                    })}
                    <th style={{background:'#DDE6F0'}}>Tổng</th>
                    <th style={{background:'#DDE6F0'}}>%</th>
                  </tr>
                </thead>
                <tbody>
                  {(nhomView==='thu' ? allThuNhom : allChiNhom).map(nhom=>{
                    const byMonth = nhomView==='thu' ? thuByMonth : chiByMonth
                    const rowVals = monthKeysForYear.map(k=>(byMonth.get(k)?.get(nhom)||0))
                    const rowTotal = rowVals.reduce((s,v)=>s+v,0)
                    const grandTotal = monthKeysForYear.reduce((s,k)=>{
                      const bm = nhomView==='thu' ? thuByMonth : chiByMonth
                      return s+Array.from(bm.get(k)?.values()??[]).reduce((a,b)=>a+b,0)
                    },0)
                    if (rowTotal===0) return null
                    return (
                      <tr key={nhom}>
                        <td style={{fontWeight:500,fontSize:11}}>{nhom}</td>
                        {rowVals.map((v,i)=>(
                          <td key={i} style={{color:v>0?(nhomView==='thu'?'#16A34A':'#DC2626'):'#D1D5DB'}}>
                            {v>0?fmtU(v):'–'}
                          </td>
                        ))}
                        <td style={{fontWeight:700,background:'#F5F8FF',color:nhomView==='thu'?'#16A34A':'#DC2626'}}>{fmtU(rowTotal)}</td>
                        <td style={{background:'#F5F8FF',color:'#6B7280'}}>{grandTotal>0?(rowTotal/grandTotal*100).toFixed(1)+'%':'–'}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot><tr>
                  <td>Tổng</td>
                  {monthKeysForYear.map(k=>{
                    const bm = nhomView==='thu' ? thuByMonth : chiByMonth
                    const t = Array.from(bm.get(k)?.values()??[]).reduce((s,v)=>s+v,0)
                    return <td key={k} style={{color:nhomView==='thu'?'#16A34A':'#DC2626'}}>{t>0?fmtU(t):'–'}</td>
                  })}
                  <td style={{color:nhomView==='thu'?'#16A34A':'#DC2626'}}>
                    {fmtU(monthKeysForYear.reduce((s,k)=>{
                      const bm = nhomView==='thu' ? thuByMonth : chiByMonth
                      return s+Array.from(bm.get(k)?.values()??[]).reduce((a,b)=>a+b,0)
                    },0))}
                  </td>
                  <td>100%</td>
                </tr></tfoot>
              </table>
            )}
          </div>
        </div>

      </div>

      {/* Vốn vay table */}
      <div className="tc2-panel" style={{marginBottom:14}}>
        <div className="tc2-ph">🏦 Lịch sử giải ngân – Vốn vay</div>
        <div className="tc2-pb">
          <div className="vv2-tabs">
            {([['all','Tất cả'],['giai-ngan','Đã giải ngân'],['cho-duyet','Chờ duyệt']] as [string,string][]).map(([v,l])=>(
              <button key={v} className={`vv2-tab ${tabVV===v?'active':''}`} onClick={()=>setTabVV(v as any)}>{l}</button>
            ))}
          </div>
          <div className="vv2-sum">
            <div className="vv2-si"><div className="vv2-sl">Hạn mức NH</div><div className="vv2-sv">{hanMuc>0?fmtU(hanMuc):'–'}</div></div>
            <div className="vv2-si"><div className="vv2-sl">Đã giải ngân</div><div className="vv2-sv" style={{color:daGiaiNgan>0?'#16A34A':'#374151'}}>{fmtU(daGiaiNgan)}</div></div>
            <div className="vv2-si"><div className="vv2-sl">Còn lại</div><div className="vv2-sv" style={{color:'#D97706'}}>{fmtU(hanMuc-daGiaiNgan)}</div></div>
            <div className="vv2-si"><div className="vv2-sl">Lãi / tháng</div><div className="vv2-sv">{laiThang}</div></div>
          </div>
          {loadTC?(
            <div style={{textAlign:'center',padding:'20px',color:'#9CA3AF',fontSize:12}}>Đang tải…</div>
          ):(
            <div style={{overflowX:'auto'}}>
              <table className="legal-table">
                <thead><tr>
                  <th>Đợt</th><th>Ngân hàng</th><th>Ngày ĐN</th><th>Ngày GN</th>
                  <th style={{textAlign:'right'}}>Hạn mức ({unit.suffix.trim()})</th><th style={{textAlign:'right'}}>Thực nhận ({unit.suffix.trim()})</th>
                  <th style={{textAlign:'center'}}>Tỉ lệ</th><th style={{textAlign:'center',width:90}}>Tiến độ</th>
                  <th style={{textAlign:'center'}}>TT</th><th>Số HĐ</th>
                </tr></thead>
                <tbody>
                  {filteredVV.length===0?(
                    <tr><td colSpan={10} style={{textAlign:'center',color:'#9CA3AF',padding:'18px'}}>Không có dữ liệu</td></tr>
                  ):filteredVV.map((r,i)=>{
                    const pct=getVVTienDo(r)||getVVTiLe(r), tt=getVVTT(r)
                    const badge=tt==='Chờ duyệt'?'badge-cho-duyet':tt==='Đã giải ngân'?'badge-da-gn':'badge-neu'
                    return(
                      <tr key={i}>
                        <td><code style={{fontSize:11,background:'#EEF3FA',padding:'2px 6px',borderRadius:4}}>{getVVDot(r)}</code></td>
                        <td style={{fontWeight:500}}>{getVVNH(r)}</td>
                        <td style={{color:'#6B7280'}}>{getVVNgayDN(r)}</td>
                        <td style={{color:'#6B7280'}}>{getVVNgayGN(r)}</td>
                        <td style={{textAlign:'right',fontWeight:700,color:'#1C3557'}}>{fmtU(getVVHanMuc(r))}</td>
                        <td style={{textAlign:'right',fontWeight:700,color:getVVThucNhan(r)>0?'#16A34A':'#9CA3AF'}}>{getVVThucNhan(r)>0?fmtU(getVVThucNhan(r)):'–'}</td>
                        <td style={{textAlign:'center',color:'#6B7280'}}>{getVVTiLe(r)}%</td>
                        <td><div style={{display:'flex',alignItems:'center',gap:4}}><div className="ld2-bar"><div className="ld2-fill" style={{width:`${pct}%`}}/></div><span style={{fontSize:10,fontWeight:700,color:'#B08A3E',width:26}}>{pct}%</span></div></td>
                        <td style={{textAlign:'center'}}><span className={badge}>{tt}</span></td>
                        <td style={{color:'#6B7280',fontSize:11}}>{getVVSoHD(r)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

    </div>
  )
}
