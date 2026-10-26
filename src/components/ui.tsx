import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react'
import { APP_NAME, hasSupportWhatsApp, isHitungCuan, supportUrl } from '../lib/brand'
import { adminHint, errorText, friendlyError } from '../lib/errors'
import { ParseError } from '../lib/parsers/common'
import { reportError } from '../lib/reportError'
import { IconAlertCircle, IconArrowRight, IconCheck, IconCheckCircle, IconError, IconInfo, IconMinus, IconWarning, IconWhatsApp, IconX } from './icons'

type Variant = 'primary' | 'secondary' | 'danger'

/*
 * Tombol utama: pil indigo dengan teks putih (9,54:1), seperti tombol WhatsApp di landing. Satu per layar kalau bisa.
 * Tombol kedua: pil bergaris control (3,8:1, syarat 3:1) di atas paper. Semua punya garis 2px supaya tingginya sama.
 */
const VARIANTS: Record<Variant, string> = {
  primary: 'border-transparent bg-accent text-white hover:bg-accent-hover disabled:bg-accent/45',
  secondary: 'border-control bg-paper text-ink hover:border-ink disabled:border-line disabled:text-ink-3',
  danger: 'border-transparent bg-loss text-white hover:bg-loss/90 disabled:bg-loss/45',
}

/** Kelas tombol, juga untuk <a> yang tampil sebagai tombol (mis. "Upload laporan" ke halaman lain). */
export const buttonClass = (variant: Variant = 'primary') =>
  `inline-flex min-h-11 items-center justify-center gap-2 rounded-full border-2 px-5 text-base font-semibold transition-[background-color,border-color,transform] duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:active:translate-y-0 ${VARIANTS[variant]}`

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type="button" {...props} className={`${buttonClass(variant)} ${className}`} />
}

/** Tautan (#/halaman) yang tampil seperti Button. */
export function ButtonLink({
  href,
  variant = 'primary',
  className = '',
  children,
}: {
  href: string
  variant?: Variant
  className?: string
  children: ReactNode
}) {
  return (
    <a href={href} className={`${buttonClass(variant)} ${className}`}>
      {children}
    </a>
  )
}

/**
 * Pembungkus tabel lebar di atas lembar putih. Kalau isinya lebih lebar dari layar (HP), tampil
 * bayangan di tepi kanan dan petunjuk "geser", supaya jelas masih ada kolom yang tersembunyi.
 */
/**
 * Satu baris teks besar yang tidak pernah pecah ke baris kedua (angka jawaban di Rekap Bab 1). Ukuran dari
 * `className` adalah batas atas; kalau kolomnya lebih sempit, huruf dikecilkan sampai teks terlebar di `fitTo` muat.
 * Lebar diukur langsung karena angka Parkinsans tidak sama lebar ("4" jauh lebih lebar dari "1").
 */
export function FitLine({ children, fitTo, className = '' }: { children: ReactNode; fitTo: string[]; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null)
  const probeRef = useRef<HTMLSpanElement>(null)
  const key = fitTo.join('\n')

  useLayoutEffect(() => {
    const el = ref.current
    const probe = probeRef.current
    if (!el || !probe) return
    const labels = key.split('\n')
    let width = -1
    let alive = true
    const fit = () => {
      if (!alive) return
      width = el.clientWidth
      el.style.fontSize = ''
      const max = parseFloat(getComputedStyle(el).fontSize)
      let widest = 0
      for (const label of labels) {
        probe.textContent = label
        widest = Math.max(widest, probe.getBoundingClientRect().width)
      }
      probe.textContent = ''
      // Sisa 2%: angka di tengah putaran bisa sedikit lebih lebar dari contoh di `fitTo`.
      const room = width * 0.98
      if (room > 0 && widest > room) el.style.fontSize = `${Math.floor((max * room) / widest)}px`
    }
    fit()
    // Huruf asli biasanya selesai dimuat setelah ukuran pertama dihitung dengan huruf cadangan.
    const fonts = document.fonts
    void fonts?.ready.then(fit)
    fonts?.addEventListener('loadingdone', fit)
    // Lebar kolom berubah (bukan tinggi, yang berubah karena fit sendiri). Lewat requestAnimationFrame supaya tidak
    // memicu galat "ResizeObserver loop".
    let frame = 0
    const ro =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            if (el.clientWidth === width) return
            cancelAnimationFrame(frame)
            frame = requestAnimationFrame(fit)
          })
    ro?.observe(el)
    return () => {
      alive = false
      cancelAnimationFrame(frame)
      fonts?.removeEventListener('loadingdone', fit)
      ro?.disconnect()
    }
  }, [key])

  return (
    <p ref={ref} className={`relative whitespace-nowrap ${className}`}>
      {children}
      <span ref={probeRef} aria-hidden="true" className="invisible absolute left-0 top-0 whitespace-nowrap" />
    </p>
  )
}

