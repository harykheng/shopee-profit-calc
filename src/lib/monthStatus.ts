// Menentukan apakah angka profit sebuah bulan sudah "final" (lengkap).
import type { DailyReconciliation, MonthlyRecap } from './types'

export interface MonthStatus {
  /** true kalau semua syarat terpenuhi → profit bulan ini angka pasti. */
  final: boolean
  /** Laporan penghasilan (PDF) bulan ini sudah di-upload. */
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
