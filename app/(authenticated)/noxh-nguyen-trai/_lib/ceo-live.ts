import type { Project, Risk, Task, FillCls, CeoData } from './types'
import { fmtTyU } from './format'

// Tính toàn bộ số liệu tổng quan CEO TỪ Firestore (live). Bảng rỗng → 0/[] (không dùng số mẫu).
export function buildCeoLive(p0: Project, d: CeoData | null, donVi: 'ty'|'trieu'|'dong'): Project {
  if (!d) return p0
  const gv=(r:any,...ks:string[])=>{for(const k of ks){if(r[k]!=null&&r[k]!=='')return r[k]}return null}
  const toTy=(raw:any)=>{const n=Number(raw??0);return isNaN(n)?0:(n>=1000?n/1e9:n)}
  const M=(v:number)=>fmtTyU(v,donVi)

  // ── Góp vốn liên danh ──
  const ldMap=new Map<string,{ck:number;dg:number}>()
  d.ld.forEach(r=>{const name=String(gv(r,'thanh_vien_lien_danh','thanh_vien','ten')??'–');const ck=toTy(gv(r,'so_tien_cam_ket'));const dg=toTy(gv(r,'so_tien_gop_thuc_te','so_tien_gop_thu_te','so_tien_gop_thu'));const c=ldMap.get(name)??{ck:0,dg:0};ldMap.set(name,{ck:c.ck+ck,dg:c.dg+dg})})
  const gopVon=Array.from(ldMap.entries()).map(([name,{ck,dg}])=>({name,pct:ck>0?Math.round(dg/ck*100):0,camket:+ck.toFixed(2),dago:+dg.toFixed(2),con:+Math.max(0,ck-dg).toFixed(2)}))
  const ldConLai=gopVon.reduce((s,g)=>s+g.con,0)
  const thuGop=gopVon.reduce((s,g)=>s+g.dago,0)

  // ── Thi công ──
  const getTD=(r:any)=>{const raw=gv(r,'tien_do_percent','tien_do');if(raw!=null){const v=Number(raw);return v<=1&&v>0?Math.round(v*100):Math.round(v)}return String(gv(r,'trang_thai')??'').startsWith('Hoàn')?100:0}
  const getTre=(r:any)=>Number(gv(r,'so_ngay_tre','tre_ngay')??0)
  const tcMap=new Map<string,{tds:number[];tre:number;cnt:number}>()
  d.tc.forEach(r=>{const n=String(gv(r,'nhom_hang_muc')??'Khác');const c=tcMap.get(n)??{tds:[],tre:0,cnt:0};c.tds.push(getTD(r));if(getTre(r)>0)c.tre++;c.cnt++;tcMap.set(n,c)})
  const thiCong=Array.from(tcMap.entries()).map(([name,c])=>{const pct=c.tds.length?Math.round(c.tds.reduce((a,b)=>a+b,0)/c.tds.length):0;return {name,hm:`${c.cnt} HM${c.tre>0?` · ${c.tre} trễ`:''}`,pct,cls:(pct===100?'fill-green':pct<20?'fill-red':'fill-navy') as FillCls}})
  const allTD=d.tc.map(getTD)
  const progress=allTD.length?Math.round(allTD.reduce((a,b)=>a+b,0)/allTD.length):0
  const lateCnt=d.tc.filter(r=>getTre(r)>0).length

  // ── Vốn vay / giải ngân ──
  const hanMuc=d.vv.reduce((s,r)=>s+toTy(gv(r,'han_muc_giai_ngan','han_muc')),0)
  const daGiaiNgan=d.vv.reduce((s,r)=>s+toTy(gv(r,'so_tien_thuc_nhan','thuc_nhan')),0)

  // ── Chi (thanh toán nhà thầu) — phân loại theo cột ghi_chu ──
  const getThucChi=(r:any)=>toTy(gv(r,'so_tien_thuc_tt','so_tien_thuc','so_tien_thu','so_tien_th'))
  const getLoaiChi=(r:any)=>String(r['ghi_chu']??'').toLowerCase()
  const chiNT =d.tt.filter(r=>{const l=getLoaiChi(r);return !l.includes('ncc')&&!l.includes('hoạt động')}).reduce((s,r)=>s+getThucChi(r),0)
  const chiNCC=d.tt.filter(r=>getLoaiChi(r).includes('ncc')).reduce((s,r)=>s+getThucChi(r),0)
  const chiHD =d.tt.filter(r=>getLoaiChi(r).includes('hoạt động')).reduce((s,r)=>s+getThucChi(r),0)
  const chiNhaThau=chiNT+chiNCC+chiHD
  const pendingTT=d.tt.filter(r=>{const tt=String(gv(r,'trang_thai_tt')??'').toLowerCase();return tt&&!tt.includes('đã thanh toán')})
  const pendingAmt=pendingTT.reduce((s,r)=>s+toTy(gv(r,'gia_tri_de_nghi_tt')),0)

  // ── Bán hàng ──
  const totalCan=d.bh.length
  const isSold=(r:any)=>{const hd=gv(r,'so_hop_dong_mbb');const tt=String(gv(r,'tinh_trang_can_ho')??'');return (!!hd&&String(hd).trim()!==''&&hd!=='–')||tt.toLowerCase().includes('ký')}
  const soldCan=d.bh.filter(isSold).length
  const gtKy=d.bh.reduce((s,r)=>isSold(r)?s+toTy(gv(r,'gia_tri_hd')):s,0)

  // ── Thực thu ──
  const thucThu=d.cn.reduce((s,r)=>s+toTy(gv(r,'so_tien_thuc_thu','so_tien_thu')),0)

  // ── Thu/Chi theo tháng (T01–T06 năm hiện tại) ──
  const months=['T01','T02','T03','T04','T05','T06']
  const thu=Array(6).fill(0) as number[], chiArr=Array(6).fill(0) as number[]
  const monthOf=(s:any)=>{const a=String(s??'').match(/\d{4}-(\d{2})/);if(a)return +a[1];const b=String(s??'').match(/\d{2}\/(\d{2})\/\d{4}/);return b?+b[1]:0}
  const gnArr=Array(6).fill(0) as number[]
  d.ld.forEach(r=>{const m=monthOf(gv(r,'ngay_chuyen_tien','ngay_gop'));if(m>=1&&m<=6)thu[m-1]+=toTy(gv(r,'so_tien_gop_thuc_te','so_tien_gop_thu_te'))})
  d.vv.forEach(r=>{const m=monthOf(gv(r,'ngay_ngan_hang_gn','ngay_giai_ngan','ngay_gn'));if(m>=1&&m<=6)gnArr[m-1]+=toTy(gv(r,'so_tien_thuc_nhan','thuc_nhan'))})
  d.tt.forEach(r=>{const m=monthOf(gv(r,'ngay_tt_thuc_te','ngay_tt_thuc','ngay_tt'));if(m>=1&&m<=6)chiArr[m-1]+=getThucChi(r)})

  const ceoKpis={
    k1:`${progress}%`, k1s: lateCnt>0?`${lateCnt} hạng mục trễ`:'Đúng kế hoạch',
    k2:M(daGiaiNgan), k2s:`HM ${M(hanMuc)} · ${hanMuc>0?Math.round(daGiaiNgan/hanMuc*100):0}%`,
    k3:`${soldCan}/${totalCan}`, k3s:`Hấp thụ ${totalCan>0?Math.round(soldCan/totalCan*100):0}%`,
    k4:M(thucThu), k4s: gtKy>0?`GT ký ${M(gtKy)}`:'Thực thu',
  }
  const donut={labels:['Chi nhà thầu','Chi trả NCC','Chi hoạt động'],vals:[+chiNT.toFixed(2),+chiNCC.toFixed(2),+chiHD.toFixed(2)],colors:p0.donut.colors}

  const risks:Risk[]=[]
  d.tc.filter(r=>getTre(r)>0).sort((a,b)=>getTre(b)-getTre(a)).slice(0,2).forEach(r=>risks.push({n:'2',t:`Trễ tiến độ: ${gv(r,'ten_hang_muc','ten_goi_thau')??'hạng mục'}`,d:`${gv(r,'nha_thau_phu_trach')??''} · Trễ ${getTre(r)} ngày`,tag:'Khẩn',cls:'r2',tC:'tag-urgent'}))
  if(ldConLai>0.01)risks.push({n:'2',t:'Thiếu vốn góp liên danh',d:`Còn thiếu ${M(ldConLai)}`,tag:'Khẩn',cls:'r2',tC:'tag-urgent'})
  if(pendingTT.length>0)risks.push({n:String(pendingTT.length),t:`${pendingTT.length} phiếu TT chờ duyệt`,d:`Tổng ${M(pendingAmt)}`,tag:'Theo dõi',cls:'r1',tC:'tag-watch'})
  const highR=risks.filter(r=>r.cls==='r2').length, midR=risks.filter(r=>r.cls==='r1').length

  const tasks:Task[]=[]
  if(pendingTT.length>0)tasks.push({dot:'dot-red',title:`Duyệt ${pendingTT.length} đề nghị thanh toán nhà thầu`,sub:`Tổng ${M(pendingAmt)}`,date:'Khẩn',urgent:true})
  if(ldConLai>0.01)tasks.push({dot:'dot-amber',title:'Đốc thúc thành viên góp vốn',sub:`Còn thiếu ${M(ldConLai)}`,date:'Ưu tiên',urgent:false})
  d.tc.filter(r=>getTre(r)>0).slice(0,2).forEach(r=>tasks.push({dot:'dot-amber',title:`Xử lý trễ: ${String(gv(r,'ten_hang_muc')??'').slice(0,40)}`,sub:`Trễ ${getTre(r)} ngày`,date:'Hôm nay',urgent:false}))

  const alerts:string[]=[]
  if(lateCnt>0)alerts.push(`${lateCnt} hạng mục thi công đang trễ tiến độ`)
  if(ldConLai>0.01)alerts.push(`Thiếu vốn góp liên danh ${M(ldConLai)}`)
  if(pendingTT.length>0)alerts.push(`${pendingTT.length} phiếu thanh toán chờ duyệt · ${M(pendingAmt)}`)

  const scl=donVi==='trieu'?1000:donVi==='dong'?1e9:1
  const sc=(v:number)=>+(v*scl).toFixed(donVi==='ty'?3:0)
  return {...p0, progress, ceoKpis, donut, thuChi:{labels:months,thu:thu.map(sc),giaiNgan:gnArr.map(sc),chiTC:chiArr.map(sc)},
    thiCong, tcAlert: lateCnt>0?`${lateCnt} trễ`:'Đúng KH',
    gopVon, gvAlert: ldConLai>0?`Thiếu ${M(ldConLai)}`:'Đủ vốn',
    risks, riskMeta:`${highR} cao · ${midR} TB`, tasks, alerts}
}
