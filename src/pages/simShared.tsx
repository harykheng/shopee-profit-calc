// Bagian yang dipakai bersama oleh Simulasi satu produk dan Simulasi grup iklan.
import { useState, type ReactNode } from 'react'
import { IconCornerDownRight } from '../components/icons'

export const DEFAULTS = {
  adminPct: 8.25,
  xtra: true,
  processFee: 1250,
  packaging: 0,
  realisticRoas: 5.5,
}

export const TOO_THIN = 'tidak mungkin, untung per barang terlalu tipis'

export const decimal = (v: number, digits = 2) =>
  new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(v)

/** ROAS 2 desimal: 7.1276 → "7,13". */
export const formatRoas = (v: number) =>
  new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)

/** Target dibulatkan ke atas (lebih aman): 10.711 → 10,72. */
export const roundUp2 = (v: number) => Math.ceil(v * 100 - 1e-9) / 100


export function Field({
  label,
  hint,
  note,
  children,
}: {
  label: string
  hint?: string
  /** Asal angka yang terisi otomatis dari produk yang dipilih. */
  note?: string
  children: ReactNode
}) {
  return (
    <div>
      <p className="mb-1.5 font-medium">{label}</p>
      {children}
      {note && (
        <p className="mt-1.5 flex gap-1.5 text-sm font-medium text-info">
          <IconCornerDownRight size={16} className="mt-0.5 shrink-0" />
          {note}
        </p>
      )}
      {hint && <p className="mt-1 text-sm text-ink-muted">{hint}</p>}
    </div>
  )
}

export function Result({
  label,
  value,
  hint,
  strong,
  bad,
}: {
  label: string
  value: string
  hint?: string
  strong?: boolean
  bad?: boolean
}) {
  return (
    <div className="py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <dt className="font-medium text-ink">{label}</dt>
        <dd
          className={`${bad ? 'font-medium text-loss' : strong ? 'num text-2xl font-bold' : 'num text-xl font-semibold'}`}
        >
          {value}
        </dd>
      </div>
      {hint && <p className="mt-1 text-sm text-ink-muted">{hint}</p>}
    </div>
  )
}

/** Input angka desimal (koma atau titik), mis. "8,25" atau "5.5". Diperbarui saat kolom ditinggalkan / Enter. */
export function DecimalInput({
  value,
  onCommit,
  ariaLabel,
  suffix,
  optional,
  placeholder,
}: {
  value: number | null
  onCommit: (value: number | null) => void
  ariaLabel: string
  suffix?: string
  optional?: boolean
  placeholder?: string
}) {
  const format = (n: number | null) => (n === null ? '' : decimal(n, 4))
  const [text, setText] = useState(format(value))
  const [lastValue, setLastValue] = useState(value)
  const [invalid, setInvalid] = useState(false)

  // Sinkronkan kalau nilai dari luar berubah (mis. setelah memilih produk).
  if (value !== lastValue) {
    setLastValue(value)
    setText(format(value))
    setInvalid(false)
  }

  const commit = () => {
    const t = text.trim()
    if (t === '') {
      setInvalid(false)
      onCommit(null)
      return
    }
    const n = Number(t.replace(',', '.'))
    if (!/^\d+([.,]\d+)?$/.test(t) || !Number.isFinite(n) || n < 0) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    setText(format(n))
    onCommit(n)
  }

  return (
    <div className="relative">
      <input
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        aria-invalid={invalid}
        value={text}
        placeholder={placeholder ?? (optional ? 'boleh dikosongkan' : 'belum diisi')}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        className={`num min-h-11 w-full rounded-md border px-3 text-right text-base transition-colors placeholder:font-sans placeholder:text-ink-muted focus:outline-none focus:ring-2 ${
          suffix ? 'pr-9' : ''
        } ${invalid ? 'border-loss ring-loss/20' : 'border-line bg-paper hover:border-ink-muted focus:border-stamp focus:ring-stamp/25'}`}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted">{suffix}</span>
      )}
      {invalid && <p className="mt-1 text-sm text-loss">Isi angka saja, mis. 8,25</p>}
    </div>
  )
}
