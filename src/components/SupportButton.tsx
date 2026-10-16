// Tombol bantuan yang menempel di pojok layar: langsung membuka WhatsApp ke pengelola, dengan pesan awal
// yang sudah berisi akun, toko, dan halaman, supaya pengelola tidak perlu bertanya balik.
import { APP_NAME, supportUrl } from '../lib/brand'
import { IconWhatsApp } from './icons'

export interface SupportContext {
  email?: string
  storeName?: string
  /** Nama halaman yang sedang dibuka, mis. "Rekap". */
  page?: string
}

/** Pesan awal WhatsApp. Pelanggan masih bisa mengubahnya sebelum mengirim. */
export function supportMessage(ctx: SupportContext = {}): string {
  const lines = [`Halo, saya butuh bantuan ${APP_NAME}.`]
  if (ctx.email) lines.push(`Akun: ${ctx.email}`)
  if (ctx.storeName) lines.push(`Toko: ${ctx.storeName}`)
  if (ctx.page) lines.push(`Halaman: ${ctx.page}`)
  lines.push('Masalahnya: ')
  return lines.join('\n')
}

/**
 * Tidak tampil kalau nomor WhatsApp pengelola (VITE_SUPPORT_WA) belum diisi. Pil putih bergaris, bukan indigo:
 * tombol ini ada di setiap halaman, jadi tidak boleh bersaing dengan tombol utama halaman itu.
 * Di HP naik di atas menu bawah (`aboveNav`); di laptop di pojok kanan bawah.
 */
export function SupportButton({ context, aboveNav = true }: { context?: SupportContext; aboveNav?: boolean }) {
  const href = supportUrl(supportMessage(context))
  if (!href) return null
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`fixed right-4 z-20 inline-flex min-h-12 items-center gap-2 rounded-full border-2 border-control bg-paper px-5 font-semibold text-ink shadow-sheet transition-[border-color,transform] active:translate-y-px hover:border-ink ${
        aboveNav ? 'bottom-[calc(5.5rem+env(safe-area-inset-bottom))] lg:bottom-6' : 'bottom-[calc(1rem+env(safe-area-inset-bottom))]'
      }`}
    >
      <IconWhatsApp size={20} className="text-accent" />
      Bantuan
      <span className="sr-only"> lewat WhatsApp (membuka WhatsApp di tab baru)</span>
    </a>
  )
}
