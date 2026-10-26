// Simulasi grup iklan: beberapa produk dengan SATU target ROAS (Iklan Grup Shopee).
// Semua dihitung di browser; grup tidak disimpan.
import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, ErrorBox, inputClass } from '../components/ui'
import { IconAlertCircle, IconPlus, IconSearch } from '../components/icons'
import { RupiahInput } from '../components/pickers'
import { XTRA_FEE_RATE, profitAtRoas, simulateAdGroup, type Targets } from '../lib/adsMath'
import { fetchItemsCreatedBetween, fetchLastSalePrice, fetchLatestOrderDate } from '../lib/api'
import { formatMonth, formatNumber, formatPercent, formatRupiah, monthEnd, wibDay } from '../lib/format'
import { effectiveAdminPct } from '../lib/feeCategories'
import type { FeeCategory, Product } from '../lib/types'
import { DEFAULTS, DecimalInput, Field, Result, TOO_THIN, decimal, formatRoas, roundUp2 } from './simShared'
import { TrialSimBlocked, TrialSimNotice, useTrialSimulation, type SimGate } from '../components/trialSim'
import { groupRowSimKey, productSimKey } from '../lib/trialLimits'

interface GroupRow {
  key: string
  name: string
  /** Produk baru yang diketik sendiri (belum ada di data). */
  manual: boolean
  price: number | null
  hpp: number | null
  adminPct: number | null
  xtra: boolean
  /** Perkiraan terjual per bulan; null = belum diketahui. */
  qty: number | null
  note: string
}

interface Sales {
  month: string
  byName: Map<string, { qty: number; gmv: number; bySku: Map<string, number> }>
}

/** Penjualan (tidak batal) per produk di bulan pesanan terbaru: dasar harga rata-rata & porsi. */
async function loadSales(storeId: number): Promise<Sales | null> {
  const latest = await fetchLatestOrderDate(storeId)
  if (!latest) return null
  const month = `${wibDay(latest).slice(0, 7)}-01`
  const items = await fetchItemsCreatedBetween(storeId, month, monthEnd(month))
  const byName = new Map<string, { qty: number; gmv: number; bySku: Map<string, number> }>()
  for (const i of items) {
    if (i.status_group === 'batal') continue
    const qty = Number(i.qty)
    if (!(qty > 0)) continue
    const s = byName.get(i.product_name) ?? { qty: 0, gmv: 0, bySku: new Map<string, number>() }
    s.qty += qty
    s.gmv += Number(i.subtotal)
    s.bySku.set(i.sku, (s.bySku.get(i.sku) ?? 0) + qty)
    byName.set(i.product_name, s)
  }
  return { month, byName }
}

let nextKey = 0

/** Kunci jatah simulasi uji coba: produk yang sama di Satu produk dan Grup iklan dihitung sekali. */
const simKeyOf = (r: GroupRow) => (r.manual ? groupRowSimKey(r.key) : productSimKey(r.name))

