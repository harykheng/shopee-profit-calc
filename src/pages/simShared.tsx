// Bagian yang dipakai bersama oleh Simulasi satu produk dan Simulasi grup iklan.
import { useState, type ReactNode } from 'react'
import { IconCornerDownRight, IconPlus, IconX } from '../components/icons'
import { RupiahInput } from '../components/pickers'
import { inputClass } from '../components/ui'
import { extraFeeLabel, type ExtraFee } from '../lib/extraFees'

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
      <p className="mb-1.5 font-semibold">{label}</p>
      {children}
      {note && (
        <p className="mt-1.5 flex gap-1.5 text-sm font-medium text-ink-2">
          <IconCornerDownRight size={16} className="mt-0.5 shrink-0 text-accent" />
          {note}
        </p>
      )}
      {hint && <p className="mt-1 text-sm text-ink-3">{hint}</p>}
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
          className={`${bad ? 'font-medium text-loss' : strong ? 'num font-display text-2xl font-extrabold' : 'num text-xl font-semibold'}`}
        >
          {value}
        </dd>
      </div>
      {hint && <p className="mt-1 text-sm text-ink-3">{hint}</p>}
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
  disabled,
}: {
  value: number | null
  onCommit: (value: number | null) => void
  ariaLabel: string
  suffix?: string
  optional?: boolean
  placeholder?: string
  disabled?: boolean
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
        disabled={disabled}
        placeholder={placeholder ?? (optional ? 'boleh dikosongkan' : 'belum diisi')}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        className={`num min-h-11 w-full rounded-xl border px-3 text-right text-base text-ink transition-colors placeholder:font-sans placeholder:text-ink-3 focus:outline-none focus:ring-[3px] ${
          suffix ? 'pr-9' : ''
        } ${invalid ? 'border-loss bg-paper ring-loss/20' : 'border-control bg-paper hover:border-ink focus:border-accent focus:ring-accent/25'} ${
          disabled ? 'cursor-not-allowed bg-tint text-ink-2 hover:border-control' : ''
        }`}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-3">{suffix}</span>
      )}
      {invalid && <p className="mt-1 text-sm text-loss">Isi angka saja, mis. 8,25</p>}
    </div>
  )
}

// --- Biaya tambahan -------------------------------------------------------------
// Biaya lain yang diisi sendiri (mis. komisi affiliate %, biaya layanan Rp per order).
// Disimpan di browser ini per toko, bukan di database.

export { extraFeeLabel, extraFeeTotals, type ExtraFee } from '../lib/extraFees'

const extraKey = (storeId: number | null) => `sim-extra-fees:${storeId ?? 'none'}`

function readExtraFees(storeId: number | null): ExtraFee[] {
  try {
    const raw = localStorage.getItem(extraKey(storeId))
    const list: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(list)) return []
    return list.filter(
      (f): f is ExtraFee =>
        typeof f?.id === 'string' &&
        typeof f?.name === 'string' &&
        (f.value === null || typeof f.value === 'number') &&
        (f.unit === 'pct' || f.unit === 'rp'),
    )
  } catch {
    return []
  }
}

/** Daftar biaya tambahan untuk satu toko, diingat di browser ini. */
export function useExtraFees(storeId: number | null): [ExtraFee[], (next: ExtraFee[]) => void] {
  const [state, setState] = useState(() => ({ storeId, fees: readExtraFees(storeId) }))
  // Ganti toko: muat daftar milik toko itu.
  const current = state.storeId === storeId ? state : { storeId, fees: readExtraFees(storeId) }
  if (current !== state) setState(current)
  const update = (fees: ExtraFee[]) => {
    setState({ storeId, fees })
    try {
      localStorage.setItem(extraKey(storeId), JSON.stringify(fees))
    } catch {
      // Penyimpanan browser tidak tersedia: tetap berlaku selama halaman terbuka.
    }
  }
  return [current.fees, update]
}

let nextId = 0
const newId = () => `${Date.now().toString(36)}-${(nextId++).toString(36)}`

export function ExtraFeesEditor({ fees, onChange }: { fees: ExtraFee[]; onChange: (next: ExtraFee[]) => void }) {
  const patch = (id: string, p: Partial<ExtraFee>) => onChange(fees.map((f) => (f.id === id ? { ...f, ...p } : f)))
  return (
    <div>
      {fees.length > 0 && (
        <>
          <p className="mb-1.5 font-semibold">Biaya tambahan</p>
          <ul className="space-y-3">
            {fees.map((f, i) => (
              <li key={f.id} className="rounded-xl bg-tint p-3">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={f.name}
                    onChange={(e) => patch(f.id, { name: e.target.value })}
                    placeholder="Nama biaya, mis. Komisi affiliate"
                    aria-label={`Nama biaya tambahan ${i + 1}`}
                    maxLength={60}
                    className={`${inputClass} min-w-0 flex-1`}
                  />
                  <button
                    type="button"
                    onClick={() => onChange(fees.filter((x) => x.id !== f.id))}
                    aria-label={`Hapus ${extraFeeLabel(f)}`}
                    className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-paper hover:text-loss"
                  >
                    <IconX size={18} />
                  </button>
                </div>
                <div className="mt-2 flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    {f.unit === 'pct' ? (
                      <DecimalInput
                        value={f.value}
                        onCommit={(v) => patch(f.id, { value: v })}
                        ariaLabel={`${extraFeeLabel(f)} (persen)`}
                        suffix="%"
                      />
                    ) : (
                      <RupiahInput
                        value={f.value}
                        onCommit={(v) => patch(f.id, { value: v })}
                        ariaLabel={`${extraFeeLabel(f)} (rupiah per order)`}
                      />
                    )}
                  </div>
                  <div
                    role="radiogroup"
                    aria-label={`Satuan ${extraFeeLabel(f)}`}
                    className="flex shrink-0 gap-1 rounded-full bg-paper p-1 ring-1 ring-line"
                  >
                    {(
                      [
                        ['pct', '%'],
                        ['rp', 'Rp'],
                      ] as const
                    ).map(([unit, label]) => (
                      <button
                        key={unit}
                        type="button"
                        role="radio"
                        aria-checked={f.unit === unit}
                        // Ganti satuan: angkanya dikosongkan supaya 2% tidak terbaca Rp2.
                        onClick={() => f.unit !== unit && patch(f.id, { unit, value: null })}
                        className={`min-h-9 min-w-11 rounded-full px-3 font-semibold transition-colors duration-150 ${
                          f.unit === unit ? 'bg-ink text-paper' : 'text-ink-2 hover:text-ink'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="mt-1 text-sm text-ink-3">{f.unit === 'pct' ? 'Persen dari harga jual.' : 'Rupiah per order.'}</p>
              </li>
            ))}
          </ul>
        </>
      )}
      <button
        type="button"
        onClick={() => onChange([...fees, { id: newId(), name: '', value: null, unit: 'pct' }])}
        className={`${fees.length > 0 ? 'mt-3' : ''} flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-control px-3 font-semibold text-ink-2 transition-colors hover:border-ink hover:text-ink`}
      >
        <IconPlus size={18} />
        Tambah biaya lain
      </button>
      {fees.length > 0 && (
        <p className="mt-1 text-sm text-ink-3">Diingat di browser ini untuk semua produk di toko ini.</p>
      )}
    </div>
  )
}
