// Pelapor error yang sudah tersambung ke Supabase, plus penangkap error global browser.
import { createReporter, type ErrorKind, type ReportContext } from './errorReport'
import { isSupabaseConfigured, supabase } from './supabase'


const appVersion = typeof __APP_VERSION__ === 'undefined' ? 'dev' : __APP_VERSION__

let storeId: number | null = null

/** Toko yang sedang dipilih (hanya yang sudah terbukti milik akun ini, supaya laporan diterima RLS). */
export function setErrorContext(ctx: { storeId: number | null }) {
  storeId = ctx.storeId
}

const reporter = createReporter((row) => {
  if (!isSupabaseConfigured) return
  // Tanpa .select(): pelanggan memang tidak punya hak membaca tabel ini.
  return supabase.from('client_errors').insert(row)
})

export function reportError(kind: ErrorKind, error: unknown) {
  const ctx: ReportContext = {
    route: typeof window === 'undefined' ? null : window.location.hash,
    storeId,
    appVersion,
    userAgent: typeof navigator === 'undefined' ? null : navigator.userAgent,
  }
  return reporter.report(kind, error, ctx)
}

/** Pasang sekali di main.tsx: menangkap error yang lolos dan promise yang ditolak tanpa penanganan. */
export function installErrorHandlers() {
  window.addEventListener('error', (e) => reportError('uncaught', e.error ?? e.message))
  window.addEventListener('unhandledrejection', (e) => reportError('unhandledrejection', e.reason))
}
