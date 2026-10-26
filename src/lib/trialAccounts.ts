/**
 * Halaman Pengelola: membuat akun uji coba dan membaca daftar pelanggan.
 *
 * Fungsi murni (tanpa Supabase) supaya bisa dites. Aturan isian sama dengan platform_create_trial()
 * di database (migration 20261026000000); yang benar-benar menolak tetap database.
 */
import { TRIAL_MONTH_LIMIT, TRIAL_SIMULATION_LIMIT } from './trialLimits'
import { MIN_PASSWORD_LENGTH } from './password'
import { subscriptionStatus, wibToday } from './subscription'
import { formatDate } from './format'

/** Lama uji coba bawaan (hari), sama dengan janji di landing ("Gratis 30 hari") dan OPERASI.md. */
export const DEFAULT_TRIAL_DAYS = 30

/** Huruf & angka yang tidak mirip satu sama lain (tanpa 0/O, 1/l/I), supaya mudah diketik dari WhatsApp. */
const PASSWORD_CHARS = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const DIGITS = '23456789'

/** Bilangan acak 0..max-1. Bawaan: crypto browser (aman); test memberi versi sendiri. */
export type RandomInt = (max: number) => number

export const cryptoRandomInt: RandomInt = (max) => {
  // Tolak sisa supaya tiap karakter peluangnya sama.
  const limit = Math.floor(0x1_0000_0000 / max) * max
  const buf = new Uint32Array(1)
  do crypto.getRandomValues(buf)
  while (buf[0] >= limit)
  return buf[0] % max
}

/** Password sementara 10 karakter, selalu ada huruf dan angka. */
export function generatePassword(randomInt: RandomInt = cryptoRandomInt, length = 10): string {
  const chars = Array.from({ length }, () => PASSWORD_CHARS[randomInt(PASSWORD_CHARS.length)])
  if (!chars.some((c) => DIGITS.includes(c))) chars[randomInt(length)] = DIGITS[randomInt(DIGITS.length)]
  if (!chars.some((c) => !DIGITS.includes(c))) chars[randomInt(length)] = 'k'
  return chars.join('')
}

/** "YYYY-MM-DD" + n hari. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/**
 * Tanggal berakhir bawaan: hari ini (WIB) ikut dihitung, jadi 30 hari = hari ini + 29.
 * Toko aktif sampai akhir tanggal itu (sama dengan is_store_active di database).
 */
export function defaultTrialEnd(now: Date = new Date(), days = DEFAULT_TRIAL_DAYS): string {
  return addDays(wibToday(now), days - 1)
}

/**
 * Tanggal berakhir akun berlangganan: N bulan dari hari ini (WIB), hari ini ikut dihitung.
 * Contoh: dibuat 15 Nov, 1 bulan → aktif sampai 14 Des. Tanggal yang tidak ada (31 → Feb) mundur ke akhir bulan.
 */
export function paidEnd(months: number, now: Date = new Date()): string {
  return monthsFrom(wibToday(now), months)
}

/** N bulan mulai tanggal `start` (ikut dihitung): "2026-11-01" + 1 bulan → "2026-11-30". */
function monthsFrom(start: string, months: number): string {
  const [y, m, d] = start.split('-').map(Number)
  const lastDay = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate()
  const target = new Date(Date.UTC(y, m - 1 + months, Math.min(d, lastDay))).toISOString().slice(0, 10)
  return addDays(target, -1)
}

/**
 * Hari pertama masa perpanjangan: sehari setelah langganan sekarang berakhir kalau masih aktif (sisa hari
 * tidak hilang), atau hari ini kalau sudah berakhir.
 */
export function extensionStart(activeUntil: string | null, now: Date = new Date()): string {
  const today = wibToday(now)
  return activeUntil && activeUntil >= today ? addDays(activeUntil, 1) : today
}

/** Tanggal berakhir baru kalau diperpanjang N bulan. */
export function extendedEnd(activeUntil: string | null, months: number, now: Date = new Date()): string {
  return monthsFrom(extensionStart(activeUntil, now), months)
}

