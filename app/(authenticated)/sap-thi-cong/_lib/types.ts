// ─── Types cho module SAP - Thi công ────────────────────────────
// Mỗi dự án (SapProject) có danh mục riêng: hangMuc / dongTien / vatTu /
// nhaThau (+ nghiemThu con) / khoanVay (+ kyTraNo con) / nguonVon.
// Toàn bộ lưu trong Firestore theo path:
//   sapThiCongProjects/{projectId}
//   sapThiCongProjects/{projectId}/hangMuc/{id}
//   sapThiCongProjects/{projectId}/dongTien/{id}
//   sapThiCongProjects/{projectId}/vatTu/{id}
//   sapThiCongProjects/{projectId}/nhaThau/{id}
//   sapThiCongProjects/{projectId}/nhaThau/{id}/nghiemThu/{id}
//   sapThiCongProjects/{projectId}/khoanVay/{id}
//   sapThiCongProjects/{projectId}/khoanVay/{id}/kyTraNo/{id}
//   sapThiCongProjects/{projectId}/nguonVon/{id}

export type ProjectStatus = 'active' | 'upcoming' | 'done'

export type SapProject = {
  id: string
  name: string
  code?: string
  address?: string
  scope?: string
  contractValue?: number   // tổng mức đầu tư (đ)
  startDate?: string       // yyyy-mm-dd
  endDate?: string
  status: ProjectStatus
  createdAt?: number
}

export type HangMucStatus = 'todo' | 'active' | 'done' | 'delay'

export type HangMuc = {
  id: string
  name: string
  parentId?: string | null
  startDate?: string
  endDate?: string
  progressPct: number
  status: HangMucStatus
  order?: number
  note?: string
}

export type DongTienType = 'thu' | 'chi'

export type DongTienItem = {
  id: string
  date: string
  type: DongTienType
  category: string
  amount: number
  note?: string
}

export type VatTuItem = {
  id: string
  name: string
  unit: string
  qtyPlanned: number
  qtyUsed: number
  unitPrice: number
  supplier?: string
  date?: string
  note?: string
}

export type NghiemThuStatus = 'done' | 'pending'

export type NghiemThu = {
  id: string
  dot: string
  bbNo?: string
  bbDate?: string
  invNo?: string
  invDate?: string
  value: number
  retainPct: number
  retain: number
  netPayable: number
  paid: number
  loanRef?: string
  status: NghiemThuStatus
  note?: string
}

export type NhaThauStatus = 'active' | 'done' | 'paused'

export type NhaThau = {
  id: string
  name: string
  scope?: string
  contractValue: number
  retainPct: number
  status: NhaThauStatus
}

export type KhoanVay = {
  id: string
  batch: string
  date: string
  amount: number
  bank?: string
  interestRate?: number
  note?: string
}

export type KyTraNo = {
  id: string
  dueDate: string
  goc: number
  lai: number
  paid: boolean
}

export type NguonVonType = 'von-tu-co' | 'vay' | 'khac'

export type NguonVon = {
  id: string
  source: string
  type: NguonVonType
  amount: number
  note?: string
}

export const SAP_TABS = [
  { id: 'tien-do',   label: 'Tiến độ' },
  { id: 'dong-tien', label: 'Dòng tiền' },
  { id: 'vat-tu',    label: 'Vật tư' },
  { id: 'nha-thau',  label: 'Nhà thầu phụ' },
  { id: 'vay',       label: 'Vay & giải ngân' },
  { id: 'nguon-von', label: 'Nguồn vốn' },
] as const

export type SapTab = typeof SAP_TABS[number]['id']

export const fmt = (n?: number) => (n ?? 0).toLocaleString('vi-VN')
