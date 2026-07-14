import {
  collection, doc, setDoc, deleteDoc,
  onSnapshot, Unsubscribe,
} from 'firebase/firestore'
import { diennuocDb } from './firebase-diennuoc'
import {
  MeterReading, Customer, CustomerUsage, Payment, EMPTY_BANDS, BAND_KEYS, normalizeFloor,
} from './dien-nuoc-types'

const COL_METERS   = 'dn_meters'
const COL_CUSTOMERS= 'dn_customers'
const COL_USAGE    = 'dn_usage'
const COL_PAYMENTS = 'dn_payments'
const COL_CONFIG   = 'dn_config'
const DOC_METER_NAMES = 'meter_names'

function clean(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) out[k] = v ?? null
  return out
}

// ── Meter readings ───────────────────────────────────────────────────────────
function parseMeter(id: string, d: Record<string, unknown>): MeterReading {
  const rawBands = (d.bands as Record<string, { kwh?: number; donGia?: number }>) ?? {}
  const bands = { ...EMPTY_BANDS }
  for (const k of BAND_KEYS) {
    bands[k] = { kwh: Number(rawBands[k]?.kwh ?? 0), donGia: Number(rawBands[k]?.donGia ?? 0) }
  }
  return {
    id,
    meterId:  Number(d.meterId) as MeterReading['meterId'],
    month:    (d.month as string) ?? '',
    bands,
    vatPercent: Number(d.vatPercent ?? 8),
    note:     (d.note as string) ?? '',
    floorReadings: Array.isArray(d.floorReadings) ? (d.floorReadings as unknown[]).map(normalizeFloor) : undefined,
    bqtRatio:      (d.bqtRatio as MeterReading['bqtRatio']) ?? undefined,
    createdAt:(d.createdAt as string) ?? '',
    updatedAt:(d.updatedAt as string) ?? '',
  }
}

export async function saveMeterReading(r: MeterReading): Promise<void> {
  await setDoc(doc(diennuocDb, COL_METERS, r.id), clean(r as unknown as Record<string, unknown>))
}
export async function deleteMeterReading(id: string): Promise<void> {
  await deleteDoc(doc(diennuocDb, COL_METERS, id))
}
export function subscribeMeterReadings(cb: (rows: MeterReading[]) => void): Unsubscribe {
  return onSnapshot(collection(diennuocDb, COL_METERS), snap => {
    cb(snap.docs.map(d => parseMeter(d.id, d.data() as Record<string, unknown>)))
  })
}

// ── Customers ────────────────────────────────────────────────────────────────
function parseCustomer(id: string, d: Record<string, unknown>): Customer {
  return {
    id,
    name:       (d.name as string) ?? '',
    group:      (d.group as string) ?? '',
    meterId:    Number(d.meterId) as Customer['meterId'],
    chargeType: (d.chargeType as Customer['chargeType']) ?? 'flat_vat_incl',
    flatUnitPrice: Number(d.flatUnitPrice ?? 0),
    areaM2:        Number(d.areaM2 ?? 0),
    pricePerM2:    Number(d.pricePerM2 ?? 0),
    flatPriceHistory: (d.flatPriceHistory as Customer['flatPriceHistory']) ?? undefined,
    areaPriceHistory: (d.areaPriceHistory as Customer['areaPriceHistory']) ?? undefined,
    timebandPriceHistory: (d.timebandPriceHistory as Customer['timebandPriceHistory']) ?? undefined,
    floor:      (d.floor as string) ?? '',
    kioskCode:  (d.kioskCode as string) ?? '',
    kioskOwner: (d.kioskOwner as string) ?? '',
    tenantName: (d.tenantName as string) ?? '',
    active:     d.active !== false,
    inactiveMonths: Array.isArray(d.inactiveMonths) ? (d.inactiveMonths as string[]) : undefined,
    note:       (d.note as string) ?? '',
    services:   Array.isArray(d.services) ? (d.services as Customer['services']) : undefined,
    hasManagementFee: d.hasManagementFee === true,
    managementFeePrice: d.managementFeePrice != null ? Number(d.managementFeePrice) : undefined,
    managementFeeHistory: (d.managementFeeHistory as Customer['managementFeeHistory']) ?? undefined,
    feeConfirmedMonths: Array.isArray(d.feeConfirmedMonths) ? (d.feeConfirmedMonths as string[]) : undefined,
    feeByMonth:        d.feeByMonth != null && typeof d.feeByMonth === 'object'
      ? Object.fromEntries(Object.entries(d.feeByMonth as Record<string, number>).map(([k, v]) => [k, Math.abs(Number(v))]))
      : undefined,
    feeAccruedByMonth: d.feeAccruedByMonth != null && typeof d.feeAccruedByMonth === 'object'
      ? Object.fromEntries(Object.entries(d.feeAccruedByMonth as Record<string, number>).map(([k, v]) => [k, Math.abs(Number(v))]))
      : undefined,
    otherFeesByType:   d.otherFeesByType != null && typeof d.otherFeesByType === 'object'
      ? Object.fromEntries(Object.entries(d.otherFeesByType as Record<string, Record<string, number>>)
          .map(([typeKey, byMonth]) => [typeKey, typeof byMonth === 'object' && byMonth != null
            ? Object.fromEntries(Object.entries(byMonth).map(([m, v]) => [m, Math.abs(Number(v))]))
            : {}]))
      : undefined,
    oldDebt:    d.oldDebt != null ? Number(d.oldDebt) : undefined,
    createdAt:  (d.createdAt as string) ?? '',
  }
}

