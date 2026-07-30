import {
  apBalanceAt, breakdownByCode, buildLineItemMatrix, FlatDoc, groupBsItems,
  maSoSumOverPeriods, productPL, valueByCodeAndLabel, valueByTaiKhoan,
} from '../_lib/compute'
import { MS_BS, MS_PL, PL_BREAKDOWN_CODES, TK } from '../_lib/masocode'
import { pct } from '../_lib/format'
import { PeriodFilter, periodsForQuarter, periodsForYear } from '../_lib/usePeriodFilter'

interface Props {
  docs: FlatDoc[]
  donViKey: string
  donViLabel: string
  pf: PeriodFilter
  fmtS: (v: number) => string
  unitLbl: string
}

interface Column { label: string; periods: string[] }
interface Row { label: string; bold?: boolean; isPercent?: boolean; blank?: boolean; values: number[] }

const safeDiv = (a: number, b: number) => (b !== 0 ? a / b : 0)
const endOf = (periods: string[]): string | null => (periods.length ? periods[periods.length - 1] : null)

// ── KQKD: cột theo quý + cả năm, gộp cả mã số gốc lẫn thuyết minh (sản phẩm/chi phí) thành 1
// bảng liền mạch đúng như mẫu — chi phí/thuế hiện dấu âm để đọc theo kiểu "khoản trừ lợi nhuận".
function buildPlRows(docs: FlatDoc[], donViKey: string, columns: Column[]): Row[] {
  const yearPeriods = columns[columns.length - 1].periods
  const productNames = productPL(docs, donViKey, yearPeriods).map(p => p.name)
  const costNames = breakdownByCode(docs, donViKey, yearPeriods, [PL_BREAKDOWN_CODES.CAU_TRUC_CHI_PHI, PL_BREAKDOWN_CODES.CHI_PHI_KHAC_CT]).map(i => i.chiTieu)
  const otherNames = breakdownByCode(docs, donViKey, yearPeriods, [PL_BREAKDOWN_CODES.THU_NHAP_KHAC]).map(i => i.chiTieu)

  const col = (fn: (periods: string[]) => number) => columns.map(c => fn(c.periods))
  const dt = (name: string) => col(ps => valueByCodeAndLabel(docs, donViKey, ps, [PL_BREAKDOWN_CODES.DOANH_THU_SP], name))
  const gv = (name: string) => col(ps => valueByCodeAndLabel(docs, donViKey, ps, [PL_BREAKDOWN_CODES.GIA_VON_SP], name))
  const lg = (name: string) => col(ps => valueByCodeAndLabel(docs, donViKey, ps, [PL_BREAKDOWN_CODES.LAI_GOP_SP], name))
  const cp = (name: string) => col(ps => -valueByCodeAndLabel(docs, donViKey, ps, [PL_BREAKDOWN_CODES.CAU_TRUC_CHI_PHI, PL_BREAKDOWN_CODES.CHI_PHI_KHAC_CT], name))
  const other = (name: string) => col(ps => {
    const raw = valueByCodeAndLabel(docs, donViKey, ps, [PL_BREAKDOWN_CODES.THU_NHAP_KHAC], name)
    return name.toUpperCase().startsWith('CP') ? -raw : raw
  })
  const sumArr = (arrs: number[][]) => columns.map((_, i) => arrs.reduce((s, a) => s + (a[i] ?? 0), 0))

  const rows: Row[] = []
  rows.push(...productNames.map(n => ({ label: `Doanh thu - ${n}`, values: dt(n) })))
  rows.push({ label: 'Trả hàng, hoàn tiền, giảm giá', values: col(ps => -maSoSumOverPeriods(docs, donViKey, ps, MS_PL.GIAM_TRU)) })
  rows.push({ label: 'Tổng doanh thu thuần', bold: true, values: col(ps => maSoSumOverPeriods(docs, donViKey, ps, MS_PL.DTT)) })
  rows.push(...productNames.map(n => ({ label: `Giá vốn - ${n}`, values: gv(n) })))
  rows.push({ label: 'Tổng lãi gộp', bold: true, values: col(ps => maSoSumOverPeriods(docs, donViKey, ps, MS_PL.LAI_GOP)) })
  const grossRows = productNames.map(n => ({ label: `Lãi gộp - ${n}`, values: lg(n) }))
  rows.push(...grossRows)
  rows.push({ label: '% Tổng lãi gộp', isPercent: true, values: col(ps => safeDiv(maSoSumOverPeriods(docs, donViKey, ps, MS_PL.LAI_GOP), maSoSumOverPeriods(docs, donViKey, ps, MS_PL.DTT))) })
  rows.push(...productNames.map((n, i) => ({ label: `% Lãi gộp - ${n}`, isPercent: true, values: columns.map((_, ci) => safeDiv(grossRows[i].values[ci], dt(n)[ci])) })))
  rows.push({ label: '', blank: true, values: columns.map(() => 0) })

  const costRows = costNames.map(n => ({ label: `CPHĐ - ${n}`, values: cp(n) }))
  rows.push({ label: 'Chi phí hoạt động', bold: true, values: sumArr(costRows.map(r => r.values)) })
  rows.push(...costRows)

  const otherRows = otherNames.map(n => ({ label: n, values: other(n) }))
  rows.push({ label: 'Thu nhập khác - Chi phí khác', bold: true, values: sumArr(otherRows.map(r => r.values)) })
  rows.push(...otherRows)

  rows.push({ label: 'Lợi nhuận trước thuế', bold: true, values: col(ps => maSoSumOverPeriods(docs, donViKey, ps, MS_PL.LN_TRUOC_THUE)) })
  rows.push({ label: 'Thuế TNDN', values: col(ps => -(maSoSumOverPeriods(docs, donViKey, ps, MS_PL.THUE_HIEN_HANH) + maSoSumOverPeriods(docs, donViKey, ps, MS_PL.THUE_HOAN_LAI))) })
  rows.push({ label: 'Lợi nhuận sau thuế', bold: true, values: col(ps => maSoSumOverPeriods(docs, donViKey, ps, MS_PL.LN_SAU_THUE)) })
  return rows
}

