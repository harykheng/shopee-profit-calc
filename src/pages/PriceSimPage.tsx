import { useState, type ReactNode } from 'react'
import { Alert, Card, PageTitle } from '../components/ui'
import { RupiahInput } from '../components/pickers'
import { ADS_TARGET_PROFIT, PRICE_TARGET_MARGIN, XTRA_FEE_RATE, simulatePrice, type SuggestedPrice } from '../lib/adsMath'
import { formatPercent, formatRupiah } from '../lib/format'
import type { Store } from '../lib/types'
import { NotaLine } from './RecapPage'

// Semua dihitung di browser; tidak ada yang disimpan ke database.

const DEFAULTS = {
  adminPct: 8.25,
  xtra: true,
  processFee: 1250,
  packaging: 0,
  realisticRoas: 5.5,
}

const TOO_THIN = 'tidak mungkin, untung per barang terlalu tipis'

const decimal = (v: number, digits = 2) =>
  new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(v)

/** ROAS 2 desimal: 7.1276 → "7,13". */
const formatRoas = (v: number) =>
  new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)

/** Target dibulatkan ke atas (lebih aman): 10.711 → 10,72. */
const roundUp2 = (v: number) => Math.ceil(v * 100 - 1e-9) / 100

export function PriceSimPage({ stores, storeId }: { stores: Store[]; storeId: number | null }) {
  const store = stores.find((s) => s.id === storeId) ?? null
  const [hpp, setHpp] = useState<number | null>(null)
  const [price, setPrice] = useState<number | null>(null)
  const [adminPct, setAdminPct] = useState<number | null>(DEFAULTS.adminPct)
  const [xtra, setXtra] = useState(DEFAULTS.xtra)
  const [processFee, setProcessFee] = useState<number | null>(DEFAULTS.processFee)
  const [packaging, setPackaging] = useState<number | null>(DEFAULTS.packaging)
  const [realisticRoas, setRealisticRoas] = useState<number | null>(DEFAULTS.realisticRoas)
  const [actualRoas, setActualRoas] = useState<number | null>(null)

  const ready = hpp !== null && price !== null && price > 0 && realisticRoas !== null && realisticRoas > 0
  const r = ready
    ? simulatePrice({
        hpp,
        price,
        adminRate: (adminPct ?? 0) / 100,
        xtra,
        processFee: processFee ?? 0,
        packaging: packaging ?? 0,
        realisticRoas,
        actualRoas,
      })
    : null

  return (
    <>
      <PageTitle subtitle="Sebelum jualan atau ganti harga: hitung untung per order, ROAS minimum supaya iklan tidak rugi, dan harga jual yang masuk akal. Angka di halaman ini tidak disimpan.">
        Simulasi Harga — {store?.name ?? '-'}
      </PageTitle>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <Card title="Isi angka">
          <div className="space-y-4">
            <Field label="HPP per unit jual" hint="Paket/bundling: isi HPP per paket.">
              <RupiahInput value={hpp} onCommit={setHpp} ariaLabel="HPP per unit jual" />
            </Field>
            <Field label="Harga jual">
              <RupiahInput value={price} onCommit={setPrice} ariaLabel="Harga jual" />
            </Field>
            <Field label="Biaya admin">
              <DecimalInput value={adminPct} onCommit={setAdminPct} ariaLabel="Biaya admin (persen)" suffix="%" />
            </Field>
            <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-slate-300 px-4">
              <input
                type="checkbox"
                checked={xtra}
                onChange={(e) => setXtra(e.target.checked)}
                className="h-6 w-6 accent-orange-600"
              />
              <span className="text-lg">
                Ikut Gratis Ongkir XTRA <span className="text-slate-500">({formatPercent(XTRA_FEE_RATE * 100)})</span>
              </span>
            </label>
            <Field label="Biaya proses pesanan" hint="Per order (tetap, bukan persen).">
              <RupiahInput value={processFee} onCommit={setProcessFee} ariaLabel="Biaya proses pesanan" />
            </Field>
            <Field label="Packaging per order">
              <RupiahInput value={packaging} onCommit={setPackaging} ariaLabel="Packaging per order" />
            </Field>
            <Field label="ROAS realistis" hint="ROAS yang biasa didapat di iklan.">
              <DecimalInput value={realisticRoas} onCommit={setRealisticRoas} ariaLabel="ROAS realistis" />
            </Field>
            <Field label="ROAS aktual (opsional)" hint="ROAS nyata iklan produk ini, kalau sudah jalan.">
              <DecimalInput value={actualRoas} onCommit={setActualRoas} ariaLabel="ROAS aktual" optional />
            </Field>
          </div>
        </Card>

        <div className="min-w-0 space-y-6">
          {!r ? (
            <Alert title="Isi HPP dan harga jual untuk melihat hasilnya.">
              Angka diperbarui setelah kolom ditinggalkan atau tombol Enter ditekan.
            </Alert>
          ) : (
            <>
              <Card title="Rincian per order">
                <div>
                  <NotaLine op="" label="Harga jual" detail="" amount={formatRupiah(price)} />
                  <NotaLine
                    op="−"
                    label="Biaya admin"
                    detail={`${decimal(adminPct ?? 0)}% × harga jual`}
                    amount={formatRupiah(r.adminFee)}
                  />
                  <NotaLine op="−" label="Biaya proses pesanan" detail="per order" amount={formatRupiah(r.processFee)} />
                  <NotaLine
                    op="−"
                    label="Gratis Ongkir XTRA"
                    detail={xtra ? `${formatPercent(XTRA_FEE_RATE * 100)} × harga jual` : 'tidak ikut'}
                    amount={formatRupiah(r.xtraFee)}
                  />
                  <NotaLine op="−" label="Packaging" detail="per order" amount={formatRupiah(packaging ?? 0)} />
                </div>
                <div className="mt-1 border-t-2 border-dashed border-slate-300">
                  <NotaLine
                    op="="
                    label="Penghasilan"
                    detail={
                      (packaging ?? 0) > 0
                        ? `uang cair dari Shopee ${formatRupiah(r.income)}, dikurangi packaging`
                        : `uang cair per order (potongan Shopee ${formatRupiah(r.totalFee)})`
                    }
                    amount={formatRupiah(r.income - (packaging ?? 0))}
                  />
                  <NotaLine op="−" label="HPP" detail="modal per unit jual" amount={formatRupiah(hpp)} />
                </div>
                <div className="mt-1 grid grid-cols-[1.5rem_1fr_auto] items-baseline gap-2 border-t-2 border-slate-800 pt-3">
                  <span className="text-center font-extrabold text-slate-400">=</span>
                  <span className="font-bold uppercase tracking-wide">Untung per order</span>
                  <span
                    className={`whitespace-nowrap text-right text-2xl font-extrabold tabular-nums ${
                      r.profitable ? 'text-emerald-700' : 'text-red-700'
                    }`}
                  >
                    {formatRupiah(r.profit)}
                  </span>
                  <span />
                  <span className="text-sm text-slate-500">sebelum iklan</span>
                  <span className={`text-right font-semibold ${r.profitable ? 'text-emerald-700' : 'text-red-700'}`}>
                    {formatPercent(r.margin * 100)}
                  </span>
                </div>
                {!r.profitable && (
                  <div className="mt-4">
                    <Alert tone="error" title="Harga ini sudah rugi tanpa iklan." />
                  </div>
                )}
              </Card>

              {r.actual && (
                <div
                  className={`rounded-2xl border-2 p-5 ${
                    r.actual.profitAfterAds >= 0 ? 'border-emerald-300 bg-emerald-50' : 'border-red-300 bg-red-50'
                  }`}
                >
                  <span
                    className={`inline-block rounded-full px-3 py-1 text-base font-bold ${
                      r.actual.profitAfterAds >= 0 ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                    }`}
                  >
                    {r.actual.profitAfterAds >= 0 ? 'Iklan untung' : 'Iklan rugi'}
                  </span>
                  <p
                    className={`mt-2 text-2xl font-extrabold tabular-nums ${
                      r.actual.profitAfterAds >= 0 ? 'text-emerald-800' : 'text-red-800'
                    }`}
                  >
                    {formatRupiah(Math.abs(r.actual.profitAfterAds))} per order
                  </p>
                  <p className="mt-1 text-slate-700">
                    Biaya iklan per order {formatRupiah(r.actual.adCost)} (harga jual ÷ ROAS aktual{' '}
                    {decimal(actualRoas ?? 0)}). Untung setelah iklan = {formatRupiah(r.profit)} −{' '}
                    {formatRupiah(r.actual.adCost)}.
                  </p>
                </div>
              )}

              <Card title="Hasil">
                <dl className="divide-y divide-slate-100">
                  <Result
                    label="Balik modal butuh ROAS"
                    value={r.bepRoas !== null ? formatRoas(r.bepRoas) : 'Harga ini sudah rugi tanpa iklan'}
                    bad={r.bepRoas === null}
                    hint={r.bepRoas !== null ? 'Di bawah ROAS ini, iklan rugi.' : undefined}
                  />
                  <Result
                    label="Saran target ROAS di Shopee"
                    value={
                      !r.profitable
                        ? 'Harga ini sudah rugi tanpa iklan'
                        : r.targetRoas !== null
                          ? formatRoas(roundUp2(r.targetRoas))
                          : TOO_THIN
                    }
                    bad={r.targetRoas === null}
                    strong
                    hint={
                      r.profitable
                        ? `Supaya masih untung ${formatPercent(ADS_TARGET_PROFIT * 100)} setelah iklan. Belum termasuk cadangan pesanan batal.`
                        : undefined
                    }
                  />
                  <Result
                    label={`Harga minimum balik modal di ROAS ${decimal(realisticRoas ?? 0)}`}
                    value={priceText(r.priceBreakEven)}
                    bad={r.priceBreakEven === null}
                    hint={exactHint(r.priceBreakEven, 'Di bawah harga ini, iklan dengan ROAS realistis pasti rugi.')}
                  />
                  <Result
                    label={`Harga untuk untung ${formatPercent(ADS_TARGET_PROFIT * 100)} setelah iklan`}
                    value={priceText(r.priceTargetProfit)}
                    bad={r.priceTargetProfit === null}
                    strong
                    hint={exactHint(r.priceTargetProfit, `Dengan ROAS ${decimal(realisticRoas ?? 0)}.`)}
                  />
                  <Result
                    label={`Harga untuk untung ${formatPercent(PRICE_TARGET_MARGIN * 100)}`}
                    value={priceText(r.priceTargetMargin)}
                    bad={r.priceTargetMargin === null}
                    hint={exactHint(r.priceTargetMargin, 'Sebelum iklan.')}
                  />
                </dl>
                <p className="mt-3 text-sm text-slate-500">Saran harga dibulatkan ke atas ke Rp1.000.</p>
              </Card>
            </>
          )}
        </div>
      </div>
    </>
  )
}