export async function saveCustomer(c: Customer): Promise<void> {
  await setDoc(doc(diennuocDb, COL_CUSTOMERS, c.id), clean(c as unknown as Record<string, unknown>))
}
export async function deleteCustomer(id: string): Promise<void> {
  await deleteDoc(doc(diennuocDb, COL_CUSTOMERS, id))
}
export function subscribeCustomers(cb: (rows: Customer[]) => void): Unsubscribe {
  return onSnapshot(collection(diennuocDb, COL_CUSTOMERS), snap => {
    cb(snap.docs.map(d => parseCustomer(d.id, d.data() as Record<string, unknown>)))
  })
}

// ── Customer usage (theo tháng) ──────────────────────────────────────────────
function parseUsage(id: string, d: Record<string, unknown>): CustomerUsage {
  return {
    id,
    customerId: (d.customerId as string) ?? '',
    service:    (d.service as CustomerUsage['service']) ?? undefined,
    month:      (d.month as string) ?? '',
    totalUnit:  Number(d.totalUnit ?? 0),
    bandsKwh:   (d.bandsKwh as CustomerUsage['bandsKwh']) ?? {},
    indexOld:   d.indexOld != null ? Number(d.indexOld) : undefined,
    indexNew:   d.indexNew != null ? Number(d.indexNew) : undefined,
    bandsIndexOld: (d.bandsIndexOld as CustomerUsage['bandsIndexOld']) ?? undefined,
    bandsIndexNew: (d.bandsIndexNew as CustomerUsage['bandsIndexNew']) ?? undefined,
    createdAt:  (d.createdAt as string) ?? '',
    updatedAt:  (d.updatedAt as string) ?? '',
  }
}

export async function saveUsage(u: CustomerUsage): Promise<void> {
  await setDoc(doc(diennuocDb, COL_USAGE, u.id), clean(u as unknown as Record<string, unknown>))
}
export async function deleteUsage(id: string): Promise<void> {
  await deleteDoc(doc(diennuocDb, COL_USAGE, id))
}
export function subscribeUsage(cb: (rows: CustomerUsage[]) => void): Unsubscribe {
  return onSnapshot(collection(diennuocDb, COL_USAGE), snap => {
    cb(snap.docs.map(d => parseUsage(d.id, d.data() as Record<string, unknown>)))
  })
}

// ── Payments (thu tiền) ───────────────────────────────────────────────────────
function parsePayment(id: string, d: Record<string, unknown>): Payment {
  return {
    id,
    customerId:      (d.customerId as string) ?? '',
    month:           (d.month as string) ?? '',
    amount:          Number(d.amount ?? 0),
    paidAt:          (d.paidAt as string) ?? '',
    note:            (d.note as string) ?? '',
    service:         (d.service as Payment['service']) ?? undefined,
    kind:            (d.kind as Payment['kind']) ?? undefined,
    createdAt:       (d.createdAt as string) ?? '',
    paymentMethod:   (d.paymentMethod as Payment['paymentMethod']) ?? undefined,
    bankAccount:     (d.bankAccount as string) ?? undefined,
    transactionRef:  (d.transactionRef as string) ?? undefined,
  }
}

export async function savePayment(p: Payment): Promise<void> {
  await setDoc(doc(diennuocDb, COL_PAYMENTS, p.id), clean(p as unknown as Record<string, unknown>))
}
export async function deletePayment(id: string): Promise<void> {
  await deleteDoc(doc(diennuocDb, COL_PAYMENTS, id))
}
export function subscribePayments(cb: (rows: Payment[]) => void): Unsubscribe {
  return onSnapshot(collection(diennuocDb, COL_PAYMENTS), snap => {
    cb(snap.docs.map(d => parsePayment(d.id, d.data() as Record<string, unknown>)))
  })
}

// ── Bố cục dashboard tùy biến (kéo-thả/co-giãn card) — lưu theo user ─────────
// 1 doc / user (id = username). Nội dung: { [gridKey]: { order: string[], size: {[panelKey]: {w?,h?}} } }
const COL_DASH = 'dn_dash_layouts'
export interface DashGridState { order: string[]; size: Record<string, { w?: number; h?: number }> }
export type DashLayouts = Record<string, DashGridState>

export function subscribeDashLayouts(username: string, cb: (all: DashLayouts) => void): Unsubscribe {
  if (!username) { cb({}); return () => {} }
  return onSnapshot(doc(diennuocDb, COL_DASH, username), snap => cb((snap.data() as DashLayouts) ?? {}))
}
export async function saveDashLayout(username: string, gridKey: string, state: DashGridState): Promise<void> {
  if (!username) return
  await setDoc(doc(diennuocDb, COL_DASH, username), { [gridKey]: state }, { merge: true })
}

// ── Tên đồng hồ tùy chỉnh (chỉ admin được sửa) ───────────────────────────────
export async function saveMeterNames(names: Record<number, string>): Promise<void> {
  await setDoc(doc(diennuocDb, COL_CONFIG, DOC_METER_NAMES), clean(names as Record<string, unknown>))
}
export function subscribeMeterNames(cb: (names: Record<number, string>) => void): Unsubscribe {
  return onSnapshot(doc(diennuocDb, COL_CONFIG, DOC_METER_NAMES), snap => {
    cb((snap.data() as Record<number, string>) ?? {})
  })
}
