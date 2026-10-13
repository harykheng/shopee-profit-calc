// Laporan error dari browser ke tabel client_errors (migration 20261016). Bagian murni di sini:
// menyaring noise, menyusun baris, mengelompokkan, dan membatasi jumlah. Pengirimannya (Supabase)
// ada di reportError.ts supaya berkas ini bisa dites tanpa browser.
import { errorText } from './errors'

export type ErrorKind = 'uncaught' | 'unhandledrejection' | 'render' | 'handled' | 'parse'

export interface ErrorReportRow {
  kind: ErrorKind
  message: string
  stack: string | null
  route: string | null
  app_version: string | null
  user_agent: string | null
  fingerprint: string
  store_id: number | null
}

export interface ReportContext {
  /** Halaman yang sedang dibuka, mis. "#/rekap?bulan=2026-09-01". */
  route?: string | null
  storeId?: number | null
  appVersion?: string | null
  userAgent?: string | null
}

const MAX_MESSAGE = 1000
const MAX_STACK = 6000

/**
 * Error yang bukan kerusakan aplikasi: koneksi pelanggan putus, salah password, sesi habis, atau
 * noise bawaan browser. Melaporkannya hanya membuat tabel penuh dan menutupi yang penting.
 */
const IGNORED: RegExp[] = [
  /failed to fetch/i,
  /networkerror/i,
  /load failed/i,
  /network request failed/i,
  /invalid login credentials/i,
  /jwt expired/i,
  /refresh token/i,
  /resizeobserver loop/i,
  /^script error/i,
  /aborterror|signal is aborted|the user aborted/i,
]

export function isIgnorable(message: string, stack?: string | null): boolean {
  if (IGNORED.some((re) => re.test(message))) return true
  // Error dari ekstensi browser pelanggan, bukan dari aplikasi ini.
  if (stack && /(chrome|moz|safari)-extension:\/\//i.test(stack)) return true
  return false
}

const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

/** Hash pendek yang stabil (djb2) untuk mengelompokkan error yang sama. */
function hash(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(16)
}

/** Error yang sama di data berbeda (id, tanggal) harus satu kelompok: angka diganti "#", query halaman dibuang. */
export function fingerprintOf(kind: ErrorKind, message: string, route: string | null): string {
  const base = (route ?? '').split('?')[0]
  const normalized = message.split('\n')[0].replace(/\d+/g, '#').slice(0, 200)
  return `${kind}:${hash(`${kind}|${normalized}|${base}`)}`
}

/** Pesan dari apa pun yang bisa dilempar (Error, objek Supabase, string). */
export function messageOf(error: unknown): string {
  const text = errorText(error)
  const code =
    error && typeof error === 'object' && 'code' in error && typeof (error as { code: unknown }).code === 'string'
      ? `[${(error as { code: string }).code}] `
      : ''
  return truncate(`${code}${text}`, MAX_MESSAGE)
}

/** Baris siap simpan, atau null kalau error ini tidak perlu dilaporkan. */
export function buildReport(kind: ErrorKind, error: unknown, ctx: ReportContext = {}): ErrorReportRow | null {
  const message = messageOf(error)
  const stack = error instanceof Error && error.stack ? truncate(error.stack, MAX_STACK) : null
  if (!message.trim() || isIgnorable(message, stack)) return null
  const route = ctx.route ? truncate(ctx.route, 200) : null
  return {
    kind,
    message,
    stack,
    route,
    app_version: ctx.appVersion ? truncate(ctx.appVersion, 40) : null,
    user_agent: ctx.userAgent ? truncate(ctx.userAgent, 300) : null,
    fingerprint: fingerprintOf(kind, message, route),
    store_id: ctx.storeId ?? null,
  }
}

/**
 * Pelapor dengan dua pagar: error yang sama hanya dikirim sekali per sesi browser, dan paling banyak
 * `maxPerSession` laporan per sesi. Pengirim yang gagal tidak pernah melempar ulang.
 */
export function createReporter(send: (row: ErrorReportRow) => unknown, maxPerSession = 10) {
  const seen = new Set<string>()
  let sent = 0
  return {
    report(kind: ErrorKind, error: unknown, ctx: ReportContext = {}): boolean {
      const row = buildReport(kind, error, ctx)
      if (!row || seen.has(row.fingerprint) || sent >= maxPerSession) return false
      seen.add(row.fingerprint)
      sent++
      try {
        Promise.resolve(send(row)).catch(() => {})
      } catch {
        // pelaporan tidak boleh mengganggu aplikasi
      }
      return true
    },
  }
}
