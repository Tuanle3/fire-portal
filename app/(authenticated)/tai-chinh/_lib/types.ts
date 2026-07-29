import { BctcReport, BctcRow } from '@/lib/bctc-types'

export interface StoredDoc {
  donVi: string
  report: BctcReport
  period: string
  rows: BctcRow[]
  updatedAt?: string
  source?: string
}

// Shape trả về từ Firebase: data_bctc/{donViKey}/{report}/{period}
export type RawBctc = Record<string, Partial<Record<BctcReport, Record<string, StoredDoc>>>>

export interface FlatDoc {
  donViKey: string
  donVi: string
  report: BctcReport
  period: string
  rows: BctcRow[]
}

export interface DonViInfo { key: string; label: string }

export const ALL_DONVI = 'ALL'
