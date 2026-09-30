import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { errorText, friendlyError } from '../lib/errors'

type Variant = 'primary' | 'secondary' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-orange-600 text-white hover:bg-orange-700 disabled:bg-orange-300',
  secondary: 'bg-white text-slate-800 border border-slate-300 hover:bg-slate-100 disabled:text-slate-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300',
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
      className={`min-h-12 rounded-xl px-5 text-lg font-semibold transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
    />
  )
}

export function Card({ title, children, className = '' }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {title && <h2 className="mb-4 text-xl font-bold">{title}</h2>}
      {children}
    </section>
  )
}

type Tone = 'info' | 'warning' | 'error' | 'success'

const TONES: Record<Tone, string> = {
  info: 'border-sky-200 bg-sky-50 text-sky-900',
  warning: 'border-amber-300 bg-amber-50 text-amber-900',
  error: 'border-red-300 bg-red-50 text-red-900',
  success: 'border-emerald-300 bg-emerald-50 text-emerald-900',
}

const ICONS: Record<Tone, string> = { info: 'ℹ️', warning: '⚠️', error: '⛔', success: '✅' }

export function Alert({ tone = 'info', title, children }: { tone?: Tone; title?: ReactNode; children?: ReactNode }) {
  return (
    <div className={`rounded-xl border p-4 ${TONES[tone]}`} role={tone === 'error' ? 'alert' : undefined}>
      <div className="flex gap-3">
        <span aria-hidden className="text-xl leading-6">{ICONS[tone]}</span>
        <div className="min-w-0 flex-1">
          {title && <p className="font-semibold">{title}</p>}
          {children && <div className={title ? 'mt-1' : ''}>{children}</div>}
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
        <details className="mt-1 text-sm opacity-80">
          <summary className="cursor-pointer">Detail teknis</summary>
          <p className="mt-1 break-words font-mono">{detail}</p>
        </details>
      )}
    </Alert>
  )
}

export function Spinner({ label = 'Memuat…' }: { label?: string }) {
  return (
    <p className="flex items-center gap-3 py-6 text-lg text-slate-500">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-orange-600" />
      {label}
    </p>
  )
}

export function PageTitle({ children, subtitle }: { children: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-3xl font-bold">{children}</h1>
      {subtitle && <p className="mt-1 text-lg text-slate-600">{subtitle}</p>}
    </div>
  )
}

export function Stat({
  label,
  value,
  tone,
  note,
}: {
  label: string
  value: string
  tone?: 'good' | 'bad' | 'warning'
  note?: string
}) {
  const color =
    tone === 'good' ? 'text-emerald-700' : tone === 'bad' ? 'text-red-700' : tone === 'warning' ? 'text-amber-700' : 'text-slate-900'
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className={`mt-1 break-words text-2xl font-bold tabular-nums ${color}`}>{value}</p>
      {note && <p className="mt-1 text-sm font-semibold text-amber-700">{note}</p>}
    </div>
  )
}

export const selectClass =
  'min-h-12 rounded-xl border border-slate-300 bg-white px-3 text-lg focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200'
