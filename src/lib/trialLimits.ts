/**
 * Batas akun uji coba (stores.trial = true). Aturannya sama dengan migration 20261027000000_trial_limits.sql
 * dan angka di 20261028000000_trial_limits_total.sql:
 *
 * - Data maksimal 1 bulan: bulan laporan penghasilan (tanggal uang cair) dan bulan data iklan.
 *   Export pesanan tidak dibatasi. Yang benar-benar menolak adalah trigger di database; fungsi di sini
 *   untuk memberi tahu SEBELUM tombol simpan ditekan.
 * - Simulasi maksimal 50 produk selama uji coba. Satu produk dihitung sekali, baik di Satu produk maupun
 *   di Grup iklan; mengubah harga/ROAS/biaya produk yang sama tidak menambah hitungan.
 *
 * Fungsi murni (tanpa Supabase) supaya bisa dites.
 */
import { formatMonth } from './format'
import type { IncomeParseResult } from './parsers/income'

export const TRIAL_MONTH_LIMIT = 1
export const TRIAL_SIMULATION_LIMIT = 50

/** "YYYY-MM-DD" → "YYYY-MM-01". */
export function monthOf(date: string): string {
  return `${date.slice(0, 7)}-01`
}

/** Bulan yang akan terisi oleh upload ini: laporan penghasilan + data iklan bulanan. Urut, tanpa dobel. */
export function uploadMonths(income: IncomeParseResult | null | undefined, adsMonths: (string | null)[]): string[] {
  const set = new Set<string>()
  if (income) {
    for (const d of income.days) set.add(monthOf(d.released_date))
    // Sama dengan yang dikirim saveIncomeReport: penyesuaian hanya kalau terbaca lengkap, rincian pesanan hanya dari Excel.
    if (income.adjustmentsComplete) for (const a of income.adjustments) set.add(monthOf(a.date))
    if (income.source === 'xlsx') for (const o of income.orders) if (o.released_date) set.add(monthOf(o.released_date))
  }
  for (const m of adsMonths) if (m) set.add(monthOf(m))
  return [...set].sort()
}

/** "Agustus 2026", "Agustus 2026 dan September 2026", "A, B, dan C". */
export function monthList(months: string[]): string {
  const names = months.map(formatMonth)
  if (names.length <= 1) return names.join('')
  if (names.length === 2) return `${names[0]} dan ${names[1]}`
  return `${names.slice(0, -1).join(', ')}, dan ${names[names.length - 1]}`
}

export interface TrialUploadCheck {
  /** Semua bulan setelah upload ini tersimpan. */
  months: string[]
  /** Bulan baru yang ditambahkan upload ini. */
  added: string[]
  over: boolean
}

export function trialUploadCheck(used: string[], adding: string[], limit = TRIAL_MONTH_LIMIT): TrialUploadCheck {
  const usedSet = new Set(used.map(monthOf))
  const added = [...new Set(adding.map(monthOf))].filter((m) => !usedSet.has(m)).sort()
  const months = [...usedSet, ...added].sort()
  return { months, added, over: months.length > limit }
}

/** Kalimat status di halaman Upload untuk toko uji coba. */
export function trialMonthsNotice(used: string[], limit = TRIAL_MONTH_LIMIT): string {
  const base = `Akun uji coba bisa menyimpan laporan penghasilan dan data iklan untuk ${limit} bulan.`
  if (used.length === 0) {
    return `${base} Belum ada yang terpakai. Pilih bulan yang sudah selesai (biasanya bulan lalu): bulan pertama yang disimpan tidak bisa diganti.`
  }
  const left = limit - used.length
  return `${base} Sudah terpakai: ${monthList(used)}${
    left > 0 ? ` (sisa ${left} bulan)` : '. Upload ulang bulan itu tetap boleh'
  }.`
}

/** Pesan kalau upload ini akan melewati batas (null kalau masih boleh). */
export function trialUploadProblem(check: TrialUploadCheck, used: string[], limit = TRIAL_MONTH_LIMIT): string | null {
  if (!check.over) return null
  const now = used.length > 0 ? ` Yang sudah tersimpan: ${monthList(used)}.` : ''
  return `Akun uji coba hanya bisa menyimpan data ${limit} bulan, tapi file ini berisi ${monthList(check.added)}.${now} Pilih laporan untuk bulan yang masih boleh, atau berlangganan untuk menyimpan bulan lain.`
}

const MONTH_LIMIT_PREFIX = 'trial_month_limit:'

/** Pesan penolakan dari database (trigger trial_month_limit), tanpa awalan teknisnya. null kalau bukan. */
export function trialLimitMessage(errorMessage: string): string | null {
  const i = errorMessage.indexOf(MONTH_LIMIT_PREFIX)
  if (i < 0) return null
  return `${errorMessage.slice(i + MONTH_LIMIT_PREFIX.length).trim()} Upload ulang bulan yang sudah ada tetap boleh; untuk bulan lain, berlangganan dulu.`
}

/** Kunci jatah simulasi untuk produk yang sudah ada di data (sama di Satu produk dan Grup iklan). */
export function productSimKey(productName: string): string {
  return `produk:${productName.trim().toLowerCase()}`
}

/** Kunci untuk produk yang diketik sendiri di Satu produk: satu modal (HPP) = satu produk. */
export function manualSimKey(hpp: number): string {
  return `modal:${hpp}`
}

/** Kunci untuk baris "produk baru" di Grup iklan (satu baris = satu produk). */
export function groupRowSimKey(rowKey: string): string {
  return `grup-baris:${rowKey}`
}

/** Kalimat sisa jatah, mis. "Uji coba: 3 dari 50 produk sudah disimulasikan." */
export function trialSimNotice(used: number, limit = TRIAL_SIMULATION_LIMIT): string {
  return `Uji coba: ${used} dari ${limit} produk sudah disimulasikan. Mengubah harga atau ROAS produk yang sama tidak menambah hitungan.`
}