export function ScrollX({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  const update = useCallback(() => {
    const el = ref.current
    if (!el) return
    setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
    if (el.scrollLeft > 4) setScrolled(true)
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    return () => ro.disconnect()
  }, [update])

  return (
    <div className="relative">
      <div ref={ref} onScroll={update} className={`overflow-x-auto ${className}`}>
        {children}
      </div>
      {more && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-10"
          style={{ background: 'linear-gradient(to left, var(--color-paper), transparent)' }}
        />
      )}
      {more && !scrolled && (
        <p className="mt-1 flex items-center justify-end gap-1 text-sm font-semibold text-accent">
          Geser ke samping untuk kolom lainnya
          <IconArrowRight size={16} />
        </p>
      )}
    </div>
  )
}

/** Tautan teks: indigo, bergaris bawah tebal. Untuk aksi kedua yang bukan tombol. */
export const linkClass =
  'font-semibold text-accent underline decoration-accent/35 decoration-2 underline-offset-4 transition-colors hover:decoration-accent'

/** Nama aplikasi di bar atas: logo HitungCuan untuk deploy HitungCuan, nama teks untuk deploy lain. */
export function Brand({ className = '' }: { className?: string }) {
  if (isHitungCuan) {
    return (
      <img
        src="/logo/logo-horizontal.svg"
        alt={APP_NAME}
        width={165}
        height={28}
        className={`h-6 w-auto max-w-full object-contain object-left sm:h-7 ${className}`}
      />
    )
  }
  return <span className={`font-display text-xl font-extrabold tracking-tight text-ink ${className}`}>{APP_NAME}</span>
}

/** Lembar putih di atas halaman krem. Tanpa lembar di dalam lembar: isi bertingkat memakai sumur bg-tint. */
export function Card({ title, children, className = '' }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-3xl bg-paper p-5 shadow-sheet ring-1 ring-line sm:p-7 ${className}`}>
      {title && <h2 className="mb-4 font-display text-xl font-bold tracking-tight">{title}</h2>}
      {children}
    </section>
  )
}

type Tone = 'info' | 'warning' | 'error' | 'success'

const TONES: Record<Tone, { box: string; icon: string }> = {
  info: { box: 'border-line bg-tint', icon: 'text-accent' },
  warning: { box: 'border-sun bg-sun-tint', icon: 'text-warn' },
  error: { box: 'border-loss/35 bg-loss-tint', icon: 'text-loss' },
  success: { box: 'border-gain/35 bg-mintbg', icon: 'text-gain' },
}

const ICONS: Record<Tone, typeof IconInfo> = {
  info: IconInfo,
  warning: IconAlertCircle,
  error: IconError,
  success: IconCheckCircle,
}

export function Alert({ tone = 'info', title, children }: { tone?: Tone; title?: ReactNode; children?: ReactNode }) {
  const Icon = ICONS[tone]
  return (
    <div className={`rounded-2xl border px-4 py-3 ${TONES[tone].box}`} role={tone === 'error' ? 'alert' : undefined}>
      <div className="flex gap-3">
        <Icon className={`mt-0.5 shrink-0 ${TONES[tone].icon}`} />
        <div className="min-w-0 flex-1 text-ink [overflow-wrap:anywhere]">
          {title && <p className="font-semibold">{title}</p>}
          {children && <div className={`text-ink-2 ${title ? 'mt-1' : ''}`}>{children}</div>}
        </div>
      </div>
    </div>
  )
}

/**
 * Link WhatsApp ke pengelola. Kalau nomor belum diisi (VITE_SUPPORT_WA) tidak tampil sama sekali, supaya tidak ada
 * teks yang tampak bisa diklik padahal tidak. Pemanggil yang kalimatnya bergantung pada link ini memeriksa `hasSupportWhatsApp`.
 */
export function SupportLink({
  message = `Halo, saya butuh bantuan untuk ${APP_NAME}.`,
  className = '',
  children = 'Hubungi pengelola lewat WhatsApp',
}: {
  message?: string
  className?: string
  children?: ReactNode
}) {
  const href = supportUrl(message)
  if (!href) return null
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`${linkClass} ${className}`}>
      {children}
    </a>
  )
}

/**
 * Tombol utama ke WhatsApp pengelola (pil indigo + logo WhatsApp, seperti tombol WhatsApp di landing), untuk layar yang
 * satu-satunya jalan keluarnya adalah chat pengelola. Tidak tampil kalau nomor belum diisi.
 */
export function WhatsAppButton({ message, children, className = '' }: { message: string; children: ReactNode; className?: string }) {
  const href = supportUrl(message)
  if (!href) return null
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex min-h-12 items-center justify-center gap-2.5 rounded-full bg-accent px-6 text-center font-display font-bold text-white transition-[background-color,transform] duration-150 hover:bg-accent-hover active:translate-y-px ${className}`}
    >
      <IconWhatsApp size={20} className="shrink-0" />
      {children}
      <span className="sr-only"> lewat WhatsApp</span>
    </a>
  )
}

