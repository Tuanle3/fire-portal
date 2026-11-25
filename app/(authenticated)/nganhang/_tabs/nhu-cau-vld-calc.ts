// Mô hình tính nhu cầu vốn lưu động (đơn vị: tỷ đồng, 1 năm = 365 ngày).
// Đặt cùng thư mục với TabNhuCauVLD.tsx: app/(authenticated)/nganhang/_tabs/

export type Mode = 'xaylap' | 'cdt'
export type Params = Record<string, number>

export interface Field { id: string; label: string; hint: string; min: number; max: number; step: number }
export interface Group { key: 'a' | 'b' | 'c' | 'd'; title: string; fields: Field[] }
export interface Row { no: number; kind: 'up' | 'dn' | 'sub' | 'base' | 'res' | 'loan'; label: string; formula: string; subst: string; value: number }
export interface Result {
  rows: Row[]
  upTotal: number   // tổng tài sản lưu động cần có
  dnTotal: number   // công nợ & ứng trước
  wc: number        // nhu cầu vốn lưu động
  loan: number      // nhu cầu vay thêm
  surplus: number   // nguồn vốn dư so với nhu cầu
  interest: number
  ccc: number | null
}
export interface SensCfg {
  rowVar: string; colVar: string; rowTitle: string; colTitle: string; colUnit: string
  rowMults: number[]; colDeltas: number[]
}
export interface Model {
  title: string; sub: string
  groups: Group[]
  sens: SensCfg
  notes: { c: 'up' | 'dn' | 'sub' | 'loan'; t: string }[]
  calc: (p: Params) => Result
}

