import { Fragment } from 'react'
import {
  breakdownByCode, buildLineItemMatrix, FlatDoc, groupBsItems,
  maSoSumOverPeriods, productPL, valueByCodeAndLabel,
} from '../_lib/compute'
import { MS_BS, MS_PL, PL_BREAKDOWN_CODES } from '../_lib/masocode'
import { pct, ratioStr } from '../_lib/format'
import { PeriodFilter } from '../_lib/usePeriodFilter'

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

// ── KQKD: N cột kỳ (đến từ pf.trendBuckets — Năm/Quý/Tháng tự đổi số cột và nội dung), gộp cả mã số
// gốc lẫn thuyết minh (sản phẩm/chi phí) thành 1 bảng liền mạch — chi phí/thuế hiện dấu âm để đọc
// theo kiểu "khoản trừ lợi nhuận". Danh sách sản phẩm/chi phí lấy theo hợp của TẤT CẢ các cột (không
// chỉ cột cuối) để không bị mất dòng nếu 1 sản phẩm chỉ phát sinh ở cột đầu/giữa.
function buildPlRows(docs: FlatDoc[], donViKey: string, columns: Column[]): Row[] {
  const allPeriods = [...new Set(columns.flatMap(c => c.periods))]
  const productNames = productPL(docs, donViKey, allPeriods).map(p => p.name)
  const costNames = breakdownByCode(docs, donViKey, allPeriods, [PL_BREAKDOWN_CODES.CAU_TRUC_CHI_PHI, PL_BREAKDOWN_CODES.CHI_PHI_KHAC_CT]).map(i => i.chiTieu)
  const otherNames = breakdownByCode(docs, donViKey, allPeriods, [PL_BREAKDOWN_CODES.THU_NHAP_KHAC]).map(i => i.chiTieu)

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

  // FIX: 4 dòng theo mã số 21-24 trong sheet gốc (Lãi/lỗ HĐ BĐS đầu tư, Doanh thu tài chính, Chi
  // phí tài chính, trong đó Chi phí lãi vay) — trước đây bị bỏ sót hoàn toàn khỏi bảng, nhảy thẳng
  // từ Lãi gộp sang Chi phí hoạt động (25+26), sai thứ tự so với BCTC gốc.
  rows.push({ label: 'Lãi/lỗ hoạt động BĐS đầu tư', values: col(ps => maSoSumOverPeriods(docs, donViKey, ps, MS_PL.LAI_LO_BDSDT)) })
  rows.push({ label: 'Doanh thu tài chính', values: col(ps => maSoSumOverPeriods(docs, donViKey, ps, MS_PL.DT_TAI_CHINH)) })
  rows.push({ label: 'Chi phí tài chính', values: col(ps => -maSoSumOverPeriods(docs, donViKey, ps, MS_PL.CP_TAI_CHINH)) })
  rows.push({ label: '- Trong đó: Chi phí lãi vay', values: col(ps => -maSoSumOverPeriods(docs, donViKey, ps, MS_PL.CP_LAI_VAY)) })

  // Dòng tổng lấy TRỰC TIẾP từ mã số CP bán hàng (25) + CP QLDN (26) — không cộng từ các dòng
  // thuyết minh (TM_CP) bên dưới, vì thuyết minh có thể chưa được nhập chi tiết dù dòng tổng theo
  // mã số BCTC gốc đã có đủ số liệu (khiến "Chi phí hoạt động" hiện sai thành 0/thiếu trước đây).
  const costRows = costNames.map(n => ({ label: `CPHĐ - ${n}`, values: cp(n) }))
  rows.push({
    label: 'Chi phí hoạt động', bold: true,
    values: col(ps => -(maSoSumOverPeriods(docs, donViKey, ps, MS_PL.CP_BAN_HANG) + maSoSumOverPeriods(docs, donViKey, ps, MS_PL.CP_QLDN))),
  })
  rows.push(...costRows)
  rows.push({ label: 'Lợi nhuận thuần từ HĐKD', bold: true, values: col(ps => maSoSumOverPeriods(docs, donViKey, ps, MS_PL.LN_THUAN_HDKD)) })

  // Tương tự: tổng lấy từ mã số Thu nhập khác (31) − Chi phí khác (32), thuyết minh chỉ để bung chi
  // tiết bên dưới, không phải nguồn tính tổng.
  const otherRows = otherNames.map(n => ({ label: n, values: other(n) }))
  rows.push({
    label: 'Thu nhập khác - Chi phí khác', bold: true,
    values: col(ps => maSoSumOverPeriods(docs, donViKey, ps, MS_PL.THU_NHAP_KHAC) - maSoSumOverPeriods(docs, donViKey, ps, MS_PL.CHI_PHI_KHAC)),
  })
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
        <tr><th className="lbl">Chỉ tiêu</th>{columns.map((c, i) => <th key={i} className="num">{c.label}</th>)}</tr>
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
// 412=thặng dư vốn, 418+419=quỹ ĐTPT+quỹ khác VCSH, 420=LNST chưa phân phối).
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
  // Cột kỳ dùng chung cho cả bảng KQKD, CĐKT lẫn Chỉ số tài chính — tự đổi theo bộ lọc Kỳ:
  //   Năm   → 3 năm gần nhất (2024, 2025, 2026...)
  //   Quý   → theo pf.compareBasis: cùng 1 quý qua 3 năm gần nhất, HOẶC 4 quý trong năm đang chọn,
  //           HOẶC danh sách Quý×Năm người dùng tự chọn ở popover "Tùy chỉnh" (pf.customQuarterKeys)
  //   Tháng → 3 tháng gần nhất trong đúng năm đang chọn
  const columns: Column[] = pf.trendBuckets(3)
  const colLabel = columns.map(c => c.label).join(' · ')

  const plRows = buildPlRows(docs, donViKey, columns)

  const allBsPeriods = [...new Set(columns.flatMap(c => c.periods))]
  const bsItems = buildLineItemMatrix(docs, 'BS', donViKey, allBsPeriods)
  const bsByMaSo = new Map(bsItems.map(i => [i.maSo, i]))
  const bsGroups = groupBsItems(bsItems)

  // BS là số dư tại 1 thời điểm — mỗi cột chốt vào kỳ CUỐI CÙNG trong cột đó thực sự có số liệu
  // (không phải kỳ cuối theo lịch, có thể còn trống nếu chưa đồng bộ).
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
  const bsCol = (fn: (periods: string[]) => number) => columns.map(c => fn(c.periods))

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

  // ── Chỉ số tài chính cơ bản: chạy trực tiếp trên CHÍNH các cột đang hiển thị ở trên (không còn cố
  // định "năm nay vs năm trước" như bản cũ) — công thức/ngưỡng tham khảo giữ nguyên theo mẫu gốc.
  const khauHaoOf = (ps: string[]) => breakdownByCode(docs, donViKey, ps, [PL_BREAKDOWN_CODES.CAU_TRUC_CHI_PHI]).find(i => i.chiTieu === 'Khấu hao - Phân bổ')?.value ?? 0

  function ratioSetFor(periodsForCol: string[]) {
    const tsnh = vBS(MS_BS.TSNH, periodsForCol), noNH = vBS(MS_BS.NO_NGAN_HAN, periodsForCol)
    const tien = vBS(MS_BS.TIEN, periodsForCol), htk = vBS(MS_BS.HANG_TON_KHO, periodsForCol)
    const tongTS = vBS(MS_BS.TONG_TS, periodsForCol), noPhaiTra = vBS(MS_BS.NO_PHAI_TRA, periodsForCol), vonCSH = vBS(MS_BS.VON_CSH, periodsForCol)
    const vayNH = vBS(MS_BS.VAY_NH, periodsForCol), vayDH = vBS(MS_BS.VAY_DH, periodsForCol)
    const plSum = (maSo: string) => maSoSumOverPeriods(docs, donViKey, periodsForCol, maSo)
    const dtt = plSum(MS_PL.DTT), laiGop = plSum(MS_PL.LAI_GOP), lntt = plSum(MS_PL.LN_TRUOC_THUE)
    const lnst = plSum(MS_PL.LN_SAU_THUE), cpLaiVay = plSum(MS_PL.CP_LAI_VAY)
    const khauHao = khauHaoOf(periodsForCol)
    const ebitda = lntt + cpLaiVay + khauHao
    return {
      currentRatio: safeDiv(tsnh, noNH), quickRatio: safeDiv(tsnh - htk, noNH), cashRatio: safeDiv(tien, noNH),
      workingCapital: tsnh - noNH,
      debtToAssets: safeDiv(noPhaiTra, tongTS), debtToEquity: safeDiv(noPhaiTra, vonCSH),
      icr: safeDiv(lntt + cpLaiVay, cpLaiVay), debtToEbitda: safeDiv(vayNH + vayDH, ebitda),
      grossMargin: safeDiv(laiGop, dtt), roe: safeDiv(lnst, vonCSH), roa: safeDiv(lnst, tongTS), netMargin: safeDiv(lnst, dtt),
    }
  }
  type RatioSet = ReturnType<typeof ratioSetFor>
  const ratioByColumn: { hasData: boolean; r: RatioSet }[] = columns.map(c => ({
    hasData: c.periods.length > 0 && vBS(MS_BS.TONG_TS, c.periods) !== 0,
    r: ratioSetFor(c.periods),
  }))
  const val = (key: keyof RatioSet): (number | null)[] => ratioByColumn.map(c => (c.hasData ? c.r[key] : null))

  type RKind = 'ratio' | 'pct' | 'money'
  interface RRow { label: string; formula?: string; note: string; kind: RKind; values: (number | null)[] }
  const fmtRatio = (kind: RKind, v: number) => kind === 'pct' ? pct(v) : kind === 'money' ? fmtS(v) : `${ratioStr(v)} lần`

  const ratioGroups: { title: string; rows: RRow[] }[] = [
    {
      title: '1. Thanh khoản', rows: [
        { label: 'Thanh khoản hiện hành', formula: 'TSNH / Nợ NH', note: 'BĐS: ≥ 1,3 | Xây dựng: ≥ 1,2', kind: 'ratio', values: val('currentRatio') },
        { label: 'Thanh khoản nhanh', formula: '(TSNH − HTK) / Nợ NH', note: 'BĐS: ≥ 0,5 | Xây dựng: ≥ 0,7', kind: 'ratio', values: val('quickRatio') },
        { label: 'Thanh khoản tiền mặt', formula: 'Tiền / Nợ NH', note: '≥ 0,1 là mức tối thiểu an toàn', kind: 'ratio', values: val('cashRatio') },
        { label: 'Vốn lưu động ròng', formula: 'TSNH − Nợ NH', note: `> 0 (đơn vị: ${unitLbl})`, kind: 'money', values: val('workingCapital') },
      ],
    },
    {
      title: '2. Đòn bẩy tài chính', rows: [
        { label: 'Nợ / Tổng TS', formula: 'Tổng nợ phải trả / Tổng TS', note: 'BĐS: ≤ 65% | Xây dựng: ≤ 70%', kind: 'pct', values: val('debtToAssets') },
        { label: 'Nợ / Vốn CSH', formula: 'Tổng nợ phải trả / Vốn CSH', note: 'An toàn: ≤ 2,0x | Cảnh báo: > 3,0x', kind: 'ratio', values: val('debtToEquity') },
        { label: 'ICR — Khả năng trả lãi', formula: '(LNTT + CP lãi vay) / CP lãi vay', note: 'BĐS: ≥ 2,5x | Xây dựng: ≥ 3,0x', kind: 'ratio', values: val('icr') },
        { label: 'Nợ vay / EBITDA', formula: '(Nợ vay NH + DH) / EBITDA', note: 'Ổn: ≤ 4x | Nguy hiểm: > 6x', kind: 'ratio', values: val('debtToEbitda') },
      ],
    },
    {
      title: '3. Sinh lời - Lợi nhuận', rows: [
        { label: 'Lãi gộp / Doanh thu thuần', note: 'BĐS: ≥ 25% | Xây dựng: ≥ 8%', kind: 'pct', values: val('grossMargin') },
        { label: 'ROE', formula: 'LNST / Vốn CSH', note: 'BĐS: ≥ 15% | Xây dựng: ≥ 12%', kind: 'pct', values: val('roe') },
        { label: 'ROA', formula: 'LNST / Tổng TS', note: 'BĐS: ≥ 5% | Xây dựng: ≥ 6%', kind: 'pct', values: val('roa') },
        { label: 'LNST / Doanh thu thuần', note: 'BĐS TM: ≥ 12% | NOXH: ≥ 4%', kind: 'pct', values: val('netMargin') },
      ],
    },
  ]

  return (
    <>
      <div className="tc-sub">{donViLabel} · So sánh: {colLabel || '—'}</div>

      {columns.length <= 1 && (
        <div className="alert-row alert-yellow">⚠ Chưa đủ dữ liệu các kỳ trước để so sánh — chỉ có 1 cột dữ liệu.</div>
      )}

      <div className="pn-grid">
        <div className="panel" style={{ marginBottom: 0 }}>
          <div className="panel-h"><span>📈 Báo cáo kết quả kinh doanh</span><span className="company-badge">{donViLabel}</span></div>
          <div className="panel-b" style={{ overflowX: 'auto' }}>
            <PlTable rows={plRows} columns={columns} fmtS={fmtS} />
          </div>
        </div>

        <div className="col-stack">
          <div className="panel" style={{ marginBottom: 0 }}>
            <div className="panel-h"><span>⚖ Cân đối kế toán & Nguồn vốn</span></div>
            <div className="panel-b" style={{ overflowX: 'auto' }}>
              <table className="stbl">
                <thead>
                  <tr><th /><th className="lbl">Chỉ tiêu</th>{columns.map((c, i) => <th key={i} className="num">{c.label}</th>)}</tr>
                </thead>
                <tbody>
                  <tr className="bold">
                    <td colSpan={2} className="lbl">{tongTaiSanRow.label}</td>
                    {tongTaiSanRow.values.map((v, ci) => <td key={ci} className="num">{fmtS(v)}</td>)}
                  </tr>
                  <BsGroup label="TÀI SẢN NGẮN HẠN" rows={tsnhRows} fmtS={fmtS} />
                  <BsGroup label="TÀI SẢN DÀI HẠN" rows={tsdhRows} fmtS={fmtS} />
                  <tr className="bold">
                    <td colSpan={2} className="lbl">{tongNguonVonRow.label}</td>
                    {tongNguonVonRow.values.map((v, ci) => <td key={ci} className="num">{fmtS(v)}</td>)}
                  </tr>
                  <BsGroup label="NỢ" rows={noRows} fmtS={fmtS} />
                  <BsGroup label="VỐN CHỦ SỞ HỮU" rows={vcshRows} fmtS={fmtS} />
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel" style={{ marginBottom: 0 }}>
            <div className="panel-h"><span>📐 Chỉ số tài chính cơ bản</span><span>{columns.length} kỳ</span></div>
            <div className="panel-b pn-ratio-cards">
              {ratioGroups.map(g => (
                <div className="pn-ratio-card" key={g.title}>
                  <div className="pn-ratio-cardh">{g.title}</div>
                  <table className="stbl pn-ratio-tbl">
                    <thead>
                      <tr><th className="lbl" />{columns.map((c, i) => <th key={i} className="num">{c.label}</th>)}</tr>
                    </thead>
                    <tbody>
                      {g.rows.map(r => (
                        <tr key={r.label}>
                          <td className="lbl">
                            <div className="pn-ratio-label">{r.label}</div>
                            {r.formula && <div className="pn-ratio-meta">{r.formula}</div>}
                            <div className="pn-ratio-meta pn-ratio-note">{r.note}</div>
                          </td>
                          {r.values.map((v, ci) => <td key={ci} className="num">{v == null ? '–' : fmtRatio(r.kind, v)}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}