function priceText(p: SuggestedPrice | null): string {
  return p ? formatRupiah(p.rounded) : TOO_THIN
}

function exactHint(p: SuggestedPrice | null, text: string): string {
  return p ? `${text} Persisnya ${formatRupiah(p.exact)}.` : text
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-lg font-semibold">{label}</p>
      {children}
      {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
    </div>
  )
}

function Result({
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
        <dt className="font-semibold text-slate-700">{label}</dt>
        <dd
          className={`tabular-nums ${bad ? 'text-base font-semibold text-red-700' : strong ? 'text-2xl font-extrabold' : 'text-xl font-bold'}`}
        >
          {value}
        </dd>
      </div>
      {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
    </div>
  )
}

/** Input angka desimal (koma atau titik), mis. "8,25" atau "5.5". Diperbarui saat kolom ditinggalkan / Enter. */
function DecimalInput({
  value,
  onCommit,
  ariaLabel,
  suffix,
  optional,
}: {
  value: number | null
  onCommit: (value: number | null) => void
  ariaLabel: string
  suffix?: string
  optional?: boolean
}) {
  const format = (n: number | null) => (n === null ? '' : decimal(n, 4))
  const [text, setText] = useState(format(value))
  const [invalid, setInvalid] = useState(false)

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
        placeholder={optional ? 'boleh dikosongkan' : 'belum diisi'}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        className={`min-h-12 w-full rounded-xl border px-3 text-right text-lg tabular-nums focus:outline-none focus:ring-2 ${
          suffix ? 'pr-9' : ''
        } ${invalid ? 'border-red-500 ring-red-200' : 'border-slate-300 bg-white focus:border-orange-500 focus:ring-orange-200'}`}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">{suffix}</span>
      )}
      {invalid && <p className="mt-1 text-sm text-red-700">Isi angka saja, mis. 8,25</p>}
    </div>
  )
}
