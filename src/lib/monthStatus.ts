// Menentukan apakah angka profit sebuah bulan sudah "final" (lengkap).
import { addMonths, formatMonth } from './format'
import type { DailyReconciliation, MonthlyRecap } from './types'

export interface MonthStatus {
  /** true kalau semua syarat terpenuhi → profit bulan ini angka pasti. */
  final: boolean
  /** Laporan penghasilan (Excel "Sudah Dilepas" atau PDF) bulan ini sudah di-upload. */
  hasIncome: boolean
  /** Uang cair yang pesanannya belum di-upload (biasanya pesanan bulan lalu). */
  missingOrders: { amount: number; days: string[] }
  /** Pesanan selesai yang tanggalnya tidak ada di laporan penghasilan. */
  ordersWithoutIncome: { orders: number; days: string[] }
  /** Jumlah item yang HPP-nya kosong. */
  missingHpp: number
  /** Biaya bulan ini sudah pernah disimpan (boleh Rp0). */
  expensesFilled: boolean
  /** Informasi saja (tidak menghalangi status final). */
  refunds: { amount: number; days: string[] }
  /**
   * Uang yang cair 1–2 hari setelah tanggal "pesanan selesai" di export (mis. selesai malam,
   * dicatat cair besoknya). Data lengkap; hanya beda tanggal. Informasi saja.
   */
  shifted: { amount: number; days: string[] }
}

/** Maksimal selisih hari antara pesanan selesai dan uang cair yang dianggap "geser tanggal". */
export const MAX_SHIFT_DAYS = 2

const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / 86_400_000

/**
 * Pasangkan hari "uang cair lebih besar dari pesanan" dengan hari berdekatan yang
 * "pesanan lebih besar dari uang cair". Kalau kelebihan pesanan di hari tetangga cukup
 * menutupi kekurangannya, itu pesanan yang sama yang tanggalnya beda — bukan data hilang.
 * Hasil: selisih per hari setelah dipasangkan, dan jumlah yang dipasangkan per hari.
 */
export function matchShiftedDays(days: DailyReconciliation[]) {
  const diff = new Map<string, number>()
  for (const d of days) {
    // Hari tanpa laporan penghasilan: seluruh pesanannya "kelebihan".
    diff.set(d.day, d.has_income ? Number(d.difference) : -Number(d.orders_subtotal))
  }
  const shifted = new Map<string, number>()
  const sorted = [...days].sort((a, b) => a.day.localeCompare(b.day))
  for (const d of sorted) {
    const missing = diff.get(d.day) ?? 0
    if (!d.has_income || missing <= 0) continue
    const neighbours = sorted
      .filter((n) => n.has_orders && n.day !== d.day && Math.abs(dayNumber(n.day) - dayNumber(d.day)) <= MAX_SHIFT_DAYS)
      .sort((a, b) => Math.abs(dayNumber(a.day) - dayNumber(d.day)) - Math.abs(dayNumber(b.day) - dayNumber(d.day)))
    const match = neighbours.find((n) => -(diff.get(n.day) ?? 0) >= missing)
    if (!match) continue
    diff.set(d.day, 0)
    diff.set(match.day, (diff.get(match.day) ?? 0) + missing)
    shifted.set(d.day, (shifted.get(d.day) ?? 0) + missing)
  }
  return { diff, shifted }
}

export function monthStatus(recap: MonthlyRecap, days: DailyReconciliation[]): MonthStatus {
  // Pemasangan memakai semua hari yang diberikan (termasuk beberapa hari di bulan tetangga).
  const { diff, shifted } = matchShiftedDays(days)
  const left = (d: DailyReconciliation) => diff.get(d.day) ?? 0
  const inMonth = days.filter((d) => d.month === recap.month)
  const hasIncome = inMonth.some((d) => d.has_income)

  const missing = inMonth.filter((d) => d.has_income && left(d) > 0)
  // Hari dengan pesanan tapi tanpa laporan penghasilan, yang tidak tertutup hari tetangga.
  const noIncome = inMonth.filter((d) => d.has_orders && !d.has_income && left(d) < 0)
  const refunds = inMonth.filter((d) => d.has_income && d.has_orders && left(d) < 0)
  const shiftedDays = inMonth.filter((d) => shifted.has(d.day))

  const status: Omit<MonthStatus, 'final'> = {
    hasIncome,
    missingOrders: {
      amount: missing.reduce((s, d) => s + left(d), 0),
      days: missing.map((d) => d.day),
    },
    ordersWithoutIncome: {
      orders: noIncome.reduce((s, d) => s + Number(d.order_count), 0),
      days: noIncome.map((d) => d.day),
    },
    missingHpp: Number(recap.items_missing_hpp),
    expensesFilled: Number(recap.expense_entries) > 0,
    refunds: {
      amount: refunds.reduce((s, d) => s + left(d), 0),
      days: refunds.map((d) => d.day),
    },
    shifted: {
      amount: shiftedDays.reduce((s, d) => s + (shifted.get(d.day) ?? 0), 0),
      days: shiftedDays.map((d) => d.day),
    },
  }

  const final =
    status.hasIncome &&
    status.missingOrders.days.length === 0 &&
    status.ordersWithoutIncome.days.length === 0 &&
    status.missingHpp === 0 &&
    status.expensesFilled

  return { final, ...status }
}

