/**
 * Branding lewat env, supaya satu kode bisa dipakai dua deploy:
 * "Profit Shopee" (keluarga) dan "HitungCuan" (banyak pelanggan).
 */

/** VITE_APP_NAME, default "Profit Shopee". */
export const APP_NAME = ((import.meta.env.VITE_APP_NAME as string | undefined) ?? '').trim() || 'Profit Shopee'

/** Deploy HitungCuan memakai logo dan favicon landing (public/logo/); deploy lain memakai nama teks. */
export const isHitungCuan = APP_NAME.replace(/\s+/g, '').toLowerCase() === 'hitungcuan'

/** VITE_SUPPORT_WA: nomor WhatsApp pengelola, format 62... (tanda baca diabaikan). */
const SUPPORT_NUMBER = ((import.meta.env.VITE_SUPPORT_WA as string | undefined) ?? '').replace(/\D/g, '')

export const hasSupportWhatsApp = SUPPORT_NUMBER.length > 0

// Tanpa nomor ini, semua link WhatsApp ke pengelola (tombol Bantuan, "Perpanjang", "Lupa password?") disembunyikan.
// Peringatan di console (bukan di layar) supaya pengelola sadar saat membuka aplikasi hasil deploy.
if (!hasSupportWhatsApp && import.meta.env.PROD) {
  console.warn('VITE_SUPPORT_WA belum diisi: tombol WhatsApp ke pengelola tidak aktif (lihat README).')
}

/** Link chat WhatsApp ke pengelola, dengan pesan awal. null kalau nomor belum diisi. */
export function supportUrl(message: string): string | null {
  if (!hasSupportWhatsApp) return null
  return `https://wa.me/${SUPPORT_NUMBER}?text=${encodeURIComponent(message)}`
}
