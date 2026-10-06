import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { MonthSelect } from '../components/pickers'
import { Alert, Button, ErrorBox, Spinner, Stamp } from '../components/ui'
import { IconAlertCircle, IconCheck, IconChevronDown, IconInfo } from '../components/icons'
import {
  countItemsWithoutCreatedAt,
  fetchAdReports,
  fetchCreatedItems,
  fetchEarlierOrdersCompleted,
  fetchIncomeDays,
  fetchMonthlyRecap,
  fetchOrdersByCreated,
  fetchProductRecap,
  fetchProducts,
  fetchReconciliation,
  fetchReturnedItems,
  recalcHpp,
  type CreatedItem,
} from '../lib/api'
import { addMonths, currentMonth, formatDate, formatMonth, formatNumber, formatPercent, formatRupiah, formatRupiahShort } from '../lib/format'
import { monthStatus, type MonthStatus } from '../lib/monthStatus'
import { estimateProfit, soldFlow, type FlowStep, type ProfitEstimate } from '../lib/recapMath'
import { navigate } from '../lib/router'
import { fullMonthOf } from '../lib/adsMath'
import { loadAdsAnalysis, type Period as AdsPeriod } from './AdsPage'
import { Confetti, WordsRise, useCelebrateOnce, useCountUp } from '../components/motion'
import type {
  DailyReconciliation,
  MonthlyRecap,
  OrdersByCreated,
  ProductRecap,
  ReturnedItem,
  Store,
} from '../lib/types'

interface RecapData {
  months: MonthlyRecap[]
  products: ProductRecap[]
  reconciliation: DailyReconciliation[]
  returned: ReturnedItem[]
}

/** Data untuk tab "Semua pesanan" & penjelasan barang terjual (butuh SQL ke-3). */
interface OrdersData {
  groups: OrdersByCreated[]
  withoutCreatedAt: number
  createdItems: CreatedItem[]
  earlierCompleted: { qty: number; returned_qty: number }[]
  estimate: ProfitEstimate | null
}

type Tab = 'pesanan' | 'produk' | 'bulan'

export function RecapPage({ stores, storeId }: { stores: Store[]; storeId: number | null }) {
  const lastMonth = addMonths(currentMonth(), -1)
  const [from, setFrom] = useState(lastMonth)
  const [to, setTo] = useState(lastMonth)
  const [multi, setMulti] = useState(false)
  const [data, setData] = useState<RecapData | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [orders, setOrders] = useState<OrdersData | { error: unknown } | null>(null)
  const [tab, setTab] = useState<Tab>('pesanan')
  const [recalcMonth, setRecalcMonth] = useState<string | null>(null)
  const [recalcResult, setRecalcResult] = useState<string | null>(null)

  const end = multi ? to : from
  const rangeValid = from <= end
  const period = from === end ? formatMonth(from) : `${formatMonth(from)} – ${formatMonth(end)}`
  const storeName = stores.find((s) => s.id === storeId)?.name ?? ''

  const load = useCallback(async () => {
    if (!storeId || !rangeValid) return
    setData(null)
    setError(null)
    setOrders(null)
    try {
      const [months, products, reconciliation, returned] = await Promise.all([
        fetchMonthlyRecap(storeId, from, end),
        fetchProductRecap(storeId, from, end),
        fetchReconciliation(storeId, from, end),
        fetchReturnedItems(storeId, from, end),
      ])
      setData({ months, products, reconciliation, returned })
    } catch (e) {
      setError(e)
      return
    }
    // Dimuat terpisah: kalau gagal (mis. SQL ke-3 belum dijalankan), untung bersih tetap tampil.
    try {
      const [groups, withoutCreatedAt, createdItems, earlierCompleted, productList, incomeDays] = await Promise.all([
        fetchOrdersByCreated(storeId, from, end),
        countItemsWithoutCreatedAt(storeId),
        fetchCreatedItems(storeId, from, end),
        fetchEarlierOrdersCompleted(storeId, from, end),
        fetchProducts(storeId),
        fetchIncomeDays(storeId, from),
      ])
      const hppBySku = new Map(productList.map((p) => [p.sku, p.hpp === null ? null : Number(p.hpp)]))
      const estimate = estimateProfit(
        createdItems
          .filter((i) => i.status_group === 'selesai')
          .map((i) => ({
            subtotal: Number(i.subtotal),
            qty: Number(i.qty),
            returned_qty: Number(i.returned_qty),
            completed_at: i.completed_at,
            hpp: i.hpp_snapshot !== null ? Number(i.hpp_snapshot) : (hppBySku.get(i.sku) ?? null),
          })),
        incomeDays.map((d) => ({
          day: d.released_date,
          total_income: Number(d.total_income),
          subtotal_pesanan: Number(d.subtotal_pesanan),
        })),
      )
      setOrders({ groups, withoutCreatedAt, createdItems, earlierCompleted, estimate })
    } catch (e) {
      setOrders({ error: e })
    }
  }, [storeId, from, end, rangeValid])

  useEffect(() => {
    setRecalcResult(null)
    load()
  }, [load])

  const isEmpty =
    data && data.months.length === 0 && orders && !('error' in orders) && orders.groups.length === 0

  return (
    <>
      <div className="on-field mb-8 flex flex-wrap items-center gap-x-4 gap-y-3">
        <MonthSelect value={from} onChange={setFrom} label={multi ? 'Dari' : 'Bulan'} />
        {multi && <MonthSelect value={to} onChange={setTo} label="Sampai" />}
        <button
          type="button"
          onClick={() => {
            setMulti((m) => !m)
            setTo(from)
          }}
          className="min-h-11 rounded-full px-4 font-semibold text-on-field-muted underline decoration-on-field/40 underline-offset-4 transition-colors hover:text-on-field hover:decoration-on-field"
        >
          {multi ? 'Satu bulan saja' : 'Lihat beberapa bulan'}
        </button>
      </div>
      {!rangeValid && <p className="mb-4 font-semibold text-[#ffcf5c]">Bulan "Dari" harus sebelum atau sama dengan "Sampai".</p>}

      {recalcResult && (
        <div className="mb-5">
          <Alert tone="success">{recalcResult}</Alert>
        </div>
      )}

      {!rangeValid ? null : error ? (
        <ErrorBox error={error} />
      ) : !data ? (
        <Spinner />
      ) : isEmpty ? (
        <Alert tone="info" title="Belum ada data">
          Belum ada penghasilan, pesanan, atau biaya untuk {storeName} di {period}.
        </Alert>
      ) : (
        <div className="space-y-14">
          <NotaCard
            data={data}
            orders={orders && !('error' in orders) ? orders : null}
            period={period}
            singleMonth={from === end ? from : null}
            rangeEnd={end}
            onRecalc={setRecalcMonth}
            storeId={storeId}
            storeName={storeName}
          />

          {from === end && storeId && <AdsChapter storeId={storeId} month={from} />}

          <section className="space-y-4">
            <ChapterTitle n={from === end ? 4 : 3} kicker="Rinciannya">
              Pesanan & produk
            </ChapterTitle>
            <div role="tablist" aria-label="Rincian" className="on-field flex w-fit max-w-full flex-wrap gap-1 rounded-full bg-white/10 p-1">
              <TabButton id="pesanan" tab={tab} setTab={setTab}>Semua pesanan</TabButton>
              <TabButton id="produk" tab={tab} setTab={setTab}>Per produk</TabButton>
              {data.months.length > 1 && <TabButton id="bulan" tab={tab} setTab={setTab}>Per bulan</TabButton>}
            </div>
            <div key={tab} className="page-in">
              {tab === 'pesanan' && <OrdersTab orders={orders} period={period} />}
              {tab === 'produk' && <ProductsTab products={data.products} returned={data.returned} period={period} />}
              {tab === 'bulan' && data.months.length > 1 && (
                <MonthsTab months={data.months} reconciliation={data.reconciliation} onRecalc={setRecalcMonth} />
              )}
            </div>
          </section>
        </div>
      )}

      {recalcMonth && storeId && (
        <RecalcDialog
          month={recalcMonth}
          onCancel={() => setRecalcMonth(null)}
          onRun={async (onlyMissing) => {
            const n = await recalcHpp(storeId, recalcMonth, onlyMissing)
            setRecalcMonth(null)
            setRecalcResult(
              n === 0
                ? `Tidak ada barang di ${formatMonth(recalcMonth)} yang perlu diperbarui.`
                : `HPP ${formatNumber(n)} barang di ${formatMonth(recalcMonth)} sudah dihitung ulang.`,
            )
            await load()
          }}
        />
      )}
    </>
  )
}

