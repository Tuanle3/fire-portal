'use client'
import { useEffect, useState, useMemo } from 'react'
import { getDb } from '@/lib/firebase'
import { ref, get } from 'firebase/database'
import { useDashUnit } from '@/contexts/dash-unit'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>

function toArr(snap: any): Row[] {
  if (!snap.exists()) return []
  const val = snap.val()
  if (Array.isArray(val)) return val.filter(Boolean)
  if (typeof val === 'object' && val !== null)
    return Object.entries(val).map(([, v]) => (typeof v === 'object' && v !== null ? (v as Row) : {}))
  return []
}

function f(row: Row, name: string): unknown {
  return row[name] ?? row[name.replace(/ /g, '_')]
}
function nf(row: Row, name: string): number { const x = Number(f(row, name)); return isNaN(x) ? 0 : x }

// Check if string (đơn vị or đại diện) represents a cá nhân
function isCaNhanStr(s: string): boolean {
  const low = s.trim().toLowerCase()
  return /^(mr|mrs|ms)[\s./]/.test(low) || low === 'mr' || low === 'mrs' || low === 'ms'
}

const CY    = new Date().getFullYear()
const CY_PX = `${CY}-`

// ─────── Sub-components ───────

function ScoreRing({ score, color }: { score: number; color: string }) {
  const r = 52, circ = 2 * Math.PI * r
  const colorMap: Record<string, string> = {
    green: '#10b981', blue: '#3b82f6', amber: '#f59e0b', orange: '#f97316', red: '#ef4444',
  }
  const c = colorMap[color] ?? '#6b7280'
  const dash = (score / 100) * circ
  return (
    <svg width={120} height={120} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={60} cy={60} r={r} fill="none" stroke="#f0f0f0" strokeWidth={10} />
      <circle cx={60} cy={60} r={r} fill="none" stroke={c} strokeWidth={10}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 1s ease-out' }} />
    </svg>
  )
}