/** Hal-hal yang masih menghalangi sebuah bulan jadi final, urut dari yang pertama dikerjakan. */
export interface MonthTodo {
  key: string
  /** Alasan singkat untuk baris "Belum final: …". */
  short: string
}

export function monthTodos(s: MonthStatus): MonthTodo[] {
  const out: MonthTodo[] = []
  if (!s.hasIncome) out.push({ key: 'income', short: 'laporan penghasilan belum di-upload' })
  if (s.missingOrders.days.length > 0) out.push({ key: 'orders', short: 'ada uang cair yang pesanannya belum di-upload' })
  if (s.hasIncome && s.ordersWithoutIncome.days.length > 0)
    out.push({ key: 'noincome', short: 'ada pesanan yang tidak ada di laporan penghasilan' })
  if (s.missingHpp > 0) out.push({ key: 'hpp', short: 'ada barang yang HPP-nya kosong' })
  if (!s.expensesFilled) out.push({ key: 'expenses', short: 'biaya belum diisi' })
  return out
}

/**
 * Bulan pesanan dari nomor pesanan Shopee: 6 angka pertama = TTBBHH (mis. "261023D8MY3EE8" → "2026-10-01").
 * null kalau formatnya tidak dikenali.
 */
export function orderNoMonth(orderNo: string): string | null {
  const m = /^(\d{2})(\d{2})(\d{2})/.exec(orderNo.trim())
  if (!m) return null
  const month = Number(m[2])
  const day = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `20${m[1]}-${m[2]}-01`
}

/** Pesanan yang uangnya sudah cair tapi belum cocok dengan export pesanan (lihat view income_order_match). */
export interface UnmatchedOrderRef {
  order_no: string
  match: 'tidak_ada' | 'belum_selesai'
}

/**
 * Langkah untuk "ada uang cair yang pesanannya belum di-upload" di bulan `month`, dalam satu kalimat.
 * - Pesanan yang statusnya belum Selesai di export → download ulang export terbaru.
 * - Pesanan yang tidak ada di export → upload export bulan pesanan itu dibuat (dari nomor pesanannya).
 * - Tanpa daftar nomor pesanan → tebakan lama: export bulan sebelumnya.
 */
export function missingOrdersAction(month: string, unmatched: UnmatchedOrderRef[]): string {
  const absent = unmatched.filter((o) => o.match === 'tidak_ada')
  const stale = unmatched.filter((o) => o.match === 'belum_selesai')
  const months = new Set<string>()
  for (const o of absent) months.add(orderNoMonth(o.order_no) ?? addMonths(month, -1))
  if (unmatched.length === 0) months.add(addMonths(month, -1))
  const parts: string[] = []
  if (months.size > 0) {
    const names = [...months].sort().map(formatMonth)
    const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} dan ${names[names.length - 1]}` : names[0]
    parts.push(`upload export pesanan ${list}`)
  }
  if (stale.length > 0) parts.push('download ulang export pesanan terbaru (status Semua) dari Shopee lalu upload lagi')
  const text = parts.join('. Lalu ')
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`
}

/** Barang selesai yang statusnya di export masih "Pesanan diterima, namun Pembeli masih dapat mengajukan pengembalian…". */
export interface ReturnWindowItem {
  order_no: string
  status: string
}

/** Pesanan di sebuah bulan yang masih dalam masa pengembalian (atau baru lewat, tapi export-nya belum di-upload ulang). */
export interface ReturnWindow {
  orders: number
  /** Batas pengembalian paling akhir ("YYYY-MM-DD"); null kalau tanggalnya tidak terbaca. */
  until: string | null
  /** true = masa pengembalian sudah lewat, jadi export pesanan bisa di-upload ulang untuk angka final. */
  passed: boolean
}

/** Tanggal batas dari status "…mengajukan pengembalian hingga 2026-11-04." → "2026-11-04". */
export function returnWindowEnd(status: string): string | null {
  return /(\d{4}-\d{2}-\d{2})/.exec(status)?.[1] ?? null
}

export function returnWindow(items: ReturnWindowItem[], today: string): ReturnWindow | null {
  if (items.length === 0) return null
  const orders = new Set(items.map((i) => i.order_no)).size
  const dates = items.map((i) => returnWindowEnd(i.status))
  // Satu tanggal tidak terbaca: anggap masih terbuka, jangan menyuruh upload ulang terlalu cepat.
  const until = dates.every((d) => d !== null) ? (dates as string[]).sort().at(-1)! : null
  return { orders, until, passed: until !== null && today > until }
}
