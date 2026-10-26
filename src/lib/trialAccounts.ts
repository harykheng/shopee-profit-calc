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
}): string {
  return [
    `Halo! Akun uji coba ${input.appName} kamu sudah siap.`,
    '',
    `Buka: ${input.loginUrl}`,
    `Email: ${input.email}`,
    `Password: ${input.password}`,
    '',
    `Bisa dipakai sampai ${formatDate(input.activeUntil)}. Setelah login, ganti password di halaman Akun ya.`,
    '',
    `Selama uji coba, laporan bisa disimpan untuk ${TRIAL_MONTH_LIMIT} bulan (mulai dari bulan lalu ya) dan Simulasi Harga ${TRIAL_SIMULATION_LIMIT} produk per hari.`,
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
