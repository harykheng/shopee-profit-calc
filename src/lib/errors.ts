import { ParseError } from './parsers/common'

/** Ubah error apa pun menjadi pesan yang bisa dipahami orang non-teknis. */
export function friendlyError(err: unknown): string {
  if (err instanceof ParseError) return err.message
  const message = errorText(err)
  const lower = message.toLowerCase()
  if (lower.includes('invalid login credentials')) return 'Email atau password salah.'
  if (lower.includes('email not confirmed')) return 'Akun ini belum dikonfirmasi. Hubungi pengelola aplikasi.'
  if (lower.includes('jwt') || lower.includes('not authenticated') || lower.includes('refresh token')) {
    return 'Sesi login sudah habis. Silakan keluar lalu login lagi.'
  }
  if (lower.includes('failed to fetch') || lower.includes('network') || lower.includes('load failed')) {
    return 'Tidak bisa terhubung ke server. Cek koneksi internet, lalu coba lagi.'
  }
  if (lower.includes('permission denied') || lower.includes('row-level security')) {
    return 'Anda tidak punya akses untuk data ini. Coba login ulang.'
  }
  return 'Terjadi kesalahan. Coba lagi; kalau masih gagal, hubungi pengelola aplikasi.'
}

/** Detail teknis (untuk dibuka di bagian "Detail teknis"). */
export function errorText(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message: unknown }).message)
  return String(err)
}
