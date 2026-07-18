import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const sagSupabase = createClient(url, key)

// ceo01 row shape (only fields we need)
interface Ceo01Row {
  loai_don_vi: string
  thang_nam: string      // 'MM/YYYY'
  so_du_dau_ky: number
  so_du_cuoi_ky: number
}

// Convert 'YYYY-MM' → 'MM/YYYY'
function toThangNam(month: string): string {
  const [y, m] = month.split('-')
  return `${m}/${y}`
}

export interface TonQuyBalances {
  dauKy: number   // opening balance of selected month (for KH column)
  cuoiKy: number  // latest closing balance (for TH column, matches CEO dashboard)
}

export async function fetchTonQuyFromCeo01(month: string): Promise<TonQuyBalances> {
  const thangNam = toThangNam(month)

  const { data, error } = await sagSupabase
    .from('ceo01')
    .select('loai_don_vi, thang_nam, so_du_dau_ky, so_du_cuoi_ky')
    .eq('loai_don_vi', 'TỔNG CỘNG')
    .order('thang_nam', { ascending: false })

  if (error || !data || data.length === 0) {
    return { dauKy: 0, cuoiKy: 0 }
  }

  const rows = data as Ceo01Row[]

  // KH: opening balance of selected month
  const selectedRow = rows.find(r => r.thang_nam?.trim() === thangNam)
  const dauKy = selectedRow?.so_du_dau_ky ?? 0

  // TH: closing balance of most recent month (first row after ordering desc)
  const cuoiKy = rows[0]?.so_du_cuoi_ky ?? 0

  return { dauKy, cuoiKy }
}
