/**
 * Catatan aktivitas (migration 20261116000000_activity_events.sql): apakah akun uji coba benar-benar mencoba?
 *
 * Yang dicatat hanya nama aktivitas + waktu, tanpa isi laporan. Fungsi di sini murni (tanpa Supabase) supaya
 * bisa dites; yang menulis & membatasi catatan adalah database.
 */
import { lastLoginLabel } from './trialAccounts'

/** Aktivitas yang dikirim aplikasi. "trial_registered" dan "subscription_paid" dicatat database sendiri. */
export type AppActivity = 'trial_logged_in' | 'report_uploaded' | 'profit_report_viewed'

/** Satu baris dari platform_activity_summary(). */
export interface ActivitySummary {
  store_id: number
  /** Sumber link uji coba ("Instagram"), null kalau tidak diisi / bukan dari link. */
  source: string | null
  registered_at: string | null
  logins: number
  /** Jumlah tanggal (WIB) berbeda dengan login / upload / buka Rekap. */
  active_days: number
  last_active_at: string | null
  uploads: number
  first_upload_at: string | null
  report_views: number
  first_view_at: string | null
  payments: number
  first_paid_at: string | null
}

export type ActivityStage = 'paid' | 'viewed' | 'uploaded' | 'logged_in' | 'idle'

/** Sejauh mana akun ini mencoba aplikasinya (langkah terjauh yang sudah dilakukan). */
export function activityStage(a: Pick<ActivitySummary, 'payments' | 'report_views' | 'uploads' | 'logins'>): ActivityStage {
  if (a.payments > 0) return 'paid'
  if (a.report_views > 0) return 'viewed'
  if (a.uploads > 0) return 'uploaded'
  if (a.logins > 0) return 'logged_in'
  return 'idle'
}

/** Jawaban singkat untuk daftar Pelanggan, + apakah perlu di-follow up. */
export function activityVerdict(a: ActivitySummary): { label: string; followUp: boolean } {
  switch (activityStage(a)) {
    case 'paid':
      return { label: 'Sudah bayar', followUp: false }
    case 'viewed':
      return { label: 'Sudah melihat hasil Rekap', followUp: false }
    case 'uploaded':
      return { label: 'Sudah upload, belum buka Rekap', followUp: true }
    case 'logged_in':
      return { label: 'Masuk saja, belum upload', followUp: true }
    default:
      return { label: 'Belum dipakai', followUp: true }
  }
}

/** "Masuk 3× · 2 hari aktif · Upload 1× · Buka Rekap 4× · terakhir aktif kemarin" (yang nol tidak ditulis). */
export function activityDetail(a: ActivitySummary, now: Date = new Date()): string {
  const parts: string[] = []
  if (a.logins > 0) parts.push(`Masuk ${a.logins}×`)
  if (a.active_days > 0) parts.push(`${a.active_days} hari aktif`)
  if (a.uploads > 0) parts.push(`Upload ${a.uploads}×`)
  if (a.report_views > 0) parts.push(`Buka Rekap ${a.report_views}×`)
  if (a.payments > 1) parts.push(`Bayar ${a.payments}×`)
  if (a.last_active_at) parts.push(`terakhir aktif ${lastLoginLabel(a.last_active_at, now).toLowerCase()}`)
  return parts.join(' · ')
}

/** Toko uji coba (dari daftar) yang sudah sampai upload laporan atau lebih jauh. */
export function countTried(storeIds: number[], summary: Map<number, ActivitySummary>): number {
  return storeIds.filter((id) => {
    const a = summary.get(id)
    return a ? activityStage(a) !== 'idle' && activityStage(a) !== 'logged_in' : false
  }).length
}

/** Sumber link: dirapikan, kosong = null. Batas panjang sama dengan database. */
export const SOURCE_MAX_LENGTH = 40
export function normalizeSource(input: string): string | null {
  const s = input.trim().replace(/\s+/g, ' ')
  return s === '' ? null : s.slice(0, SOURCE_MAX_LENGTH)
}