/** Nama toko kalau isian dikosongkan: "Toko budi.santoso" dari "budi.santoso@gmail.com". */
export function storeNameFromEmail(email: string): string {
  const local = email.trim().split('@')[0]?.trim() ?? ''
  return local ? `Toko ${local}`.slice(0, 100) : ''
}

export interface TrialForm {
  email: string
  password: string
  /** Boleh kosong: diisi dari email. */
  storeName: string
  /** "YYYY-MM-DD" */
  activeUntil: string
}

/** Nama toko dikosongkan pengelola: pemilik akun mengisinya sendiri saat login pertama. */
export function asksStoreName(form: TrialForm): boolean {
  return form.storeName.trim() === ''
}

/** Nama toko yang diketik pemilik (spasi dirapikan, sama seperti set_store_name di database). */
export function cleanStoreName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

/** Pesan kesalahan nama toko, atau null kalau sudah benar. */
export function validateStoreName(name: string): string | null {
  const clean = cleanStoreName(name)
  if (clean === '') return 'Isi nama tokomu.'
  if (clean.length > 100) return 'Nama toko terlalu panjang (maksimal 100 karakter).'
  return null
}

/** Isian yang dikirim ke database (email dirapikan, nama toko terisi). */
export function normalizeTrialForm(form: TrialForm): TrialForm {
  const email = form.email.trim().toLowerCase()
  return {
    email,
    password: form.password,
    storeName: form.storeName.trim() || storeNameFromEmail(email),
    activeUntil: form.activeUntil,
  }
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** Pesan kesalahan isian, atau null kalau sudah benar. */
export function validateTrialForm(form: TrialForm, now: Date = new Date()): string | null {
  const f = normalizeTrialForm(form)
  if (!EMAIL_RE.test(f.email) || f.email.length > 254) return 'Email belum benar. Contoh: nama@gmail.com'
  if (f.password.length < MIN_PASSWORD_LENGTH) return `Password minimal ${MIN_PASSWORD_LENGTH} karakter.`
  if (new TextEncoder().encode(f.password).length > 72) return 'Password terlalu panjang (maksimal 72 karakter).'
  if (f.storeName.length > 100) return 'Nama toko terlalu panjang (maksimal 100 karakter).'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.activeUntil)) return 'Isi tanggal berakhir.'
  if (f.activeUntil < wibToday(now)) return 'Tanggal berakhir tidak boleh sebelum hari ini.'
  return null
}

/** Teks siap kirim lewat WhatsApp ke calon pelanggan. */
export function welcomeMessage(input: {
  appName: string
  loginUrl: string
  email: string
  password: string
  activeUntil: string
  /** false = akun langsung berlangganan (tanpa kalimat batas uji coba). Bawaan: uji coba. */
  trial?: boolean
}): string {
  if (input.trial === false) {
    return [
      `Halo! Akun ${input.appName} kamu sudah aktif.`,
      '',
      `Buka: ${input.loginUrl}`,
      `Email: ${input.email}`,
      `Password: ${input.password}`,
      '',
      `Langganan aktif sampai ${formatDate(input.activeUntil)}. Setelah login, ganti password di halaman Akun ya.`,
    ].join('\n')
  }
  return [
    `Halo! Akun uji coba ${input.appName} kamu sudah siap.`,
    '',
    `Buka: ${input.loginUrl}`,
    `Email: ${input.email}`,
    `Password: ${input.password}`,
    '',
    `Bisa dipakai sampai ${formatDate(input.activeUntil)}. Setelah login, ganti password di halaman Akun ya.`,
    '',
    `Selama uji coba, laporan bisa disimpan untuk ${TRIAL_MONTH_LIMIT} bulan (pakai bulan lalu ya, bulan pertama yang disimpan tidak bisa diganti) dan Simulasi Harga untuk ${TRIAL_SIMULATION_LIMIT} produk.`,
  ].join('\n')
}

