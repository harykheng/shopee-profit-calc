/**
 * Password dari admin vs password milik pelanggan.
 *
 * Akun dibuat admin dengan password sementara. Selama pelanggan belum menggantinya sendiri lewat
 * halaman Akun, user_metadata.password_changed belum ada dan aplikasi menampilkan banner pengingat.
 * Ini hanya pengingat, bukan pengaman: pelanggan bisa mengubah metadata-nya sendiri.
 */

export const MIN_PASSWORD_LENGTH = 8

/** true selama akun masih memakai password dari admin. */
export function needsPasswordChange(user: { user_metadata?: Record<string, unknown> | null } | null | undefined): boolean {
  return user?.user_metadata?.password_changed !== true
}

/** Pesan kesalahan untuk isian ganti password, atau null kalau sudah benar. */
export function validateNewPassword(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Password baru minimal ${MIN_PASSWORD_LENGTH} karakter.`
  if (password !== confirm) return 'Konfirmasi password tidak sama dengan password baru.'
  return null
}