export function AdGroupSim({
  storeId,
  trial,
  products,
  categories,
  targets,
}: {
  storeId: number | null
  trial: boolean
  products: Product[] | null
  categories: FeeCategory[]
  targets: Targets
}) {
  const adsPct = formatPercent(targets.adsProfit * 100)
  const [rows, setRows] = useState<GroupRow[]>([])
  const [processFee, setProcessFee] = useState<number | null>(DEFAULTS.processFee)
  const [packaging, setPackaging] = useState<number | null>(DEFAULTS.packaging)
  const [realisticRoas, setRealisticRoas] = useState<number | null>(DEFAULTS.realisticRoas)
  const [sales, setSales] = useState<Sales | null | undefined>(undefined)
  const [salesError, setSalesError] = useState<unknown>(null)

  useEffect(() => {
    if (!storeId) return
    let cancelled = false
    setRows([])
    setSales(undefined)
    setSalesError(null)
    loadSales(storeId)
      .then((s) => !cancelled && setSales(s))
      .catch((e) => {
        if (cancelled) return
        setSalesError(e)
        setSales(null)
      })
    return () => {
      cancelled = true
    }
  }, [storeId])

  const monthLabel = sales ? formatMonth(sales.month) : null

  const addProduct = async (name: string) => {
    if (!storeId || !products) return
    const variants = products.filter((p) => p.product_name === name)
    const sold = sales?.byName.get(name)
    const hppOf = new Map(variants.map((v) => [v.sku, v.hpp === null ? null : Number(v.hpp)]))
    let hpp: number | null = null
    if (sold) {
      // HPP rata-rata sesuai variasi yang terjual (HPP saat ini dari halaman HPP).
      let units = 0
      let total = 0
      for (const [sku, q] of sold.bySku) {
        const h = hppOf.get(sku)
        if (h === null || h === undefined) continue
        units += q
        total += h * q
      }
      if (units > 0) hpp = total / units
    }
    if (hpp === null) {
      const known = variants.map((v) => v.hpp).filter((h): h is number => h !== null).map(Number)
      if (known.length > 0) hpp = known.reduce((s, h) => s + h, 0) / known.length
    }
    const withFees = variants.find((v) => effectiveAdminPct(v, categories) !== null)
    const key = `p${nextKey++}`
    setRows((r) => [
      ...r,
      {
        key,
        name,
        manual: false,
        price: sold ? Math.round(sold.gmv / sold.qty) : null,
        hpp: hpp === null ? null : Math.round(hpp),
        adminPct: withFees ? (effectiveAdminPct(withFees, categories) ?? DEFAULTS.adminPct) : DEFAULTS.adminPct,
        xtra: withFees?.xtra ?? DEFAULTS.xtra,
        qty: sold ? sold.qty : null,
        note: sold
          ? `Terjual ${formatNumber(sold.qty)} di ${monthLabel}; harga & HPP rata-rata variasi yang terjual.`
          : `Belum ada penjualan${monthLabel ? ` di ${monthLabel}` : ''}, porsinya belum diketahui.`,
      },
    ])
    if (!sold && variants[0]) {
      // Belum terjual bulan itu: pakai harga pesanan terakhir kalau ada.
      const last = await fetchLastSalePrice(storeId, variants[0].sku).catch(() => null)
      if (last) setRows((r) => r.map((x) => (x.key === key && x.price === null ? { ...x, price: last.price } : x)))
    }
  }

  const addManual = () =>
    setRows((r) => [
      ...r,
      {
        key: `p${nextKey++}`,
        name: '',
        manual: true,
        price: null,
        hpp: null,
        adminPct: DEFAULTS.adminPct,
        xtra: DEFAULTS.xtra,
        qty: null,
        note: 'Produk baru: isi harga jual dan HPP.',
      },
    ])

  const update = (key: string, patch: Partial<GroupRow>) => setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)))
  const remove = (key: string) => setRows((r) => r.filter((x) => x.key !== key))

  const filled = rows.filter((r) => r.price !== null && r.price > 0 && r.hpp !== null)
  // Akun uji coba: produk yang tidak dapat jatah hari ini tidak ikut dihitung.
  const sim = useTrialSimulation(storeId, trial, filled.map(simKeyOf))
  const complete = filled.filter((r) => sim.statusOf(simKeyOf(r)) === 'ok')
  const anyBlocked = filled.some((r) => sim.statusOf(simKeyOf(r)) === 'blocked')
  const group =
    complete.length > 0
      ? simulateAdGroup({
          rows: complete.map((r) => ({
            price: r.price as number,
            hpp: r.hpp as number,
            adminRate: (r.adminPct ?? 0) / 100,
            xtra: r.xtra,
            qty: r.qty,
          })),
          processFee: processFee ?? 0,
          packaging: packaging ?? 0,
          targets,
        })
      : null
  const target = group && group.recommendedRoas !== null ? roundUp2(group.recommendedRoas) : null
  const resultOf = (key: string) => {
    const i = complete.findIndex((r) => r.key === key)
    return i >= 0 && group ? { row: group.rows[i], price: complete[i].price as number } : null
  }
  // Produk yang menentukan target aman (untungnya paling tipis), dan target aman tanpa produk itu.
  const bottleneck = (() => {
    if (!group || group.safeTargetRoas === null || complete.length < 2) return null
    const i = group.rows.findIndex((r) => r.targetRoas === group.safeTargetRoas)
    const others = group.rows.filter((_, j) => j !== i).map((r) => r.targetRoas as number)
    return { name: complete[i].name || 'produk baru', without: Math.max(...others) }
  })()
  const losers =
    target === null
      ? []
      : complete.filter((r) => {
          const x = resultOf(r.key)
          return x !== null && profitAtRoas({ price: x.price, profit: x.row.profit }, target) < 0
        })

  return (
    <>
      <TrialSimNotice sim={sim} />

      {/* Jawabannya dulu. */}
      <div className="mb-8" aria-live="polite">
        {anyBlocked && (
          <div className="mb-6">
            <TrialSimBlocked limit={sim.limit} />
          </div>
        )}
        {!group ? (
          <p className="max-w-3xl font-display text-2xl font-bold leading-snug text-ink-2 sm:text-3xl">
            Pilih produk yang mau dijadikan satu grup iklan. Target ROAS grupnya muncul di sini.
          </p>
        ) : target === null ? (
          <>
            <h2 className="font-display text-3xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
              Grup ini <span className="text-loss">tidak bisa untung {adsPct}</span> setelah iklan.
            </h2>
            <p className="mt-3 text-lg leading-relaxed text-ink-2">
              Untung per barangnya terlalu tipis. Naikkan harga, atau keluarkan produk yang ditandai merah dari grup.
            </p>
          </>
        ) : (
          <>
            <h2 className="font-display text-3xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
              Isi target ROAS grup: <span className="num hl">{formatRoas(target)}</span>
            </h2>
            <p className="mt-3 max-w-3xl text-lg leading-relaxed text-ink-2">
              {group.recommended === 'safe'
                ? `Target aman: setiap produk di grup tetap untung ${adsPct} setelah iklan, berapa pun porsi penjualannya. Dipakai karena ${
                    group.hasUnknownQty ? 'ada produk yang porsi penjualannya belum diketahui' : 'porsi penjualan belum diisi'
                  }.`
                : `Sesuai porsi penjualan${monthLabel ? ` ${monthLabel}` : ''}: grup secara keseluruhan untung ${adsPct} setelah iklan.`}
              {group.recommended === 'mix' && group.safeTargetRoas !== null && (
                <>
                  {' '}
                  Kalau mau setiap produk aman: <b className="num text-ink">{formatRoas(roundUp2(group.safeTargetRoas))}</b>.
                </>
              )}
            </p>
            {bottleneck && roundUp2(bottleneck.without) < roundUp2(group.safeTargetRoas as number) && (
              <p className="mt-2 max-w-3xl leading-relaxed text-ink-2">
                Target aman ditentukan oleh <b className="text-ink">{bottleneck.name}</b> (untungnya paling tipis). Kalau
                produk ini dipisah ke grup atau iklan sendiri, target aman grup jadi{' '}
                <b className="num text-ink">{formatRoas(roundUp2(bottleneck.without))}</b>.
              </p>
            )}
            {losers.length > 0 && (
              <p className="mt-2 flex items-center gap-2 text-lg font-semibold text-loss">
                <IconAlertCircle size={20} className="shrink-0" />
                {formatNumber(losers.length)} produk rugi di ROAS ini (ditandai di bawah).
              </p>
            )}
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <Card title="Produk di grup" className="self-start">
          {salesError ? <ErrorBox error={salesError} /> : null}
          <GroupPicker
            products={products}
            added={new Set(rows.filter((r) => !r.manual).map((r) => r.name))}
            disabled={sales === undefined}
            onPick={addProduct}
          />
          <div className="mt-3">
            <Button variant="secondary" onClick={addManual}>
              <IconPlus size={18} />
              Produk baru (belum ada di data)
            </Button>
          </div>

          {rows.length === 0 ? (
            <p className="mt-5 text-ink-2">Belum ada produk. Cari di atas, atau tambah produk baru.</p>
          ) : (
            <ul className="mt-5 space-y-4">
              {rows.map((r) => (
                <GroupRowCard
                  key={r.key}
                  row={r}
                  result={resultOf(r.key)}
                  gate={sim.statusOf(simKeyOf(r))}
                  target={target}
                  onChange={(patch) => update(r.key, patch)}
                  onRemove={() => remove(r.key)}
                />
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          <Card title="Biaya per order">
            <div className="space-y-4">
              <Field label="Biaya proses pesanan" hint="Sama untuk semua produk di grup.">
                <RupiahInput value={processFee} onCommit={setProcessFee} ariaLabel="Biaya proses pesanan" />
              </Field>
              <Field label="Packaging per order">
                <RupiahInput value={packaging} onCommit={setPackaging} ariaLabel="Packaging per order" />
              </Field>
              <Field label="ROAS realistis" hint="ROAS yang biasa didapat di iklan, untuk cek apakah target masuk akal.">
                <DecimalInput value={realisticRoas} onCommit={setRealisticRoas} ariaLabel="ROAS realistis" />
              </Field>
            </div>
          </Card>

          {group && (
            <Card title="Target ROAS grup">
              <dl className="divide-y divide-line">
                <Result
                  label="Sesuai porsi penjualan"
                  value={group.mixTargetRoas !== null ? formatRoas(roundUp2(group.mixTargetRoas)) : TOO_THIN}
                  bad={group.mixTargetRoas === null}
                  strong={group.recommended === 'mix' && group.mixTargetRoas !== null}
                  hint={
                    group.hasUnknownQty
                      ? 'Produk yang porsinya belum diketahui dianggap laku rata-rata produk lain.'
                      : `Grup untung ${adsPct} setelah iklan kalau porsi penjualannya seperti ini.`
                  }
                />
                <Result
                  label="Aman untuk semua produk"
                  value={group.safeTargetRoas !== null ? formatRoas(roundUp2(group.safeTargetRoas)) : TOO_THIN}
                  bad={group.safeTargetRoas === null}
                  strong={group.recommended === 'safe'}
                  hint={`Setiap produk tetap untung ${adsPct} setelah iklan, berapa pun porsinya.`}
                />
                <Result
                  label="Balik modal grup"
                  value={group.mixBepRoas !== null ? formatRoas(group.mixBepRoas) : 'Grup sudah rugi tanpa iklan'}
                  bad={group.mixBepRoas === null}
                  hint="Di bawah ROAS ini, iklan grup rugi."
                />
              </dl>
              {target !== null && realisticRoas !== null && realisticRoas > 0 && target > realisticRoas && (
                <div className="mt-3">
                  <Alert tone="warning" title={`Target ${formatRoas(target)} di atas ROAS realistis ${decimal(realisticRoas)}.`}>
                    Shopee akan menahan belanja iklan supaya target tercapai, jadi iklan grup bisa jarang tampil. Pertimbangkan
                    mengeluarkan produk yang untungnya tipis.
                  </Alert>
                </div>
              )}
              <p className="mt-3 text-sm text-ink-3">
                Target dibulatkan ke atas. Belum termasuk cadangan pesanan batal (sama seperti Simulasi satu produk).
              </p>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}

function GroupRowCard({
  row,
  result,
  gate,
  target,
  onChange,
  onRemove,
}: {
  row: GroupRow
  result: { row: ReturnType<typeof simulateAdGroup>['rows'][number]; price: number } | null
  /** Jatah simulasi uji coba untuk produk ini (toko berbayar selalu 'ok'). */
  gate: SimGate
  target: number | null
  onChange: (patch: Partial<GroupRow>) => void
  onRemove: () => void
}) {
  const after = result && target !== null ? profitAtRoas({ price: result.price, profit: result.row.profit }, target) : null
  const loses = after !== null && after < 0
  return (
    <li className={`reveal rounded-2xl p-4 ring-1 ${loses ? 'bg-loss-tint ring-loss/40' : 'bg-tint ring-line'}`}>
      <div className="flex items-start justify-between gap-3">
        {row.manual ? (
          <input
            value={row.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Nama produk baru"
            aria-label="Nama produk baru"
            className={`${inputClass} font-semibold placeholder:font-normal`}
          />
        ) : (
          <p className="line-clamp-2 font-semibold">{row.name}</p>
        )}
        <button
          type="button"
          onClick={onRemove}
          className="min-h-11 shrink-0 rounded-full px-3 text-sm font-semibold text-ink-2 underline decoration-ink-3/50 underline-offset-4 transition-colors hover:text-loss hover:decoration-loss"
        >
          Hapus
        </button>
      </div>
      <p className="mt-1 text-sm text-ink-2">{row.note}</p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="block text-sm font-semibold text-ink-2">
          Harga jual
          <span className="mt-1 block">
            <RupiahInput value={row.price} onCommit={(v) => onChange({ price: v })} ariaLabel={`Harga jual ${row.name}`} />
          </span>
        </label>
        <label className="block text-sm font-semibold text-ink-2">
          HPP
          <span className="mt-1 block">
            <RupiahInput value={row.hpp} onCommit={(v) => onChange({ hpp: v })} ariaLabel={`HPP ${row.name}`} />
          </span>
        </label>
        <label className="block text-sm font-semibold text-ink-2">
          Biaya admin
          <span className="mt-1 block">
            <DecimalInput value={row.adminPct} onCommit={(v) => onChange({ adminPct: v })} ariaLabel={`Biaya admin ${row.name}`} suffix="%" />
          </span>
        </label>
        <label className="block text-sm font-semibold text-ink-2">
          Terjual / bulan
          <span className="mt-1 block">
            <DecimalInput value={row.qty} onCommit={(v) => onChange({ qty: v })} ariaLabel={`Terjual per bulan ${row.name}`} optional placeholder="belum tahu" />
          </span>
        </label>
      </div>
      <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 text-sm">
        <input type="checkbox" checked={row.xtra} onChange={(e) => onChange({ xtra: e.target.checked })} className="h-5 w-5" />
        Ikut Gratis Ongkir XTRA ({formatPercent(XTRA_FEE_RATE * 100)})
      </label>

      {result ? (
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 border-t border-rule pt-3 text-sm">
          <span>
            Untung sebelum iklan{' '}
            <b className={`num ${result.row.profit > 0 ? 'text-gain' : 'text-loss'}`}>{formatRupiah(result.row.profit)}</b>
            <span className="num text-ink-3"> ({formatPercent(result.row.margin * 100)})</span>
          </span>
          <span>
            Target sendiri{' '}
            <b className="num">{result.row.targetRoas !== null ? formatRoas(roundUp2(result.row.targetRoas)) : 'tidak mungkin'}</b>
          </span>
          {after !== null && (
            <span className={loses ? 'font-semibold text-loss' : ''}>
              Di ROAS grup <span className="num">{formatRoas(target as number)}</span>: {loses ? 'rugi' : 'untung'}{' '}
              <b className="num">{formatRupiah(Math.abs(after))}</b> per order
            </span>
          )}
          {result.row.weightEstimated && <span className="font-semibold text-warn">Porsi belum diketahui, dianggap rata-rata.</span>}
        </div>
      ) : (
        <p className="mt-2 flex items-center gap-1.5 border-t border-rule pt-3 text-sm font-semibold text-warn">
          <IconAlertCircle size={16} className="shrink-0" />
          {row.price === null || row.price <= 0 || row.hpp === null
            ? 'Isi harga jual dan HPP supaya ikut dihitung.'
            : gate === 'blocked'
              ? 'Tidak ikut dihitung: jatah simulasi uji coba hari ini sudah habis.'
              : 'Mengecek jatah simulasi uji coba…'}
        </p>
      )}
    </li>
  )
}

const MAX_RESULTS = 30

/** Cari produk (per nama produk, bukan per variasi: iklan Shopee per produk). */
function GroupPicker({
  products,
  added,
  disabled,
  onPick,
}: {
  products: Product[] | null
  added: Set<string>
  disabled: boolean
  onPick: (name: string) => void
}) {
  const [query, setQuery] = useState('')
  const names = useMemo(() => [...new Set((products ?? []).map((p) => p.product_name))].sort(), [products])
  const results = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (words.length === 0) return []
    return names.filter((n) => words.every((w) => n.toLowerCase().includes(w)))
  }, [names, query])

  return (
    <div>
      <div className="relative">
        <IconSearch size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={products && !disabled ? 'Ketik nama produk, mis. bedak' : 'Memuat produk…'}
          aria-label="Cari produk untuk grup"
          disabled={!products || disabled}
          className={`${inputClass} pl-10`}
        />
      </div>
      {query.trim() !== '' && (
        <ul className="mt-3 max-h-80 divide-y divide-line overflow-y-auto rounded-xl border border-control">
          {results.length === 0 && <li className="p-3 text-ink-2">Tidak ada produk yang cocok.</li>}
          {results.slice(0, MAX_RESULTS).map((n) => (
            <li key={n}>
              <button
                type="button"
                disabled={added.has(n)}
                onClick={() => {
                  setQuery('')
                  onPick(n)
                }}
                className="block min-h-11 w-full px-3 py-2 text-left hover:bg-tint disabled:cursor-default disabled:text-ink-3 disabled:hover:bg-transparent"
              >
                <span className="line-clamp-2 font-medium">{n}</span>
                {added.has(n) && <span className="text-sm">Sudah di grup</span>}
              </button>
            </li>
          ))}
          {results.length > MAX_RESULTS && (
            <li className="p-3 text-sm text-ink-2">{results.length - MAX_RESULTS} produk lain. Ketik lebih spesifik.</li>
          )}
        </ul>
      )}
    </div>
  )
}