/** Satu baris dari platform_list_customers(). */
export interface CustomerRow {
  store_id: number
  store_name: string
  active_until: string | null
  trial: boolean
  created_at: string | null
  owner_emails: string[]
  last_sign_in_at: string | null
}

export type CustomerState = 'active' | 'expiring' | 'expired' | 'unlimited'

/** Status langganan untuk daftar pelanggan. "expiring" = sisa ≤ 3 hari (saatnya follow up). */
export function customerStatus(
  activeUntil: string | null,
  now: Date = new Date(),
): { state: CustomerState; label: string } {
  const s = subscriptionStatus(activeUntil, now)
  if (s.state === 'unlimited') return { state: 'unlimited', label: 'Tanpa batas' }
  if (s.state === 'expired') return { state: 'expired', label: `Baca saja sejak ${formatDate(addDays(s.activeUntil!, 1))}` }
  const left = s.daysLeft!
  const label = left === 0 ? 'Aktif, hari ini terakhir' : left === 1 ? 'Aktif, sisa 1 hari (besok terakhir)' : `Aktif, sisa ${left} hari`
  return { state: left <= 3 ? 'expiring' : 'active', label }
}

/** "Belum pernah login", "Hari ini", "Kemarin", "5 hari lalu" (menurut tanggal WIB). */
export function lastLoginLabel(lastSignInAt: string | null, now: Date = new Date()): string {
  if (!lastSignInAt) return 'Belum pernah login'
  const t = new Date(lastSignInAt)
  if (Number.isNaN(t.getTime())) return 'Belum pernah login'
  const days = Math.round(
    (Date.parse(wibToday(now)) - Date.parse(wibToday(t))) / 86_400_000,
  )
  if (days <= 0) return 'Hari ini'
  if (days === 1) return 'Kemarin'
  if (days < 60) return `${days} hari lalu`
  return formatDate(lastSignInAt)
}

/**
 * Kelompok di dashboard pengelola:
 * - trial : uji coba yang masih aktif
 * - paid  : berlangganan yang masih aktif (termasuk toko tanpa batas tanggal)
 * - ended : sudah berakhir (baca saja), uji coba maupun berlangganan
 */
export type CustomerGroup = 'trial' | 'paid' | 'ended'

export function customerGroup(row: CustomerRow, now: Date = new Date()): CustomerGroup {
  if (customerStatus(row.active_until, now).state === 'expired') return 'ended'
  return row.trial ? 'trial' : 'paid'
}

export function countByGroup(rows: CustomerRow[], now: Date = new Date()): Record<CustomerGroup, number> {
  const out: Record<CustomerGroup, number> = { trial: 0, paid: 0, ended: 0 }
  for (const r of rows) out[customerGroup(r, now)]++
  return out
}

/** Ringkasan untuk kalimat jawaban di atas halaman. */
export function summarizeCustomers(rows: CustomerRow[], now: Date = new Date()) {
  let activeTrials = 0
  let neverLoggedIn = 0
  for (const r of rows) {
    if (!r.trial) continue
    const st = customerStatus(r.active_until, now).state
    if (st === 'active' || st === 'expiring') {
      activeTrials++
      if (!r.last_sign_in_at && r.owner_emails.length > 0) neverLoggedIn++
    }
  }
  return { total: rows.length, activeTrials, neverLoggedIn }
}

/**
 * Pesan error untuk halaman Pengelola. Pesan dari database untuk isian yang salah, email yang sudah terdaftar,
 * atau bukan pengelola sudah ditulis untuk pengelola, jadi ditampilkan apa adanya.
 */
export function trialErrorMessage(err: unknown, fallback: (err: unknown) => string, hint: (err: unknown) => string | null): string {
  const e = err as { code?: unknown; message?: unknown } | null
  if (e && typeof e.message === 'string' && ['22023', '23505', '42501'].includes(String(e.code))) return e.message
  return hint(err) ?? fallback(err)
}