function TabButton({ id, tab, setTab, children }: { id: Tab; tab: Tab; setTab: (t: Tab) => void; children: ReactNode }) {
  const on = id === tab
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      onClick={() => setTab(id)}
      className={`min-h-10 rounded-full px-4 font-semibold transition-colors duration-150 ${
        on ? 'bg-on-field text-field' : 'text-on-field-muted hover:text-on-field'
      }`}
    >
      {children}
    </button>
  )
}

/** Tombol kecil "Kenapa …?" yang membuka penjelasan. */
function Why({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="space-y-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-11 items-center gap-2 rounded-md border border-line bg-paper px-3 text-sm font-medium text-ink-soft transition-colors hover:border-ink-muted hover:text-ink"
      >
        <IconInfo size={18} className="text-stamp" />
        {label}
        <IconChevronDown size={16} className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="reveal space-y-2 rounded-md bg-counter/60 px-4 py-3 text-ink-soft">{children}</div>}
    </div>
  )
}

// --- Nota: untung bersih ---------------------------------------------------------

function NotaCard({
  data,
  orders,
  period,
  singleMonth,
  rangeEnd,
  onRecalc,
  storeId,
  storeName,
}: {
  data: RecapData
  orders: OrdersData | null
  period: string
  singleMonth: string | null
  rangeEnd: string
  onRecalc: (month: string) => void
  storeId: number | null
  storeName: string
}) {
  const t = data.months.reduce(
    (a, m) => ({
      income: a.income + Number(m.total_income),
      adjustments: a.adjustments + Number(m.adjustments ?? 0),
      modal: a.modal + Number(m.total_modal),
      expenses: a.expenses + Number(m.total_expenses),
      profit: a.profit + Number(m.net_profit),
      qty: a.qty + Number(m.total_qty),
    }),
    { income: 0, adjustments: 0, modal: 0, expenses: 0, profit: 0, qty: 0 },
  )
  const statuses = data.months.map((m) => ({ month: m.month, status: monthStatus(m, data.reconciliation) }))
  const todoCount = statuses.reduce((n, s) => n + todos(s.status).length, 0)
  const allFinal = statuses.length > 0 && todoCount === 0
  const firstTodo = statuses.flatMap((s) => todos(s.status))[0]
  const [showStatus, setShowStatus] = useState(false)

  const releaseDays = data.reconciliation.filter(
    (d) => d.has_income && data.months.some((m) => m.month === d.month),
  ).length
  const refund = statuses.reduce((n, s) => n + s.status.refunds.amount, 0)
  const unfilledExpenses = data.months.filter((m) => Number(m.expense_entries) === 0)
  const expenseParts = [
    ['iklan Shopee', 'iklan_shopee'],
    ['Meta Ads', 'meta_ads'],
    ['packaging', 'packaging'],
    ['lain-lain', 'lain_lain'],
  ] as const
  const expenseDetail = expenseParts
    .map(([label, key]) => [label, data.months.reduce((n, m) => n + Number(m[key]), 0)] as const)
    .filter(([, v]) => v > 0)
    .map(([label, v]) => `${label} ${formatRupiah(v)}`)
    .join(' · ')
  const margin = t.income > 0 ? (t.profit / t.income) * 100 : null

  const flow = orders ? buildFlow(orders, t.qty, rangeEnd) : null
  const biayaMonth = unfilledExpenses[0]?.month ?? singleMonth ?? data.months[0]?.month

  // Kalimat naik, angka berputar naik, stiker ditempel; konfeti sekali per bulan yang final.
  const shownProfit = useCountUp(t.profit)
  const stampRef = useRef<HTMLButtonElement>(null)
  const celebrate = useCelebrateOnce(allFinal && singleMonth && storeId ? `final:${storeId}:${singleMonth}` : null, 900)
  const loss = t.profit < 0

  return (
    <>
      {/* Bab 1: jawabannya, ditulis seperti kalimat. */}
      <section className="on-field grid gap-10 text-on-field lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.6fr)] lg:items-end">
        <div className="min-w-0">
          <p className="font-display text-lg font-bold text-lime">Bab 1 · Untung</p>
          <h1 className="mt-3 font-display text-4xl font-bold leading-[1.04] tracking-tight sm:text-6xl">
            <WordsRise text={`${period}, ${storeName} ${loss ? 'rugi' : 'untung'}`} />
          </h1>
          <p
            className={`num mt-3 font-display text-7xl font-extrabold leading-[0.9] tracking-tighter sm:text-[8.5rem] ${
              loss ? 'text-coral-soft' : 'text-lime'
            }`}
          >
            {formatRupiahShort(Math.abs(shownProfit))}
          </p>
          <p className="mt-5 max-w-2xl text-lg text-on-field-muted">
            Tepatnya <b className="num text-on-field">{formatRupiah(t.profit)}</b>
            {margin !== null && <> ({formatPercent(margin)} dari uang masuk)</>}, dari{' '}
            <b className="text-on-field">{formatNumber(t.qty)} barang</b> yang sudah sampai ke pembeli dan uangnya cair.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3">
            <Confetti anchor={stampRef} fireKey={celebrate} />
            {statuses.length > 0 && (
              <button
                ref={stampRef}
                type="button"
                aria-expanded={showStatus}
                onClick={() => setShowStatus((s) => !s)}
                className="group inline-flex min-h-11 items-center gap-1.5 rounded-full px-1"
              >
                <Stamp tone={allFinal ? 'final' : 'warn'} delay={650} className="!text-base">
                  {allFinal ? <IconCheck size={16} /> : <IconAlertCircle size={16} />}
                  {allFinal ? 'Angka final' : `Belum lengkap · ${todoCount} hal`}
                </Stamp>
                <IconChevronDown
                  size={18}
                  className={`text-on-field-muted transition-transform duration-150 group-hover:text-on-field ${showStatus ? 'rotate-180' : ''}`}
                />
                <span className="sr-only">{showStatus ? 'Tutup' : 'Lihat'} rincian status</span>
              </button>
            )}
            {!allFinal && firstTodo && <span className="font-semibold text-[#ffcf5c]">Belum final: {firstTodo.short}</span>}
          </div>
        </div>
        <MoneySplit income={t.modal + t.expenses + t.profit} modal={t.modal} expenses={t.expenses} profit={t.profit} />
      </section>

      {showStatus && (
        <div className={`reveal space-y-4 rounded-3xl p-5 shadow-sheet sm:p-6 ${allFinal ? 'bg-gain-tint' : 'bg-warn-tint'}`}>
          {statuses.map((s) => (
            <Checklist key={s.month} month={s.month} status={s.status} showTitle={statuses.length > 1} onRecalc={onRecalc} />
          ))}
        </div>
      )}

      {/* Bab 2: dari mana angkanya. */}
      <section className="space-y-4">
        <ChapterTitle n={2} kicker="Hitungannya">
          Dari mana angkanya
        </ChapterTitle>
        <div className="space-y-5 rounded-3xl bg-paper p-5 shadow-sheet sm:p-7">
          <div className="print-in">
            <NotaLine
              op="+"
              label="Uang masuk dari Shopee"
              detail={[
                `Dana cair ${formatNumber(releaseDays)} hari`,
                t.adjustments !== 0 ? `penyesuaian ${formatRupiah(t.adjustments)}` : null,
                refund !== 0 ? `refund ${formatRupiah(-refund)} sudah dipotong` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              amount={formatRupiah(t.income)}
            />
            <NotaLine
              op="−"
              label="Modal barang terjual"
              detail={
                <>
                  {formatNumber(t.qty)} barang × HPP masing-masing
                  {singleMonth && (
                    <>
                      {' · '}
                      <button type="button" className="font-semibold text-stamp underline-offset-2 hover:underline" onClick={() => onRecalc(singleMonth)}>
                        Hitung ulang HPP
                      </button>
                    </>
                  )}
                </>
              }
              amount={formatRupiah(t.modal)}
            />
            <NotaLine
              op="−"
              label="Biaya (iklan, packaging, dll.)"
              detail={
                <>
                  {expenseDetail || (unfilledExpenses.length > 0 ? 'Belum diisi' : 'Tidak ada biaya')}
                  {biayaMonth && (
                    <>
                      {' · '}
                      <button
                        type="button"
                        className="font-semibold text-stamp underline-offset-2 hover:underline"
                        onClick={() => navigate('biaya', { bulan: biayaMonth })}
                      >
                        {unfilledExpenses.length > 0 ? 'Isi biaya' : 'Ubah biaya'}
                      </button>
                    </>
                  )}
                </>
              }
              amount={
                unfilledExpenses.length > 0 && t.expenses === 0 ? (
                  <span className="font-sans text-base font-semibold text-warn">belum diisi</span>
                ) : (
                  formatRupiah(t.expenses)
                )
              }
            />
          </div>
          <div className="print-last flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-2xl bg-stamp-tint px-4 py-3">
            <span className="font-display text-lg font-bold">= Untung bersih</span>
            <span className={`num font-display text-2xl font-bold ${loss ? 'text-loss' : 'text-ink'}`}>{formatRupiah(t.profit)}</span>
          </div>
          {flow && flow[0].value !== t.qty && (
            <Why label={`Kenapa ${formatNumber(t.qty)} barang, bukan ${formatNumber(flow[0].value)}?`}>
              <p>
                Untung dihitung dari barang yang <strong>sudah sampai ke pembeli dan uangnya cair</strong> di {period}.
              </p>
              <FlowList steps={flow} />
            </Why>
          )}
        </div>
      </section>
    </>
  )
}

/** Judul bab di atas bidang biru: nomor bab + kata kunci kecil, lalu judul besar. */
function ChapterTitle({ n, kicker, children }: { n: number; kicker: string; children: ReactNode }) {
  return (
    <div className="on-field text-on-field">
      <p className="font-display text-lg font-bold text-lime">
        Bab {n} · {kicker}
      </p>
      <h2 className="mt-1 font-display text-3xl font-bold tracking-tight sm:text-4xl">{children}</h2>
    </div>
  )
}

/**
 * "Dari setiap Rp100 yang masuk": satu batang bagian-dari-keseluruhan (modal, biaya, untung).
 * Tegak di laptop, mendatar di HP. Tidak ditampilkan kalau rugi (bagiannya tidak lagi menjumlah ke 100).
 */
function MoneySplit({ income, modal, expenses, profit }: { income: number; modal: number; expenses: number; profit: number }) {
  if (income <= 0 || profit < 0) {
    return (
      <div className="on-field rounded-3xl bg-white/8 p-5 text-on-field-muted">
        Modal dan biaya bulan ini lebih besar dari uang yang masuk, jadi tidak ada sisa untung.
      </div>
    )
  }
  const modalPer100 = Math.round((modal / income) * 100)
  const biayaPer100 = Math.round((expenses / income) * 100)
  const untungPer100 = 100 - modalPer100 - biayaPer100
  const segs = [
    { key: 'modal', label: 'modal barang', per100: modalPer100, share: modal / income, cls: 'bg-white/15 text-on-field' },
    { key: 'biaya', label: 'biaya', per100: biayaPer100, share: expenses / income, cls: 'bg-white/35 text-on-field' },
    { key: 'untung', label: 'untung', per100: untungPer100, share: profit / income, cls: 'bg-lime text-field-deep' },
  ]
  const big = (share: number) => share >= 0.12
  return (
    <figure className="on-field min-w-0 text-on-field">
      <figcaption className="font-display text-2xl font-bold leading-tight tracking-tight">Dari setiap Rp100 yang masuk</figcaption>
      <div
        role="img"
        aria-label={`Rp${modalPer100} untuk modal barang, Rp${biayaPer100} untuk biaya, Rp${untungPer100} jadi untung`}
        className="mt-4 flex h-24 gap-[3px] lg:h-[22rem] lg:flex-col"
      >
        {segs.map((sg, i) => (
          <div
            key={sg.key}
            title={`${sg.label}: Rp${sg.per100} dari setiap Rp100`}
            style={{ flexGrow: Math.max(sg.share, 0.004), animationDelay: `${300 + i * 140}ms` }}
            className={`grow-split flex min-h-0 min-w-0 basis-0 flex-col items-start justify-end overflow-hidden rounded-xl font-semibold lg:flex-row lg:items-end lg:justify-between lg:gap-2 ${
              big(sg.share) ? 'px-3 py-2 lg:px-4 lg:py-3' : ''
            } ${sg.cls}`}
          >
            {big(sg.share) && (
              <>
                <span className="max-w-full truncate text-sm lg:text-base">{sg.label}</span>
                <span className="num font-display text-xl font-bold lg:text-3xl">Rp{sg.per100}</span>
              </>
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 text-sm text-on-field-muted">
        {segs
          .filter((sg) => !big(sg.share))
          .map((sg) => `${sg.label} Rp${sg.per100}`)
          .join(' · ')}
        {segs.some((sg) => !big(sg.share)) && ' · '}
        uang masuk {formatRupiahShort(income)}, modal {formatRupiahShort(modal)}, biaya {formatRupiahShort(expenses)}.
      </p>
    </figure>
  )
}

// --- Bab Iklan -----------------------------------------------------------------

type AdsState =
  | { kind: 'loading' }
  | { kind: 'none' }
  | { kind: 'error' }
  | { kind: 'ok'; profitAfterAds: number; spend: number; takedown: { name: string; profit: number | null }[]; takedownCount: number }

/** Bab 3: iklan bulan yang sama (kalau ada data iklan 1 bulan penuh), dengan tautan ke halaman Iklan. */
function AdsChapter({ storeId, month }: { storeId: number; month: string }) {
  const [state, setState] = useState<AdsState>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ kind: 'loading' })
    ;(async () => {
      const reports = (await fetchAdReports(storeId)).filter((r) => fullMonthOf(r.period_start, r.period_end) === month)
      if (reports.length === 0) return { kind: 'none' } as const
      const period: AdsPeriod = {
        key: `${reports[0].period_start}|${reports[0].period_end}`,
        start: reports[0].period_start,
        end: reports[0].period_end,
        reports,
      }
      const { analysis } = await loadAdsAnalysis(storeId, period)
      const takedown = analysis.products.filter((p) => p.verdict === 'takedown')
      return {
        kind: 'ok',
        profitAfterAds: analysis.profitAfterAds,
        spend: analysis.totalSpend,
        takedownCount: takedown.length,
        takedown: takedown
          .sort((a, b) => (a.profitAfterAds ?? 0) - (b.profitAfterAds ?? 0))
          .slice(0, 3)
          .map((p) => ({ name: p.name, profit: p.profitAfterAds })),
      } as const
    })()
      .then((st) => !cancelled && setState(st))
      .catch(() => !cancelled && setState({ kind: 'error' }))
    return () => {
      cancelled = true
    }
  }, [storeId, month])

  return (
    <section className="on-field rounded-[2rem] bg-coral p-6 text-white shadow-sheet sm:p-9">
      <p className="font-display text-lg font-bold text-[#ffe4dc]">Bab 3 · Iklan {formatMonth(month)}</p>
      {state.kind === 'loading' && <p className="mt-3 text-white">Menghitung iklan…</p>}
      {(state.kind === 'none' || state.kind === 'error') && (
        <>
          <h2 className="mt-2 font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            {state.kind === 'none' ? `Belum ada data iklan ${formatMonth(month)}.` : 'Data iklan belum bisa dihitung di sini.'}
          </h2>
          <p className="mt-2 max-w-2xl text-lg text-white">
            {state.kind === 'none'
              ? 'Upload file iklan Shopee 1 bulan penuh untuk melihat iklan mana yang untung dan mana yang bikin rugi.'
              : 'Buka halaman Iklan untuk melihat rinciannya.'}
          </p>
        </>
      )}
      {state.kind === 'ok' && (
        <>
          <h2 className="mt-2 font-display text-3xl font-bold leading-tight tracking-tight sm:text-5xl">
            Iklan {state.profitAfterAds < 0 ? 'rugi' : 'untung'} {formatRupiahShort(Math.abs(state.profitAfterAds))}.{' '}
            {state.takedownCount > 0 ? `${formatNumber(state.takedownCount)} iklan sebaiknya dimatikan.` : 'Tidak ada iklan yang perlu dimatikan.'}
          </h2>
          <p className="mt-2 text-lg text-white">
            Setelah biaya iklan <span className="num">{formatRupiah(state.spend)}</span>, untungnya{' '}
            <b className="num text-white">{formatRupiah(state.profitAfterAds)}</b>.
          </p>
          {state.takedown.length > 0 && (
            <ul className="mt-5 grid gap-2 sm:grid-cols-3">
              {state.takedown.map((p) => (
                <li key={p.name} className="min-w-0 rounded-2xl bg-white/14 px-4 py-3">
                  <span className="line-clamp-2 font-semibold">{p.name}</span>
                  <span className="num mt-1 block font-display text-xl font-bold">
                    {p.profit === null ? 'HPP belum lengkap' : formatRupiah(p.profit)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <a
        href="#/iklan"
        className="mt-6 inline-flex min-h-11 items-center rounded-full bg-white px-5 font-semibold text-coral transition active:scale-[0.97]"
      >
        Buka halaman Iklan →
      </a>
    </section>
  )
}

function buildFlow(orders: OrdersData, sold: number, rangeEnd: string): FlowStep[] {
  const sum = (g: OrdersByCreated['status_group'], f: (r: OrdersByCreated) => number) =>
    orders.groups.filter((r) => r.status_group === g).reduce((n, r) => n + f(r), 0)
  const ordered = orders.groups.reduce((n, r) => n + Number(r.qty), 0)
  const after = new Date(`${addMonths(rangeEnd, 1)}T00:00:00+07:00`)
  const completedLater = orders.createdItems
    .filter((i) => i.status_group === 'selesai' && i.completed_at && new Date(i.completed_at) >= after)
    .reduce((n, i) => n + Number(i.qty) - Number(i.returned_qty), 0)
  return soldFlow({
    ordered,
    cancelled: sum('batal', (r) => Number(r.qty)),
    inProcess: sum('proses', (r) => Number(r.qty)),
    returned: sum('selesai', (r) => Number(r.qty_returned)),
    completedLater,
    fromEarlier: orders.earlierCompleted.reduce((n, i) => n + Number(i.qty) - Number(i.returned_qty), 0),
    sold,
  })
}

function FlowList({ steps }: { steps: FlowStep[] }) {
  return (
    <div className="space-y-1 num">
      {steps.map((s, i) => (
        <div
          key={i}
          className={`grid grid-cols-[1fr_auto] gap-3 rounded-lg px-3 ${
            s.kind === 'start'
              ? 'bg-counter py-2'
              : s.kind === 'result'
                ? 'bg-stamp-tint py-2 font-bold text-stamp-strong'
                : 'py-0.5 text-ink-soft'
          }`}
        >
          <span>
            {s.kind === 'minus' ? '− ' : s.kind === 'plus' ? '+ ' : ''}
            {s.label}
          </span>
          <span className="num font-semibold">{formatNumber(s.value)}</span>
        </div>
      ))}
    </div>
  )
}

export function NotaLine({ op, label, detail, amount }: { op: string; label: string; detail: ReactNode; amount: ReactNode }) {
  return (
    <div className="grid grid-cols-[1.5rem_1fr] items-baseline gap-x-2 border-line/70 py-3 sm:grid-cols-[1.5rem_1fr_auto] [&+&]:border-t">
      <span className="num text-center font-bold text-ink-muted">{op}</span>
      <span className="min-w-0">
        <span className="block font-semibold">{label}</span>
        <span className="block text-sm text-ink-muted">{detail}</span>
      </span>
      {/* HP: angka turun ke bawah labelnya supaya label tidak terjepit. */}
      <span className="num col-start-2 mt-1 whitespace-nowrap text-lg font-semibold sm:col-start-auto sm:mt-0 sm:text-right">
        {amount}
      </span>
    </div>
  )
}

// --- Daftar centang status bulan ---------------------------------------------

interface Todo {
  key: string
  /** Alasan singkat untuk baris "Belum final: …". */
  short: string
}

function todos(s: MonthStatus): Todo[] {
  const out: Todo[] = []
  if (!s.hasIncome) out.push({ key: 'income', short: 'laporan penghasilan belum di-upload' })
  if (s.missingOrders.days.length > 0) out.push({ key: 'orders', short: 'ada uang cair yang pesanannya belum di-upload' })
  if (s.hasIncome && s.ordersWithoutIncome.days.length > 0)
    out.push({ key: 'noincome', short: 'ada pesanan yang tidak ada di laporan penghasilan' })
  if (s.missingHpp > 0) out.push({ key: 'hpp', short: 'ada barang yang HPP-nya kosong' })
  if (!s.expensesFilled) out.push({ key: 'expenses', short: 'biaya belum diisi' })
  return out
}

const dayList = (days: string[]) => days.map((d) => formatDate(d)).join(', ')

function CheckRow({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[1.5rem_1fr] gap-2">
      {ok ? (
        <IconCheck size={20} className="mt-0.5 text-gain" aria-label="Sudah" />
      ) : (
        <IconAlertCircle size={20} className="mt-0.5 text-warn" aria-label="Belum" />
      )}
      <div>{children}</div>
    </div>
  )
}

function Checklist({
  month,
  status: s,
  showTitle,
  onRecalc,
}: {
  month: string
  status: MonthStatus
  showTitle: boolean
  onRecalc: (month: string) => void
}) {
  const label = formatMonth(month)
  return (
    <div className="space-y-2">
      {showTitle && <p className="font-bold">{label}</p>}
      <CheckRow ok={s.hasIncome}>
        {s.hasIncome ? 'Laporan penghasilan sudah di-upload' : (
          <><strong>Laporan penghasilan (PDF) {label} belum di-upload.</strong> Upload di halaman Upload.</>
        )}
      </CheckRow>
      <CheckRow ok={s.missingOrders.days.length === 0}>
        {s.missingOrders.days.length === 0 ? 'Semua uang yang cair sudah ketemu pesanannya' : (
          <>
            <strong>Ada uang cair {formatRupiah(s.missingOrders.amount)} dari pesanan yang belum di-upload</strong>{' '}
            ({dayList(s.missingOrders.days)}). Upload export pesanan <strong>{formatMonth(addMonths(month, -1))}</strong>.
          </>
        )}
      </CheckRow>
      {s.shifted.days.length > 0 && (
        <p className="flex gap-2 pl-8 text-sm text-ink-soft">
          <IconInfo size={16} className="mt-0.5 shrink-0 text-info" />
          <span>
            {formatRupiah(s.shifted.amount)} cair 1–2 hari setelah tanggal pesanan selesai di export (
            {dayList(s.shifted.days)}). Normal — datanya sudah cocok.
          </span>
        </p>
      )}
      {s.hasIncome && s.ordersWithoutIncome.days.length > 0 && (
        <CheckRow ok={false}>
          <strong>{formatNumber(s.ordersWithoutIncome.orders)} pesanan selesai tidak ada di laporan penghasilan</strong>{' '}
          ({dayList(s.ordersWithoutIncome.days)}). Pastikan PDF {label} yang di-upload lengkap.
        </CheckRow>
      )}
      <CheckRow ok={s.missingHpp === 0}>
        {s.missingHpp === 0 ? 'Semua barang sudah punya HPP' : (
          <>
            <strong>{formatNumber(s.missingHpp)} barang belum punya HPP</strong>, jadi modalnya masih Rp0.
            <span className="mt-2 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => navigate('hpp', { kosong: '1' })}>Isi HPP</Button>
              <Button variant="secondary" onClick={() => onRecalc(month)}>Hitung ulang HPP</Button>
            </span>
          </>
        )}
      </CheckRow>
      <CheckRow ok={s.expensesFilled}>
        {s.expensesFilled ? 'Biaya sudah diisi' : (
          <>
            <strong>Biaya {label} belum diisi</strong> (iklan, packaging, dll.). Kalau memang tidak ada, simpan Rp0.{' '}
            <button type="button" className="font-semibold underline" onClick={() => navigate('biaya', { bulan: month })}>
              Isi biaya
            </button>
          </>
        )}
      </CheckRow>
    </div>
  )
}

// --- Tab: semua pesanan -----------------------------------------------------------

const GROUP_LABEL: Record<OrdersByCreated['status_group'], string> = {
  selesai: 'Selesai',
  proses: 'Masih diproses / dikirim',
  batal: 'Batal / belum bayar',
}

function OrdersTab({ orders, period }: { orders: OrdersData | { error: unknown } | null; period: string }) {
  if (!orders) return <Spinner />
  if ('error' in orders) {
    return (
      <Alert tone="warning" title="Bagian ini belum aktif">
        Pengelola aplikasi perlu menjalankan file SQL <strong>20261005000000_all_order_statuses.sql</strong> di
        Supabase (lihat README). Untung bersih di atas tidak terpengaruh.
      </Alert>
    )
  }

  const groups = (['selesai', 'proses', 'batal'] as const).map((g) => {
    const rows = orders.groups.filter((r) => r.status_group === g)
    const sum = (f: (r: OrdersByCreated) => number) => rows.reduce((n, r) => n + f(r), 0)
    return {
      group: g,
      orders: sum((r) => Number(r.order_count)),
      qty: sum((r) => Number(r.qty)),
      returned: sum((r) => Number(r.qty_returned)),
      subtotal: sum((r) => Number(r.subtotal)),
      modal: sum((r) => Number(r.modal ?? 0)),
    }
  })
  const [done, proses, batal] = groups
  const total = {
    orders: groups.reduce((n, g) => n + g.orders, 0),
    qty: groups.reduce((n, g) => n + g.qty, 0),
    subtotal: groups.reduce((n, g) => n + g.subtotal, 0),
    modal: done.modal + proses.modal,
  }
  const est = orders.estimate
  const pct = (n: number) => (total.qty > 0 ? `${(n / total.qty) * 100}%` : '0%')

  return (
    <section className="space-y-5 rounded-3xl bg-paper p-5 shadow-sheet sm:p-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Semua pesanan yang masuk di {period}</h2>
        <p className="mt-1 text-ink-soft">
          <strong className="text-2xl text-ink num">{formatNumber(total.orders)}</strong> pesanan ·{' '}
          <strong className="text-2xl text-ink num">{formatNumber(total.qty)}</strong> barang
        </p>
      </div>

      {total.qty === 0 ? (
        <Alert tone="info">
          Belum ada pesanan yang dibuat di {period}. Upload export pesanan dengan status <strong>Semua</strong>.
        </Alert>
      ) : (
        <>
          <div>
            <div
              className="flex h-3 overflow-hidden rounded-sm bg-line"
              role="img"
              aria-label={`${done.qty} barang selesai, ${proses.qty} diproses, ${batal.qty} batal`}
            >
              <div className="bg-stamp" style={{ width: pct(done.qty) }} />
              <div className="bg-warn-line" style={{ width: pct(proses.qty) }} />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-soft">
              <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-stamp" />Selesai {formatNumber(done.qty)} barang</span>
              {proses.qty > 0 && (
                <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-warn-line" />Masih diproses {formatNumber(proses.qty)} barang</span>
              )}
              <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-line" />Batal {formatNumber(batal.qty)} barang</span>
            </div>
          </div>

          {est && done.qty > 0 && (
            <div className="space-y-3 rounded-md border border-line p-4 sm:p-5">
              <p className="font-semibold">Perkiraan untung dari pesanan {period} yang selesai</p>
              <div className="border-y-2 border-dashed border-rule">
                <NotaLine
                  op="+"
                  label="Nilai penjualan"
                  detail={`${formatNumber(done.orders)} pesanan selesai`}
                  amount={formatRupiah(est.sales)}
                />
                <NotaLine
                  op="−"
                  label="Potongan Shopee"
                  detail={`admin, ongkir XTRA, voucher, refund · ±${Math.round((est.fees / est.sales) * 100)}%`}
                  amount={formatRupiah(est.fees)}
                />
                <NotaLine
                  op="−"
                  label="Modal barang"
                  detail={`${formatNumber(done.qty - done.returned)} barang${done.returned > 0 ? ` (tanpa ${formatNumber(done.returned)} barang retur)` : ''}`}
                  amount={formatRupiah(est.modal)}
                />
              </div>
              <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 rounded-2xl bg-stamp-tint px-4 py-3">
                <span>
                  <span className="block font-display text-lg font-bold">≈ Perkiraan untung</span>
                  <span className="block text-sm font-semibold text-warn">Belum dikurangi biaya (iklan, packaging, dll.)</span>
                </span>
                <span className="sm:text-right">
                  <span className={`block font-display text-2xl font-bold tracking-tight num ${est.profit < 0 ? 'text-loss' : ''}`}>
                    {formatRupiah(est.profit)}
                  </span>
                  <span className="block text-sm font-semibold text-ink-muted">
                    {formatPercent((est.profit / est.sales) * 100)} dari nilai penjualan
                  </span>
                </span>
              </div>
              {est.missingHpp > 0 && (
                <Alert tone="warning">
                  {formatNumber(est.missingHpp)} barang belum punya HPP, jadi modal di perkiraan ini belum lengkap.{' '}
                  <button type="button" className="underline" onClick={() => navigate('hpp', { kosong: '1' })}>Isi HPP</button>
                </Alert>
              )}
              <Why label="Kenapa beda dengan untung bersih di atas?">
                <p>Dua angka ini menghitung kelompok barang yang berbeda:</p>
                <p>
                  <strong>Untung bersih di atas</strong> = barang yang <strong>sampai & uangnya cair</strong> di {period}.
                  Ini angka pasti dari laporan Shopee.
                </p>
                <p>
                  <strong>Perkiraan di sini</strong> = semua pesanan yang <strong>dibuat</strong> di {period} dan sudah
                  selesai, termasuk yang baru sampai bulan berikutnya. Shopee hanya mencatat uang cair per hari, jadi
                  potongan untuk tiap pesanan dibagi sesuai nilai penjualannya. Karena itu disebut perkiraan.
                </p>
                {est.averaged > 0 && (
                  <p>
                    {formatNumber(est.averaged)} barang uangnya belum ada di laporan penghasilan yang di-upload, jadi
                    memakai rata-rata potongan.
                  </p>
                )}
                <p>Pesanan batal tidak dihitung: tidak ada uang masuk dan barangnya tidak keluar.</p>
              </Why>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left">
              <thead className="border-b border-rule text-sm font-medium text-ink-muted">
                <tr>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3 text-right">Pesanan</th>
                  <th className="py-2 pr-3 text-right">Barang</th>
                  <th className="py-2 pr-3 text-right">Nilai penjualan</th>
                  <th className="py-2 pr-3 text-right">Modal</th>
                </tr>
              </thead>
              <tbody>
                {groups
                  .filter((g) => g.group !== 'proses' || g.qty > 0)
                  .map((g) => (
                    <tr key={g.group} className="border-b border-line/70 align-top">
                      <td className="py-3 pr-3 font-medium">
                        {GROUP_LABEL[g.group]}
                        {g.returned > 0 && (
                          <span className="block text-xs font-normal text-ink-muted">{formatNumber(g.returned)} barang diretur</span>
                        )}
                        {g.group === 'batal' && (
                          <span className="block text-xs font-normal text-ink-muted">tidak ada uang masuk</span>
                        )}
                      </td>
                      <td className="num py-3 pr-3 text-right">{formatNumber(g.orders)}</td>
                      <td className="num py-3 pr-3 text-right">{formatNumber(g.qty)}</td>
                      <td className={`num py-3 pr-3 text-right ${g.group === 'batal' ? 'text-ink-muted' : ''}`}>
                        {formatRupiah(g.subtotal)}
                      </td>
                      <td className="num py-3 pr-3 text-right">
                        {g.group === 'batal' ? <span className="text-ink-muted">—</span> : formatRupiah(g.modal)}
                      </td>
                    </tr>
                  ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-rule font-bold">
                  <td className="py-3 pr-3">Total</td>
                  <td className="num py-3 pr-3 text-right">{formatNumber(total.orders)}</td>
                  <td className="num py-3 pr-3 text-right">{formatNumber(total.qty)}</td>
                  <td className="num py-3 pr-3 text-right">{formatRupiah(total.subtotal)}</td>
                  <td className="num py-3 pr-3 text-right">{formatRupiah(total.modal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-sm text-ink-muted">
            Dihitung dari <strong>tanggal pesanan dibuat</strong>, untuk melihat penjualan. Angka ini sama dengan
            hitungan dari file export. Modal di tabel ini termasuk barang retur; pesanan yang masih diproses memakai HPP
            saat ini.
          </p>
        </>
      )}

      {orders.withoutCreatedAt > 0 && (
        <Alert tone="info">
          {formatNumber(orders.withoutCreatedAt)} barang di-upload dengan versi lama dan belum punya tanggal pesanan
          dibuat, jadi belum terhitung di sini. Upload ulang export pesanannya (status <strong>Semua</strong>), data
          tidak akan dobel.
        </Alert>
      )}
    </section>
  )
}

// --- Tab: per produk -------------------------------------------------------------

function ProductsTab({ products, returned, period }: { products: ProductRecap[]; returned: ReturnedItem[]; period: string }) {
  const rows = useMemo(() => {
    const map = new Map<string, { sku: string; name: string; variant: string; qty: number; returned: number; modal: number; missing: boolean }>()
    for (const p of products) {
      const r = map.get(p.sku) ?? { sku: p.sku, name: p.product_name, variant: p.variant_name, qty: 0, returned: 0, modal: 0, missing: false }
      r.qty += Number(p.qty_sold)
      r.returned += Number(p.qty_returned)
      r.modal += Number(p.total_modal ?? 0)
      r.missing ||= p.missing_hpp
      map.set(p.sku, r)
    }
    return [...map.values()].sort((a, b) => b.qty - a.qty)
  }, [products])
  const max = Math.max(1, ...rows.map((r) => r.qty))
  const totalQty = rows.reduce((n, r) => n + r.qty, 0)
  const totalModal = rows.reduce((n, r) => n + r.modal, 0)

  return (
    <section className="space-y-4 rounded-3xl bg-paper p-5 shadow-sheet sm:p-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Barang terjual per produk</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Barang yang sampai & uangnya cair di {period}. Paket grosir dihitung per paket, sama seperti di Shopee.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="text-ink-muted">Belum ada barang terjual di {period}.</p>
      ) : (
        <div>
          {rows.map((r) => (
            <div key={r.sku} className="space-y-1.5 border-b border-line/70 py-3">
              <div className="grid grid-cols-[1fr_auto] items-baseline gap-3">
                <span className="min-w-0">
                  <span className="line-clamp-2 font-semibold">{r.name}</span>
                  {r.variant && <span className="block text-sm text-ink-muted">{r.variant}</span>}
                </span>
                <span className="whitespace-nowrap font-bold num">{formatNumber(r.qty)} barang</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-sm bg-counter">
                <div className="h-full rounded-sm bg-stamp/70" style={{ width: `${(r.qty / max) * 100}%` }} />
              </div>
              <p className="text-sm num text-ink-muted">
                {r.missing ? <span className="font-semibold text-loss">HPP belum diisi</span> : `Modal ${formatRupiah(r.modal)}`}
                {r.returned > 0 && ` · ${formatNumber(r.returned)} diretur`}
              </p>
            </div>
          ))}
          <div className="flex flex-wrap justify-between gap-2 pt-3 font-bold num">
            <span>Total {formatNumber(rows.length)} produk</span>
            <span>
              {formatNumber(totalQty)} barang · Modal {formatRupiah(totalModal)}
            </span>
          </div>
        </div>
      )}

      {returned.length > 0 && (
        <details className="rounded-md bg-counter/60 p-4">
          <summary className="cursor-pointer font-semibold">Barang retur ({formatNumber(returned.length)})</summary>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-sm">
            {returned.map((r) => (
              <li key={r.order_no + r.sku}>
                {formatDate(r.completed_at)} · {r.order_no} · {r.product_name}
                {r.variant_name && ` — ${r.variant_name}`} · retur {r.returned_qty} dari {r.qty}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-ink-muted">Barang retur tidak dihitung sebagai modal.</p>
        </details>
      )}
    </section>
  )
}

// --- Tab: per bulan (kalau melihat beberapa bulan) --------------------------------

function MonthsTab({
  months,
  reconciliation,
  onRecalc,
}: {
  months: MonthlyRecap[]
  reconciliation: DailyReconciliation[]
  onRecalc: (month: string) => void
}) {
  return (
    <section className="rounded-3xl bg-paper p-5 shadow-sheet sm:p-6">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left">
          <thead className="border-b border-rule text-sm font-medium text-ink-muted">
            <tr>
              <th className="py-2 pr-3">Bulan</th>
              <th className="py-2 pr-3 text-right">Uang masuk</th>
              <th className="py-2 pr-3 text-right">Modal</th>
              <th className="py-2 pr-3 text-right">Biaya</th>
              <th className="py-2 pr-3 text-right">Untung bersih</th>
              <th className="py-2 pr-3 text-right">Barang</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {months.map((m) => {
              const final = monthStatus(m, reconciliation).final
              return (
                <tr key={m.month} className="border-b border-line/70">
                  <td className="py-3 pr-3 font-semibold">
                    {formatMonth(m.month)}
                    <Stamp tone={final ? 'final' : 'warn'} tilt={false} className="ml-2 !text-xs">
                      {final ? 'Final' : 'Belum lengkap'}
                    </Stamp>
                  </td>
                  <td className="num py-3 pr-3 text-right">{formatRupiah(Number(m.total_income))}</td>
                  <td className="num py-3 pr-3 text-right">{formatRupiah(Number(m.total_modal))}</td>
                  <td className="num py-3 pr-3 text-right">
                    {Number(m.expense_entries) === 0 ? (
                      <span className="font-sans font-medium text-warn">belum diisi</span>
                    ) : (
                      formatRupiah(Number(m.total_expenses))
                    )}
                  </td>
                  <td className={`num py-3 pr-3 text-right font-bold ${Number(m.net_profit) < 0 ? 'text-loss' : ''}`}>
                    {formatRupiah(Number(m.net_profit))}
                  </td>
                  <td className="num py-3 pr-3 text-right">{formatNumber(Number(m.total_qty))}</td>
                  <td className="py-3 text-right">
                    <button
                      type="button"
                      onClick={() => onRecalc(m.month)}
                      className="min-h-11 whitespace-nowrap px-2 text-sm font-medium text-stamp underline"
                    >
                      Hitung ulang HPP
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// --- Dialog hitung ulang HPP -------------------------------------------------------

function RecalcDialog({
  month,
  onCancel,
  onRun,
}: {
  month: string
  onCancel: () => void
  onRun: (onlyMissing: boolean) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const run = async (onlyMissing: boolean) => {
    setBusy(true)
    setError(null)
    try {
      await onRun(onlyMissing)
    } catch (e) {
      setError(e)
      setBusy(false)
    }
  }
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-3xl bg-paper p-6 shadow-xl">
        <h2 className="text-xl font-semibold tracking-tight">Hitung ulang HPP — {formatMonth(month)}</h2>
        <p className="mt-3 text-ink-soft">
          Modal bulan ini memakai HPP yang terkunci saat pesanan selesai. Pilih cara menghitung ulang:
        </p>
        {error ? <div className="mt-4"><ErrorBox error={error} /></div> : null}
        <div className="mt-5 flex flex-col gap-3">
          <Button onClick={() => run(true)} disabled={busy}>
            Isi yang HPP-nya kosong saja (disarankan)
          </Button>
          <Button variant="secondary" onClick={() => run(false)} disabled={busy}>
            Semua barang pakai HPP saat ini
          </Button>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Batal
          </Button>
        </div>
        <p className="mt-4 text-sm text-ink-muted">
          "Semua barang" mengganti HPP lama dengan HPP yang sekarang tercatat di halaman HPP, sehingga untung{' '}
          {formatMonth(month)} bisa berubah.
        </p>
      </div>
    </div>
  )
}
