import { Fragment } from 'react'
import {
  breakdownByCode, buildLineItemMatrix, FlatDoc, groupBsItems,
  maSoSumOverPeriods, productPL, valueByCodeAndLabel,
} from '../_lib/compute'
import { MS_BS, MS_PL, PL_BREAKDOWN_CODES } from '../_lib/masocode'
import { pct, ratioStr } from '../_lib/format'
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
// Nợ/VCSH lấy trực tiếp theo MÃ SỐ CĐKT (311=phải trả NCC NH, 321/339=vay NH/DH, 411=vốn góp,
// 412=thặng dư vốn, 418+419=quỹ ĐTPT+quỹ khác VCSH, 420=LNST chưa phân phối) — đã đối chiếu đúng
// với Data_BS thật (không đoán qua số tài khoản TB nữa vì từng lấy sai 421 thay vì 420, và sai
// dấu 4111/412 theo quy ước report TB).
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
  const isQuarterMode = pf.mode === 'quarter'
  const monthColsOfQuarter = (y: string, q: number): Column[] =>
    [q * 3 - 2, q * 3 - 1, q * 3].map(m => {
      const period = `${y}-${String(m).padStart(2, '0')}`
      return { label: `Tháng ${m}`, periods: pf.periods.includes(period) ? [period] : [] }
    })
  const quarterCols: Column[] = [1, 2, 3, 4].map(q => ({ label: `Quý ${q}`, periods: periodsForQuarter(pf.periods, year, q) }))
  const yearPeriods = periodsForYear(pf.periods, year)
  const prevYearPeriods = periodsForYear(pf.periods, prevYear)

  // Khi bộ lọc Kỳ ở chế độ "Quý" (đã chọn 1 quý cụ thể) — tách cột theo từng THÁNG trong quý đó
  // thay vì gộp cả 4 quý của năm, để xem biến động từng tháng ngay trong quý đang quan tâm.
  const plColumns: Column[] = isQuarterMode
    ? [...monthColsOfQuarter(year, pf.quarter), { label: `Quý ${pf.quarter}`, periods: periodsForQuarter(pf.periods, year, pf.quarter) }]
    : [...quarterCols, { label: `Năm ${year}`, periods: yearPeriods }]
  const bsColumns: Column[] = isQuarterMode
    ? [
        ...monthColsOfQuarter(year, pf.quarter),
        { label: `Quý ${pf.quarter}/${year}`, periods: periodsForQuarter(pf.periods, year, pf.quarter) },
        { label: `Quý ${pf.quarter}/${prevYear}`, periods: periodsForQuarter(pf.periods, prevYear, pf.quarter) },
      ]
    : [...quarterCols, { label: `Năm ${year}`, periods: yearPeriods }, { label: `Năm ${prevYear}`, periods: prevYearPeriods }]

  const plRows = buildPlRows(docs, donViKey, plColumns)

  const allBsPeriods = [...new Set(bsColumns.flatMap(c => c.periods))]
  const bsItems = buildLineItemMatrix(docs, 'BS', donViKey, allBsPeriods)
  const bsByMaSo = new Map(bsItems.map(i => [i.maSo, i]))
  const bsGroups = groupBsItems(bsItems)

  // "Năm {year}" gộp cả các tháng còn trống của những kỳ tương lai (0 cho tới khi đồng bộ) — nếu
  // lấy đúng tháng cuối cùng theo mảng thì sẽ rơi vào tháng trống đó (vd tháng 12 khi mới có số
  // liệu tới tháng 6), nên quét ngược để lấy kỳ cuối cùng CÓ số liệu thật (Tổng TS ≠ 0).
  const endOf = (periods: string[]): string | null => {
    for (let i = periods.length - 1; i >= 0; i--) {
      if ((bsByMaSo.get(MS_BS.TONG_TS)?.values[periods[i]] ?? 0) !== 0) return periods[i]
    }
    return periods.length ? periods[periods.length - 1] : null
  }

  const vBS = (maSo: string, periods: string[]) => {
    const p = endOf(periods)
    return p ? (bsByMaSo.get(maSo)?.values[p] ?? 0) : 0
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
    { label: 'Phải trả người bán ngắn hạn', values: bsCol(ps => vBS(MS_BS.PHAI_TRA_NCC_NH, ps)) },
    { label: 'Nợ vay ngắn hạn', values: bsCol(ps => vBS(MS_BS.VAY_NH, ps)) },
    { label: 'Nợ vay dài hạn', values: bsCol(ps => vBS(MS_BS.VAY_DH, ps)) },
    { label: 'Nợ khác', values: bsCol(ps => vBS(MS_BS.NO_PHAI_TRA, ps) - vBS(MS_BS.PHAI_TRA_NCC_NH, ps) - vBS(MS_BS.VAY_NH, ps) - vBS(MS_BS.VAY_DH, ps)) },
    { label: 'Tổng nợ', bold: true, values: bsCol(ps => vBS(MS_BS.NO_PHAI_TRA, ps)) },
  ]

  const vcshRows: Row[] = [
    { label: 'Vốn điều lệ', values: bsCol(ps => vBS(MS_BS.VON_GOP, ps)) },
    { label: 'Thặng dư vốn cổ phần', values: bsCol(ps => vBS(MS_BS.THANG_DU_VON, ps)) },
    { label: 'Lợi nhuận giữ lại', values: bsCol(ps => vBS(MS_BS.LNST_CHUA_PP, ps)) },
    { label: 'Quỹ và vốn khác', values: bsCol(ps => vBS(MS_BS.QUY_DTPT, ps) + vBS(MS_BS.QUY_KHAC_VCSH, ps)) },
    { label: 'Tổng vốn CSH', bold: true, values: bsCol(ps => vBS(MS_BS.VON_CSH, ps)) },
  ]

  const tongTaiSanRow: Row = { label: 'TỔNG TÀI SẢN', bold: true, values: bsCol(ps => vBS(MS_BS.TONG_TS, ps)) }
  const tongNguonVonRow: Row = { label: 'TỔNG NGUỒN VỐN', bold: true, values: bsCol(ps => vBS(MS_BS.TONG_NGUON_VON, ps)) }

  // ── Chỉ số tài chính cơ bản: Năm hiện tại vs năm trước, công thức chạy trực tiếp từ số liệu đã
  // tổng hợp ở trên (không phải nhập tay) — nhóm/công thức/ngưỡng tham khảo theo đúng mẫu người dùng gửi.
  const plAnnual = (maSo: string) => maSoSumOverPeriods(docs, donViKey, yearPeriods, maSo)
  const plPrevYear = (maSo: string) => maSoSumOverPeriods(docs, donViKey, prevYearPeriods, maSo)
  const khauHaoOf = (ps: string[]) => breakdownByCode(docs, donViKey, ps, [PL_BREAKDOWN_CODES.CAU_TRUC_CHI_PHI]).find(i => i.chiTieu === 'Khấu hao - Phân bổ')?.value ?? 0

  function ratioSet(bsPeriods: string[], plSum: (maSo: string) => number, khauHao: number) {
    const tsnh = vBS(MS_BS.TSNH, bsPeriods), noNH = vBS(MS_BS.NO_NGAN_HAN, bsPeriods)
    const tien = vBS(MS_BS.TIEN, bsPeriods), htk = vBS(MS_BS.HANG_TON_KHO, bsPeriods)
    const tongTS = vBS(MS_BS.TONG_TS, bsPeriods), noPhaiTra = vBS(MS_BS.NO_PHAI_TRA, bsPeriods), vonCSH = vBS(MS_BS.VON_CSH, bsPeriods)
    const vayNH = vBS(MS_BS.VAY_NH, bsPeriods), vayDH = vBS(MS_BS.VAY_DH, bsPeriods)
    const dtt = plSum(MS_PL.DTT), laiGop = plSum(MS_PL.LAI_GOP), lntt = plSum(MS_PL.LN_TRUOC_THUE)
    const lnst = plSum(MS_PL.LN_SAU_THUE), cpLaiVay = plSum(MS_PL.CP_LAI_VAY)
    const ebitda = lntt + cpLaiVay + khauHao
    return {
      currentRatio: safeDiv(tsnh, noNH), quickRatio: safeDiv(tsnh - htk, noNH), cashRatio: safeDiv(tien, noNH),
      workingCapital: tsnh - noNH,
      debtToAssets: safeDiv(noPhaiTra, tongTS), debtToEquity: safeDiv(noPhaiTra, vonCSH),
      icr: safeDiv(lntt + cpLaiVay, cpLaiVay), debtToEbitda: safeDiv(vayNH + vayDH, ebitda),
      grossMargin: safeDiv(laiGop, dtt), roe: safeDiv(lnst, vonCSH), roa: safeDiv(lnst, tongTS), netMargin: safeDiv(lnst, dtt),
    }
  }
  const hasPrevYear = prevYearPeriods.length > 0
  const curR = ratioSet(yearPeriods, plAnnual, khauHaoOf(yearPeriods))
  const prevR = hasPrevYear ? ratioSet(prevYearPeriods, plPrevYear, khauHaoOf(prevYearPeriods)) : null

  type RKind = 'ratio' | 'pct' | 'money'
  interface RRow { label: string; note: string; kind: RKind; cur: number; prev: number | null }
  const fmtRatio = (kind: RKind, v: number) => kind === 'pct' ? pct(v) : kind === 'money' ? fmtS(v) : `${ratioStr(v)} lần`

  const ratioGroups: { title: string; rows: RRow[] }[] = [
    {
      title: '1. NHÓM THANH KHOẢN', rows: [
        { label: 'Thanh khoản hiện hành [= TSNH / Nợ NH]', note: 'BĐS: ≥ 1,3 | Xây dựng: ≥ 1,2', kind: 'ratio', cur: curR.currentRatio, prev: prevR?.currentRatio ?? null },
        { label: 'Thanh khoản nhanh [= (TSNH − HTK) / Nợ NH]', note: 'BĐS: ≥ 0,5 | Xây dựng: ≥ 0,7', kind: 'ratio', cur: curR.quickRatio, prev: prevR?.quickRatio ?? null },
        { label: 'Thanh khoản tiền mặt [= Tiền / Nợ NH]', note: '≥ 0,1 là mức tối thiểu an toàn', kind: 'ratio', cur: curR.cashRatio, prev: prevR?.cashRatio ?? null },
        { label: 'Vốn lưu động ròng [= TSNH − Nợ NH]', note: `> 0 (đơn vị: ${unitLbl})`, kind: 'money', cur: curR.workingCapital, prev: prevR?.workingCapital ?? null },
      ],
    },
    {
      title: '2. NHÓM ĐÒN BẨY TÀI CHÍNH', rows: [
        { label: 'Nợ / Tổng TS [= Tổng nợ phải trả / Tổng TS]', note: 'BĐS: ≤ 65% | Xây dựng: ≤ 70%', kind: 'pct', cur: curR.debtToAssets, prev: prevR?.debtToAssets ?? null },
        { label: 'Nợ / Vốn CSH [= Tổng nợ phải trả / Vốn CSH]', note: 'An toàn: ≤ 2,0x | Cảnh báo: > 3,0x', kind: 'ratio', cur: curR.debtToEquity, prev: prevR?.debtToEquity ?? null },
        { label: 'ICR — Khả năng trả lãi [= (LNTT + CP lãi vay) / CP lãi vay]', note: 'BĐS: ≥ 2,5x | Xây dựng: ≥ 3,0x', kind: 'ratio', cur: curR.icr, prev: prevR?.icr ?? null },
        { label: 'Nợ vay / EBITDA [= (Nợ vay NH + DH) / EBITDA]', note: 'Ổn: ≤ 4x | Nguy hiểm: > 6x', kind: 'ratio', cur: curR.debtToEbitda, prev: prevR?.debtToEbitda ?? null },
      ],
    },
    {
      title: '3. NHÓM SINH LỜI - LỢI NHUẬN', rows: [
        { label: 'Lãi gộp / Doanh thu thuần', note: 'BĐS: ≥ 25% | Xây dựng: ≥ 8%', kind: 'pct', cur: curR.grossMargin, prev: prevR?.grossMargin ?? null },
        { label: 'ROE [= LNST / Vốn CSH]', note: 'BĐS: ≥ 15% | Xây dựng: ≥ 12%', kind: 'pct', cur: curR.roe, prev: prevR?.roe ?? null },
        { label: 'ROA [= LNST / Tổng TS]', note: 'BĐS: ≥ 5% | Xây dựng: ≥ 6%', kind: 'pct', cur: curR.roa, prev: prevR?.roa ?? null },
        { label: 'LNST / Doanh thu thuần', note: 'BĐS TM: ≥ 12% | NOXH: ≥ 4%', kind: 'pct', cur: curR.netMargin, prev: prevR?.netMargin ?? null },
      ],
    },
  ]

  return (
    <>
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
                <tr className="bold">
                  <td colSpan={2} className="lbl">{tongTaiSanRow.label}</td>
                  {tongTaiSanRow.values.map((v, ci) => <td key={ci} className="num">{fmtS(v)}</td>)}
                </tr>
                <tr className="pn-section nv"><td colSpan={bsColumns.length + 2}>TỔNG NGUỒN VỐN</td></tr>
                <BsGroup label="NỢ" rows={noRows} fmtS={fmtS} />
                <BsGroup label="VỐN CHỦ SỞ HỮU" rows={vcshRows} fmtS={fmtS} />
                <tr className="bold">
                  <td colSpan={2} className="lbl">{tongNguonVonRow.label}</td>
                  {tongNguonVonRow.values.map((v, ci) => <td key={ci} className="num">{fmtS(v)}</td>)}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-h"><span>📐 Chỉ số tài chính cơ bản</span><span>Năm {year}{hasPrevYear ? ` so Năm ${prevYear}` : ''}</span></div>
        <div className="panel-b" style={{ overflowX: 'auto' }}>
          <table className="stbl">
            <thead>
              <tr><th className="lbl">Chỉ tiêu</th><th className="num">Năm {year}</th>{hasPrevYear && <th className="num">Năm {prevYear}</th>}<th className="lbl">Ngưỡng tham khảo</th></tr>
            </thead>
            <tbody>
              {ratioGroups.map(g => (
                <Fragment key={g.title}>
                  <tr className="grp"><td colSpan={hasPrevYear ? 4 : 3}>{g.title}</td></tr>
                  {g.rows.map(r => (
                    <tr key={r.label}>
                      <td className="lbl">{r.label}</td>
                      <td className="num">{fmtRatio(r.kind, r.cur)}</td>
                      {hasPrevYear && <td className="num">{r.prev == null ? '–' : fmtRatio(r.kind, r.prev)}</td>}
                      <td className="lbl" style={{ color: '#9CA3AF', fontSize: 10 }}>{r.note}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
          {!hasPrevYear && <div style={{ fontSize: 10.5, color: '#9CA3AF', marginTop: 6 }}>Chưa có dữ liệu Năm {prevYear} để so sánh.</div>}
        </div>
      </div>
    </>
  )
}
