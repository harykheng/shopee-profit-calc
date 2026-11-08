import { ParseError } from './parsers/common'
import { trialLimitMessage } from './trialLimits'

/** Pesan untuk pelanggan kalau database belum diperbarui. Detailnya hanya untuk pengelola (lihat adminHint). */
const SYSTEM_TROUBLE = 'Ada gangguan di sistem kami. Coba lagi sebentar lagi; kalau masih gagal, hubungi pengelola aplikasi.'

/** Error karena migration belum dijalankan: [kata kunci, nama file SQL]. */
const MISSING_MIGRATIONS: [match: (lower: string) => boolean, file: string][] = [
  [(l) => l.includes('platform_create_account'), '20261030000000_platform_create_account.sql'],
  [(l) => l.includes('platform_subscribe_store'), '20261031000000_platform_set_subscription.sql'],
  [(l) => l.includes('platform_reset_password'), '20261101000000_platform_reset_password.sql'],
  [(l) => l.includes('platform_add_trial_simulations'), '20261102000000_trial_simulation_bonus.sql'],
  [
    (l) => l.includes('platform_create_trial') || l.includes('platform_list_customers') || l.includes('is_platform_admin'),
    '20261026000000_platform_admin.sql',
  ],
  [(l) => l.includes('use_trial_simulation') || l.includes('trial_months_used'), '20261027000000_trial_limits.sql'],
  [(l) => l.includes('active_until') || l.includes('store_members'), '20261012000000_multi_tenant.sql'],
  [
    (l) => l.includes('save_income_report') || l.includes('income_orders') || (l.includes('income_adjustments') && l.includes('order_no')),
    '20261020000000_income_orders.sql',
  ],
  [(l) => l.includes('upsert_income_adjustments') || l.includes('income_adjustments'), '20261004000000_income_adjustments.sql'],
  [
    (l) => l.includes('admin_pct') || l.includes("'xtra'") || l.includes('column products.xtra'),
    '20261007000000_product_fee_settings.sql',
  ],
  [
    (l) => (l.includes('fee_categories') || l.includes('fee_category_id')) && (l.includes('does not exist') || l.includes('schema cache')),
    '20261014000000_fee_categories.sql',
  ],
  [
    (l) => l.includes('store_settings') && (l.includes('does not exist') || l.includes('schema cache')),
    '20261015000000_store_settings.sql',
  ],
  [(l) => l.includes('save_ad_report') || l.includes('ad_reports') || l.includes('ad_rows'), '20261006000000_ads.sql'],
]

/**
 * Petunjuk untuk pengelola kalau errornya berarti migration belum dijalankan; null kalau bukan.
 * Hanya untuk log (console), tidak pernah ditampilkan ke pelanggan.
 */
export function adminHint(err: unknown): string | null {
  if (err instanceof ParseError) return null
  const lower = errorText(err).toLowerCase()
  const hit = MISSING_MIGRATIONS.find(([match]) => match(lower))
  return hit ? `Database belum diperbarui: jalankan supabase/migrations/${hit[1]} di Supabase SQL Editor (lihat README).` : null
}

/** Ubah error apa pun menjadi pesan yang bisa dipahami orang non-teknis. */
export function friendlyError(err: unknown): string {
  if (err instanceof ParseError) return err.message
  const message = errorText(err)
  const lower = message.toLowerCase()
  const trialLimit = trialLimitMessage(message)
  if (trialLimit) return trialLimit
  if (lower.includes('fee_categories_store_name_key')) return 'Sudah ada kategori dengan nama itu. Pakai nama lain.'
  if (lower.includes('invalid login credentials')) return 'Email atau password salah.'
  if (lower.includes('email not confirmed')) return 'Akun ini belum dikonfirmasi. Hubungi pengelola aplikasi.'
  if (lower.includes('jwt') || lower.includes('not authenticated') || lower.includes('refresh token')) {
    return 'Sesi login sudah habis. Silakan keluar lalu login lagi.'
  }
  if (lower.includes('different from the old password')) return 'Password baru harus berbeda dari password yang sekarang.'
  if (lower.includes('password should be') || lower.includes('weak password')) {
    return 'Password terlalu lemah. Pakai minimal 8 karakter, campuran huruf dan angka.'
  }
  if (lower.includes('reauthentication') || lower.includes('recently logged in')) {
    return 'Demi keamanan, keluar lalu login lagi, kemudian coba ganti password sekali lagi.'
  }
  if (lower.includes('failed to fetch') || lower.includes('network') || lower.includes('load failed')) {
    return 'Tidak bisa terhubung ke server. Cek koneksi internet, lalu coba lagi.'
  }
  if (adminHint(err)) return SYSTEM_TROUBLE
  if (lower.includes('permission denied') || lower.includes('row-level security')) {
    return 'Kamu tidak punya akses untuk data ini. Coba login ulang.'
  }
  return 'Terjadi kesalahan. Coba lagi; kalau masih gagal, hubungi pengelola aplikasi.'
}

/** Detail teknis (untuk dibuka di bagian "Detail teknis"). */
export function errorText(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message: unknown }).message)
  return String(err)
}
