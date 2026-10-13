import { useCallback, useEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react'
import { APP_NAME, hasSupportWhatsApp, supportUrl } from '../lib/brand'
import { adminHint, errorText, friendlyError } from '../lib/errors'
import { ParseError } from '../lib/parsers/common'
import { reportError } from '../lib/reportError'
import { IconAlertCircle, IconCheckCircle, IconError, IconInfo } from './icons'

type Variant = 'primary' | 'secondary' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-stamp text-white hover:bg-stamp-strong active:bg-stamp-strong disabled:bg-stamp/40 disabled:text-white/90',
  secondary:
    'bg-stamp-tint text-stamp-strong hover:bg-[#dfe1fa] active:bg-[#d4d7f7] disabled:bg-counter disabled:text-ink-muted',
  danger: 'bg-loss text-white hover:bg-loss/90 active:bg-loss/80 disabled:bg-loss/40',
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-base font-semibold transition duration-150 enabled:active:scale-[0.97] disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
    />
  )
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
    <a
      href={href}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-base font-semibold transition duration-150 active:scale-[0.97] ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </a>
  )
}

/**
 * Pembungkus tabel lebar di atas lembar putih. Kalau isinya lebih lebar dari layar (HP), tampil
 * bayangan di tepi kanan dan petunjuk "geser", supaya jelas masih ada kolom yang tersembunyi.
 */
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
        <p className="mt-1 text-right text-sm font-semibold text-stamp-strong">Geser ke samping untuk kolom lainnya →</p>
      )}
    </div>
  )
}

/** Lembar kertas (nota) di atas meja. */
export function Card({ title, children, className = '' }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-3xl bg-paper p-5 shadow-sheet sm:p-7 ${className}`}>
      {title && <h2 className="mb-4 font-display text-xl font-bold tracking-tight">{title}</h2>}
      {children}
    </section>
  )
}

type Tone = 'info' | 'warning' | 'error' | 'success'

const TONES: Record<Tone, string> = {
  info: 'border-info/25 bg-info-tint text-info',
  warning: 'border-warn-line bg-warn-tint text-warn',
  error: 'border-loss/30 bg-loss-tint text-loss',
  success: 'border-gain/30 bg-gain-tint text-gain',
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
    <div className={`rounded-2xl border px-4 py-3 ${TONES[tone]}`} role={tone === 'error' ? 'alert' : undefined}>
      <div className="flex gap-3">
        <Icon className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1 text-ink [overflow-wrap:anywhere]">
          {title && <p className="font-semibold">{title}</p>}
          {children && <div className={`text-ink-soft ${title ? 'mt-1' : ''}`}>{children}</div>}
        </div>
      </div>
    </div>
  )
}

/** Link WhatsApp ke pengelola. Kalau nomor belum diisi (VITE_SUPPORT_WA), hanya teks biasa. */
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
  if (!href) return <span className={className}>{children}</span>
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`font-semibold underline underline-offset-2 ${className}`}
    >
      {children}
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
          <summary className="cursor-pointer">Detail teknis</summary>
          <p className="num mt-1 break-words">{detail}</p>
        </details>
      )}
    </Alert>
  )
}

export function Spinner({ label = 'Memuat…' }: { label?: string }) {
  return (
    <p className="flex items-center gap-3 py-6 text-on-field-muted">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/25 border-t-lime" />
      {label}
    </p>
  )
}

export function PageTitle({ children, subtitle }: { children: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="on-field mb-8 text-on-field">
      <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl">{children}</h1>
      {subtitle && <p className="mt-3 max-w-[62ch] text-lg text-on-field-muted">{subtitle}</p>}
    </div>
  )
}

export type StampTone = 'final' | 'warn' | 'loss' | 'gain' | 'neutral'

const STAMP_TONES: Record<StampTone, string> = {
  final: 'bg-lime text-field-deep',
  gain: 'bg-lime text-field-deep',
  warn: 'bg-[#ffcf5c] text-[#4a2c00]',
  loss: 'bg-coral text-white',
  neutral: 'bg-counter text-ink-soft',
}

/**
 * Stiker vonis (ANGKA FINAL, TAKEDOWN, HERO, IKLAN RUGI, …): label berwarna penuh yang
 * "ditempel" sedikit miring. Teks biasa (bisa dibaca screen reader).
 */
export function Stamp({
  tone,
  children,
  className = '',
  tilt = true,
  delay = 0,
}: {
  tone: StampTone
  children: ReactNode
  className?: string
  tilt?: boolean
  /** Jeda sebelum dicapkan (ms), untuk cap berurutan di daftar. */
  delay?: number
}) {
  return (
    <span
      style={delay ? ({ '--stamp-delay': `${delay}ms` } as CSSProperties) : undefined}
      className={`stamp-in inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-display text-sm font-bold tracking-tight shadow-[0_2px_0_rgb(16_18_70/0.18)] ${
        tilt ? '-rotate-3' : ''
      } ${STAMP_TONES[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

export const selectClass =
  'min-h-11 rounded-xl border border-line bg-paper px-3 text-base text-ink transition-colors hover:border-ink-muted focus:border-stamp focus:outline-none focus:ring-2 focus:ring-stamp/25'

/** Kotak isian teks biasa (email, catatan, cari). */
export const inputClass =
  'min-h-11 w-full rounded-xl border border-line bg-paper px-3 text-base text-ink transition-colors placeholder:text-ink-muted hover:border-ink-muted focus:border-stamp focus:outline-none focus:ring-2 focus:ring-stamp/25'
