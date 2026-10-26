import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState, useSyncExternalStore, type PointerEvent, type ReactNode } from 'react'
import { MonthSelect } from '../components/pickers'
import { Alert, Button, ButtonLink, Card, ErrorBox, Kicker, Modal, NotaTotal, ScrollX, Spinner, Stamp, linkClass } from '../components/ui'
import { IconAlertCircle, IconArrowRight, IconCheck, IconChevronDown, IconInfo, IconUpload } from '../components/icons'
import {
  countItemsWithoutCreatedAt,
  fetchAdReports,
  fetchCreatedItems,
  fetchEarlierOrdersCompleted,
  fetchIncomeDays,
  fetchCreatedItemIncome,
  fetchMonthlyRecap,
  fetchOrdersByCreated,
  fetchProductRecap,
  fetchProducts,
  fetchReconciliation,
  fetchReturnedItems,
  fetchUnmatchedIncomeOrders,
  fetchIncomeBreakdown,
  fetchSetupProgress,
  fetchStoreSettings,
  type SetupProgress,
  fillMissingHpp,
  recalcHpp,
  type CreatedItem,
  type UnmatchedIncomeOrder,
} from '../lib/api'
import { notifyDataChanged } from '../lib/events'
import { addMonths, currentMonth, formatDate, formatMonth, formatNumber, formatPercent, formatRupiah, formatRupiahShort } from '../lib/format'
import { monthStatus, monthTodos, type MonthStatus } from '../lib/monthStatus'
import {
  THIN_MARGIN,
  estimateProfit,
  incomeBreakdown,
  productRows,
  recapInsights,
  soldFlow,
  sortProducts,
  type FlowStep,
  type IncomeBreakdown,
  type IncomeBreakdownRow,
  type ProductRow,
  type ProductSort,
  type ProfitEstimate,
  type RecapInsight,
} from '../lib/recapMath'
import { resolveSettings } from '../lib/storeSettings'
import { navigate } from '../lib/router'
import { fullMonthOf } from '../lib/adsMath'
import { loadAdsAnalysis, type Period as AdsPeriod } from '../lib/adsLoad'
import { useCountUp } from '../components/motion'
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
  /** Pesanan yang uangnya cair (Excel "Sudah Dilepas") tapi belum cocok dengan export pesanan. */
  unmatched: UnmatchedIncomeOrder[]
  /** Rincian omzet → uang cair per bulan (kosong kalau SQL 20261022 belum dijalankan). */
  breakdown: IncomeBreakdownRow[]
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

/** Langganan habis: Rekap hanya bisa dilihat. Semua tombol yang mengubah data atau pindah ke halaman input disembunyikan. */
const ReadOnlyContext = createContext(false)

