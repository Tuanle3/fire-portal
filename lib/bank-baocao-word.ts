import {
  Document, Packer, Paragraph, TextRun,
  Table, TableRow, TableCell, WidthType, AlignmentType,
  ShadingType, VerticalAlign, VerticalMergeType, BorderStyle, TableLayoutType, PageOrientation,
  Footer, PageNumber,
} from 'docx'
import {
  BankRelation, BankProposal, BankNote, TienDoHangMuc,
  DANH_GIA_LABEL, TRANG_THAI_NH_LABEL, LOAI_HINH_LABEL, LOAI_VAY_LABEL, TRANG_THAI_PA_LABEL, TIEN_DO_HM_LABEL,
  minLaiSuat, laiSuatDisplay, mucTaiTroDisplay, customRowLabels, customRowValue, isHoSoDangXuLy,
} from './bank-types'

// ── Màu & font (khớp bảng trên màn hình) ─────────────────────────────────────────
const NAVY = '1C3557'
const GREEN = '15803D'
const RED = 'DC2626'
const HEAD_BG = 'F5F8FC'
const GROUP_BG = 'EEF3FA'
const MUTED = '4B6A8A'
const GREY = '9CA3AF'
const INK = '1F2430'
const FONT = 'Arial'

const fmt = (n: number) => (n === 0 ? '—' : Math.round(n).toLocaleString('vi-VN'))
const pct = (n: number) => (n === 0 ? '—' : n.toFixed(1) + '%')

function txt(text: string, o: { size?: number; bold?: boolean; color?: string } = {}) {
  return new TextRun({ text, font: FONT, size: o.size ?? 18, bold: o.bold, color: o.color ?? INK })
}

// Tách nội dung nhiều dòng (do người dùng xuống dòng khi nhập) thành các TextRun
// có ngắt dòng thật trong Word — nếu không, \n trong 1 TextRun sẽ bị bỏ qua và
// toàn bộ nội dung dồn lại thành 1 dòng liền.
function multilineRuns(text: string, o: { size?: number; bold?: boolean; color?: string } = {}): TextRun[] {
  const lines = (text || '—').split('\n')
  return lines.map((line, i) => new TextRun({ text: line, font: FONT, size: o.size ?? 18, bold: o.bold, color: o.color ?? INK, break: i > 0 ? 1 : 0 }))
}

function cell(opts: {
  runs: TextRun[]
  width: number
  align?: 'left' | 'right' | 'center'
  bg?: string
  columnSpan?: number
  verticalMerge?: 'restart' | 'continue'
}) {
  const align =
    opts.align === 'right' ? AlignmentType.RIGHT
      : opts.align === 'center' ? AlignmentType.CENTER
        : AlignmentType.LEFT
  return new TableCell({
    width: { size: opts.width, type: WidthType.DXA },
    columnSpan: opts.columnSpan,
    verticalMerge: opts.verticalMerge === 'restart' ? VerticalMergeType.RESTART : opts.verticalMerge === 'continue' ? VerticalMergeType.CONTINUE : undefined,
    shading: opts.bg ? { type: ShadingType.CLEAR, color: 'auto', fill: opts.bg } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 40, bottom: 40, left: 90, right: 90 },
    children: [new Paragraph({ alignment: align, children: opts.runs })],
  })
}

function sectionHead(roman: string, title: string) {
  return new Paragraph({
    spacing: { before: 260, after: 100 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: NAVY, space: 4 } },
    children: [txt(`${roman}. ${title}`, { bold: true, size: 22, color: NAVY })],
  })
}

export interface BankWordInput {
  printDate: string
  relations: BankRelation[]
  proposals: (BankProposal & { tenNganHang: string })[]
  notes: (BankNote & { tenNganHang: string })[]
  deXuat: string
  mode: 'compact' | 'full'
}

