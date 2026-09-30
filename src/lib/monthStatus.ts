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
}

export function monthStatus(recap: MonthlyRecap, days: DailyReconciliation[]): MonthStatus {
  const inMonth = days.filter((d) => d.month === recap.month)
  const hasIncome = inMonth.some((d) => d.has_income)

  const missing = inMonth.filter((d) => d.has_income && Number(d.difference) > 0)
  const noIncome = inMonth.filter((d) => d.has_orders && !d.has_income)
  const refunds = inMonth.filter((d) => d.has_income && d.has_orders && Number(d.difference) < 0)

  const status: Omit<MonthStatus, 'final'> = {
    hasIncome,
    missingOrders: {
      amount: missing.reduce((s, d) => s + Number(d.difference), 0),
      days: missing.map((d) => d.day),
    },
    ordersWithoutIncome: {
      orders: noIncome.reduce((s, d) => s + Number(d.order_count), 0),
      days: noIncome.map((d) => d.day),
    },
    missingHpp: Number(recap.items_missing_hpp),
    expensesFilled: Number(recap.expense_entries) > 0,
    refunds: {
      amount: refunds.reduce((s, d) => s + Number(d.difference), 0),
      days: refunds.map((d) => d.day),
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
