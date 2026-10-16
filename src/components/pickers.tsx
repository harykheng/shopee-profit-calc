import { useState, type SelectHTMLAttributes } from 'react'
import { parseRupiah } from '../lib/parsers/common'
import { MONTH_NAMES, addMonths, currentMonth, formatMonth, toMonth } from '../lib/format'
import { IconChevronDown } from './icons'

/** Dropdown berbentuk pil untuk filter di atas halaman (bulan, periode iklan, toko). */
export function PillSelect({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative inline-block max-w-full">
      <select
        {...props}
        className={`min-h-11 max-w-full cursor-pointer appearance-none truncate rounded-full border border-control bg-paper pl-4 pr-10 font-semibold text-ink transition-colors hover:border-ink ${className}`}
      />
      <IconChevronDown size={18} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-3" />
    </span>
  )
}

/** Pilih bulan dengan dua dropdown (bulan + tahun). Nilai "YYYY-MM-01". */
export function MonthPicker({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (month: string) => void
  label?: string
}) {
  const [y, m] = value.split('-').map(Number)
  const thisYear = Number(currentMonth().slice(0, 4))
  const years: number[] = []
  for (let yr = thisYear + 1; yr >= 2020; yr--) years.push(yr)
  return (
    <div className="flex flex-wrap items-center gap-2">
      {label && <span className="font-medium text-ink-2">{label}</span>}
      <PillSelect
        aria-label={label ? `${label} (bulan)` : 'Bulan'}
        value={m}
        onChange={(e) => onChange(toMonth(y, Number(e.target.value)))}
      >
        {MONTH_NAMES.map((name, i) => (
          <option key={name} value={i + 1}>
            {name}
          </option>
        ))}
      </PillSelect>
      <PillSelect
        aria-label={label ? `${label} (tahun)` : 'Tahun'}
        value={y}
        onChange={(e) => onChange(toMonth(Number(e.target.value), m))}
      >
        {years.map((yr) => (
          <option key={yr} value={yr}>
            {yr}
          </option>
        ))}
      </PillSelect>
    </div>
  )
}

/** Satu dropdown bulan (24 bulan terakhir s/d bulan ini). Nilai "YYYY-MM-01". */
export function MonthSelect({
  value,
  onChange,
  label,
  className = '',
}: {
  value: string
  onChange: (month: string) => void
  label: string
  className?: string
}) {
  const options: string[] = []
  const now = currentMonth()
  for (let i = 0; i < 24; i++) options.push(addMonths(now, -i))
  if (!options.includes(value)) options.push(value)
  return (
    <label className="flex items-center gap-2">
      <span className="text-ink-2">{label}</span>
      <PillSelect value={value} onChange={(e) => onChange(e.target.value)} className={`font-bold ${className}`}>
        {options.map((m) => (
          <option key={m} value={m}>
            {formatMonth(m)}
          </option>
        ))}
      </PillSelect>
    </label>
  )
}

/**
 * Input Rupiah: menampilkan "1.250.000", mengembalikan angka.
 * onCommit dipanggil saat selesai mengetik (blur / Enter) dengan angka atau null (kosong).
 */
export function RupiahInput({
  value,
  onCommit,
  ariaLabel,
  highlight,
  disabled,
}: {
  value: number | null
  onCommit: (value: number | null) => void
  ariaLabel: string
  highlight?: boolean
  disabled?: boolean
}) {
  const format = (n: number | null) => (n === null ? '' : new Intl.NumberFormat('id-ID').format(n))
  const [text, setText] = useState(format(value))
  const [lastValue, setLastValue] = useState(value)
  const [invalid, setInvalid] = useState(false)

  // Sinkronkan kalau nilai dari luar berubah (mis. setelah disimpan).
  if (value !== lastValue) {
    setLastValue(value)
    setText(format(value))
  }

  const commit = () => {
    const trimmed = text.trim()
    if (trimmed === '') {
      setInvalid(false)
      if (value !== null) onCommit(null)
      return
    }
    const n = parseRupiah(trimmed.replace(/^rp/i, ''))
    if (n === null || n < 0) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    setText(format(n))
    if (n !== value) onCommit(n)
  }

  return (
    <div className="relative">
      <span className="num pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3">Rp</span>
      <input
        type="text"
        inputMode="numeric"
        aria-label={ariaLabel}
        aria-invalid={invalid}
        disabled={disabled}
        value={text}
        placeholder="belum diisi"
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        className={`num min-h-11 w-full rounded-xl border pl-10 pr-3 text-right text-base text-ink transition-colors placeholder:font-sans placeholder:text-ink-3 focus:outline-none focus:ring-[3px] disabled:opacity-60 ${
          invalid
            ? 'border-loss bg-paper ring-loss/20'
            : highlight
              ? 'border-loss/70 bg-loss-tint focus:border-loss focus:ring-loss/20'
              : 'border-control bg-paper hover:border-ink focus:border-accent focus:ring-accent/25'
        }`}
      />
      {invalid && <p className="mt-1 text-sm text-loss">Isi angka saja, mis. 12500</p>}
    </div>
  )
}
