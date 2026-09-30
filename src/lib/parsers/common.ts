/** Error dengan pesan yang aman ditampilkan langsung ke pengguna. */
export class ParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ParseError'
  }
}

export interface ParseWarning {
  code: string
  /** Pesan dalam Bahasa Indonesia untuk pengguna. */
  message: string
  /** Contoh (maks. beberapa) SKU / tanggal / no. pesanan terkait. Tidak pernah berisi data pembeli. */
  examples?: string[]
}

/** Samakan penulisan header: huruf kecil, spasi rapat, tanpa spasi di sekitar "/". */
export function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, ' ')
    .trim()
}

export function cleanText(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).replace(/\s+/g, ' ').trim()
}

/**
 * Ubah nilai Rupiah dari Shopee menjadi angka bulat.
 * Menerima: 37200, "37.200", "Rp13,771,357", "−600" (tanda minus unicode), "-1.500".
 * Nilai kosong → 0. Nilai yang tidak bisa dibaca → null.
 */
export function parseRupiah(value: unknown): number | null {
  if (value === null || value === undefined) return 0
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value) : null
  let s = String(value).trim()
  if (s === '' || s === '-') return 0
  s = s.replace(/[−‒–—]/g, '-').replace(/rp/i, '').replace(/\s/g, '')
  const negative = s.startsWith('-')
  if (negative) s = s.slice(1)
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) {
    // Pemisah ribuan (titik atau koma).
    s = s.replace(/[.,]/g, '')
  } else if (/^\d+([.,]\d{1,2})?$/.test(s)) {
    // Angka biasa, mungkin dengan desimal.
    s = s.replace(',', '.')
  } else {
    return null
  }
  const n = Math.round(Number(s))
  if (!Number.isFinite(n)) return null
  return negative ? -n : n
}

/** Qty bulat ≥ 0. Kosong → 0. Tidak valid → null. */
export function parseQty(value: unknown): number | null {
  const n = parseRupiah(value)
  if (n === null || n < 0) return null
  return n
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * Ubah waktu dari export Shopee (WIB) menjadi ISO 8601 dengan zona +07:00.
 * Menerima "2026-08-03 14:22", "2026-08-03 14:22:05", "2026/08/03 14:22",
 * "03-08-2026 14:22", nomor seri tanggal Excel, atau objek Date.
 * Kosong → null. Tidak bisa dibaca → undefined.
 */
export function parseShopeeDateTime(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return undefined
    return toWibIso(
      value.getFullYear(),
      value.getMonth() + 1,
      value.getDate(),
      value.getHours(),
      value.getMinutes(),
      value.getSeconds(),
    )
  }
  if (typeof value === 'number') {
    // Nomor seri Excel (hari sejak 1899-12-30), waktu lokal.
    const ms = Math.round((value - 25569) * 86400 * 1000)
    const d = new Date(ms)
    return toWibIso(
      d.getUTCFullYear(),
      d.getUTCMonth() + 1,
      d.getUTCDate(),
      d.getUTCHours(),
      d.getUTCMinutes(),
      d.getUTCSeconds(),
    )
  }
  const s = String(value).trim()
  if (s === '' || s === '-') return null

  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (m) return toWibIso(+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0))
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (m) return toWibIso(+m[3], +m[2], +m[1], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0))
  return undefined
}

function toWibIso(y: number, mo: number, d: number, h: number, mi: number, s: number) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return undefined
  return `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:${pad(s)}+07:00`
}
