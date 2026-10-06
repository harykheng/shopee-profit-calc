import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { errorText, friendlyError } from '../lib/errors'
import { IconAlertCircle, IconCheckCircle, IconError, IconInfo } from './icons'

type Variant = 'primary' | 'secondary' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-stamp text-white hover:bg-stamp-strong active:bg-stamp-strong disabled:bg-stamp/40 disabled:text-white/90',
  secondary:
    'bg-paper text-ink border border-line hover:border-ink-muted hover:bg-counter/60 active:bg-counter disabled:text-ink-muted disabled:border-line disabled:bg-paper',
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
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-base font-semibold transition-colors duration-150 disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
    />
  )
}

/** Lembar kertas (nota) di atas meja. */
export function Card({ title, children, className = '' }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-line bg-paper p-5 shadow-sheet sm:p-6 ${className}`}>
      {title && <h2 className="mb-4 text-lg font-semibold tracking-tight">{title}</h2>}
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
    <div className={`rounded-md border px-4 py-3 ${TONES[tone]}`} role={tone === 'error' ? 'alert' : undefined}>
      <div className="flex gap-3">
        <Icon className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1 text-ink">
          {title && <p className="font-semibold">{title}</p>}
          {children && <div className={`text-ink-soft ${title ? 'mt-1' : ''}`}>{children}</div>}
        </div>
      </div>
    </div>
  )
}

/** Kotak error ramah + detail teknis yang bisa dibuka (untuk pengelola aplikasi). */
export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null
  const friendly = friendlyError(error)
  const detail = errorText(error)
  return (
    <Alert tone="error" title={friendly}>
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
    <p className="flex items-center gap-3 py-6 text-ink-muted">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-stamp" />
      {label}
    </p>
  )
}

export function PageTitle({ children, subtitle }: { children: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{children}</h1>
      {subtitle && <p className="mt-1.5 max-w-[70ch] text-ink-soft">{subtitle}</p>}
    </div>
  )
}

export type StampTone = 'final' | 'warn' | 'loss' | 'gain' | 'neutral'

const STAMP_TONES: Record<StampTone, string> = {
  final: 'text-gain border-gain',
  gain: 'text-gain border-gain',
  warn: 'text-warn border-warn',
  loss: 'text-loss border-loss',
  neutral: 'text-ink-muted border-ink-muted',
}

/**
 * Cap stempel: vonis di atas nota (FINAL, TAKEDOWN, HERO, IKLAN RUGI, …).
 * Teks biasa (bisa dibaca screen reader), hanya diberi bingkai ganda dan sedikit miring.
 */
export function Stamp({
  tone,
  children,
  className = '',
  tilt = true,
}: {
  tone: StampTone
  children: ReactNode
  className?: string
  tilt?: boolean
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[3px] border-[3px] border-double bg-paper/80 px-2 py-0.5 text-sm font-bold uppercase tracking-[0.1em] ${
        tilt ? '-rotate-2' : ''
      } ${STAMP_TONES[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

export const selectClass =
  'min-h-11 rounded-md border border-line bg-paper px-3 text-base text-ink transition-colors hover:border-ink-muted focus:border-stamp focus:outline-none focus:ring-2 focus:ring-stamp/25'
