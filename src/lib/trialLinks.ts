/**
 * Link uji coba: pengelola membuat link, calon pelanggan membuat akun uji cobanya sendiri.
 *
 * Fungsi murni (tanpa Supabase) supaya bisa dites. Yang benar-benar memeriksa kode link, jatah, dan
 * masa berlaku adalah database (migration 20261111000000_trial_links.sql).
 */
import { MIN_PASSWORD_LENGTH } from './password'
import { DEFAULT_TRIAL_DAYS } from './trialAccounts'
import { TRIAL_MONTH_LIMIT, TRIAL_SIMULATION_LIMIT } from './trialLimits'
import { formatDate } from './format'

/** Alamat halaman daftar: "#/coba?kode=…". Kode ada di bagian # supaya tidak ikut terkirim ke server web. */
export const SIGNUP_ROUTE = 'coba'

/** Pilihan di halaman Buat akun. */
export const LINK_USE_OPTIONS = [1, 10, 50] as const
export const LINK_DAY_OPTIONS = [7, 30] as const

export function signupUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}/#/${SIGNUP_ROUTE}?kode=${encodeURIComponent(token)}`
}

/** Kode link dari alamat "#/coba?kode=…", atau null kalau bukan halaman daftar. "" = halaman daftar tanpa kode. */
export function signupCodeFromHash(hash: string): string | null {
  const [path, query] = hash.replace(/^#\/?/, '').split('?')
  if (path !== SIGNUP_ROUTE) return null
  return (new URLSearchParams(query ?? '').get('kode') ?? '').trim()
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** Pesan kesalahan isian daftar, atau null kalau sudah benar. Aturannya sama dengan database. */
export function validateSignup(input: { email: string; password: string }): string | null {
  const email = input.email.trim()
  if (!EMAIL_RE.test(email) || email.length > 254) return 'Email belum benar. Contoh: nama@gmail.com'
  if (input.password.length < MIN_PASSWORD_LENGTH) return `Password minimal ${MIN_PASSWORD_LENGTH} karakter.`
  if (new TextEncoder().encode(input.password).length > 72) return 'Password terlalu panjang (maksimal 72 karakter).'
  return null
}

/** Jawaban trial_link_status() di database. */
export type TrialLinkState = 'ok' | 'expired' | 'used_up' | 'invalid'

export function toLinkState(value: unknown): TrialLinkState {
  return value === 'ok' || value === 'expired' || value === 'used_up' ? value : 'invalid'
}

/** Judul halaman daftar kalau link tidak bisa dipakai. */
export function linkProblem(state: TrialLinkState): string | null {
  if (state === 'expired') return 'Link uji coba ini sudah tidak berlaku.'
  if (state === 'used_up') return 'Kuota link uji coba ini sudah habis.'
  if (state === 'invalid') return 'Link uji coba ini tidak dikenal.'
  return null
}

/** Kalimat batas uji coba (sama dengan teks akun uji coba buatan pengelola). */
export function trialLimitsSentence(): string {
  return `Selama uji coba, laporan bisa disimpan untuk ${TRIAL_MONTH_LIMIT} bulan (pakai bulan lalu ya, bulan pertama yang disimpan tidak bisa diganti) dan Simulasi Harga untuk ${TRIAL_SIMULATION_LIMIT} produk.`
}

/** Teks siap kirim (WhatsApp / bio / grup) berisi link uji coba. */
export function linkInviteMessage(input: { appName: string; url: string }): string {
  return [
    `Halo! Coba ${input.appName} gratis ${DEFAULT_TRIAL_DAYS} hari: lihat untung bersih tokomu, iklan yang bikin rugi, dan harga jual yang masih untung.`,
    '',
    `Daftar di sini (cukup email dan password, langsung bisa dipakai):`,
    input.url,
  ].join('\n')
}

/** Satu baris dari platform_list_trial_links(). */
export interface TrialLinkRow {
  id: number
  max_uses: number
  used_count: number
  expires_at: string
  created_at: string
}

/** "Untuk 10 orang · 3 sudah daftar · berlaku sampai 18 Nov 2026" */
export function linkSummary(row: Pick<TrialLinkRow, 'max_uses' | 'used_count' | 'expires_at'>): string {
  const who = row.max_uses === 1 ? 'Untuk 1 orang' : `Untuk ${row.max_uses} orang`
  return `${who} · ${row.used_count} sudah daftar · berlaku sampai ${formatDate(row.expires_at)}`
}
