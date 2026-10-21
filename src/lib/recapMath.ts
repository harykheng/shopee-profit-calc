// Hitungan untuk halaman Rekap yang tidak dilakukan di database.
import { wibDay } from './format'

// --- "Kenapa barang terjual beda dengan barang dipesan?" ---------------------

export interface FlowNumbers {
  /** Semua barang yang dipesan (dibuat) di periode ini, semua status. */
  ordered: number
  cancelled: number
  inProcess: number
  /** Barang retur dari pesanan selesai yang dibuat di periode ini. */
  returned: number
  /** Pesanan dibuat di periode ini, tapi baru selesai setelahnya (qty bersih). */
  completedLater: number
  /** Pesanan dibuat sebelum periode ini, selesai di periode ini (qty bersih). */
  fromEarlier: number
  /** Barang terjual menurut rekap profit (selesai di periode ini, tanpa retur). */
  sold: number
}

export interface FlowStep {
  label: string
  value: number
  kind: 'start' | 'minus' | 'plus' | 'result'
}

export function soldFlow(n: FlowNumbers): FlowStep[] {
  const steps: FlowStep[] = [{ label: 'Barang dipesan di periode ini', value: n.ordered, kind: 'start' }]
  const add = (label: string, value: number, kind: 'minus' | 'plus') => {
    if (value !== 0) steps.push({ label, value, kind })
  }
  add('batal / belum bayar', n.cancelled, 'minus')
  add('masih diproses / dikirim', n.inProcess, 'minus')
  add('diretur pembeli', n.returned, 'minus')
  add('baru sampai setelah periode ini (masuk untung bulan berikutnya)', n.completedLater, 'minus')
  add('pesanan sebelum periode ini yang sampai di periode ini', n.fromEarlier, 'plus')
  const computed =
    n.ordered - n.cancelled - n.inProcess - n.returned - n.completedLater + n.fromEarlier
  const other = n.sold - computed
  // Sisa yang tidak bisa dijelaskan: biasanya data lama yang belum punya tanggal pesanan dibuat.
  if (other > 0) steps.push({ label: 'pesanan lain (data lama tanpa tanggal pesanan)', value: other, kind: 'plus' })
  if (other < 0) steps.push({ label: 'pesanan lain (data lama tanpa tanggal pesanan)', value: -other, kind: 'minus' })
  steps.push({ label: 'Terjual & uangnya cair di periode ini', value: n.sold, kind: 'result' })
  return steps
}

// --- Perkiraan untung dari pesanan yang dibuat di periode ini ----------------

export interface EstimateItem {
  subtotal: number
  qty: number
  returned_qty: number
  completed_at: string | null
  /** HPP per unit (terkunci kalau ada, kalau belum pakai HPP saat ini). null = belum diisi. */
  hpp: number | null
  /**
   * Uang masuk ASLI untuk item ini (dari Excel "Sudah Dilepas", sudah tanpa bagian yang diretur).
   * Tidak diisi / null = belum ada, pakai perkiraan dari uang cair per hari.
   */
  income?: number | null
}

export interface DayIncome {
  day: string
  total_income: number
  subtotal_pesanan: number
}

export interface ProfitEstimate {
  sales: number
  income: number
  fees: number
  modal: number
  profit: number
  /** Jumlah item yang HPP-nya kosong (modalnya belum terhitung). */
  missingHpp: number
  /** Item yang tanggal cairnya belum ada di laporan → pakai rata-rata potongan. */
  averaged: number
  /** Item yang memakai uang masuk asli per pesanan (bukan perkiraan). */
  exact: number
  /** Jumlah item yang dihitung. */
  items: number
}

/**
 * Laporan Shopee hanya mencatat uang cair per hari. Tiap pesanan mendapat bagian
 * dari uang cair di hari pesanan itu selesai, sebanding dengan nilai penjualannya:
 * uang masuk ≈ subtotal × (penghasilan hari itu ÷ subtotal hari itu), tanpa bagian yang diretur.
 * Kalau hari itu belum ada di laporan, dipakai rata-rata semua hari yang ada.
 * Item yang punya uang masuk asli (`income`, dari Excel "Sudah Dilepas") memakai angka itu.
 * Mengembalikan null kalau ada item tanpa uang masuk asli dan belum ada laporan penghasilan sama sekali.
 */
export function estimateProfit(
  items: EstimateItem[],
  days: DayIncome[],
  /** Porsi barang retur yang bisa dijual lagi (0–1). 1 = semua kembali ke stok (modalnya tidak hilang). */
  returnRecovery = 1,
): ProfitEstimate | null {
  const ratio = new Map<string, number>()
  let sumInc = 0
  let sumSub = 0
  for (const d of days) {
    if (d.subtotal_pesanan > 0) {
      ratio.set(d.day, d.total_income / d.subtotal_pesanan)
      sumInc += d.total_income
      sumSub += d.subtotal_pesanan
    }
  }
  const needsEstimate = items.some((i) => i.income === undefined || i.income === null)
  if (sumSub === 0 && (needsEstimate || items.length === 0)) return null
  const average = sumSub > 0 ? sumInc / sumSub : 0

  let sales = 0
  let income = 0
  let modal = 0
  let missingHpp = 0
  let averaged = 0
  let exact = 0
  for (const i of items) {
    sales += i.subtotal
    const netQty = i.qty - i.returned_qty
    if (i.income !== undefined && i.income !== null) {
      income += i.income
      exact++
    } else {
      const day = i.completed_at ? wibDay(i.completed_at) : null
      let r = day ? ratio.get(day) : undefined
      if (r === undefined) {
        r = average
        averaged++
      }
      // Uang barang retur dikembalikan ke pembeli, jadi hanya bagian yang tidak diretur yang jadi uang masuk.
      income += i.qty > 0 ? i.subtotal * (netQty / i.qty) * r : 0
    }
    if (i.hpp === null) {
      // Barang yang seluruhnya diretur juga butuh HPP kalau retur ikut jadi kerugian (returnRecovery < 1).
      if (netQty > 0 || (i.returned_qty > 0 && returnRecovery < 1)) missingHpp++
    } else {
      // Barang retur yang tidak bisa dijual lagi menjadi kerugian modal (sama dengan hitungan di database).
      modal += netQty * i.hpp + i.returned_qty * i.hpp * (1 - returnRecovery)
    }
  }
  income = Math.round(income)
  modal = Math.round(modal)
  return { sales, income, fees: sales - income, modal, profit: income - modal, missingHpp, averaged, exact, items: items.length }
}