function PlTable({ rows, columns, fmtS }: { rows: Row[]; columns: Column[]; fmtS: (v: number) => string }) {
  return (
    <table className="stbl">
      <thead>
        <tr><th className="lbl">Chỉ tiêu</th>{columns.map(c => <th key={c.label} className="num">{c.label}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => {
          if (r.blank) return <tr key={ri}><td colSpan={columns.length + 1}>&nbsp;</td></tr>
          return (
            <tr key={ri} className={r.bold ? 'bold' : r.isPercent ? 'pct' : ''}>
              <td className="lbl">{r.label}</td>
              {r.values.map((v, ci) => (
                <td key={ci} className="num" style={{ color: !r.isPercent && v < 0 ? '#DC2626' : undefined }}>
                  {r.isPercent ? pct(v) : fmtS(v)}
                </td>
              ))}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ── Cân đối kế toán + Nguồn vốn: view rút gọn theo đúng mẫu (không phải toàn bộ chi tiết TT200).
// TSNH lấy nguyên các nhóm La Mã thật (I./II./III...) từ groupBsItems; TSDH rút gọn còn 3 dòng;
// Nợ/VCSH lấy theo SỐ TÀI KHOẢN (report TB) vì ổn định hơn nhiều so với đoán theo mã số/tên CĐKT
// (331=phải trả NCC, 34111/34112=vay NH/DH, 4111/412/421=vốn góp/thặng dư/LNST chưa PP) — phần
// còn lại là số dư chênh lệch (không sai lệch tổng, chỉ là "chưa phân loại chi tiết").
function sectionLevel1(groups: ReturnType<typeof groupBsItems>, sectionMaSo: string) {
  const startIdx = groups.findIndex(g => g.item.maSo === sectionMaSo)
  if (startIdx === -1) return []
  const out: typeof groups = []
  for (let i = startIdx + 1; i < groups.length; i++) {
    if (groups[i].level === 0) break
    if (groups[i].level === 1) out.push(groups[i])
  }
  return out
}

function BsGroup({ label, rows, fmtS }: { label: string; rows: Row[]; fmtS: (v: number) => string }) {
  return (
    <>
      {rows.map((r, ri) => (
        <tr key={ri} className={r.bold ? 'bold' : ''}>
          {ri === 0 && <td className="pn-grouplabel" rowSpan={rows.length}>{label}</td>}
          <td className="lbl">{r.label}</td>
          {r.values.map((v, ci) => <td key={ci} className="num" style={{ color: v < 0 ? '#DC2626' : undefined }}>{fmtS(v)}</td>)}
        </tr>
      ))}
    </>
  )
}

export function TabPhanTichNgang({ docs, donViKey, donViLabel, pf, fmtS, unitLbl }: Props) {
  const year = pf.year
  const prevYear = String(Number(year) - 1)
  const quarterCols: Column[] = [1, 2, 3, 4].map(q => ({ label: `Quý ${q}`, periods: periodsForQuarter(pf.periods, year, q) }))
  const yearPeriods = periodsForYear(pf.periods, year)
  const prevYearPeriods = periodsForYear(pf.periods, prevYear)

  const plColumns: Column[] = [...quarterCols, { label: `Năm ${year}`, periods: yearPeriods }]
  const bsColumns: Column[] = [...quarterCols, { label: `Năm ${year}`, periods: yearPeriods }, { label: `Năm ${prevYear}`, periods: prevYearPeriods }]

  const plRows = buildPlRows(docs, donViKey, plColumns)

  const allBsPeriods = [...new Set(bsColumns.flatMap(c => c.periods))]
  const bsItems = buildLineItemMatrix(docs, 'BS', donViKey, allBsPeriods)
  const bsByMaSo = new Map(bsItems.map(i => [i.maSo, i]))
  const bsGroups = groupBsItems(bsItems)

  const vBS = (maSo: string, periods: string[]) => {
    const p = endOf(periods)
    return p ? (bsByMaSo.get(maSo)?.values[p] ?? 0) : 0
  }
  // Report TB lưu số dư bên Có (nợ phải trả/vốn CSH) theo quy ước âm (vd 411 luôn ra số âm dù là
  // vốn góp thật, còn 421 lỗ luỹ kế lại ra dương) — đảo dấu để khớp cách trình bày dương thông
  // thường của Cân đối kế toán (đã kiểm chứng bằng dữ liệu thật: 4111 ra -150 tỷ, 421 ra +54 tỷ
  // trong khi công ty đang lỗ luỹ kế thật, tức phải là âm sau khi đảo dấu).
  const vTK = (taiKhoan: string, periods: string[]) => {
    const p = endOf(periods)
    return p ? -valueByTaiKhoan(docs, p, taiKhoan, donViKey) : 0
  }
  const vAP = (periods: string[]) => {
    const p = endOf(periods)
    return p ? apBalanceAt(docs, p, donViKey) : 0
  }
  const bsCol = (fn: (periods: string[]) => number) => bsColumns.map(c => fn(c.periods))

  const tsnhChildren = sectionLevel1(bsGroups, MS_BS.TSNH)
  const tsnhRows: Row[] = [
    ...tsnhChildren.map(g => ({ label: g.item.chiTieu.replace(/^[IVXLCDM]+\.\s*/, ''), values: bsCol(ps => { const p = endOf(ps); return p ? (g.item.values[p] ?? 0) : 0 }) })),
    { label: 'Tổng TS ngắn hạn', bold: true, values: bsCol(ps => vBS(MS_BS.TSNH, ps)) },
  ]

  const tsdhRows: Row[] = [
    { label: 'Tài sản cố định', values: bsCol(ps => vBS(MS_BS.TSCD, ps)) },
    { label: 'Đầu tư dài hạn', values: bsCol(ps => vBS(MS_BS.DAU_TU_DH, ps)) },
    { label: 'Tài sản dài hạn khác', values: bsCol(ps => vBS(MS_BS.TSDH, ps) - vBS(MS_BS.TSCD, ps) - vBS(MS_BS.DAU_TU_DH, ps)) },
    { label: 'Tổng TS dài hạn', bold: true, values: bsCol(ps => vBS(MS_BS.TSDH, ps)) },
  ]

  const noRows: Row[] = [
    { label: 'Phải trả người bán ngắn hạn', values: bsCol(vAP) },
    { label: 'Nợ vay ngắn hạn', values: bsCol(ps => vTK(TK.VAY_NGAN_HAN, ps)) },
    { label: 'Nợ vay dài hạn', values: bsCol(ps => vTK(TK.VAY_DAI_HAN, ps)) },
    { label: 'Nợ khác', values: bsCol(ps => vBS(MS_BS.NO_PHAI_TRA, ps) - vAP(ps) - vTK(TK.VAY_NGAN_HAN, ps) - vTK(TK.VAY_DAI_HAN, ps)) },
    { label: 'Tổng nợ', bold: true, values: bsCol(ps => vBS(MS_BS.NO_PHAI_TRA, ps)) },
  ]

  const vcshRows: Row[] = [
    { label: 'Vốn điều lệ', values: bsCol(ps => vTK(TK.VON_GOP, ps)) },
    { label: 'Thặng dư vốn cổ phần', values: bsCol(ps => vTK(TK.THANG_DU_VON, ps)) },
    { label: 'Lợi nhuận giữ lại', values: bsCol(ps => vTK(TK.LNST_CHUA_PHAN_PHOI, ps)) },
    { label: 'Quỹ và vốn khác', values: bsCol(ps => vBS(MS_BS.VON_CSH, ps) - vTK(TK.VON_GOP, ps) - vTK(TK.THANG_DU_VON, ps) - vTK(TK.LNST_CHUA_PHAN_PHOI, ps)) },
    { label: 'Tổng vốn CSH', bold: true, values: bsCol(ps => vBS(MS_BS.VON_CSH, ps)) },
  ]

  return (
    <>
      <div className="tc-sub">Năm {year} theo quý (đơn vị: {unitLbl}) — Nợ/Vốn CSH lấy theo số tài khoản kế toán (331/34111/34112/4111/412/421), phần chưa xác định gộp vào dòng “khác”</div>

      <div className="pn-grid">
        <div className="panel" style={{ marginBottom: 0 }}>
          <div className="panel-h"><span>📈 Báo cáo kết quả kinh doanh</span><span className="company-badge">{donViLabel}</span></div>
          <div className="panel-b" style={{ overflowX: 'auto' }}>
            <PlTable rows={plRows} columns={plColumns} fmtS={fmtS} />
          </div>
        </div>

        <div className="panel" style={{ marginBottom: 0 }}>
          <div className="panel-h"><span>⚖ Cân đối kế toán & Nguồn vốn</span></div>
          <div className="panel-b" style={{ overflowX: 'auto' }}>
            <table className="stbl">
              <thead>
                <tr><th /><th className="lbl">Chỉ tiêu</th>{bsColumns.map(c => <th key={c.label} className="num">{c.label}</th>)}</tr>
              </thead>
              <tbody>
                <tr className="pn-section"><td colSpan={bsColumns.length + 2}>TỔNG TÀI SẢN</td></tr>
                <BsGroup label="TÀI SẢN NGẮN HẠN" rows={tsnhRows} fmtS={fmtS} />
                <BsGroup label="TÀI SẢN DÀI HẠN" rows={tsdhRows} fmtS={fmtS} />
                <tr className="pn-section nv"><td colSpan={bsColumns.length + 2}>TỔNG NGUỒN VỐN</td></tr>
                <BsGroup label="NỢ" rows={noRows} fmtS={fmtS} />
                <BsGroup label="VỐN CHỦ SỞ HỮU" rows={vcshRows} fmtS={fmtS} />
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}