export function fmt(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '0'
  return n.toLocaleString('vi-VN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

// Nhóm nguồn vốn dùng chung cho cả 2 mô hình
const NGUON_VON: Group = {
  key: 'd', title: 'Nguồn vốn & lãi vay',
  fields: [
    { id: 'eq',   label: 'Vốn tự có',   hint: 'Tỷ đồng dùng cho vốn lưu động', min: 0, max: 500, step: 1 },
    { id: 'debt', label: 'Vay hiện có', hint: 'Dư nợ đang vay phục vụ vốn lưu động (tỷ)', min: 0, max: 500, step: 1 },
    { id: 'rate', label: 'Lãi suất vay', hint: '%/năm', min: 0, max: 20, step: 0.1 },
    { id: 'mon',  label: 'Thời gian vay', hint: 'Tháng', min: 1, max: 60, step: 1 },
  ],
}

// Phần cuối chung: trừ vốn tự có, vay hiện có → vay thêm
function finish(p: Params, rows: Row[], upTotal: number, dnTotal: number, ccc: number | null): Result {
  const wc = upTotal - dnTotal
  const need = wc - p.eq - p.debt
  const loan = Math.max(0, need)
  const surplus = Math.max(0, -need)
  const interest = (loan * p.rate / 100) * (p.mon / 12)
  const n = rows.length
  rows.push(
    { no: n + 1, kind: 'res', label: 'Nhu cầu vốn lưu động', formula: `(${n - 2}) − (${n - 1}) hoặc TSLĐ − công nợ`, subst: `${fmt(upTotal)} − ${fmt(dnTotal)}`, value: wc },
    { no: n + 2, kind: 'base', label: 'Trừ vốn tự có', formula: 'Vốn tự có', subst: fmt(p.eq), value: p.eq },
    { no: n + 3, kind: 'base', label: 'Trừ vay hiện có', formula: 'Dư nợ vay hiện có', subst: fmt(p.debt), value: p.debt },
    { no: n + 4, kind: 'loan', label: 'Nhu cầu vay thêm', formula: `max(0; (${n + 1}) − (${n + 2}) − (${n + 3}))`, subst: `max(0; ${fmt(wc)} − ${fmt(p.eq)} − ${fmt(p.debt)})`, value: loan },
  )
  return { rows, upTotal, dnTotal, wc, loan, surplus, interest, ccc }
}

// ───────────── Công ty xây lắp ─────────────
function calcXayLap(p: Params): Result {
  const cogs = (p.rev * p.cogsPct) / 100
  const ar = (p.rev * p.dso) / 365
  const inv = (cogs * p.dio) / 365
  const wip = (cogs * p.wip) / 365
  const up = ar + inv + wip
  const ap = (cogs * p.dpo) / 365
  const adv = (p.rev * p.adv) / 100
  const dn = ap + adv
  const rows: Row[] = [
    { no: 1, kind: 'up', label: 'Phải thu khách hàng (kể cả giữ lại bảo hành)', formula: 'Doanh thu × DSO ÷ 365', subst: `${fmt(p.rev)} × ${p.dso} ÷ 365`, value: ar },
    { no: 2, kind: 'up', label: 'Tồn kho nguyên vật liệu', formula: 'Giá vốn × DIO ÷ 365', subst: `${fmt(cogs)} × ${p.dio} ÷ 365`, value: inv },
    { no: 3, kind: 'up', label: 'Chi phí sản xuất kinh doanh dở dang', formula: 'Giá vốn × WIP ÷ 365', subst: `${fmt(cogs)} × ${p.wip} ÷ 365`, value: wip },
    { no: 4, kind: 'sub', label: 'Tổng tài sản lưu động cần có', formula: '(1) + (2) + (3)', subst: `${fmt(ar)} + ${fmt(inv)} + ${fmt(wip)}`, value: up },
    { no: 5, kind: 'dn', label: 'Phải trả nhà cung cấp, thầu phụ', formula: 'Giá vốn × DPO ÷ 365', subst: `${fmt(cogs)} × ${p.dpo} ÷ 365`, value: ap },
    { no: 6, kind: 'dn', label: 'Tiền ứng trước của chủ đầu tư', formula: 'Doanh thu × % ứng trước', subst: `${fmt(p.rev)} × ${p.adv}%`, value: adv },
    { no: 7, kind: 'sub', label: 'Công nợ & ứng trước', formula: '(5) + (6)', subst: `${fmt(ap)} + ${fmt(adv)}`, value: dn },
  ]
  // finish() dùng (4) và (7) làm số hạng của dòng 8
  const res = finish(p, rows, up, dn, p.dso + p.dio + p.wip - p.dpo)
  res.rows[7].formula = '(4) − (7)'
  res.rows[10].formula = 'max(0; (8) − (9) − (10))'
  return res
}

// ───────────── Chủ đầu tư ─────────────
function calcCDT(p: Params): Result {
  const wip = (p.cost * p.wipDays) / 365
  const ar = (p.rev * p.arDays) / 365
  const up = wip + ar
  const ap = (p.cost * p.apDays) / 365
  const dep = (p.rev * p.depPct) / 100
  const dn = ap + dep
  const rows: Row[] = [
    { no: 1, kind: 'up', label: 'Chi phí dự án dở dang', formula: 'Chi phí đầu tư × số ngày dở dang ÷ 365', subst: `${fmt(p.cost)} × ${p.wipDays} ÷ 365`, value: wip },
    { no: 2, kind: 'up', label: 'Phải thu khách hàng', formula: 'Doanh thu × số ngày thu tiền ÷ 365', subst: `${fmt(p.rev)} × ${p.arDays} ÷ 365`, value: ar },
    { no: 3, kind: 'sub', label: 'Tổng tài sản lưu động cần có', formula: '(1) + (2)', subst: `${fmt(wip)} + ${fmt(ar)}`, value: up },
    { no: 4, kind: 'dn', label: 'Phải trả nhà thầu, nhà cung cấp', formula: 'Chi phí đầu tư × số ngày nợ ÷ 365', subst: `${fmt(p.cost)} × ${p.apDays} ÷ 365`, value: ap },
    { no: 5, kind: 'dn', label: 'Tiền khách hàng ứng trước / đặt cọc', formula: 'Doanh thu × % ứng trước', subst: `${fmt(p.rev)} × ${p.depPct}%`, value: dep },
    { no: 6, kind: 'sub', label: 'Công nợ & ứng trước', formula: '(4) + (5)', subst: `${fmt(ap)} + ${fmt(dep)}`, value: dn },
  ]
  const res = finish(p, rows, up, dn, null)
  res.rows[6].formula = '(3) − (6)'
  res.rows[9].formula = 'max(0; (7) − (8) − (9))'
  return res
}

export const MODELS: Record<Mode, Model> = {
  xaylap: {
    title: 'Công ty xây lắp',
    sub: 'Vốn lưu động = phải thu + tồn kho + dở dang − phải trả − tiền ứng trước.',
    groups: [
      { key: 'a', title: 'Doanh thu & giá vốn', fields: [
        { id: 'rev', label: 'Doanh thu thi công trong năm', hint: 'Tỷ đồng', min: 0, max: 1000, step: 1 },
        { id: 'cogsPct', label: 'Giá vốn / doanh thu', hint: '%', min: 50, max: 100, step: 1 },
      ] },
      { key: 'b', title: 'Tài sản lưu động (số ngày)', fields: [
        { id: 'dso', label: 'Ngày thu tiền khách hàng (DSO)', hint: 'Gồm cả thời gian chờ nghiệm thu, quyết toán', min: 0, max: 365, step: 1 },
        { id: 'dio', label: 'Ngày tồn kho NVL (DIO)', hint: 'Ngày', min: 0, max: 180, step: 1 },
        { id: 'wip', label: 'Ngày thi công dở dang (WIP)', hint: 'Ngày', min: 0, max: 365, step: 1 },
      ] },
      { key: 'c', title: 'Công nợ & ứng trước', fields: [
        { id: 'dpo', label: 'Ngày trả nhà cung cấp (DPO)', hint: 'Ngày', min: 0, max: 365, step: 1 },
        { id: 'adv', label: 'Chủ đầu tư ứng trước', hint: '% doanh thu', min: 0, max: 50, step: 1 },
      ] },
      NGUON_VON,
    ],
    sens: { rowVar: 'rev', colVar: 'dso', rowTitle: 'Doanh thu', colTitle: 'Ngày thu tiền', colUnit: ' ngày',
      rowMults: [0.5, 0.75, 1, 1.25, 1.5], colDeltas: [-30, -15, 0, 15, 30] },
    notes: [
      { c: 'up', t: 'Cam: tài sản lưu động, càng lớn thì càng cần nhiều vốn.' },
      { c: 'dn', t: 'Xanh lá: công nợ và tiền ứng trước, giảm bớt nhu cầu vốn.' },
      { c: 'sub', t: 'Xanh dương: các dòng tổng hợp.' },
      { c: 'loan', t: 'Đỏ: số cần vay thêm sau khi trừ vốn tự có và vay hiện có.' },
    ],
    calc: calcXayLap,
  },
  cdt: {
    title: 'Chủ đầu tư',
    sub: 'Vốn lưu động = chi phí dự án dở dang + phải thu − phải trả nhà thầu − tiền khách ứng trước.',
    groups: [
      { key: 'a', title: 'Chi phí & doanh thu', fields: [
        { id: 'cost', label: 'Chi phí đầu tư trong năm', hint: 'Tỷ đồng', min: 0, max: 2000, step: 1 },
        { id: 'rev', label: 'Doanh thu bán hàng trong năm', hint: 'Tỷ đồng', min: 0, max: 2000, step: 1 },
      ] },
      { key: 'b', title: 'Tài sản lưu động (số ngày)', fields: [
        { id: 'wipDays', label: 'Ngày dở dang bình quân', hint: 'Từ lúc chi tiền đến lúc bàn giao/bán', min: 0, max: 720, step: 5 },
        { id: 'arDays', label: 'Ngày thu tiền khách hàng', hint: 'Ngày', min: 0, max: 365, step: 1 },
      ] },
      { key: 'c', title: 'Công nợ & ứng trước', fields: [
        { id: 'apDays', label: 'Ngày nợ nhà thầu / NCC', hint: 'Ngày', min: 0, max: 365, step: 1 },
        { id: 'depPct', label: 'Khách hàng ứng trước / đặt cọc', hint: '% doanh thu', min: 0, max: 100, step: 1 },
      ] },
      NGUON_VON,
    ],
    sens: { rowVar: 'cost', colVar: 'depPct', rowTitle: 'Chi phí đầu tư', colTitle: '% khách ứng trước', colUnit: '%',
      rowMults: [0.5, 0.75, 1, 1.25, 1.5], colDeltas: [-20, -10, 0, 10, 20] },
    notes: [
      { c: 'up', t: 'Cam: chi phí dở dang và phải thu, càng lớn thì càng cần nhiều vốn.' },
      { c: 'dn', t: 'Xanh lá: nợ nhà thầu và tiền khách ứng trước, giảm bớt nhu cầu vốn.' },
      { c: 'sub', t: 'Xanh dương: các dòng tổng hợp.' },
      { c: 'loan', t: 'Đỏ: số cần vay thêm sau khi trừ vốn tự có và vay hiện có.' },
    ],
    calc: calcCDT,
  },
}

const DEFAULTS: Record<Mode, Params> = {
  xaylap: { rev: 120, cogsPct: 88, dso: 75, dio: 20, wip: 45, dpo: 45, adv: 10, eq: 15, debt: 10, rate: 9.5, mon: 12 },
  cdt:    { cost: 150, rev: 100, wipDays: 270, arDays: 30, apDays: 60, depPct: 30, eq: 20, debt: 30, rate: 9.5, mon: 12 },
}

export function defaults(mode: Mode): Params {
  return { ...DEFAULTS[mode] }
}

// Ma trận độ nhạy: hàng = rowMults, cột = colDeltas, giá trị = nhu cầu vay thêm
export function sensitivity(mode: Mode, p: Params): number[][] {
  const m = MODELS[mode]
  const { rowVar, colVar, rowMults, colDeltas } = m.sens
  return rowMults.map((k) =>
    colDeltas.map((d) => m.calc({ ...p, [rowVar]: p[rowVar] * k, [colVar]: Math.max(0, p[colVar] + d) }).loan),
  )
}