export function buildBankDoc(input: BankWordInput): Document {
  const { printDate, relations, proposals, notes, deXuat, mode } = input
  const showFull = mode === 'full'
  const PAGE_W = 15398 // A4 ngang, trừ lề (twip)

  const children: (Paragraph | Table)[] = [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [txt('SƠN AN GROUP', { bold: true, size: 16, color: GREY })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [txt('BÁO CÁO QUAN HỆ & PHƯƠNG ÁN NGÂN HÀNG', { bold: true, size: 28, color: NAVY })] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: NAVY, space: 6 } },
      children: [txt(`Ngày in: ${printDate}`, { size: 15, color: GREY })],
    }),
  ]

  // ── I. Tổng quan quan hệ ngân hàng (chỉ ở bản đầy đủ) ─────────────────────
  if (showFull) {
    children.push(sectionHead('I', 'TỔNG QUAN QUAN HỆ NGÂN HÀNG'))
    const W = [PAGE_W * .22, PAGE_W * .13, PAGE_W * .16, PAGE_W * .16, PAGE_W * .13, PAGE_W * .20]
    const head = new TableRow({
      tableHeader: true,
      children: [
        cell({ runs: [txt('Ngân hàng', { bold: true, color: MUTED, size: 15 })], width: W[0], bg: HEAD_BG }),
        cell({ runs: [txt('Trạng thái', { bold: true, color: MUTED, size: 15 })], width: W[1], bg: HEAD_BG }),
        cell({ runs: [txt('Hạn mức (đ)', { bold: true, color: MUTED, size: 15 })], width: W[2], align: 'right', bg: HEAD_BG }),
        cell({ runs: [txt('Dư nợ (đ)', { bold: true, color: MUTED, size: 15 })], width: W[3], align: 'right', bg: HEAD_BG }),
        cell({ runs: [txt('Lãi suất bq', { bold: true, color: MUTED, size: 15 })], width: W[4], align: 'right', bg: HEAD_BG }),
        cell({ runs: [txt('Đánh giá', { bold: true, color: MUTED, size: 15 })], width: W[5], bg: HEAD_BG }),
      ],
    })
    const rows = relations.length === 0
      ? [new TableRow({ children: [cell({ runs: [txt('Chưa có ngân hàng nào.', { color: GREY })], width: PAGE_W, align: 'center', columnSpan: 6 })] })]
      : relations.map(r => new TableRow({
        children: [
          cell({
            runs: [
              new TextRun({ text: r.tenNganHang, font: FONT, size: 18, bold: true, color: NAVY }),
              new TextRun({ text: [r.chiNhanh, LOAI_HINH_LABEL[r.loaiHinh]].filter(Boolean).join(' · '), font: FONT, size: 15, color: MUTED, break: 1 }),
            ],
            width: W[0],
          }),
          cell({ runs: [txt(TRANG_THAI_NH_LABEL[r.trangThai])], width: W[1] }),
          cell({ runs: [txt(fmt(r.hanMucHienTai))], width: W[2], align: 'right' }),
          cell({ runs: [txt(fmt(r.duNoHienTai), { color: r.duNoHienTai > 0 ? RED : undefined })], width: W[3], align: 'right' }),
          cell({ runs: [txt(pct(r.laiSuatBinhQuan))], width: W[4], align: 'right' }),
          cell({ runs: [txt(DANH_GIA_LABEL[r.danhGia])], width: W[5] }),
        ],
      }))
    const border = { style: BorderStyle.SINGLE, size: 2, color: 'D0DCE8' }
    children.push(new Table({
      width: { size: PAGE_W, type: WidthType.DXA },
      columnWidths: W,
      layout: TableLayoutType.FIXED,
      borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
      rows: [head, ...rows],
    }))
  }

  // ── II. So sánh phương án đang xem xét ────────────────────────────────────
  children.push(sectionHead(showFull ? 'II' : 'I', 'SO SÁNH PHƯƠNG ÁN ĐANG XEM XÉT'))
  if (proposals.length === 0) {
    children.push(new Paragraph({ spacing: { after: 120 }, children: [txt('Chưa chọn phương án nào để so sánh (chọn ở tab So sánh).', { color: GREY })] }))
  } else {
    const nCol = proposals.length
    const W_LABEL = Math.round(PAGE_W * 0.22)
    const W_COL = Math.round((PAGE_W - W_LABEL) / nCol)
    type ProposalRow = BankProposal & { tenNganHang: string }
    const rowsDef: { label: string; get: (p: ProposalRow) => string; bestOf?: (p: ProposalRow) => number; better?: 'min' | 'max' }[] = [
      { label: 'Ngân hàng', get: p => p.tenNganHang },
      { label: 'Loại vay', get: p => LOAI_VAY_LABEL[p.loaiVay] },
      { label: 'Ẩn hạn / Kỳ hạn', get: p => p.thoiHan || '—' },
      { label: 'Lãi suất', get: p => laiSuatDisplay(p), bestOf: minLaiSuat, better: 'min' },
      { label: 'Mức tài trợ', get: p => mucTaiTroDisplay(p, fmt), bestOf: p => p.hanMucDeXuat, better: 'max' },
      { label: 'Tỷ lệ TSĐB', get: p => pct(p.tyLeTSDB) },
      { label: 'TSĐB yêu cầu / chấp nhận', get: p => p.tsdbDieuKien || '—' },
      { label: 'TSĐB từ chối / loại trừ', get: p => p.tsdbTuChoi || '—' },
      { label: 'Hỗ trợ đặc biệt', get: p => p.hoTroDacBiet || '—' },
      { label: 'Phương thức thanh toán', get: p => p.phuongThucTT || '—' },
      { label: 'Phí dịch vụ', get: p => p.phiDichVu || '—' },
      { label: 'Điều kiện khác', get: p => p.dieuKien || '—' },
      { label: 'Ưu điểm', get: p => p.uuDiem.length ? p.uuDiem.map(s => '+ ' + s).join('\n') : '—' },
      { label: 'Nhược điểm', get: p => p.nhuocDiem.length ? p.nhuocDiem.map(s => '− ' + s).join('\n') : '—' },
      { label: 'Trạng thái', get: p => TRANG_THAI_PA_LABEL[p.trangThai] },
      ...customRowLabels(proposals).map(label => ({ label, get: (p: ProposalRow) => customRowValue(p, label) })),
    ]
    const head = new TableRow({
      tableHeader: true,
      children: [
        cell({ runs: [txt('Chỉ tiêu', { bold: true, color: 'FFFFFF' })], width: W_LABEL, bg: NAVY }),
        ...proposals.map(p => cell({ runs: [txt(p.tenPhuongAn, { bold: true, color: 'FFFFFF', size: 16 })], width: W_COL, align: 'center', bg: NAVY })),
      ],
    })
    const rows = rowsDef.map((rd, i) => {
      let bestVal: number | null = null
      if (rd.bestOf) {
        const vals = proposals.map(rd.bestOf).filter(v => v !== 0)
        if (vals.length) bestVal = rd.better === 'min' ? Math.min(...vals) : Math.max(...vals)
      }
      return new TableRow({
        children: [
          cell({ runs: [txt(rd.label, { bold: true, color: MUTED, size: 15 })], width: W_LABEL, bg: i % 2 === 0 ? HEAD_BG : undefined }),
          ...proposals.map(p => {
            const isBest = bestVal !== null && rd.bestOf?.(p) === bestVal
            return cell({
              runs: rd.get(p).split('\n').map((line, li) => new TextRun({ text: line, font: FONT, size: 17, bold: isBest, color: isBest ? GREEN : INK, break: li > 0 ? 1 : 0 })),
              width: W_COL, align: 'center', bg: isBest ? 'EAF6EE' : (i % 2 === 0 ? HEAD_BG : undefined),
            })
          }),
        ],
      })
    })
    const border = { style: BorderStyle.SINGLE, size: 2, color: 'D0DCE8' }
    children.push(new Table({
      width: { size: PAGE_W, type: WidthType.DXA },
      columnWidths: [W_LABEL, ...proposals.map(() => W_COL)],
      layout: TableLayoutType.FIXED,
      borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
      rows: [head, ...rows],
    }))
  }

  // ── III. Nhật ký làm việc gần đây (chỉ ở bản đầy đủ) ──────────────────────
  // Mỗi ngân hàng chỉ lấy ghi chú MỚI NHẤT (đầu vào đã sắp giảm dần theo ngày) — hiển thị
  // dạng checklist: từng hạng mục 1 dòng riêng kèm tiến độ, ngân hàng & ghi chú gộp ô dọc.
  if (showFull) {
    children.push(sectionHead('III', 'NHẬT KÝ LÀM VIỆC GẦN ĐÂY'))
    const seenBank = new Set<string>()
    const latestPerBank = notes.filter(n => {
      if (seenBank.has(n.nganHangId)) return false
      seenBank.add(n.nganHangId)
      return true
    })
    if (latestPerBank.length === 0) {
      children.push(new Paragraph({ spacing: { after: 120 }, children: [txt('Chưa có ghi chú nào.', { color: GREY })] }))
    } else {
      const W = [PAGE_W * .14, PAGE_W * .46, PAGE_W * .13, PAGE_W * .27]
      const border = { style: BorderStyle.SINGLE, size: 2, color: 'D0DCE8' }
      const head = new TableRow({
        tableHeader: true,
        children: [
          cell({ runs: [txt('Ngân hàng', { bold: true, color: MUTED, size: 15 })], width: W[0], bg: HEAD_BG }),
          cell({ runs: [txt('Tình trạng hồ sơ', { bold: true, color: MUTED, size: 15 })], width: W[1], bg: HEAD_BG }),
          cell({ runs: [txt('Tiến độ', { bold: true, color: MUTED, size: 15 })], width: W[2], bg: HEAD_BG }),
          cell({ runs: [txt('Ghi chú', { bold: true, color: MUTED, size: 15 })], width: W[3], bg: HEAD_BG }),
        ],
      })
      const rows: TableRow[] = []
      for (const n of latestPerBank) {
        const items: { id: string; noiDung: string; tienDo?: TienDoHangMuc }[] =
          n.hangMuc.length > 0 ? n.hangMuc : [{ id: 'x', noiDung: '—' }]
        const ghiChu = [
          n.danhGiaChung,
          [n.viecCanLam, n.hanXuLy && `Hạn: ${n.hanXuLy}`].filter(Boolean).join(' · '),
        ].filter(Boolean).join('\n')
        items.forEach((h, i) => {
          rows.push(new TableRow({
            children: [
              cell({ runs: i === 0 ? [txt(n.tenNganHang, { bold: true, color: NAVY })] : [], width: W[0], verticalMerge: i === 0 ? 'restart' : 'continue' }),
              cell({ runs: multilineRuns(h.noiDung), width: W[1] }),
              cell({
                runs: h.tienDo
                  ? [txt(TIEN_DO_HM_LABEL[h.tienDo], { color: h.tienDo === 'da_cung_cap' ? GREEN : h.tienDo === 'chua_thuc_hien' ? RED : undefined, bold: h.tienDo !== 'chua_xac_nhan' })]
                  : [txt('—', { color: GREY })],
                width: W[2],
              }),
              cell({ runs: i === 0 ? multilineRuns(ghiChu || '—') : [], width: W[3], verticalMerge: i === 0 ? 'restart' : 'continue' }),
            ],
          }))
        })
      }
      children.push(new Table({
        width: { size: PAGE_W, type: WidthType.DXA },
        columnWidths: W,
        layout: TableLayoutType.FIXED,
        borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
        rows: [head, ...rows],
      }))
    }
  }

  // ── IV. Đề xuất / Kết luận ─────────────────────────────────────────────────
  children.push(sectionHead(showFull ? 'IV' : 'II', 'ĐỀ XUẤT / KẾT LUẬN'))
  children.push(new Table({
    width: { size: PAGE_W, type: WidthType.DXA },
    columnWidths: [PAGE_W],
    layout: TableLayoutType.FIXED,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: NAVY }, bottom: { style: BorderStyle.SINGLE, size: 4, color: NAVY },
      left: { style: BorderStyle.SINGLE, size: 4, color: NAVY }, right: { style: BorderStyle.SINGLE, size: 4, color: NAVY },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    },
    rows: [new TableRow({
      children: [new TableCell({
        width: { size: PAGE_W, type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, color: 'auto', fill: GROUP_BG },
        margins: { top: 160, bottom: 160, left: 160, right: 160 },
        children: (deXuat || 'Chưa nhập đề xuất.').split('\n').map(line => new Paragraph({ children: [txt(line, { color: deXuat ? INK : GREY })] })),
      })],
    })],
  }))

  const footer = new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ children: ['Trang ', PageNumber.CURRENT, '/', PageNumber.TOTAL_PAGES], font: FONT, size: 16, color: GREY })],
    })],
  })

  return new Document({
    styles: { default: { document: { run: { font: FONT, size: 18, color: INK } } } },
    sections: [{
      properties: {
        page: {
          size: { orientation: PageOrientation.LANDSCAPE },
          margin: { top: 720, bottom: 720, left: 720, right: 720 },
        },
      },
      footers: { default: footer },
      children,
    }],
  })
}

