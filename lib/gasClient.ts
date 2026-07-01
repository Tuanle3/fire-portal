export const GAS_URL  = 'https://script.google.com/macros/s/AKfycbzvGOlmdmiQkcXwp05RIrhtTAhw4lwPf3hO0u7ygjBerEwo0JGVLv22a0XLxX1Dsx4/exec'
export const SHEET_ID = '15shx_icL1B07iVP-Ho7U8Ixu3fyotMTynKhkevmFk7I'

/** Fetch a sheet tab as CSV text (server-side or client-side). */
export async function fetchSheetCSV(sheetName: string): Promise<string> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Sheet fetch failed (${res.status})`)
  return res.text()
}

/** Parse a UTF-8 CSV string into an array of header→value objects. */
export function parseCSV(csv: string): Record<string, string>[] {
  const lines = csv.replace(/^﻿/, '').trim().split('\n')
  if (lines.length < 2) return []
  const headers = splitCSVLine(lines[0]).map(h => h.trim().replace(/^"|"$/g, ''))
  return lines.slice(1).map(line => {
    const vals = splitCSVLine(line)
    return Object.fromEntries(headers.map((h, i) => [h, (vals[i] ?? '').replace(/^"|"$/g, '').trim()]))
  }).filter(r => Object.values(r).some(v => v !== ''))
}

function splitCSVLine(line: string): string[] {
  const res: string[] = []
  let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++ }
      else inQ = !inQ
    } else if (c === ',' && !inQ) { res.push(cur); cur = '' }
    else cur += c
  }
  res.push(cur)
  return res
}

/** POST data to GAS web app (write to Google Sheets). */
export async function writeToGAS(payload: Record<string, unknown>): Promise<void> {
  await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(payload),
    mode: 'no-cors',
  })
}