/** Kotak error ramah + detail teknis yang bisa dibuka (untuk pengelola aplikasi). */
export function ErrorBox({
  error,
  reportFile,
}: {
  error: unknown
  /**
   * Untuk file yang gagal dibaca: tampilkan tombol "Laporkan file ini ke pengelola" (WhatsApp, hanya nama
   * file dan pesan error; isi file tidak pernah dikirim). `kind` mis. "export pesanan".
   */
  reportFile?: { kind: string; fileName: string }
}) {
  // Petunjuk untuk pengelola (mis. migration belum dijalankan) hanya masuk console, tidak ke layar pelanggan.
  useEffect(() => {
    if (!error) return
    const hint = adminHint(error)
    if (hint) console.error(`[${APP_NAME}] ${hint}`, error)
    // Ke pengelola (client_errors): error server yang tampil ke pelanggan, dan file yang gagal dibaca.
    reportError(error instanceof ParseError ? 'parse' : 'handled', error)
  }, [error])
  if (!error) return null
  const friendly = friendlyError(error)
  const detail = errorText(error)
  return (
    <Alert tone="error" title={friendly}>
      {friendly.includes('pengelola aplikasi') && supportUrl('') && (
        <p className="mt-1">
          <SupportLink message={`Halo, ada kendala di ${APP_NAME}: ${friendly}`} />
        </p>
      )}
      {reportFile && hasSupportWhatsApp && (
        <p className="mt-2">
          <SupportLink
            message={`Halo, file ${reportFile.kind} saya gagal dibaca di ${APP_NAME}. Nama file: ${reportFile.fileName}. Pesan: ${friendly}`}
          >
            Laporkan file ini ke pengelola lewat WhatsApp
          </SupportLink>
        </p>
      )}
      {detail && detail !== friendly && (
        <details className="mt-1 text-sm">
          <summary className="cursor-pointer underline decoration-dotted underline-offset-4">Detail teknis</summary>
          <p className="num mt-1 break-words">{detail}</p>
        </details>
      )}
    </Alert>
  )
}

export function Spinner({ label = 'Memuat…' }: { label?: string }) {
  return (
    <p className="flex items-center gap-3 py-6 text-ink-3" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent motion-reduce:animate-none" />
      {label}
    </p>
  )
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Dialog modal. Escape dan klik di luar menutupnya (kecuali `dismissible` false, mis. saat proses berjalan),
 * Tab berputar di dalam dialog, dan fokus kembali ke pemicu saat ditutup. Fokus awal ke kotak dialog, bukan ke
 * tombol, supaya Enter tidak langsung menjalankan aksi.
 */
export function Modal({
  labelledBy,
  onClose,
  dismissible = true,
  children,
}: {
  /** id elemen judul di dalam `children`. */
  labelledBy: string
  onClose: () => void
  dismissible?: boolean
  children: ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)
  const latest = useRef({ onClose, dismissible })
  latest.current = { onClose, dismissible }

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panel.current?.focus()
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!latest.current.dismissible) return
        e.preventDefault()
        latest.current.onClose()
        return
      }
      if (e.key !== 'Tab' || !panel.current) return
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) {
        e.preventDefault()
        panel.current.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const outside = !panel.current.contains(document.activeElement) || document.activeElement === panel.current
      if (e.shiftKey && (outside || document.activeElement === first)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (outside || document.activeElement === last)) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (opener?.isConnected) opener.focus()
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-ink/45 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && latest.current.dismissible) latest.current.onClose()
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className="reveal w-full max-w-lg rounded-3xl bg-paper p-6 shadow-sheet ring-1 ring-line outline-none sm:p-7"
      >
        {children}
      </div>
    </div>
  )
}

/** Kata kunci kecil di atas judul (nama toko, "Bab 2 · Hitungannya"). */
export function Kicker({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`font-semibold tracking-wide text-accent ${className}`}>{children}</p>
}

