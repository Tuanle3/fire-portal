// ── Types ────────────────────────────────────────────────────────────────────
export type ProjectStatus = 'active' | 'upcoming' | 'done'
export type LegalState    = 'done' | 'proc' | 'pend'
export type FillCls       = 'fill-green' | 'fill-navy' | 'fill-red'
export type PhaseState    = 'done' | 'active' | 'pending'
export type RiskCls       = 'r2' | 'r1' | 'g1'
export type RiskTagCls    = 'tag-urgent' | 'tag-watch' | 'tag-ok'
export type DotCls        = 'dot-red' | 'dot-amber' | 'dot-green'

export interface LegalDoc   { name: string; co: string; date: string; state: LegalState }
export interface GopVon     { name: string; pct: number; camket: number; dago: number; con: number }
export interface ThiCong    { name: string; hm: string; pct: number; cls: FillCls }
export interface Risk       { n: string; t: string; d: string; tag: string; cls: RiskCls; tC: RiskTagCls }
export interface Task       { dot: DotCls; title: string; sub: string; date: string; urgent: boolean }
export interface Phase      { name: string; pct: number; state: PhaseState }
export interface Project {
  id: number; name: string; type: string; loc: string
  prefix: string   // tiền tố collection Firestore: 'NOXH_NT'
  sheetId?: string // Google Sheets ID cho tab Chứng từ
  status: ProjectStatus; statusLabel: string
  area: string; totalCap: string; totalCapNum: number; loan: string
  progress: number; startDate: string; estEnd: string; estStart?: string; lastUpdated: string
  ceoKpis: { k1:string; k1s:string; k2:string; k2s:string; k3:string; k3s:string; k4:string; k4s:string }
  thuChi: { labels: string[]; thu: number[]; giaiNgan: number[]; chiTC: number[] }
  donut:  { labels: string[]; vals: number[]; colors: string[] }
  thiCong: ThiCong[]; tcAlert: string
  gopVon: GopVon[]; gvAlert: string
  risks: Risk[]; riskMeta: string
  alerts: string[]; tasks: Task[]
  legal: LegalDoc[]; phases: Phase[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────
export const STATUS_CLS: Record<ProjectStatus, string> = { active:'badge-active', upcoming:'badge-upcoming', done:'badge-done' }
export const LEGAL_LABEL: Record<LegalState, string>   = { done:'Đã có / Đã cấp', proc:'Đang xử lý', pend:'Chưa nộp' }
export const LEGAL_CLS: Record<LegalState, string>     = { done:'badge-done', proc:'badge-active', pend:'badge-upcoming' }
export const PHASE_ICON: Record<PhaseState, string>    = { done:'✓', active:'▶', pending:'○' }
export const RISK_CLS: Record<RiskCls, string>         = { r2:'risk-high', r1:'risk-mid', g1:'risk-ok' }
export const RISK_TAG_CLS: Record<RiskTagCls, string>  = { 'tag-urgent':'tag-urgent', 'tag-watch':'tag-watch', 'tag-ok':'tag-ok' }

export type DetailTab = 'ceo' | 'phap-ly' | 'tai-chinh' | 'thi-cong' | 'tien-do' | 'ban-hang' | 'ke-toan' | 'chung-tu'
export const DETAIL_TABS: { id: DetailTab; label: string }[] = [
  { id:'ceo',       label:'📊 Tổng quan CEO' },
  { id:'phap-ly',   label:'📋 Pháp lý' },
  { id:'tai-chinh', label:'💰 Tài chính' },
  { id:'thi-cong',  label:'🏗️ Dự án / Thi công' },
  { id:'tien-do',   label:'📅 Tiến độ' },
  { id:'ban-hang',  label:'🏠 Bán hàng' },
  { id:'ke-toan',   label:'🧾 Kế toán' },
  { id:'chung-tu',  label:'📄 Chứng từ' },
]

export const RISK_BG: Record<RiskCls,{bg:string;border:string;dot:string}> = {
  r2: { bg:'#FDECEC', border:'#FECACA', dot:'#DC2626' },
  r1: { bg:'#FFF4E0', border:'#FDE68A', dot:'#F59E0B' },
  g1: { bg:'#F0FDF4', border:'#BBF7D0', dot:'#16A34A' },
}

// Dữ liệu CEO tab cho 6 bảng Firestore
export interface CeoData { ld:any[]; tc:any[]; vv:any[]; tt:any[]; bh:any[]; cn:any[] }

export type UnitKey = 'dong' | 'trieu' | 'ty'
export const UNITS: { key: UnitKey; label: string; mult: number; suffix: string }[] = [
  { key: 'ty',    label: 'Tỷ đồng',    mult: 1,       suffix: ' tỷ'   },
  { key: 'trieu', label: 'Triệu đồng', mult: 1000,    suffix: ' tr'   },
  { key: 'dong',  label: 'Đồng',       mult: 1e9,     suffix: ' đ'    },
]

export interface ChungTuRow { donVi:string; ngay:string; noiDung:string; soTien:number; maChungTu:string; ghiChu:string; drive:string }
export const CT_BADGE: Record<string,{bg:string;color:string}> = {
  SAHS:{bg:'#EEF2FF',color:'#3730A3'}, ĐTSA:{bg:'#FFF7ED',color:'#C2410C'}, YANA:{bg:'#ECFDF5',color:'#065F46'},
}