function KpiBar({ title, score, color, note }: { title: string; score: number; color: string; note: string }) {
  const colorMap: Record<string, { bg: string; text: string; bar: string }> = {
    green: { bg: '#f0fdf4', text: '#15803d', bar: '#10b981' },
    amber: { bg: '#FFF4E0', text: '#8A5A12', bar: '#f59e0b' },
    red:   { bg: '#FDECEC', text: '#8C1F1F', bar: '#ef4444' },
  }
  const c = colorMap[color] ?? colorMap.amber
  return (
    <div style={{ background: c.bg, borderRadius: 10, padding: '12px 16px', border: `1px solid ${c.bar}33` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#374151' }}>{title}</span>
        <span style={{ fontSize: 12, fontWeight: 800, color: c.text }}>{score}/100</span>
      </div>
      <div style={{ height: 8, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden', marginBottom: 6 }}>
        <div style={{ height: '100%', width: `${score}%`, background: c.bar, borderRadius: 4, transition: 'width 1s ease-out' }} />
      </div>
      <div style={{ fontSize: 11, color: '#6b7280' }}>{note}</div>
    </div>
  )
}

function RiskCard({ level, icon, title, detail, action }: {
  level: string; icon: string; title: string; detail: string; action: string
}) {
  const lvlMap: Record<string, { bg: string; border: string; titleColor: string; actionColor: string }> = {
    r: { bg: 'rgba(239,68,68,.05)',   border: 'rgba(239,68,68,.20)',   titleColor: '#8C1F1F', actionColor: '#b91c1c' },
    a: { bg: 'rgba(245,158,11,.06)',  border: 'rgba(245,158,11,.25)',  titleColor: '#8A5A12', actionColor: '#b45309' },
    g: { bg: 'rgba(16,185,129,.05)',  border: 'rgba(16,185,129,.20)',  titleColor: '#065f46', actionColor: '#047857' },
  }
  const s = lvlMap[level] ?? lvlMap.a
  return (
    <div style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 10, padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: s.titleColor, marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 11, color: '#374151', lineHeight: 1.65, marginBottom: 4 }}>{detail}</div>
        <div style={{ fontSize: 10.5, color: s.actionColor, fontStyle: 'italic', lineHeight: 1.5 }}>{action}</div>
      </div>
    </div>
  )
}

// ─────── Main Page ───────

export default function SuckhoePage() {
  const { unit } = useDashUnit()
  const divisor = unit === 'tỷ' ? 1_000_000_000 : unit === 'tr' ? 1_000_000 : 1
  const fracs   = unit === 'tỷ' ? 3 : unit === 'tr' ? 1 : 0
  const unitLbl = unit === 'đ' ? 'đ' : `${unit} đ`
  const fmt  = (v: number) => (v / divisor).toLocaleString('vi-VN', { maximumFractionDigits: fracs })
  const fmtN = (v: number) => fmt(Math.abs(v))
  const fmtP = (v: number) => (v > 0 ? '+' : '') + fmt(v)

  const [data,    setData]    = useState<Row[]>([])
  const [dataTs,  setDataTs]  = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  useEffect(() => {
    const db = getDb()
    Promise.all([
      get(ref(db, 'data_quy')),
      get(ref(db, 'data_ts')),
    ])
      .then(([snapQuy, snapTs]) => {
        setData(toArr(snapQuy).sort((a, b) => String(a['Ngày'] ?? '').localeCompare(String(b['Ngày'] ?? ''))))
        setDataTs(toArr(snapTs))
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Lỗi Firebase'))
      .finally(() => setLoading(false))
  }, [])

  // Đầu kỳ per account (last balance before CY)
  const dauKyAcc = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of data) {
      if (String(r['Ngày'] ?? '') >= CY_PX) break
      const s = String(r['Số_tài_khoản'] ?? '')
      if (s) m.set(s, Number(r['Tồn'] ?? 0))
    }
    return m
  }, [data])

  const yearData = useMemo(() => data.filter(r => String(r['Ngày'] ?? '').startsWith(CY_PX)), [data])

  // Monthly aggregation
  const monthRows = useMemo(() => {
    const ton = new Map<string, number>(dauKyAcc)
    const result: Array<{ mm: string; thu: number; chi: number; rong: number; cuoiky: number }> = []
    let curMm = '', mThu = 0, mChi = 0
    for (const r of yearData) {
      const mm   = String(r['Ngày'] ?? '').slice(5, 7)
      const stk  = String(r['Số_tài_khoản'] ?? '')
      const ps   = Number(r['Số_tiền_PS'] ?? 0)
      const loai = String(r['Ghi_chu'] ?? '')
      if (mm !== curMm) {
        if (curMm) {
          let c = 0; ton.forEach(v => { c += v })
          result.push({ mm: curMm, thu: mThu, chi: mChi, rong: mThu - mChi, cuoiky: c })
        }
        curMm = mm; mThu = 0; mChi = 0
      }
      if (loai === 'Thu' || ps > 0) mThu += Math.abs(ps)
      else if (loai === 'Chi' || ps < 0) mChi += Math.abs(ps)
      if (stk) ton.set(stk, Number(r['Tồn'] ?? 0))
    }
    if (curMm) {
      let c = 0; ton.forEach(v => { c += v })
      result.push({ mm: curMm, thu: mThu, chi: mChi, rong: mThu - mChi, cuoiky: c })
    }
    return result
  }, [yearData, dauKyAcc])

  // Current total balance (latest Tồn per account)
  const cuoikyBal = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of data) {
      const s = String(r['Số_tài_khoản'] ?? '')
      if (s) m.set(s, Number(r['Tồn'] ?? 0))
    }
    let total = 0; m.forEach(v => { total += v }); return total
  }, [data])


  // Asset KPIs from data_ts
  const assetKpi = useMemo(() => {
    const mortgaged  = dataTs.filter(r => String(f(r, 'Tình trạng') ?? '').toLowerCase() === 'đã thế chấp')
    const freeAssets = dataTs.filter(r => String(f(r, 'Tình trạng') ?? '').toLowerCase() === 'chưa thế chấp')

    const totalDebt = mortgaged.reduce((s, r)  => s + nf(r, 'Dư nợ phân bổ theo TSĐB'), 0)
    const freeVal   = freeAssets.reduce((s, r) => s + nf(r, 'Định giá'), 0)
    const freeRoom  = freeAssets.reduce((s, r) => s + nf(r, 'Hạn mức cho vay'), 0)
    const freeCount = freeAssets.length

    const cnDebt = dataTs
      .filter(r => isCaNhanStr(String(f(r, 'Đại diện vay') ?? '')))
      .reduce((s, r) => s + nf(r, 'Dư nợ phân bổ theo TSĐB'), 0)
    const pnDebt = totalDebt - cnDebt
    const cnPct  = totalDebt > 0 ? cnDebt / totalDebt * 100 : 0

    const mortgagedSA = mortgaged.filter(r => String(f(r, 'Đại diện vay') ?? '').trim().startsWith('SA.'))
    const nhCap   = mortgagedSA.reduce((s, r) => s + nf(r, 'Hạn mức cho vay'), 0)
    const nhUsed  = mortgagedSA.reduce((s, r) => s + nf(r, 'Dư nợ phân bổ theo TSĐB'), 0)
    const nhAvail = nhCap - nhUsed

    return { totalDebt, cnDebt, pnDebt, cnPct, freeCount, freeVal, freeRoom, nhCap, nhUsed, nhAvail }
  }, [dataTs])

  // ─── Cash flow derived metrics ───
  const totalThu  = monthRows.reduce((s, m) => s + m.thu, 0)
  const totalChi  = monthRows.reduce((s, m) => s + m.chi, 0)
  const cumNet    = totalThu - totalChi
  const burnRate  = totalThu > 0 ? totalChi / totalThu * 100 : 0
  const avgMonChi = monthRows.length > 0 ? totalChi / monthRows.length : 0
  const dailyAvg  = avgMonChi / 30
  const coverDays = dailyAvg > 0 ? cuoikyBal / dailyAvg : 999
  const last2     = monthRows.slice(-2)
  const cashTrend = last2.length === 2 ? last2[1].rong - last2[0].rong : 0
  const mmLabel   = (mm: string) => `T${mm}/${String(CY).slice(2)}`

  // ─── KPI Scores ───
  const liqScore = coverDays >= 90 ? 92 : coverDays >= 60 ? 78 : coverDays >= 30 ? 52 : coverDays >= 14 ? 28 : 12
  const liqColor = coverDays >= 60 ? 'green' : coverDays >= 30 ? 'amber' : 'red'
  const liqLabel = coverDays >= 60 ? 'Tốt' : coverDays >= 30 ? 'Cảnh báo' : 'Nguy hiểm'

  const brScore = burnRate < 70 ? 92 : burnRate < 80 ? 78 : burnRate < 90 ? 55 : burnRate < 100 ? 30 : 12
  const brColor = burnRate < 80 ? 'green' : burnRate < 90 ? 'amber' : 'red'
  const brLabel = burnRate < 80 ? 'An toàn' : burnRate < 90 ? 'Cảnh báo' : 'Nguy hiểm'

  const cfScore = cumNet > 0 && cashTrend >= 0 ? 85 : cumNet > 0 ? 65 : cumNet >= -totalThu * 0.01 ? 40 : 20
  const cfColor = cfScore >= 75 ? 'green' : cfScore >= 50 ? 'amber' : 'red'
  const cfLabel = cfScore >= 75 ? 'Tốt' : cfScore >= 50 ? 'Ổn định' : 'Suy giảm'

  const { cnPct } = assetKpi
  const debtScore = cnPct < 30 ? 88 : cnPct < 50 ? 70 : cnPct < 70 ? 48 : 25
  const debtColor = cnPct < 40 ? 'green' : cnPct < 60 ? 'amber' : 'red'
  const debtLabel = cnPct < 40 ? 'Tốt' : cnPct < 60 ? 'Cần kiểm soát' : 'Rủi ro'

  const score      = Math.round(liqScore * 0.30 + brScore * 0.25 + cfScore * 0.25 + debtScore * 0.20)
  const scoreColor = score >= 80 ? 'green' : score >= 65 ? 'blue' : score >= 50 ? 'amber' : score >= 35 ? 'orange' : 'red'
  const scoreLabel = score >= 80 ? 'Tốt' : score >= 65 ? 'Khá' : score >= 50 ? 'Trung bình' : score >= 35 ? 'Yếu' : 'Nguy hiểm'
  const verdict    = score >= 80
    ? 'Tổng thể tài chính lành mạnh, dòng tiền ổn định.'
    : score >= 65
    ? 'Cơ bản ổn định, một vài chỉ số cần theo dõi.'
    : score >= 50
    ? 'Nhiều rủi ro tiềm ẩn, cần hành động cải thiện.'
    : 'Tài chính đang yếu, cần can thiệp khẩn cấp.'

  const summary = `Thanh khoản ${liqLabel.toLowerCase()} (${coverDays >= 999 ? 'chưa có dữ liệu chi' : coverDays.toFixed(0) + ' ngày'}), burn rate ${brLabel.toLowerCase()} (${burnRate.toFixed(1)}%), dòng tiền ròng lũy kế ${fmtP(cumNet)} ${unitLbl}. Dư nợ ${assetKpi.totalDebt > 0 ? fmtN(assetKpi.totalDebt) + ' ' + unitLbl : 'chưa có'}, tỷ lệ cá nhân ${cnPct.toFixed(1)}% (${debtLabel.toLowerCase()}).`

  const scoreColorMap: Record<string, { bg: string; text: string; border: string }> = {
    green:  { bg: '#f0fdf4', text: '#15803d', border: '#10b981' },
    blue:   { bg: '#eff6ff', text: '#1d4ed8', border: '#3b82f6' },
    amber:  { bg: '#FFF4E0', text: '#8A5A12', border: '#f59e0b' },
    orange: { bg: '#fff7ed', text: '#9a3412', border: '#f97316' },
    red:    { bg: '#FDECEC', text: '#8C1F1F', border: '#ef4444' },
  }
  const sc = scoreColorMap[scoreColor] ?? scoreColorMap.amber

  // ─── Risks ───
  type Risk = { level: string; icon: string; title: string; detail: string; action: string }

  const risks: Risk[] = [
    {
      level: liqColor === 'green' ? 'g' : liqColor === 'amber' ? 'a' : 'r',
      icon:  coverDays < 30 ? '🚨' : coverDays < 60 ? '⚠️' : '✅',
      title: `Thanh khoản: Dự trữ ${coverDays >= 999 ? '—' : coverDays.toFixed(0)} ngày hoạt động`,
      detail: dailyAvg > 0
        ? `Số dư tiền mặt ${fmtN(cuoikyBal)} ${unitLbl} = ${coverDays.toFixed(0)} ngày chi phí (bình quân ${fmtN(dailyAvg)} ${unitLbl}/ngày). ${coverDays < 30 ? 'Mức độ nguy hiểm, cần bổ sung ngay.' : coverDays < 60 ? 'Mức cảnh báo, cần theo dõi sát.' : 'Thanh khoản ở mức an toàn.'}`
        : 'Chưa có dữ liệu chi trong kỳ để tính.',
      action: coverDays < 60
        ? `→ (1) Đẩy nhanh thu hồi công nợ; (2) Giãn các khoản chi lớn; (3) Kích hoạt hạn mức tín dụng ngắn hạn ${fmtN(assetKpi.nhAvail)} ${unitLbl} còn khả dụng.`
        : '→ Duy trì dự trữ tối thiểu ≥ 45 ngày. Gửi kỳ hạn ngắn phần nhàn rỗi.',
    },
    {
      level: brColor === 'green' ? 'g' : brColor === 'amber' ? 'a' : 'r',
      icon:  burnRate >= 100 ? '🚨' : burnRate >= 80 ? '⚠️' : '✅',
      title: `Burn rate: ${burnRate.toFixed(1)}% — ${brLabel}`,
      detail: `Tổng thu ${fmtN(totalThu)} ${unitLbl}, tổng chi ${fmtN(totalChi)} ${unitLbl}. ${burnRate >= 100 ? `Chi vượt thu ${fmtN(totalChi - totalThu)} ${unitLbl}.` : `Thu vượt chi ${fmtN(totalThu - totalChi)} ${unitLbl}.`}`,
      action: burnRate >= 100
        ? '→ (1) Họp khẩn CFO/CEO rà soát nhóm chi cao nhất; (2) Tạm hoãn chi không thiết yếu; (3) Đẩy mạnh thu hồi công nợ.'
        : burnRate >= 80
        ? '→ Kiểm soát chi tiêu, tránh phát sinh mới. Đặt ngưỡng cảnh báo 90%.'
        : '→ Duy trì kỷ luật chi. Dùng thặng dư trả trước nợ gốc.',
    },
    ...(assetKpi.totalDebt > 0 ? [{
      level: cnPct > 60 ? 'r' : cnPct > 40 ? 'a' : 'g',
      icon:  '🏦',
      title: `Cơ cấu nợ: ${cnPct.toFixed(1)}% dư nợ đứng tên cá nhân`,
      detail: `${fmtN(assetKpi.cnDebt)} / ${fmtN(assetKpi.totalDebt)} ${unitLbl} đứng tên cá nhân. Lãi vay không đúng chủ thể bị loại khi quyết toán TNDN — mất ~${fmtN(assetKpi.cnDebt * 0.20 * 0.10)} ${unitLbl}/năm lợi thế thuế ước tính.`,
      action: '→ (1) Ký HĐ ủy quyền vay hộ để ghi nhận chi phí lãi vay đúng pháp nhân; (2) Chuyển sang khế ước pháp nhân khi đáo hạn; (3) Ưu tiên sang tên tài sản lớn.',
    } as Risk] : []),
    ...(assetKpi.freeCount > 0 ? [{
      level: 'g',
      icon:  '✨',
      title: `${assetKpi.freeCount} tài sản chưa khai thác — Room tín dụng ${fmtN(assetKpi.freeRoom)} ${unitLbl}`,
      detail: `${assetKpi.freeCount} BĐS định giá ${fmtN(assetKpi.freeVal)} ${unitLbl} chưa thế chấp, tương đương hạn mức khả dụng ước tính ${fmtN(assetKpi.freeRoom)} ${unitLbl}.`,
      action: '→ Thế chấp tại NH lãi suất thấp nhất · Tất toán khoản vay ngoài NH · Tài trợ dự án mới',
    } as Risk] : []),
    ...(assetKpi.nhCap > 0 ? [{
      level: assetKpi.nhAvail <= 0 ? 'r' : assetKpi.nhUsed / assetKpi.nhCap > 0.8 ? 'a' : 'g',
      icon:  '📊',
      title: `Hạn mức tín dụng khả dụng: ${fmtN(assetKpi.nhAvail)} ${unitLbl}`,
      detail: `Hạn mức cấp ${fmtN(assetKpi.nhCap)} ${unitLbl}, đã dùng ${fmtN(assetKpi.nhUsed)} ${unitLbl} (${assetKpi.nhCap > 0 ? (assetKpi.nhUsed / assetKpi.nhCap * 100).toFixed(1) : 0}%), còn lại ${fmtN(assetKpi.nhAvail)} ${unitLbl}.`,
      action: assetKpi.nhAvail > 0
        ? '→ Ưu tiên dùng hạn mức ngắn hạn NH để thay thế khoản vay lãi cao. Quay vòng để tái sử dụng.'
        : '→ Đàm phán nâng hạn mức hoặc bổ sung TSĐB mới.',
    } as Risk] : []),
    {
      level: cumNet >= 0 && cashTrend >= 0 ? 'g' : cumNet >= 0 ? 'a' : 'r',
      icon:  cumNet >= 0 ? (cashTrend >= 0 ? '✅' : '⚠️') : '🔻',
      title: `Dòng tiền ròng lũy kế: ${fmtP(cumNet)} ${unitLbl} — Xu hướng ${cashTrend >= 0 ? '▲ Cải thiện' : '▼ Suy giảm'}`,
      detail: last2.length === 2
        ? `Lũy kế: ${fmtP(cumNet)} ${unitLbl}. So 2 tháng gần nhất: ${mmLabel(last2[0].mm)} (${fmtP(last2[0].rong)} ${unitLbl}) → ${mmLabel(last2[1].mm)} (${fmtP(last2[1].rong)} ${unitLbl}), ${cashTrend >= 0 ? 'xu hướng tích cực.' : 'xu hướng xấu đi.'}`
        : `Lũy kế: ${fmtP(cumNet)} ${unitLbl}. Cần thêm dữ liệu để phân tích xu hướng.`,
      action: cashTrend < 0
        ? '→ Phân tích nguyên nhân suy giảm. Đặt mục tiêu cải thiện dòng tiền tháng tới ≥ tháng hiện tại.'
        : '→ Duy trì kế hoạch. Dùng thặng dư tích lũy trả trước nợ gốc lãi cao.',
    },
  ]

  // ─── Opportunities ───
  type Opp = { icon: string; title: string; detail: string; impact: string; timeline: string }

  const opps: Opp[] = [
    ...(assetKpi.freeCount > 0 && assetKpi.freeRoom > 0 ? [{
      icon: '🏗️', title: 'Khai thác tài sản nhàn rỗi',
      detail: `Thế chấp ${assetKpi.freeCount} BĐS (định giá ${fmtN(assetKpi.freeVal)} ${unitLbl}) để mở hạn mức ${fmtN(assetKpi.freeRoom)} ${unitLbl} lãi suất ngân hàng, thay thế vay ngoài lãi cao.`,
      impact: 'Cao', timeline: '1–2 tháng',
    } as Opp] : []),
    ...(assetKpi.nhAvail > 0 ? [{
      icon: '💳', title: 'Tối ưu hạn mức tín dụng NH',
      detail: `Còn ${fmtN(assetKpi.nhAvail)} ${unitLbl} hạn mức NH chưa dùng. Rút để trả khoản vay ngoài lãi cao hơn, giảm chi phí tài chính.`,
      impact: 'Cao', timeline: '2 tuần',
    } as Opp] : []),
    ...(cnPct > 40 ? [{
      icon: '🔄', title: 'Tái cơ cấu nợ cá nhân → pháp nhân',
      detail: `${cnPct.toFixed(1)}% dư nợ đứng tên cá nhân. Chuyển sang pháp nhân khi đáo hạn giúp ghi nhận lãi vay hợp lệ, tiết kiệm ~${fmtN(assetKpi.cnDebt * 0.02)} ${unitLbl}/năm.`,
      impact: 'Trung bình', timeline: '3–6 tháng',
    } as Opp] : []),
    ...(burnRate < 85 && cumNet > 0 ? [{
      icon: '📈', title: 'Tái đầu tư thặng dư dòng tiền',
      detail: `Burn rate ${burnRate.toFixed(1)}% và dòng tiền ròng dương ${fmtN(cumNet)} ${unitLbl}. Gửi kỳ hạn ngắn phần nhàn rỗi hoặc trả trước nợ gốc lãi cao.`,
      impact: 'Trung bình', timeline: '1 tháng',
    } as Opp] : []),
    {
      icon: '🤖', title: 'Tự động hóa theo dõi dòng tiền',
      detail: 'Cài đặt cảnh báo tự động khi số dư dưới ngưỡng 30 ngày chi phí hoặc burn rate vượt 90% để CFO phản ứng kịp thời.',
      impact: 'Trung bình', timeline: '1 tháng',
    },
  ]

  // ─── Priority Actions ───
  type Action = { priority: number; icon: string; title: string; detail: string; deadline: string; owner: string }

  const actions: Action[] = [
    ...(coverDays < 30 ? [{
      priority: 1, icon: '🚨',
      title: 'Kích hoạt hạn mức tín dụng khẩn cấp',
      detail: `Số dư chỉ còn ${coverDays.toFixed(0)} ngày chi phí. Liên hệ NH rút hạn mức ${fmtN(assetKpi.nhAvail)} ${unitLbl} ngay.`,
      deadline: 'Trong tuần này', owner: 'CFO',
    } as Action] : []),
    ...(burnRate >= 90 ? [{
      priority: 2, icon: '📋',
      title: 'Họp khẩn rà soát chi phí',
      detail: `Burn rate ${burnRate.toFixed(1)}% vượt ngưỡng nguy hiểm. Cắt giảm ngay nhóm chi không thiết yếu, giãn chi lớn.`,
      deadline: 'Trong 3 ngày', owner: 'BĐH',
    } as Action] : []),
    ...(assetKpi.freeCount > 0 ? [{
      priority: burnRate >= 90 ? 3 : 2, icon: '🏗️',
      title: `Thế chấp ${assetKpi.freeCount} tài sản chưa khai thác`,
      detail: `Mở hạn mức ${fmtN(assetKpi.freeRoom)} ${unitLbl} từ ${assetKpi.freeCount} BĐS chưa thế chấp (định giá ${fmtN(assetKpi.freeVal)} ${unitLbl}).`,
      deadline: '1–2 tháng', owner: 'CFO',
    } as Action] : []),
    ...(cnPct > 50 ? [{
      priority: 4, icon: '🔄',
      title: 'Lập kế hoạch tái cơ cấu nợ cá nhân',
      detail: `${cnPct.toFixed(1)}% dư nợ đứng tên cá nhân. Ký HĐ ủy quyền vay hộ và lên lịch chuyển pháp nhân khi đáo hạn.`,
      deadline: '2–4 tuần', owner: 'Kế toán',
    } as Action] : []),
    {
      priority: 5, icon: '📊',
      title: 'Lập dự báo dòng tiền quý tới',
      detail: 'Xây dựng kế hoạch thu-chi quý tới với kịch bản lạc quan/cơ sở/xấu nhất để chủ động điều phối vốn.',
      deadline: '1 tháng', owner: 'Tài chính',
    },
    {
      priority: 6, icon: '💰',
      title: 'Rà soát thay thế vay lãi cao bằng NH',
      detail: 'Liệt kê tất cả khoản vay ngoài NH, xếp hạng theo lãi suất, lên kế hoạch tất toán bằng hạn mức NH thấp hơn.',
      deadline: '1–2 tháng', owner: 'CFO',
    },
  ]

  // ─── Render ───

  if (loading) return (
    <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', color: '#6B7280', fontSize: 14 }}>
      ⏳ Đang tải dữ liệu từ Firebase...
    </div>
  )
  if (error) return (
    <div style={{ margin: 24, padding: 16, background: '#FDECEC', border: '1px solid #FECACA', borderRadius: 8, color: '#8C1F1F' }}>⚠ {error}</div>
  )

  return (
    <>
      <style>{`
        .hk{flex:1;overflow-y:auto;padding:16px 24px 24px;background:#FAF8F3}
        .h-card{background:#fff;border:1px solid #E5E0D8;border-radius:14px;padding:20px;box-shadow:0 2px 8px rgba(13,31,51,.06)}
        .act-card{background:#fff;border:1px solid #E5E0D8;border-radius:10px;padding:14px 16px;display:flex;gap:12px;align-items:flex-start;transition:box-shadow .15s}
        .act-card:hover{box-shadow:0 2px 10px rgba(13,31,51,.10)}
        .opp-card{background:linear-gradient(135deg,#EEF3FA,#fff);border:1px solid #D0DCE8;border-radius:10px;padding:14px 16px}
        .hk-row1{display:grid;grid-template-columns:auto 1fr;gap:16px;align-items:start;margin-bottom:16px}
        .hk-row1-right{display:flex;flex-direction:column;gap:14px}
        .hk-kpis{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .hk-row2{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
        .hk-sec-title{font-size:12px;font-weight:700;color:#0D1F33;text-transform:uppercase;letter-spacing:.05em;margin-bottom:14px;display:flex;align-items:center;gap:8px}
        .hk-badge{font-size:10px;font-weight:600;color:#6b7280;background:#f3f4f6;border-radius:20px;padding:2px 8px}
        @media(max-width:900px){.hk-row1,.hk-row2{grid-template-columns:1fr}.hk-kpis{grid-template-columns:1fr 1fr}.hk{padding:12px 14px}}
      `}</style>

      <main className="hk">

        {/* ── Row 1: Score ring + Summary + 4 KPI bars ── */}
        <div className="hk-row1">

          {/* Score panel */}
          <div className="h-card" style={{ background: sc.bg, borderColor: sc.border + '44', textAlign: 'center', minWidth: 180, padding: '24px 28px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 12 }}>Điểm sức khỏe</div>
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <ScoreRing score={score} color={scoreColor} />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: sc.text, lineHeight: 1 }}>{score}</div>
                <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>/ 100</div>
              </div>
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: sc.text, marginTop: 8 }}>{scoreLabel}</div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6, lineHeight: 1.5, fontStyle: 'italic' }}>{verdict}</div>
          </div>

          {/* Right: Summary + 4 KPI bars */}
          <div className="hk-row1-right">
            <div className="h-card">
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>Nhận định tổng quan</div>
              <div style={{ fontSize: 13, color: '#1F2430', lineHeight: 1.8 }}>{summary}</div>
            </div>
            <div className="hk-kpis">
              <KpiBar title="💧 Thanh khoản" score={liqScore} color={liqColor} note={`${coverDays >= 999 ? '—' : coverDays.toFixed(0) + ' ngày'} · ${liqLabel}`} />
              <KpiBar title="🏦 Dư nợ" score={debtScore} color={debtColor} note={`${cnPct.toFixed(1)}% cá nhân · ${debtLabel}`} />
              <KpiBar title="📈 Dòng tiền" score={cfScore} color={cfColor} note={`Lũy kế ${fmtP(cumNet)} ${unitLbl} · ${cfLabel}`} />
              <KpiBar title="🔥 Burn rate" score={brScore} color={brColor} note={`${burnRate.toFixed(1)}% · ${brLabel}`} />
            </div>
          </div>
        </div>

        {/* ── Row 2: Risks & Opportunities ── */}
        <div className="hk-row2">

          {/* Risks */}
          <div className="h-card">
            <div className="hk-sec-title">
              ⚠️ Cảnh báo rủi ro
              <span className="hk-badge">{risks.length} mục</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {risks.map((r, i) => <RiskCard key={i} {...r} />)}
            </div>
          </div>

          {/* Opportunities */}
          <div className="h-card">
            <div className="hk-sec-title">
              💡 Cơ hội tối ưu
              <span className="hk-badge">{opps.length} mục</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {opps.map((o, i) => (
                <div key={i} className="opp-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 16 }}>{o.icon}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#1C3557' }}>{o.title}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 8 }}>
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 20, border: '1px solid',
                        background:   o.impact === 'Cao' ? '#EAF6EE' : '#FFF4E0',
                        color:        o.impact === 'Cao' ? '#15803d' : '#8A5A12',
                        borderColor:  o.impact === 'Cao' ? '#bbf7d0' : '#fde68a',
                      }}>{o.impact}</span>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                        {o.timeline}
                      </span>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: '#374151', lineHeight: 1.65, paddingLeft: 24 }}>{o.detail}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Row 3: Priority Actions ── */}
        <div className="h-card">
          <div className="hk-sec-title">
            ✅ Kế hoạch hành động ưu tiên
            <span className="hk-badge">{actions.length} việc</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
            {[...actions].sort((a, b) => a.priority - b.priority).map((act, i) => {
              const priColor  = act.priority <= 2 ? '#8C1F1F' : act.priority === 3 ? '#8A5A12' : '#15803d'
              const priBg     = act.priority <= 2 ? '#FDECEC' : act.priority === 3 ? '#FFF4E0' : '#f0fdf4'
              const priBorder = act.priority <= 2 ? '#fecaca' : act.priority === 3 ? '#fde68a' : '#bbf7d0'
              return (
                <div key={i} className="act-card">
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: priBg, border: `1px solid ${priBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 11, fontWeight: 800, color: priColor }}>
                    {act.priority}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 14 }}>{act.icon}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#1F2430' }}>{act.title}</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#374151', lineHeight: 1.6, marginBottom: 6 }}>{act.detail}</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: '#6366f1', background: '#eef2ff', borderRadius: 20, padding: '2px 8px', border: '1px solid #c7d2fe' }}>
                        🕐 {act.deadline}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: '#0D1F33', background: '#EEF3FA', borderRadius: 20, padding: '2px 8px', border: '1px solid #D0DCE8' }}>
                        👤 {act.owner}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

      </main>
    </>
  )
}