export async function exportBankWord(input: BankWordInput): Promise<void> {
  const doc = buildBankDoc(input)
  const blob = await Packer.toBlob(doc)
  const fname = `Bao cao ngan hang (${input.mode === 'full' ? 'day du' : 'gon'}).docx`
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fname
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ── Báo cáo hồ sơ vay vốn hằng ngày (16h) ────────────────────────────────────
// Liệt kê mọi hồ sơ đang xử lý (chưa giải ngân/từ chối/hết hạn), nhóm theo ngân hàng,
// kèm cập nhật gần nhất từ nhật ký làm việc — dùng để báo cáo nhanh cho thư ký/Ban Giám đốc.

export interface HoSoVayVonInput {
  printDate: string
  relations: BankRelation[]
  proposals: BankProposal[]
  notes: BankNote[]
}

export function buildHoSoVayVonDoc(input: HoSoVayVonInput): Document {
  const { printDate, relations, proposals, notes } = input
  const PAGE_W = 15398 // A4 ngang, trừ lề (twip)
  const dangXuLy = proposals.filter(p => isHoSoDangXuLy(p.trangThai))

  const children: (Paragraph | Table)[] = [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [txt('SƠN AN GROUP', { bold: true, size: 16, color: GREY })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [txt('BÁO CÁO HỒ SƠ VAY VỐN HẰNG NGÀY', { bold: true, size: 28, color: NAVY })] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: NAVY, space: 6 } },
      children: [txt(`Chốt số liệu 16:00 · Ngày ${printDate}`, { size: 15, color: GREY })],
    }),
  ]

  if (dangXuLy.length === 0) {
    children.push(new Paragraph({ spacing: { after: 120 }, children: [txt('Không có hồ sơ nào đang xử lý.', { color: GREY })] }))
  } else {
    const W = [PAGE_W * .24, PAGE_W * .12, PAGE_W * .18, PAGE_W * .16, PAGE_W * .12, PAGE_W * .18]
    const border = { style: BorderStyle.SINGLE, size: 2, color: 'D0DCE8' }

    for (const r of relations) {
      const rHoSo = dangXuLy.filter(p => p.nganHangId === r.id)
      if (rHoSo.length === 0) continue

      children.push(new Paragraph({
        spacing: { before: 220, after: 80 },
        children: [
          txt(r.tenNganHang, { bold: true, size: 21, color: NAVY }),
          txt(`  ${[r.chiNhanh, LOAI_HINH_LABEL[r.loaiHinh]].filter(Boolean).join(' · ')} · ${rHoSo.length} hồ sơ đang xử lý`, { size: 15, color: MUTED }),
        ],
      }))

      const head = new TableRow({
        tableHeader: true,
        children: [
          cell({ runs: [txt('Hồ sơ / Phương án', { bold: true, color: MUTED, size: 15 })], width: W[0], bg: HEAD_BG }),
          cell({ runs: [txt('Loại vay', { bold: true, color: MUTED, size: 15 })], width: W[1], bg: HEAD_BG }),
          cell({ runs: [txt('Mức tài trợ', { bold: true, color: MUTED, size: 15 })], width: W[2], align: 'right', bg: HEAD_BG }),
          cell({ runs: [txt('Trạng thái hồ sơ', { bold: true, color: MUTED, size: 15 })], width: W[3], bg: HEAD_BG }),
          cell({ runs: [txt('Ngày nộp', { bold: true, color: MUTED, size: 15 })], width: W[4], bg: HEAD_BG }),
          cell({ runs: [txt('Người phụ trách', { bold: true, color: MUTED, size: 15 })], width: W[5], bg: HEAD_BG }),
        ],
      })
      const rows = rHoSo.map(p => new TableRow({
        children: [
          cell({ runs: [txt(p.tenPhuongAn, { bold: true })], width: W[0] }),
          cell({ runs: [txt(LOAI_VAY_LABEL[p.loaiVay])], width: W[1] }),
          cell({ runs: [txt(mucTaiTroDisplay(p, fmt))], width: W[2], align: 'right' }),
          cell({ runs: [txt(TRANG_THAI_PA_LABEL[p.trangThai], { color: p.trangThai === 'da_duyet' ? GREEN : INK, bold: p.trangThai === 'da_duyet' })], width: W[3] }),
          cell({ runs: [txt(p.ngayNopHoSo || '—')], width: W[4] }),
          cell({ runs: [txt(p.nguoiPhuTrach || '—')], width: W[5] }),
        ],
      }))
      children.push(new Table({
        width: { size: PAGE_W, type: WidthType.DXA },
        columnWidths: W,
        layout: TableLayoutType.FIXED,
        borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
        rows: [head, ...rows],
      }))

      const latestNote = [...notes].filter(n => n.nganHangId === r.id).sort((a, b) => b.ngay.localeCompare(a.ngay))[0]
      if (latestNote) {
        const summary = [
          ...latestNote.hangMuc.map(h => `${h.noiDung} (${TIEN_DO_HM_LABEL[h.tienDo]})`),
          latestNote.danhGiaChung,
        ].filter(Boolean).join('\n')
        children.push(new Paragraph({
          spacing: { before: 60, after: 40 },
          children: [
            txt('Cập nhật gần nhất: ', { bold: true, size: 15, color: MUTED }),
            txt(`[${latestNote.ngay}] `, { size: 15, color: INK }),
            ...multilineRuns(summary || '—', { size: 15 }),
          ],
        }))
      }
    }
  }

  const footer = new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ children: ['Trang ', PageNumber.CURRENT, '/', PageNumber.TOTAL_PAGES], font: FONT, size: 16, color: GREY })],
    })],
  })

  return new Document({
    styles: { default: { document: { run: { font: FONT, size: 18, color: INK } } } },
    sections: [{
      properties: {
        page: {
          size: { orientation: PageOrientation.LANDSCAPE },
          margin: { top: 720, bottom: 720, left: 720, right: 720 },
        },
      },
      footers: { default: footer },
      children,
    }],
  })
}

export async function exportHoSoVayVonWord(input: HoSoVayVonInput): Promise<void> {
  const doc = buildHoSoVayVonDoc(input)
  const blob = await Packer.toBlob(doc)
  const safeDate = input.printDate.replace(/\//g, '-')
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Bao cao ho so vay von - ${safeDate}.docx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
