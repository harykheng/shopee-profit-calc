// Format angka, tanggal, dan bulan dalam gaya Indonesia.

const NUMBER = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 })

/** 1250000 → "Rp1.250.000", -600 → "-Rp600". */
export function formatRupiah(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-'
  const n = Math.round(value)
  return (n < 0 ? '-Rp' : 'Rp') + NUMBER.format(Math.abs(n))
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-'
  return NUMBER.format(value)
}

/** 40.79 → "40,8%". */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-'
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(value) + '%'
}

export const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

/** "2026-08-05" atau ISO timestamp → "5 Agu 2026" (tanggal menurut WIB). */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '-'
  const [y, m, d] = wibDateParts(value)
  return `${d} ${MONTH_SHORT[m - 1]} ${y}`
}

/** ISO timestamp → "5 Agu 2026 14:22" (WIB). */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const wib = new Date(date.getTime() + 7 * 3600 * 1000)
  const hh = String(wib.getUTCHours()).padStart(2, '0')
  const mm = String(wib.getUTCMinutes()).padStart(2, '0')
  return `${formatDate(value)} ${hh}:${mm}`
}

/** "2026-08-01" → "Agustus 2026". */
export function formatMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${MONTH_NAMES[m - 1]} ${y}`
}

function wibDateParts(value: string): [number, number, number] {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number)
    return [y, m, d]
  }
  const wib = new Date(new Date(value).getTime() + 7 * 3600 * 1000)
  return [wib.getUTCFullYear(), wib.getUTCMonth() + 1, wib.getUTCDate()]
}

// --- Bulan: selalu string "YYYY-MM-01" ---------------------------------------

export function toMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`
}

export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const total = y * 12 + (m - 1) + delta
  return toMonth(Math.floor(total / 12), (total % 12) + 1)
}

/** Bulan berjalan menurut WIB. */
export function currentMonth(now = new Date()): string {
  const wib = new Date(now.getTime() + 7 * 3600 * 1000)
  return toMonth(wib.getUTCFullYear(), wib.getUTCMonth() + 1)
}

/** Tanggal terakhir di bulan itu, "YYYY-MM-DD". */
export function monthEnd(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`
}