export function RecapPage({
  stores,
  storeId,
  readOnly = false,
}: {
  stores: Store[]
  storeId: number | null
  readOnly?: boolean
}) {
  const lastMonth = addMonths(currentMonth(), -1)
  const [from, setFrom] = useState(lastMonth)
  const [to, setTo] = useState(lastMonth)
  const [multi, setMulti] = useState(false)
  const [data, setData] = useState<RecapData | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [orders, setOrders] = useState<OrdersData | { error: unknown } | null>(null)
  const [tab, setTab] = useState<Tab>('pesanan')
  const [productSort, setProductSort] = useState<ProductSort>('terlaris')
  /** Dari diagnosa Bab 1: buka tab Per produk dengan urutan tertentu, lalu gulir ke sana. */
  const showProducts = (sort: ProductSort) => {
    setTab('produk')
    setProductSort(sort)
    requestAnimationFrame(() => document.getElementById('rincian')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
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
      const fetchRecap = () =>
        Promise.all([
          fetchMonthlyRecap(storeId, from, end),
          fetchProductRecap(storeId, from, end),
          fetchReconciliation(storeId, from, end),
          fetchReturnedItems(storeId, from, end),
          fetchUnmatchedIncomeOrders(storeId, from, end),
          fetchIncomeBreakdown(storeId, from, end),
        ])
      let [months, products, reconciliation, returned, unmatched, breakdown] = await fetchRecap()
      // HPP yang baru diisi di halaman HPP langsung dipakai (barang yang HPP-nya masih kosong saja), tanpa
      // menekan "Hitung ulang HPP". Kalau gagal, Rekap tetap tampil dengan angka yang ada.
      const stale = months.filter((m) => Number(m.items_missing_hpp) > 0).map((m) => m.month)
      if (!readOnly && stale.length > 0) {
        const filled = await fillMissingHpp(storeId, stale).catch(() => 0)
        if (filled > 0) {
          ;[months, products, reconciliation, returned, unmatched, breakdown] = await fetchRecap()
          notifyDataChanged()
        }
      }
      setData({ months, products, reconciliation, returned, unmatched, breakdown })
    } catch (e) {
      setError(e)
      return
    }
    // Dimuat terpisah: kalau gagal (mis. SQL ke-3 belum dijalankan), untung bersih tetap tampil.
    try {
      const [groups, withoutCreatedAt, createdItems, itemIncome, earlierCompleted, productList, incomeDays, settingsRow] = await Promise.all([
        fetchOrdersByCreated(storeId, from, end),
        countItemsWithoutCreatedAt(storeId),
        fetchCreatedItems(storeId, from, end),
        fetchCreatedItemIncome(storeId, from, end),
        fetchEarlierOrdersCompleted(storeId, from, end),
        fetchProducts(storeId),
        fetchIncomeDays(storeId, from),
        // Belum ada pengaturan / SQL 20261015 belum dijalankan: pakai bawaan (retur kembali ke stok).
        fetchStoreSettings(storeId).catch(() => null),
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
            income: itemIncome.get(Number(i.id)) ?? null,
          })),
        incomeDays.map((d) => ({
          day: d.released_date,
          total_income: Number(d.total_income),
          subtotal_pesanan: Number(d.subtotal_pesanan),
        })),
        resolveSettings(settingsRow).returnRecovery,
      )
      setOrders({ groups, withoutCreatedAt, createdItems, earlierCompleted, estimate })
    } catch (e) {
      setOrders({ error: e })
    }
  }, [storeId, from, end, rangeValid, readOnly])

  useEffect(() => {
    setRecalcResult(null)
    load()
  }, [load])

  // Kosong tidaknya baru pasti setelah pesanan selesai dimuat. Kalau penghasilan sudah ada, tidak perlu menunggu.
  // Selama masih menunggu, tampilkan Spinner (bukan Nota Rp0 yang lalu berganti jadi "Belum ada data").
  const ordersPending = !!data && data.months.length === 0 && orders === null
  const isEmpty =
    data && data.months.length === 0 && orders && !('error' in orders) && orders.groups.length === 0

  return (
    <>
      <div className="mb-8 flex flex-wrap items-center gap-x-4 gap-y-3">
        <MonthSelect value={from} onChange={setFrom} label={multi ? 'Dari' : 'Bulan'} />
        {multi && <MonthSelect value={to} onChange={setTo} label="Sampai" />}
        <button
          type="button"
          onClick={() => {
            setMulti((m) => !m)
            setTo(from)
          }}
          className="min-h-11 rounded-full px-2 font-semibold text-ink-2 underline decoration-ink-3/50 decoration-2 underline-offset-4 transition-colors hover:text-ink hover:decoration-ink"
        >
          {multi ? 'Satu bulan saja' : 'Lihat beberapa bulan'}
        </button>
      </div>
      {!rangeValid && (
        <p className="mb-4 flex items-center gap-2 font-semibold text-warn">
          <IconAlertCircle size={18} className="shrink-0" />
          Bulan "Dari" harus sebelum atau sama dengan "Sampai".
        </p>
      )}

      {recalcResult && (
        <div className="mb-5">
          <Alert tone="success">{recalcResult}</Alert>
        </div>
      )}

      {!rangeValid ? null : error ? (
        <ErrorBox error={error} />
      ) : !data || ordersPending ? (
        <Spinner />
      ) : isEmpty ? (
        readOnly ? (
          <Alert tone="info" title="Belum ada data">
            Belum ada penghasilan, pesanan, atau biaya untuk {storeName} di {period}.
          </Alert>
        ) : (
          <EmptyRecap storeId={storeId} storeName={storeName} period={period} />
        )
      ) : (
        <ReadOnlyContext.Provider value={readOnly}>
        <div className="space-y-14">
          <NotaCard
            data={data}
            orders={orders && !('error' in orders) ? orders : null}
            period={period}
            singleMonth={from === end ? from : null}
            rangeEnd={end}
            onRecalc={setRecalcMonth}
            storeName={storeName}
            onShowProducts={showProducts}
          />

          {from === end && storeId && <AdsChapter storeId={storeId} month={from} />}

          <section id="rincian" className="scroll-mt-6 space-y-4">
            <ChapterTitle n={from === end ? 4 : 3} kicker="Rinciannya">
              Pesanan & produk
            </ChapterTitle>
            <div role="tablist" aria-label="Rincian" className="flex w-fit max-w-full flex-wrap gap-1 rounded-full bg-tint p-1 ring-1 ring-line">
              <TabButton id="pesanan" tab={tab} setTab={setTab}>Semua pesanan</TabButton>
              <TabButton id="produk" tab={tab} setTab={setTab}>Per produk</TabButton>
              {data.months.length > 1 && <TabButton id="bulan" tab={tab} setTab={setTab}>Per bulan</TabButton>}
            </div>
            <div key={tab} className="page-in">
              {tab === 'pesanan' && <OrdersTab orders={orders} period={period} />}
              {tab === 'produk' && (
                <ProductsTab
                  products={data.products}
                  returned={data.returned}
                  period={period}
                  sort={productSort}
                  setSort={setProductSort}
                />
              )}
              {tab === 'bulan' && data.months.length > 1 && (
                <MonthsTab months={data.months} reconciliation={data.reconciliation} onRecalc={setRecalcMonth} />
              )}
            </div>
          </section>
        </div>
        </ReadOnlyContext.Provider>
      )}

      {recalcMonth && storeId && !readOnly && (
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

/**
 * Rekap kosong untuk periode yang dipilih. Toko yang belum punya data sama sekali dapat langkah awal
 * (upload → HPP); toko yang sudah punya data di bulan lain hanya diberi tahu bulan ini kosong.
 */
function EmptyRecap({ storeId, storeName, period }: { storeId: number | null; storeName: string; period: string }) {
  const [progress, setProgress] = useState<SetupProgress | null>(null)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    if (!storeId) return
    let cancelled = false
    setProgress(null)
    setError(null)
    fetchSetupProgress(storeId)
      .then((p) => !cancelled && setProgress(p))
      .catch((e) => !cancelled && setError(e))
    return () => {
      cancelled = true
    }
  }, [storeId])

  if (error) return <ErrorBox error={error} />
  // Tunggu dulu: menampilkan "Belum ada data" sebentar lalu berganti jadi panduan akan terlihat berkedip.
  if (!progress) return <Spinner />

  if (progress.hasOrders || progress.hasIncome) {
    return (
      <Alert tone="info" title={`Belum ada data di ${period}`}>
        <p>
          {storeName} belum punya penghasilan, pesanan, atau biaya di bulan ini. Pilih bulan lain di atas, atau upload
          data bulan ini.
        </p>
        <p className="mt-3">
          <ButtonLink href="#/upload" variant="secondary">Upload data</ButtonLink>
        </p>
      </Alert>
    )
  }

  const hppDone = progress.hasProducts && !progress.hasMissingHpp
  // Untuk pelanggan baru, ini layar pertama setelah masuk: kalimat jawaban dulu, satu tombol utama, lalu langkahnya.
  return (
    <section className="grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-start lg:gap-12">
      <div>
        <Kicker>Rekap {period}</Kicker>
        <h1 className="mt-3 font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">
          Mulai dengan <span className="hl">3 langkah</span> ini.
        </h1>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-ink-2">
          Untung bersih {storeName} muncul di sini setelah laporan Shopee di-upload dan HPP diisi. Setelah itu, tiap
          bulan cukup upload file terbaru.
        </p>
        <ButtonLink href="#/upload" className="mt-6 font-display font-bold">
          <IconUpload size={18} />
          Upload laporan
        </ButtonLink>
      </div>
      <Card title="Yang perlu disiapkan">
        <ol className="divide-y divide-line">
          <SetupStep n={1} title="Export pesanan (.xlsx)" action={null}>
            Seller Centre → Pesanan Saya → Export, status <strong className="text-ink">Semua</strong>.
          </SetupStep>
          <SetupStep n={2} title="Laporan penghasilan (.xlsx)" action={null}>
            Seller Centre → Keuangan → Penghasilan Saya → <strong className="text-ink">Sudah Dilepas</strong> → Export.
            PDF laporan bulanan juga bisa.
          </SetupStep>
          <SetupStep
            n={3}
            title="HPP (modal) tiap produk"
            done={hppDone}
            action={progress.hasProducts && !hppDone ? <ButtonLink href="#/hpp?kosong=1" variant="secondary">Isi HPP</ButtonLink> : null}
          >
            {progress.hasProducts
              ? 'Supaya untung dihitung setelah dikurangi modal.'
              : 'Daftar produknya muncul otomatis setelah export pesanan di-upload.'}
          </SetupStep>
        </ol>
      </Card>
    </section>
  )
}

function SetupStep({
  n,
  title,
  done = false,
  action,
  children,
}: {
  n: number
  title: string
  done?: boolean
  action: ReactNode
  children: ReactNode
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-3 py-4 first:pt-0 last:pb-0">
      <span
        aria-hidden="true"
        className={`num flex size-9 shrink-0 items-center justify-center rounded-full font-display text-lg font-bold ${
          done ? 'bg-gain text-white' : 'bg-ink text-paper'
        }`}
      >
        {done ? <IconCheck size={18} strokeWidth={3} /> : n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {title}
          {done && <span className="sr-only"> (sudah)</span>}
        </p>
        <p className="text-sm text-ink-2">{children}</p>
      </div>
      {!done && action}
    </li>
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
      className={`min-h-11 rounded-full px-4 font-semibold transition-colors duration-150 ${
        on ? 'bg-ink text-paper' : 'text-ink-2 hover:text-ink'
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
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-control bg-paper px-4 text-left text-sm font-semibold text-ink-2 transition-colors hover:border-ink hover:text-ink"
      >
        <IconInfo size={18} className="shrink-0 text-accent" />
        {label}
        <IconChevronDown size={16} className={`shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="reveal space-y-2 rounded-2xl bg-tint px-4 py-3 text-ink-2">{children}</div>}
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
  storeName,
  onShowProducts,
}: {
  data: RecapData
  orders: OrdersData | null
  period: string
  singleMonth: string | null
  rangeEnd: string
  onRecalc: (month: string) => void
  storeName: string
  onShowProducts: (sort: ProductSort) => void
}) {
  const readOnly = useContext(ReadOnlyContext)
  const t = data.months.reduce(
    (a, m) => ({
      income: a.income + Number(m.total_income),
      adjustments: a.adjustments + Number(m.adjustments ?? 0),
      modal: a.modal + Number(m.total_modal),
      returnedLoss: a.returnedLoss + Number(m.returned_loss ?? 0),
      expenses: a.expenses + Number(m.total_expenses),
      profit: a.profit + Number(m.net_profit),
      qty: a.qty + Number(m.total_qty),
    }),
    { income: 0, adjustments: 0, modal: 0, returnedLoss: 0, expenses: 0, profit: 0, qty: 0 },
  )
  const statuses = data.months.map((m) => ({ month: m.month, status: monthStatus(m, data.reconciliation) }))
  const todoCount = statuses.reduce((n, s) => n + monthTodos(s.status).length, 0)
  const allFinal = statuses.length > 0 && todoCount === 0
  const firstTodo = statuses.flatMap((s) => monthTodos(s.status))[0]
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
    .map(([label, v]) => [label, v] as const)
  // Rincian dari omzet (Bab 2). Hanya dipakai kalau uang cairnya pas dengan rekap bulanan.
  const breakdown = useMemo(() => {
    const b = incomeBreakdown(data.breakdown)
    return b && Math.abs(b.released + t.adjustments - t.income) <= 1 ? b : null
  }, [data.breakdown, t.adjustments, t.income])
  const ads = data.months.reduce((n, m) => n + Number(m.iklan_shopee) + Number(m.meta_ads), 0)
  const products = useMemo(() => productRows(data.products), [data.products])
  const insights = breakdown
    ? recapInsights({
        omzet: breakdown.omzet,
        shopeeFee: breakdown.shopeeFee,
        feeParts: breakdown.feeParts,
        ads,
        modal: t.modal,
        profit: t.profit,
        rugi: products.filter((p) => p.status === 'rugi').length,
        tipis: products.filter((p) => p.status === 'tipis').length,
      })
    : []
  const ofOmzet = (v: number) => (breakdown && breakdown.omzet > 0 ? formatPercent((v / breakdown.omzet) * 100) : '')
  const margin = breakdown && breakdown.omzet > 0 ? (t.profit / breakdown.omzet) * 100 : t.income > 0 ? (t.profit / t.income) * 100 : null

  const flow = orders ? buildFlow(orders, t.qty, rangeEnd) : null
  const biayaMonth = unfilledExpenses[0]?.month ?? singleMonth ?? data.months[0]?.month

  // Angka berputar naik, lalu stiker status ditempel.
  const shownProfit = useCountUp(t.profit)
  const loss = t.profit < 0

  return (
    <>
      {/* Bab 1: jawabannya, ditulis seperti kalimat (sama dengan kartu rekap di landing). */}
      <section className="grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)] lg:items-stretch lg:gap-12">
        <div className="min-w-0">
          <Kicker>Bab 1 · Untung bersih</Kicker>
          {/* Periode, nama toko, dan "untung bersih" masing-masing tidak terbelah ke dua baris (mis. "Sora / Store").
              Kalau periode atau nama toko lebih panjang dari satu baris, ia turun di dalam kotaknya sendiri. */}
          <h1 className="mt-3 text-balance font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            <span className="inline-block">{period},</span> <span className="inline-block">{storeName}</span>{' '}
            <span className="hl whitespace-nowrap">{loss ? 'rugi' : 'untung bersih'}</span>
          </h1>
          <p
            className={`num mt-3 font-display text-6xl font-extrabold leading-[0.95] tracking-tighter sm:text-8xl lg:text-[7.5rem] ${
              loss ? 'text-loss' : 'text-gain'
            }`}
          >
            {formatRupiahShort(Math.abs(shownProfit))}
          </p>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-2">
            Tepatnya <b className="num text-ink">{formatRupiah(t.profit)}</b>
            {margin !== null && <> ({formatPercent(margin)} dari {breakdown ? 'omzet' : 'uang masuk'})</>}, dari{' '}
            <b className="text-ink">{formatNumber(t.qty)} barang</b> yang sudah sampai ke pembeli dan uangnya cair.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3">
            {statuses.length > 0 && (
              <button
                type="button"
                aria-expanded={showStatus}
                onClick={() => setShowStatus((s) => !s)}
                className="group inline-flex min-h-11 items-center gap-1.5 rounded-full px-1"
              >
                <Stamp tone={allFinal ? 'final' : 'warn'} delay={650} size="md">
                  {allFinal ? 'Angka final' : `Belum lengkap · ${todoCount} hal`}
                </Stamp>
                <IconChevronDown
                  size={18}
                  className={`text-ink-3 transition-transform duration-150 group-hover:text-ink ${showStatus ? 'rotate-180' : ''}`}
                />
                <span className="sr-only">{showStatus ? 'Tutup' : 'Lihat'} rincian status</span>
              </button>
            )}
            {!allFinal && firstTodo && <span className="font-semibold text-warn">Belum final: {firstTodo.short}</span>}
          </div>
        </div>
        {insights.length > 0 ? (
          <Insights items={insights} loss={loss} onShowProducts={onShowProducts} />
        ) : (
          <MoneySplit income={t.modal + t.expenses + t.profit} modal={t.modal} expenses={t.expenses} profit={t.profit} />
        )}
      </section>

      {showStatus && (
        <div className={`reveal space-y-4 rounded-3xl border p-5 sm:p-6 ${allFinal ? 'border-gain/30 bg-mintbg' : 'border-sun bg-sun-tint'}`}>
          {statuses.map((s) => (
            <Checklist
              key={s.month}
              month={s.month}
              status={s.status}
              unmatched={data.unmatched.filter((u) => u.month === s.month)}
              showTitle={statuses.length > 1}
              onRecalc={onRecalc}
            />
          ))}
          <p className="flex gap-2 border-t border-ink/10 pt-3 text-sm text-ink-2">
            <IconInfo size={16} className="mt-0.5 shrink-0 text-accent" />
            <span>
              <strong>Soal tanggal batas bulan.</strong> Untung sebulan dihitung dari uang yang cair di bulan itu dan
              modal barang yang sampai di bulan itu. Barang yang sampai di 30–31 tapi uangnya cair 1–2 hari kemudian bisa
              tercatat beda bulan, jadi untung satu bulan bisa bergeser sedikit (bulan berikutnya jadi sedikit lebih
              tinggi). Kalau beberapa bulan dilihat bersamaan, totalnya tetap pas.
            </span>
          </p>
        </div>
      )}

      {/* Bab 2: dari mana angkanya. */}
      <section id="bab2" className="scroll-mt-6 space-y-4">
        <ChapterTitle n={2} kicker="Hitungannya">
          {breakdown ? (loss ? 'Dari omzet sampai rugi' : 'Dari omzet sampai untung') : 'Dari mana angkanya'}
        </ChapterTitle>
        {breakdown && <OmzetBar b={breakdown} months={data.months} modal={t.modal} profit={t.profit} />}
        <div className="space-y-5 rounded-3xl bg-paper p-5 shadow-sheet ring-1 ring-line sm:p-7">
          <div className="print-in">
            {breakdown && <OmzetLines b={breakdown} adjustments={t.adjustments} />}
            <NotaLine
              op={breakdown ? '=' : '+'}
              label="Uang masuk dari Shopee"
              detail={[
                `Dana cair ${formatNumber(releaseDays)} hari`,
                !breakdown && t.adjustments !== 0 ? `penyesuaian ${formatRupiah(t.adjustments)}` : null,
                !breakdown && refund !== 0 ? `refund ${formatRupiah(-refund)} sudah dipotong` : null,
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
                  {breakdown && <> · {ofOmzet(t.modal)} dari omzet</>}
                  {t.returnedLoss > 0 && <> · termasuk {formatRupiah(t.returnedLoss)} dari barang retur yang tidak bisa dijual lagi</>}
                  {singleMonth && !readOnly && (
                    <>
                      {' · '}
                      <button type="button" className={linkClass} onClick={() => onRecalc(singleMonth)}>
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
                  {expenseDetail.length > 0
                    ? expenseDetail
                        .map(([label, v]) => `${label} ${formatRupiah(v)}${breakdown ? ` (${ofOmzet(v)})` : ''}`)
                        .join(' · ')
                    : unfilledExpenses.length > 0
                      ? 'Belum diisi'
                      : 'Tidak ada biaya'}
                  {biayaMonth && !readOnly && (
                    <>
                      {' · '}
                      <button
                        type="button"
                        className={linkClass}
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
                  <span className="inline-flex items-center gap-1.5 font-sans text-base font-semibold text-warn">
                    <IconAlertCircle size={18} />
                    belum diisi
                  </span>
                ) : (
                  formatRupiah(t.expenses)
                )
              }
            />
          </div>
          <NotaTotal className="print-last" label="= Untung bersih" amount={formatRupiah(t.profit)} tone={loss ? 'loss' : 'gain'} />
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

/** Judul bab: nomor bab + kata kunci kecil (indigo), lalu judul besar. */
function ChapterTitle({ n, kicker, children }: { n: number; kicker: string; children: ReactNode }) {
  return (
    <div>
      <Kicker>
        Bab {n} · {kicker}
      </Kicker>
      <h2 className="mt-1 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{children}</h2>
    </div>
  )
}

/** Baris rincian di bawah satu baris nota (mis. jenis-jenis potongan Shopee). */
function NotaSub({ label, amount }: { label: ReactNode; amount: ReactNode }) {
  return (
    <div className="grid grid-cols-[1.5rem_1fr_auto] items-baseline gap-x-2 pb-2 text-sm text-ink-2">
      <span />
      <span className="min-w-0">{label}</span>
      <span className="num whitespace-nowrap">{amount}</span>
    </div>
  )
}

/** Bab 2, bagian atas: dari omzet sampai uang cair (potongan Shopee per jenis). */
function OmzetLines({ b, adjustments }: { b: IncomeBreakdown; adjustments: number }) {
  const pct = (v: number) => (b.omzet > 0 ? formatPercent((v / b.omzet) * 100) : '')
  return (
    <>
      <NotaLine
        op="+"
        label={b.detailed ? 'Omzet' : 'Omzet (setelah refund)'}
        detail={
          b.detailed
            ? `harga produk${b.orders ? `, ${formatNumber(b.orders)} pesanan` : ''}`
            : 'laporan PDF tidak memisahkan refund, jadi sudah dipotong di sini'
        }
        amount={formatRupiah(b.omzet)}
      />
      {b.refund !== 0 && (
        <NotaLine op="−" label="Refund ke pembeli" detail={`${pct(b.refund)} dari omzet`} amount={formatRupiah(b.refund)} />
      )}
      {b.voucher !== 0 && (
        <NotaLine op="−" label="Voucher dari penjual" detail={`${pct(b.voucher)} dari omzet`} amount={formatRupiah(b.voucher)} />
      )}
      {b.ongkir !== 0 && (
        <NotaLine
          op={b.ongkir < 0 ? '−' : '+'}
          label={b.ongkir < 0 ? 'Ongkir ditanggung toko' : 'Selisih ongkir'}
          detail={`${pct(Math.abs(b.ongkir))} dari omzet`}
          amount={formatRupiah(Math.abs(b.ongkir))}
        />
      )}
      {b.shopeeFee !== 0 && (
        <div className="border-line [&+&]:border-t">
          <NotaLine op="−" label="Potongan Shopee" detail={`${pct(b.shopeeFee)} dari omzet`} amount={formatRupiah(b.shopeeFee)} />
          {b.feeParts.map((f) => (
            <NotaSub key={f.label} label={`${f.label} · ${pct(f.amount)}`} amount={formatRupiah(f.amount)} />
          ))}
        </div>
      )}
      {adjustments !== 0 && (
        <NotaLine
          op={adjustments > 0 ? '+' : '−'}
          label="Kompensasi / penyesuaian"
          detail="dari Shopee, mis. ganti rugi barang retur atau hilang"
          amount={formatRupiah(Math.abs(adjustments))}
        />
      )}
    </>
  )
}

/** Bab 2: satu batang "dari omzet, uangnya ke mana saja". */
/** Tooltip di atas batang: menempel ke tepi kalau bagiannya dekat ujung, supaya tidak terpotong di HP. */
function tooltipPosition(centerPct: number) {
  if (centerPct < 30) return { left: 0 }
  if (centerPct > 70) return { right: 0 }
  return { left: `${centerPct}%`, transform: 'translateX(-50%)' }
}

function OmzetBar({ b, months, modal, profit }: { b: IncomeBreakdown; months: MonthlyRecap[]; modal: number; profit: number }) {
  // Bagian yang sedang disorot (hover, sentuh, atau fokus keyboard): tampilkan nominalnya.
  const [active, setActive] = useState<string | null>(null)
  if (b.omzet <= 0) return null
  const sum = (k: 'iklan_shopee' | 'meta_ads' | 'packaging' | 'lain_lain') => months.reduce((n, m) => n + Number(m[k]), 0)
  const segs = [
    { key: 'shopee', label: 'Potongan Shopee', value: b.shopeeFee, color: 'bg-accent' },
    {
      key: 'refund',
      label: [b.refund > 0 && 'refund', b.voucher > 0 && 'voucher', b.ongkir < 0 && 'ongkir']
        .filter(Boolean)
        .join(', ')
        .replace(/^./, (c) => c.toUpperCase()),
      value: b.refund + b.voucher - Math.min(b.ongkir, 0),
      color: 'bg-control',
    },
    { key: 'modal', label: 'Modal', value: modal, color: 'bg-ink-2' },
    { key: 'iklan', label: 'Iklan', value: sum('iklan_shopee') + sum('meta_ads'), color: 'bg-loss' },
    { key: 'packaging', label: 'Packaging', value: sum('packaging'), color: 'bg-rule' },
    { key: 'lain', label: 'Biaya lain', value: sum('lain_lain'), color: 'bg-line' },
    { key: 'untung', label: 'Untung', value: Math.max(profit, 0), color: 'bg-gain' },
  ].filter((sg) => sg.value > 0)
  const pct = (v: number) => formatPercent((v / b.omzet) * 100)
  // Titik tengah tiap bagian (persen lebar batang), untuk posisi tooltip.
  const total = segs.reduce((n, sg) => n + sg.value, 0)
  let acc = 0
  const centers = new Map(
    segs.map((sg) => {
      const c = ((acc + sg.value / 2) / total) * 100
      acc += sg.value
      return [sg.key, c] as const
    }),
  )
  const act = segs.find((sg) => sg.key === active) ?? null
  // Masuk/keluar hanya untuk mouse: di HP, browser mengirim "mouse keluar" tiruan setelah ketukan.
  const hover = (key: string) => ({
    onPointerEnter: (e: PointerEvent<HTMLButtonElement>) => {
      if (e.pointerType === 'mouse') setActive(key)
    },
    onFocus: () => setActive(key),
    onBlur: () => setActive((k) => (k === key ? null : k)),
    // Sentuh di HP: ketuk untuk tampilkan; ketuk di tempat lain menutupnya (onBlur).
    onClick: () => setActive(key),
  })
  return (
    <figure
      className="rounded-3xl bg-paper p-5 shadow-sheet ring-1 ring-line sm:p-6"
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse') setActive(null)
      }}
    >
      <figcaption className="font-semibold">
        Dari omzet {formatRupiahShort(b.omzet)}, uangnya ke mana saja
      </figcaption>
      <div className="relative mt-3">
        {act && (
          <div
            role="status"
            className="pointer-events-none absolute bottom-full z-10 mb-2 whitespace-nowrap rounded-xl bg-ink px-3 py-2 text-paper shadow-sheet"
            style={tooltipPosition(centers.get(act.key) ?? 50)}
          >
            <span className="num block text-lg font-bold leading-tight">{formatRupiah(act.value)}</span>
            <span className="mt-0.5 flex items-center gap-1.5 text-sm text-paper/80">
              <i aria-hidden="true" className={`inline-block h-0.5 w-3 rounded-full ${act.key === 'lain' ? 'bg-paper' : act.color}`} />
              {act.label} · {pct(act.value)} dari omzet
            </span>
          </div>
        )}
        <div role="group" aria-label="Pembagian omzet" className="flex h-6 gap-[2px] overflow-hidden rounded-full bg-line">
          {segs.map((sg, i) => (
            <button
              key={sg.key}
              type="button"
              aria-label={`${sg.label}: ${formatRupiah(sg.value)}, ${pct(sg.value)} dari omzet`}
              aria-pressed={active === sg.key}
              {...hover(sg.key)}
              style={{ flexGrow: sg.value, animationDelay: `${200 + i * 100}ms` }}
              className={`grow-bar min-w-[6px] basis-0 cursor-pointer transition-opacity duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink ${sg.color} ${
                active && active !== sg.key ? 'opacity-35' : ''
              }`}
            />
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-1 gap-y-1 text-sm text-ink-2">
        {segs.map((sg) => (
          <button
            key={sg.key}
            type="button"
            aria-label={`${sg.label}: ${formatRupiah(sg.value)}, ${pct(sg.value)} dari omzet`}
            aria-pressed={active === sg.key}
            {...hover(sg.key)}
            className={`num inline-flex min-h-11 items-center rounded-full px-2 transition-colors duration-150 sm:min-h-8 ${
              active === sg.key ? 'bg-tint text-ink' : 'hover:text-ink'
            }`}
          >
            <i aria-hidden="true" className={`mr-1.5 inline-block h-2.5 w-2.5 rounded-full ${sg.color} ${sg.key === 'lain' ? 'ring-1 ring-rule' : ''}`} />
            {sg.label} {pct(sg.value)}
          </button>
        ))}
      </div>
      {profit < 0 && (
        <p className="mt-2 text-sm font-semibold text-loss">
          Potongan, modal, dan biaya lebih besar dari omzet: rugi {formatRupiah(-profit)}.
        </p>
      )}
    </figure>
  )
}

/** Bab 1, kolom kanan: maksimal 3 penyebab terbesar untung/rugi bulan ini. */
function Insights({
  items,
  loss,
  onShowProducts,
}: {
  items: RecapInsight[]
  loss: boolean
  onShowProducts: (sort: ProductSort) => void
}) {
  const link = (key: RecapInsight['key']) => {
    switch (key) {
      case 'iklan':
        return <button type="button" className={linkClass} onClick={() => navigate('iklan')}>Lihat iklan per produk</button>
      case 'produk':
        return <button type="button" className={linkClass} onClick={() => onShowProducts('rugi')}>Lihat produknya</button>
      case 'potongan':
        return (
          <button
            type="button"
            className={linkClass}
            onClick={() => document.getElementById('bab2')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            Lihat rinciannya
          </button>
        )
      case 'modal':
        return <button type="button" className={linkClass} onClick={() => navigate('simulasi')}>Cek harga jual di Simulasi</button>
    }
  }
  return (
    <section aria-labelledby="insights-title" className="flex min-w-0 flex-col self-start rounded-3xl bg-paper p-5 shadow-sheet ring-1 ring-line sm:p-6">
      <h2 id="insights-title" className="font-display text-xl font-bold leading-tight tracking-tight">
        {loss ? 'Kenapa bulan ini rugi?' : 'Kenapa untungnya segini?'}
      </h2>
      <ol className="mt-4 space-y-2.5">
        {items.map((it, i) => (
          <li key={it.key} className={`flex gap-3 rounded-2xl p-3.5 ${it.tone === 'bad' ? 'bg-loss-tint' : 'bg-tint'}`}>
            <span
              aria-hidden="true"
              className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold text-white ${
                it.tone === 'bad' ? 'bg-loss' : 'bg-ink-2'
              }`}
            >
              {i + 1}
            </span>
            <span className="min-w-0 leading-relaxed">
              <strong>{it.title}</strong>
              {it.detail && <>{it.detail.startsWith('(') ? ' ' : ', '}{it.detail}</>} {link(it.key)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

/**
 * "Dari setiap Rp100 yang masuk": satu batang bagian-dari-keseluruhan (modal, biaya, untung).
 * Tegak di laptop, mendatar di HP. Tidak ditampilkan kalau rugi (bagiannya tidak lagi menjumlah ke 100).
 */
/** true di layar lebar (laptop), tempat batang "Rp100" berdiri tegak dan segmen kecil masih muat label. */
function useIsDesktop() {
  return useSyncExternalStore(
    (onChange) => {
      const m = window.matchMedia('(min-width: 1024px)')
      m.addEventListener('change', onChange)
      return () => m.removeEventListener('change', onChange)
    },
    () => window.matchMedia('(min-width: 1024px)').matches,
    () => true,
  )
}

function MoneySplit({ income, modal, expenses, profit }: { income: number; modal: number; expenses: number; profit: number }) {
  const desktop = useIsDesktop()
  if (income <= 0 || profit < 0) {
    return (
      <div className="self-start rounded-3xl bg-tint p-5 text-ink-2 ring-1 ring-line">
        Modal dan biaya bulan ini lebih besar dari uang yang masuk, jadi tidak ada sisa untung.
      </div>
    )
  }
  const modalPer100 = Math.round((modal / income) * 100)
  const biayaPer100 = Math.round((expenses / income) * 100)
  const untungPer100 = 100 - modalPer100 - biayaPer100
  const segs = [
    { key: 'modal', label: 'modal barang', per100: modalPer100, share: modal / income, cls: 'bg-line text-ink' },
    { key: 'biaya', label: 'biaya', per100: biayaPer100, share: expenses / income, cls: 'bg-rule text-ink' },
    { key: 'untung', label: 'untung', per100: untungPer100, share: profit / income, cls: 'bg-gain text-white' },
  ]
  // Batang mendatar di HP hanya selebar layar, jadi segmen harus lebih besar supaya labelnya tidak terpotong.
  // Segmen kecil tetap tertulis di kalimat di bawah batang.
  const big = (share: number) => share >= (desktop ? 0.12 : 0.22)
  return (
    <figure className="flex min-w-0 flex-col rounded-3xl bg-paper p-5 shadow-sheet ring-1 ring-line sm:p-6">
      <figcaption className="font-display text-xl font-bold leading-tight tracking-tight">Dari setiap Rp100 yang masuk</figcaption>
      <div
        role="img"
        aria-label={`Rp${modalPer100} untuk modal barang, Rp${biayaPer100} untuk biaya, Rp${untungPer100} jadi untung`}
        className="mt-4 flex h-24 gap-[3px] lg:h-auto lg:min-h-[16rem] lg:flex-1 lg:flex-col"
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
                <span className="num font-display text-xl font-extrabold lg:text-3xl">Rp{sg.per100}</span>
              </>
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 text-sm text-ink-2">
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
  const readOnly = useContext(ReadOnlyContext)
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

  // Merah hanya untuk rugi: angka rugi dan stiker Takedown. Belum ada data, gagal dihitung, atau iklan untung
  // tampil di lembar putih biasa, supaya bab ini tidak terbaca sebagai peringatan padahal tidak ada yang salah.
  const loss = state.kind === 'ok' && state.profitAfterAds < 0

  return (
    <section className="rounded-3xl bg-paper p-6 shadow-sheet ring-1 ring-line sm:p-8">
      <Kicker>Bab 3 · Iklan {formatMonth(month)}</Kicker>
      {state.kind === 'loading' && <p className="mt-3 text-ink-3">Menghitung iklan…</p>}
      {(state.kind === 'none' || state.kind === 'error') && (
        <>
          <h2 className="mt-2 font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
            {state.kind === 'none' ? `Belum ada data iklan ${formatMonth(month)}.` : 'Data iklan belum bisa dihitung di sini.'}
          </h2>
          <p className="mt-2 max-w-2xl text-lg leading-relaxed text-ink-2">
            {state.kind === 'none'
              ? 'Upload data iklan Shopee 1 bulan penuh untuk melihat iklan mana yang untung dan mana yang bikin rugi.'
              : 'Buka halaman Iklan untuk melihat rinciannya.'}
          </p>
        </>
      )}
      {state.kind === 'ok' && (
        <>
          <h2 className="mt-2 font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
            Iklan{' '}
            <span className={loss ? 'text-loss' : 'text-gain'}>
              {loss ? 'rugi' : 'untung'} {formatRupiahShort(Math.abs(state.profitAfterAds))}
            </span>
            .{' '}
            {state.takedownCount > 0
              ? `${formatNumber(state.takedownCount)} iklan sebaiknya dimatikan.`
              : 'Tidak ada iklan yang perlu dimatikan.'}
          </h2>
          <p className="mt-2 text-lg leading-relaxed text-ink-2">
            Setelah biaya iklan <span className="num">{formatRupiah(state.spend)}</span>, untungnya{' '}
            <b className={`num ${loss ? 'text-loss' : 'text-ink'}`}>{formatRupiah(state.profitAfterAds)}</b>.
          </p>
          {state.takedown.length > 0 && (
            <ul className="mt-5 divide-y divide-line border-y border-line">
              {state.takedown.map((p, i) => (
                <li key={p.name} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3.5">
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 font-semibold">{p.name}</span>
                    <span className="num block text-sm text-ink-2">
                      {p.profit === null ? (
                        'HPP belum lengkap'
                      ) : (
                        <>
                          Setelah iklan <span className="whitespace-nowrap">{formatRupiah(p.profit)}</span>
                        </>
                      )}
                    </span>
                  </span>
                  <Stamp tone="loss" tilt={i % 2 ? 3 : -3} delay={i * 60}>
                    Takedown
                  </Stamp>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {!readOnly && (
        <a href="#/iklan" className={`${linkClass} mt-5 inline-flex min-h-11 items-center gap-2`}>
          Buka halaman Iklan
          <IconArrowRight size={18} />
        </a>
      )}
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
              ? 'bg-paper py-2 text-ink'
              : s.kind === 'result'
                ? 'bg-ink py-2 font-bold text-paper'
                : 'py-0.5 text-ink-2'
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
    <div className="grid grid-cols-[1.5rem_1fr] items-baseline gap-x-2 border-line py-3 sm:grid-cols-[1.5rem_1fr_auto] [&+&]:border-t">
      <span className="num text-center font-bold text-ink-3">{op}</span>
      <span className="min-w-0">
        <span className="block font-semibold">{label}</span>
        <span className="block text-sm text-ink-2">{detail}</span>
      </span>
      {/* HP: angka turun ke bawah labelnya supaya label tidak terjepit. */}
      <span className="num col-start-2 mt-1 whitespace-nowrap text-lg font-semibold sm:col-start-auto sm:mt-0 sm:text-right">
        {amount}
      </span>
    </div>
  )
}

// --- Daftar centang status bulan ---------------------------------------------

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
  unmatched,
  showTitle,
  onRecalc,
}: {
  month: string
  status: MonthStatus
  unmatched: UnmatchedIncomeOrder[]
  showTitle: boolean
  onRecalc: (month: string) => void
}) {
  const readOnly = useContext(ReadOnlyContext)
  const label = formatMonth(month)
  return (
    <div className="space-y-2">
      {showTitle && <p className="font-bold">{label}</p>}
      <CheckRow ok={s.hasIncome}>
        {s.hasIncome ? 'Laporan penghasilan sudah di-upload' : (
          <><strong>Laporan penghasilan {label} belum di-upload.</strong> Upload di halaman Upload.</>
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
      {unmatched.length > 0 && <UnmatchedOrders orders={unmatched} />}
      {s.shifted.days.length > 0 && (
        <p className="flex gap-2 pl-8 text-sm text-ink-2">
          <IconInfo size={16} className="mt-0.5 shrink-0 text-accent" />
          <span>
            {formatRupiah(s.shifted.amount)} cair 1–2 hari setelah tanggal pesanan selesai di export (
            {dayList(s.shifted.days)}). Ini normal, datanya sudah cocok.
          </span>
        </p>
      )}
      {s.hasIncome && s.ordersWithoutIncome.days.length > 0 && (
        <CheckRow ok={false}>
          <strong>{formatNumber(s.ordersWithoutIncome.orders)} pesanan selesai tidak ada di laporan penghasilan</strong>{' '}
          ({dayList(s.ordersWithoutIncome.days)}). Pastikan laporan penghasilan {label} yang di-upload lengkap.
        </CheckRow>
      )}
      <CheckRow ok={s.missingHpp === 0}>
        {s.missingHpp === 0 ? 'Semua barang sudah punya HPP' : (
          <>
            <strong>{formatNumber(s.missingHpp)} barang belum punya HPP</strong>, jadi modalnya masih Rp0.
            {!readOnly && (
              <span className="mt-2 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => navigate('hpp', { kosong: '1' })}>Isi HPP</Button>
                <Button variant="secondary" onClick={() => onRecalc(month)}>Hitung ulang HPP</Button>
              </span>
            )}
          </>
        )}
      </CheckRow>
      <CheckRow ok={s.expensesFilled}>
        {s.expensesFilled ? 'Biaya sudah diisi' : (
          <>
            <strong>Biaya {label} belum diisi</strong> (iklan, packaging, dll.).
            {!readOnly && (
              <>
                {' '}Kalau memang tidak ada, simpan Rp0.{' '}
                <button type="button" className={linkClass} onClick={() => navigate('biaya', { bulan: month })}>
                  Isi biaya
                </button>
              </>
            )}
          </>
        )}
      </CheckRow>
    </div>
  )
}

/** Nomor pesanan yang uangnya sudah cair tapi belum cocok dengan export pesanan (dari Excel "Sudah Dilepas"). */
function UnmatchedOrders({ orders }: { orders: UnmatchedIncomeOrder[] }) {
  const missing = orders.filter((o) => o.match === 'tidak_ada')
  const stale = orders.filter((o) => o.match === 'belum_selesai')
  const list = (os: UnmatchedIncomeOrder[]) => {
    const shown = os.slice(0, UNMATCHED_SHOWN).map((o) => o.order_no).join(', ')
    return os.length > UNMATCHED_SHOWN ? `${shown}, dan ${formatNumber(os.length - UNMATCHED_SHOWN)} lainnya` : shown
  }
  const sum = (os: UnmatchedIncomeOrder[]) => os.reduce((n, o) => n + Number(o.total_income), 0)
  return (
    <div className="space-y-1 pl-8 text-sm text-ink-2">
      {missing.length > 0 && (
        <p>
          <strong className="text-ink">{formatNumber(missing.length)} pesanan</strong> ({formatRupiah(sum(missing))}) sudah
          cair tapi tidak ada di export pesanan: <span className="num">{list(missing)}</span>. Biasanya pesanan bulan
          sebelumnya; upload export pesanan dengan rentang tanggal yang lebih lebar.
        </p>
      )}
      {stale.length > 0 && (
        <p>
          <strong className="text-ink">{formatNumber(stale.length)} pesanan</strong> ({formatRupiah(sum(stale))}) sudah
          cair, tapi di export pesanan statusnya belum Selesai: <span className="num">{list(stale)}</span>. Upload ulang
          export pesanan yang terbaru; datanya tidak akan dobel.
        </p>
      )}
    </div>
  )
}

const UNMATCHED_SHOWN = 8

// --- Tab: semua pesanan -----------------------------------------------------------

const GROUP_LABEL: Record<OrdersByCreated['status_group'], string> = {
  selesai: 'Selesai',
  proses: 'Masih diproses / dikirim',
  batal: 'Batal / belum bayar',
}

function OrdersTab({ orders, period }: { orders: OrdersData | { error: unknown } | null; period: string }) {
  const readOnly = useContext(ReadOnlyContext)
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
  // Semua barang memakai uang masuk asli (Excel "Sudah Dilepas"): bukan perkiraan lagi.
  const allExact = !!est && est.items > 0 && est.exact === est.items
  const pct = (n: number) => (total.qty > 0 ? `${(n / total.qty) * 100}%` : '0%')

  return (
    <section className="space-y-5 rounded-3xl bg-paper p-5 shadow-sheet ring-1 ring-line sm:p-7">
      <div>
        <h2 className="font-display text-xl font-bold tracking-tight">Semua pesanan yang masuk di {period}</h2>
        <p className="mt-1 text-ink-2">
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
              className="flex h-3 gap-[2px] overflow-hidden rounded-full bg-line"
              role="img"
              aria-label={`${done.qty} barang selesai, ${proses.qty} diproses, ${batal.qty} batal`}
            >
              <div className="bg-ink" style={{ width: pct(done.qty) }} />
              <div className="bg-control" style={{ width: pct(proses.qty) }} />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-2">
              <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-ink" />Selesai {formatNumber(done.qty)} barang</span>
              {proses.qty > 0 && (
                <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-control" />Masih diproses {formatNumber(proses.qty)} barang</span>
              )}
              <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-line ring-1 ring-rule" />Batal {formatNumber(batal.qty)} barang</span>
            </div>
          </div>

          {est && done.qty > 0 && (
            <div className="space-y-3 rounded-2xl bg-tint p-4 sm:p-5">
              <p className="font-semibold">
                {allExact ? 'Untung' : 'Perkiraan untung'} dari pesanan {period} yang selesai
              </p>
              <div className="tear">
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
              <NotaTotal
                label={allExact ? 'Untung' : '≈ Perkiraan untung'}
                sub={<span className="text-warn">Belum dikurangi biaya (iklan, packaging, dll.)</span>}
                amount={formatRupiah(est.profit)}
                amountSub={<span className="text-ink-3">{formatPercent((est.profit / est.sales) * 100)} dari nilai penjualan</span>}
                tone={est.profit < 0 ? 'loss' : undefined}
              />
              {est.missingHpp > 0 && (
                <Alert tone="warning">
                  {formatNumber(est.missingHpp)} barang belum punya HPP, jadi modal di perkiraan ini belum lengkap.{' '}
                  {!readOnly && (
                    <button type="button" className={linkClass} onClick={() => navigate('hpp', { kosong: '1' })}>Isi HPP</button>
                  )}
                </Alert>
              )}
              <Why label="Kenapa beda dengan untung bersih di atas?">
                <p>Dua angka ini menghitung kelompok barang yang berbeda:</p>
                <p>
                  <strong>Untung bersih di atas</strong> = barang yang <strong>sampai & uangnya cair</strong> di {period}.
                  Ini angka pasti dari laporan Shopee.
                </p>
                <p>
                  <strong>Angka di sini</strong> = semua pesanan yang <strong>dibuat</strong> di {period} dan sudah
                  selesai, termasuk yang baru sampai bulan berikutnya.
                </p>
                {allExact ? (
                  <p>
                    Uang masuk tiap pesanan diambil dari laporan penghasilan Excel <strong>Sudah Dilepas</strong>, jadi
                    potongan Shopee-nya angka asli, bukan perkiraan.
                  </p>
                ) : (
                  <p>
                    {est.exact > 0 && (
                      <>
                        {formatNumber(est.exact)} dari {formatNumber(est.items)} barang memakai uang masuk asli dari
                        laporan Excel <strong>Sudah Dilepas</strong>.{' '}
                      </>
                    )}
                    Untuk {est.exact > 0 ? 'sisanya' : 'semua barang'}, laporan hanya mencatat uang cair per hari, jadi
                    potongan tiap pesanan dibagi sesuai nilai penjualannya. Karena itu disebut perkiraan. Upload laporan
                    penghasilan Excel <strong>Sudah Dilepas</strong> supaya angkanya pasti.
                  </p>
                )}
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

          <ScrollX>
            <table className="w-full min-w-[32rem] text-left">
              <thead className="border-b border-rule text-sm font-semibold text-ink-3">
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
                    <tr key={g.group} className="border-b border-line align-top">
                      <td className="py-3 pr-3 font-medium">
                        {GROUP_LABEL[g.group]}
                        {g.returned > 0 && (
                          <span className="block text-xs font-normal text-ink-3">{formatNumber(g.returned)} barang diretur</span>
                        )}
                        {g.group === 'batal' && (
                          <span className="block text-xs font-normal text-ink-3">tidak ada uang masuk</span>
                        )}
                      </td>
                      <td className="num py-3 pr-3 text-right">{formatNumber(g.orders)}</td>
                      <td className="num py-3 pr-3 text-right">{formatNumber(g.qty)}</td>
                      <td className={`num py-3 pr-3 text-right ${g.group === 'batal' ? 'text-ink-3' : ''}`}>
                        {formatRupiah(g.subtotal)}
                      </td>
                      <td className="num py-3 pr-3 text-right">
                        {g.group === 'batal' ? <span className="text-ink-3">tidak ada</span> : formatRupiah(g.modal)}
                      </td>
                    </tr>
                  ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-ink font-bold">
                  <td className="py-3 pr-3">Total</td>
                  <td className="num py-3 pr-3 text-right">{formatNumber(total.orders)}</td>
                  <td className="num py-3 pr-3 text-right">{formatNumber(total.qty)}</td>
                  <td className="num py-3 pr-3 text-right">{formatRupiah(total.subtotal)}</td>
                  <td className="num py-3 pr-3 text-right">{formatRupiah(total.modal)}</td>
                </tr>
              </tfoot>
            </table>
          </ScrollX>
          <p className="text-sm text-ink-2">
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

/** Uang masuk asli & untung satu produk (dari barang yang uangnya sudah ada di Excel "Sudah Dilepas"). */
function ProductIncomeLine({ r }: { r: ProductRow }) {
  const partial = r.itemsWithIncome < r.items
  return (
    <p className="text-sm num text-ink-2">
      Uang masuk {formatRupiah(r.income)}
      {r.profit !== null && (
        <>
          {' · '}
          <span className={r.profit < 0 ? 'font-semibold text-loss' : r.status === 'tipis' ? 'font-semibold text-ink' : 'font-semibold text-gain'}>
            Untung {formatRupiah(r.profit)}
            {r.margin !== null && ` (${formatPercent(r.margin * 100)})`}
          </span>
        </>
      )}
      {partial && ` · dari ${formatNumber(r.qtyWithIncome)} barang yang uangnya sudah ada di laporan`}
    </p>
  )
}

const SORTS: { id: ProductSort; label: string }[] = [
  { id: 'terlaris', label: 'Terlaris' },
  { id: 'untung', label: 'Paling untung' },
  { id: 'rugi', label: 'Rugi dulu' },
]

function ProductsTab({
  products,
  returned,
  period,
  sort,
  setSort,
}: {
  products: ProductRecap[]
  returned: ReturnedItem[]
  period: string
  sort: ProductSort
  setSort: (s: ProductSort) => void
}) {
  const all = useMemo(() => productRows(products), [products])
  const withIncome = all.filter((r) => r.itemsWithIncome > 0)
  // Tanpa uang masuk asli (laporan PDF), urutan untung/rugi tidak bisa dihitung.
  const canSort = withIncome.some((r) => r.profit !== null)
  const rows = useMemo(() => sortProducts(all, canSort ? sort : 'terlaris'), [all, sort, canSort])
  const max = Math.max(1, ...rows.map((r) => r.qty))
  const totalQty = rows.reduce((n, r) => n + r.qty, 0)
  const totalModal = rows.reduce((n, r) => n + r.modal, 0)
  const totalIncome = withIncome.reduce((n, r) => n + r.income, 0)
  const totalProfit = withIncome.reduce((n, r) => n + (r.profit ?? 0), 0)
  const readOnly = useContext(ReadOnlyContext)

  return (
    <section className="space-y-4 rounded-3xl bg-paper p-5 shadow-sheet ring-1 ring-line sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-bold tracking-tight">Barang terjual per produk</h2>
          <p className="mt-1 text-sm text-ink-2">
            Barang yang sampai & uangnya cair di {period}. Paket grosir dihitung per paket, sama seperti di Shopee.
          </p>
          {withIncome.length > 0 && (
            <p className="mt-1 text-sm text-ink-2">
              <strong className="text-ink">Uang masuk</strong> dan <strong className="text-ink">untung</strong> per produk
              diambil dari laporan Excel Sudah Dilepas (potongan Shopee asli), belum dikurangi biaya iklan, packaging, dll.
            </p>
          )}
        </div>
        {canSort && rows.length > 1 && (
          <div role="group" aria-label="Urutkan produk" className="flex flex-wrap items-center gap-1 rounded-full bg-tint p-1 ring-1 ring-line">
            <span className="px-2 text-sm text-ink-2">Urutkan:</span>
            {SORTS.map((o) => (
              <button
                key={o.id}
                type="button"
                aria-pressed={sort === o.id}
                onClick={() => setSort(o.id)}
                className={`min-h-11 rounded-full px-4 text-sm font-semibold transition-colors duration-150 ${
                  sort === o.id ? (o.id === 'rugi' ? 'bg-loss text-white' : 'bg-ink text-paper') : 'text-ink-2 hover:text-ink'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-ink-2">Belum ada barang terjual di {period}.</p>
      ) : (
        <div>
          {rows.map((r) => (
            <div key={r.sku} className="space-y-1.5 border-b border-line py-3">
              <div className="grid grid-cols-[1fr_auto] items-baseline gap-3">
                <span className="min-w-0">
                  <span className="line-clamp-2 font-semibold">
                    {r.name}
                    {r.status === 'rugi' && (
                      <span className="ml-2 inline-block rounded-full bg-loss-tint px-2 py-0.5 align-middle text-xs font-bold text-loss">RUGI</span>
                    )}
                    {r.status === 'tipis' && (
                      <span className="ml-2 inline-block rounded-full bg-sun-tint px-2 py-0.5 align-middle text-xs font-bold text-warn">TIPIS</span>
                    )}
                  </span>
                  {r.variant && <span className="block text-sm text-ink-2">{r.variant}</span>}
                </span>
                <span className="whitespace-nowrap font-bold num">{formatNumber(r.qty)} barang</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-tint">
                <div className="h-full rounded-full bg-ink-2" style={{ width: `${(r.qty / max) * 100}%` }} />
              </div>
              <p className="text-sm num text-ink-2">
                {r.missing ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-warn">
                    <IconAlertCircle size={15} />
                    HPP belum diisi
                  </span>
                ) : (
                  `Modal ${formatRupiah(r.modal)}`
                )}
                {r.returned > 0 && ` · ${formatNumber(r.returned)} diretur`}
              </p>
              {r.itemsWithIncome > 0 && <ProductIncomeLine r={r} />}
              {r.status === 'rugi' && (
                <p className="text-sm text-warn">
                  Modal lebih besar dari uang yang masuk untuk produk ini.{' '}
                  {!readOnly && (
                    <button type="button" className={linkClass} onClick={() => navigate('simulasi')}>
                      Cek harga jual di Simulasi
                    </button>
                  )}
                </p>
              )}
            </div>
          ))}
          <div className="flex flex-wrap justify-between gap-2 pt-3 font-bold num">
            <span>Total {formatNumber(rows.length)} produk</span>
            <span>
              {formatNumber(totalQty)} barang · Modal {formatRupiah(totalModal)}
            </span>
          </div>
          {withIncome.length > 0 && (
            <p className="pt-1 text-right text-sm num text-ink-2">
              Uang masuk {formatRupiah(totalIncome)} · Untung {formatRupiah(totalProfit)}
              {withIncome.length < rows.length && ` (${formatNumber(withIncome.length)} dari ${formatNumber(rows.length)} produk)`}
            </p>
          )}
          {canSort && (
            <p className="pt-2 text-sm text-ink-3">
              <strong>RUGI</strong> = untung di bawah 0. <strong>TIPIS</strong> = untung di bawah{' '}
              {formatPercent(THIN_MARGIN * 100)} dari uang masuk.
            </p>
          )}
        </div>
      )}

      {returned.length > 0 && (
        <details className="rounded-2xl bg-tint p-4">
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-semibold">
            Barang retur ({formatNumber(returned.length)})
            <IconChevronDown size={16} className="chev" />
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-sm">
            {returned.map((r) => (
              <li key={r.order_no + r.sku}>
                {formatDate(r.completed_at)} · {r.order_no} · {r.product_name}
                {r.variant_name && ` (${r.variant_name})`} · retur {r.returned_qty} dari {r.qty}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-ink-2">Barang retur tidak dihitung sebagai modal.</p>
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
  const readOnly = useContext(ReadOnlyContext)
  return (
    <section className="rounded-3xl bg-paper p-5 shadow-sheet ring-1 ring-line sm:p-7">
      <ScrollX>
        <table className="w-full min-w-[40rem] text-left">
          <thead className="border-b border-rule text-sm font-semibold text-ink-3">
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
                <tr key={m.month} className="border-b border-line">
                  <td className="py-3 pr-3 font-semibold">
                    {formatMonth(m.month)}
                    <Stamp tone={final ? 'final' : 'warn'} tilt={false} size="xs" className="ml-2">
                      {final ? 'Final' : 'Belum lengkap'}
                    </Stamp>
                  </td>
                  <td className="num py-3 pr-3 text-right">{formatRupiah(Number(m.total_income))}</td>
                  <td className="num py-3 pr-3 text-right">{formatRupiah(Number(m.total_modal))}</td>
                  <td className="num py-3 pr-3 text-right">
                    {Number(m.expense_entries) === 0 ? (
                      <span className="font-sans font-semibold text-warn">belum diisi</span>
                    ) : (
                      formatRupiah(Number(m.total_expenses))
                    )}
                  </td>
                  <td className={`num py-3 pr-3 text-right font-bold ${Number(m.net_profit) < 0 ? 'text-loss' : ''}`}>
                    {formatRupiah(Number(m.net_profit))}
                  </td>
                  <td className="num py-3 pr-3 text-right">{formatNumber(Number(m.total_qty))}</td>
                  <td className="py-3 text-right">
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => onRecalc(m.month)}
                        className={`${linkClass} min-h-11 whitespace-nowrap px-2 text-sm`}
                      >
                        Hitung ulang HPP
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </ScrollX>
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
  const titleId = useId()
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
    <Modal labelledBy={titleId} onClose={onCancel} dismissible={!busy}>
      <h2 id={titleId} className="font-display text-2xl font-extrabold tracking-tight">
        Hitung ulang HPP {formatMonth(month)}?
      </h2>
      <p className="mt-3 text-ink-2">
        Modal bulan ini memakai HPP yang terkunci saat pesanan selesai. Pilih cara menghitung ulang:
      </p>
      {error ? <div className="mt-4"><ErrorBox error={error} /></div> : null}
      <div className="mt-5 flex flex-col gap-3">
        <Button onClick={() => run(true)} disabled={busy}>
          {busy ? 'Menghitung…' : 'Isi yang HPP-nya kosong saja (disarankan)'}
        </Button>
        <Button variant="secondary" onClick={() => run(false)} disabled={busy}>
          Semua barang pakai HPP saat ini
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Batal
        </Button>
      </div>
      <p className="mt-4 text-sm text-ink-2">
        "Semua barang" mengganti HPP lama dengan HPP yang sekarang tercatat di halaman HPP, sehingga untung{' '}
        {formatMonth(month)} bisa berubah.
      </p>
    </Modal>
  )
}