export function PageTitle({ children, kicker, subtitle }: { children: ReactNode; kicker?: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="mb-8">
      {kicker && <Kicker>{kicker}</Kicker>}
      <h1 className={`font-display text-3xl font-extrabold leading-[1.08] tracking-tight sm:text-4xl lg:text-[2.75rem] ${kicker ? 'mt-2' : ''}`}>
        {children}
      </h1>
      {subtitle && <p className="mt-3 max-w-[62ch] text-lg leading-relaxed text-ink-2">{subtitle}</p>}
    </div>
  )
}

/**
 * Baris total di nota: garis tinta tebal di atasnya, label dan angka di huruf tampilan (seperti nota di landing).
 * `tone` mewarnai angkanya kalau angka itu memang untung atau rugi.
 */
export function NotaTotal({
  label,
  sub,
  amount,
  amountSub,
  tone,
  className = '',
}: {
  label: ReactNode
  sub?: ReactNode
  amount: ReactNode
  amountSub?: ReactNode
  tone?: 'gain' | 'loss'
  className?: string
}) {
  const color = tone === 'gain' ? 'text-gain' : tone === 'loss' ? 'text-loss' : 'text-ink'
  return (
    <div className={`flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-t-2 border-ink pt-3 ${className}`}>
      <span>
        <span className="block font-display text-lg font-extrabold">{label}</span>
        {sub && <span className="block text-sm font-semibold text-ink-3">{sub}</span>}
      </span>
      <span className={`sm:text-right ${color}`}>
        <span className="num block whitespace-nowrap font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{amount}</span>
        {amountSub && <span className="num block text-sm font-semibold">{amountSub}</span>}
      </span>
    </div>
  )
}

export type StampTone = 'final' | 'warn' | 'loss' | 'gain' | 'neutral'

/*
 * Stiker vonis, sama dengan landing: huruf tampilan 800, kapital, miring, garis 2px, selalu kata + ikon.
 * Positif = mint dengan teks gain (5,55:1). Rugi = loss dengan teks putih (5,39:1). Perhatian = sun dengan sun-ink.
 * Netral (belum ada vonis) = tint dengan ink-2.
 */
const STAMP_TONES: Record<StampTone, string> = {
  final: 'border-gain bg-mintbg text-gain',
  gain: 'border-gain bg-mintbg text-gain',
  warn: 'border-sun-ink bg-sun text-sun-ink',
  loss: 'border-loss bg-loss text-white',
  neutral: 'border-control bg-tint text-ink-2',
}

const STAMP_ICONS: Record<StampTone, typeof IconCheck> = {
  final: IconCheck,
  gain: IconCheck,
  warn: IconWarning,
  loss: IconX,
  neutral: IconMinus,
}

const STAMP_SIZES = {
  xs: { box: 'gap-1 px-2 py-0.5 text-xs', icon: 12 },
  sm: { box: 'gap-1.5 px-2.5 py-1 text-sm', icon: 14 },
  md: { box: 'gap-1.5 px-3 py-1.5 text-base', icon: 16 },
} as const

export function Stamp({
  tone,
  children,
  className = '',
  tilt = true,
  size = 'sm',
  delay = 0,
}: {
  tone: StampTone
  children: ReactNode
  className?: string
  /** true = −3°, angka = derajat sendiri (mis. 3 untuk miring ke kanan), false = lurus. */
  tilt?: boolean | number
  size?: keyof typeof STAMP_SIZES
  /** Jeda sebelum dicapkan (ms), untuk cap berurutan di daftar. */
  delay?: number
}) {
  const Icon = STAMP_ICONS[tone]
  const deg = tilt === true ? -3 : tilt === false ? 0 : tilt
  const style: CSSProperties & Record<string, string> = { rotate: `${deg}deg` }
  if (delay) style['--stamp-delay'] = `${delay}ms`
  return (
    <span
      style={style}
      className={`stamp-in inline-flex items-center rounded-md border-2 font-display font-extrabold uppercase leading-tight tracking-wide ${STAMP_SIZES[size].box} ${STAMP_TONES[tone]} ${className}`}
    >
      <Icon size={STAMP_SIZES[size].icon} strokeWidth={3} className="shrink-0" />
      <span>{children}</span>
    </span>
  )
}

/** Kotak isian teks biasa (email, catatan, cari). */
export const inputClass =
  'min-h-11 w-full rounded-xl border border-control bg-paper px-3 text-base text-ink transition-colors placeholder:text-ink-3 hover:border-ink focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/25'
