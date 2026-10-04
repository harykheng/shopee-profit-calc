import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { MonthPicker, StorePicker } from '../components/pickers'
import { Alert, Button, Card, ErrorBox, PageTitle, Spinner, Stat } from '../components/ui'
import {
  fetchMonthlyRecap,
  fetchProductRecap,
  fetchReconciliation,
  fetchReturnedItems,
  fetchOrdersByCreated,
  countItemsWithoutCreatedAt,
  recalcHpp,
} from '../lib/api'
import {
  addMonths,
  currentMonth,
  formatDate,
  formatMonth,
  formatNumber,
  formatPercent,
  formatRupiah,
} from '../lib/format'
import { navigate } from '../lib/router'
import { monthStatus, type MonthStatus } from '../lib/monthStatus'
import type {
  DailyReconciliation,
  MonthlyRecap,
  OrdersByCreated,
  ProductRecap,
  ReturnedItem,
  Store,
} from '../lib/types'

type Incoming = { rows: OrdersByCreated[]; withoutCreatedAt: number } | { error: unknown }

interface RecapData {
  months: MonthlyRecap[]
  products: ProductRecap[]
  reconciliation: DailyReconciliation[]
  returned: ReturnedItem[]
}

export function RecapPage({
  stores,
  storeId,
  onStoreChange,
}: {
  stores: Store[]
  storeId: number | null
  onStoreChange: (id: number) => void
}) {
  const lastMonth = addMonths(currentMonth(), -1)
  const [from, setFrom] = useState(lastMonth)
  const [to, setTo] = useState(lastMonth)
  const [data, setData] = useState<RecapData | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [recalcMonth, setRecalcMonth] = useState<string | null>(null)
  const [recalcResult, setRecalcResult] = useState<string | null>(null)
  const [incoming, setIncoming] = useState<Incoming | null>(null)

  const rangeValid = from <= to

  const load = useCallback(async () => {
    if (!storeId || !rangeValid) return
    setData(null)
    setError(null)
    setIncoming(null)
    try {
      const [months, products, reconciliation, returned] = await Promise.all([
        fetchMonthlyRecap(storeId, from, to),
        fetchProductRecap(storeId, from, to),
        fetchReconciliation(storeId, from, to),
        fetchReturnedItems(storeId, from, to),
      ])
      setData({ months, products, reconciliation, returned })
    } catch (e) {
      setError(e)
      return
    }
    // Tabel "Pesanan masuk" dimuat terpisah: kalau gagal (mis. SQL ke-3 belum
    // dijalankan), bagian profit tetap tampil.
    try {
      const [rows, withoutCreatedAt] = await Promise.all([
        fetchOrdersByCreated(storeId, from, to),
        countItemsWithoutCreatedAt(storeId),
      ])
      setIncoming({ rows, withoutCreatedAt })
    } catch (e) {
      setIncoming({ error: e })
    }
  }, [storeId, from, to, rangeValid])

  useEffect(() => {
    setRecalcResult(null)
    load()
  }, [load])

  const storeName = stores.find((s) => s.id === storeId)?.name ?? ''

  return (
    <>
      <PageTitle subtitle="Profit bersih = penghasilan dilepas − modal (HPP) − biaya.">Rekap</PageTitle>

      <Card className="mb-6">
        <div className="flex flex-col gap-4">
          <StorePicker stores={stores} value={storeId} onChange={onStoreChange} />
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            <MonthPicker value={from} onChange={setFrom} label="Dari" />
            <MonthPicker value={to} onChange={setTo} label="Sampai" />
          </div>
          {!rangeValid && <p className="text-lg text-red-700">Bulan "Dari" harus sebelum atau sama dengan "Sampai".</p>}
        </div>
      </Card>

      {recalcResult && (
        <div className="mb-6">
          <Alert tone="success">{recalcResult}</Alert>
        </div>
      )}

      {!rangeValid ? null : error ? (
        <ErrorBox error={error} />
      ) : !data ? (
        <Spinner />
      ) : data.months.length === 0 ? (
        <Alert tone="info" title="Belum ada data">
          Belum ada penghasilan, pesanan, atau biaya untuk {storeName} di periode ini.
        </Alert>
      ) : (
        <RecapContent data={data} onRecalc={setRecalcMonth} />
      )}

      {rangeValid && data && incoming && (
        <div className="mt-6">
          <IncomingOrdersCard incoming={incoming} from={from} to={to} />
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
                ? `Tidak ada item di ${formatMonth(recalcMonth)} yang perlu diperbarui.`
                : `HPP ${formatNumber(n)} item di ${formatMonth(recalcMonth)} sudah dihitung ulang.`,
            )
            await load()
          }}
        />
      )}
    </>
  )
}

function RecapContent({ data, onRecalc }: { data: RecapData; onRecalc: (month: string) => void }) {
  const totals = data.months.reduce(
    (t, m) => ({
      income: t.income + Number(m.total_income),
      adjustments: t.adjustments + Number(m.adjustments ?? 0),
      modal: t.modal + Number(m.total_modal),
      expenses: t.expenses + Number(m.total_expenses),
      profit: t.profit + Number(m.net_profit),
      qty: t.qty + Number(m.total_qty),
    }),
    { income: 0, adjustments: 0, modal: 0, expenses: 0, profit: 0, qty: 0 },
  )
  const qtyReturned = data.products.reduce((s, p) => s + Number(p.qty_returned), 0)
  const margin = totals.income > 0 ? (totals.profit / totals.income) * 100 : null
  const statuses = new Map(data.months.map((m) => [m.month, monthStatus(m, data.reconciliation)]))
  const allFinal = [...statuses.values()].every((s) => s.final)
  const profitTone = !allFinal ? 'warning' : totals.profit >= 0 ? 'good' : 'bad'

  return (
    <div className="space-y-6">
      {data.months.map((m) => (
        <MonthStatusCard key={m.month} month={m.month} status={statuses.get(m.month)!} onRecalc={onRecalc} />
      ))}

      <Card title={data.months.length > 1 ? 'Total periode' : formatMonth(data.months[0].month)}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Stat
            label="Penghasilan dilepas"
            value={formatRupiah(totals.income)}
            detail={totals.adjustments !== 0 ? `termasuk penyesuaian ${formatRupiah(totals.adjustments)}` : undefined}
          />
          <Stat label="Modal (HPP)" value={formatRupiah(totals.modal)} />
          <Stat label="Biaya" value={formatRupiah(totals.expenses)} />
          <Stat
            label="Profit bersih"
            value={formatRupiah(totals.profit)}
            tone={profitTone}
            note={allFinal ? undefined : 'Belum final — lihat status di atas'}
          />
          <Stat label="Margin" value={formatPercent(margin)} tone={allFinal ? undefined : 'warning'} />
          <Stat
            label="Qty terjual"
            value={`${formatNumber(totals.qty)} pcs`}
            detail={qtyReturned > 0 ? `sudah dikurangi retur ${formatNumber(qtyReturned)} pcs` : undefined}
          />
        </div>
      </Card>

      <Card title="Per bulan">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b text-sm text-slate-500">
              <tr>
                <th className="py-2 pr-3">Bulan</th>
                <th className="py-2 pr-3 text-right">Qty terjual</th>
                <th className="py-2 pr-3 text-right">Penghasilan</th>
                <th className="py-2 pr-3 text-right">Modal</th>
                <th className="py-2 pr-3 text-right">Biaya</th>
                <th className="py-2 pr-3 text-right">Profit bersih</th>
                <th className="py-2 pr-3 text-right">Margin</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {data.months.map((m) => (
                <tr key={m.month} className="border-b border-slate-100 tabular-nums">
                  <td className="py-3 pr-3 font-medium">
                    {formatMonth(m.month)}
                    <StatusBadge final={statuses.get(m.month)!.final} />
                  </td>
                  <td className="py-3 pr-3 text-right">{formatNumber(Number(m.total_qty))} pcs</td>
                  <td className="py-3 pr-3 text-right">
                    {formatRupiah(Number(m.total_income))}
                    {Number(m.adjustments ?? 0) !== 0 && (
                      <span className="block text-xs text-slate-500">
                        termasuk penyesuaian {formatRupiah(Number(m.adjustments))}
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-3 text-right">{formatRupiah(Number(m.total_modal))}</td>
                  <td className="py-3 pr-3 text-right">
                    {formatRupiah(Number(m.total_expenses))}
                    <ExpenseBreakdown m={m} />
                  </td>
                  <td className={`py-3 pr-3 text-right font-semibold ${Number(m.net_profit) < 0 ? 'text-red-700' : ''}`}>
                    {formatRupiah(Number(m.net_profit))}
                  </td>
                  <td className="py-3 pr-3 text-right">{formatPercent(m.margin_pct === null ? null : Number(m.margin_pct))}</td>
                  <td className="py-3 text-right">
                    <button
                      type="button"
                      onClick={() => onRecalc(m.month)}
                      className="min-h-12 whitespace-nowrap rounded-xl px-3 text-orange-700 underline"
                    >
                      Hitung ulang HPP
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <ReturnedItems items={data.returned} />
      <ProductTable products={data.products} />
    </div>
  )
}

function StatusBadge({ final }: { final: boolean }) {
  return final ? (
    <span className="ml-2 whitespace-nowrap rounded-lg bg-emerald-100 px-2 py-0.5 text-sm text-emerald-800">✅ Final</span>
  ) : (
    <span className="ml-2 whitespace-nowrap rounded-lg bg-amber-100 px-2 py-0.5 text-sm text-amber-900">⚠️ Belum lengkap</span>
  )
}

function ExpenseBreakdown({ m }: { m: MonthlyRecap }) {
  const parts = [
    ['Iklan Shopee', m.iklan_shopee],
    ['Meta Ads', m.meta_ads],
    ['Packaging', m.packaging],
    ['Lain-lain', m.lain_lain],
  ].filter(([, v]) => Number(v) > 0)
  if (Number(m.expense_entries) === 0) return <span className="block text-xs text-amber-700">belum diisi</span>
  if (parts.length === 0) return null
  return (
    <span className="block text-xs text-slate-500">
      {parts.map(([label, v]) => `${label} ${formatRupiah(Number(v))}`).join(' · ')}
    </span>
  )
}

const dayList = (days: string[]) => days.map((d) => formatDate(d)).join(', ')

/** Status per bulan: ✅ Angka final, atau ⚠️ Belum lengkap + daftar yang kurang. */
function MonthStatusCard({
  month,
  status,
  onRecalc,
}: {
  month: string
  status: MonthStatus
  onRecalc: (month: string) => void
}) {
  const label = formatMonth(month)
  const prev = formatMonth(addMonths(month, -1))

  const refundNote =
    status.refunds.days.length > 0 ? (
      <p className="mt-2 text-sm">
        ℹ️ Termasuk refund/pengembalian dana {formatRupiah(status.refunds.amount)} ({dayList(status.refunds.days)}) —
        sudah dihitung dari laporan Shopee.
      </p>
    ) : null

  if (status.final) {
    return (
      <Alert tone="success" title={`${label}: angka final`}>
        Semua data sudah lengkap. Profit bersih {label} di bawah adalah angka pasti.
        {refundNote}
      </Alert>
    )
  }

  const todo: ReactNode[] = []
  if (!status.hasIncome) {
    todo.push(
      <li key="income">
        <strong>Laporan penghasilan belum di-upload.</strong> Upload PDF penghasilan {label} di halaman Upload.
      </li>,
    )
  }
  if (status.missingOrders.days.length > 0) {
    todo.push(
      <li key="orders">
        <strong>Ada uang cair {formatRupiah(status.missingOrders.amount)} dari pesanan yang belum di-upload</strong>{' '}
        (tanggal {dayList(status.missingOrders.days)}). Biasanya ini pesanan yang dibuat bulan lalu. Upload export
        pesanan <strong>{prev}</strong> supaya modalnya ikut terhitung.
      </li>,
    )
  }
  if (status.hasIncome && status.ordersWithoutIncome.days.length > 0) {
    todo.push(
      <li key="noincome">
        <strong>{formatNumber(status.ordersWithoutIncome.orders)} pesanan selesai tidak ada di laporan penghasilan</strong>{' '}
        (tanggal {dayList(status.ordersWithoutIncome.days)}). Pastikan PDF yang di-upload adalah laporan {label} yang
        lengkap.
      </li>,
    )
  }
  if (status.missingHpp > 0) {
    todo.push(
      <li key="hpp">
        <strong>{formatNumber(status.missingHpp)} item belum punya HPP</strong>, jadi modalnya masih dihitung Rp0. Isi
        HPP-nya, lalu tekan "Hitung ulang HPP" untuk {label}.
        <div className="mt-2 flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => navigate('hpp', { kosong: '1' })}>Isi HPP</Button>
          <Button variant="secondary" onClick={() => onRecalc(month)}>Hitung ulang HPP</Button>
        </div>
      </li>,
    )
  }
  if (!status.expensesFilled) {
    todo.push(
      <li key="expenses">
        <strong>Biaya {label} belum diisi</strong> (iklan, packaging, dll.). Kalau memang tidak ada biaya, simpan saja
        dengan Rp0.
        <div className="mt-2">
          <Button variant="secondary" onClick={() => navigate('biaya', { bulan: month })}>Isi biaya</Button>
        </div>
      </li>,
    )
  }

  return (
    <Alert tone="warning" title={`${label}: belum lengkap — profit belum pasti`}>
      <ul className="mt-1 list-disc space-y-3 pl-5">{todo}</ul>
      {refundNote}
    </Alert>
  )
}

function ReturnedItems({ items }: { items: ReturnedItem[] }) {
  if (items.length === 0) return null
  return (
    <Card title={`Barang retur (${items.length} item)`}>
      <p className="mb-2 text-slate-600">Qty yang diretur tidak dihitung sebagai modal.</p>
      <ul className="list-disc pl-6">
        {items.slice(0, 50).map((r) => (
          <li key={r.order_no + r.sku}>
            {formatDate(r.completed_at)} · {r.order_no} · {r.product_name}
            {r.variant_name && ` — ${r.variant_name}`} · retur {r.returned_qty} dari {r.qty}
            {r.return_status && ` (${r.return_status})`}
          </li>
        ))}
      </ul>
    </Card>
  )
}

function ProductTable({ products }: { products: ProductRecap[] }) {
  // Gabungkan semua bulan dalam rentang per SKU.
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

  if (rows.length === 0) return null
  const total = rows.reduce(
    (t, r) => ({ qty: t.qty + r.qty, returned: t.returned + r.returned, modal: t.modal + r.modal }),
    { qty: 0, returned: 0, modal: 0 },
  )
  const anyMissing = rows.some((r) => r.missing)
  return (
    <Card title="Per produk">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="border-b text-sm text-slate-500">
            <tr>
              <th className="py-2 pr-3">Produk</th>
              <th className="py-2 pr-3 text-right">Qty terjual</th>
              <th className="py-2 pr-3 text-right">Retur</th>
              <th className="py-2 pr-3 text-right">Total modal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.sku} className={`border-b border-slate-100 tabular-nums ${r.missing ? 'bg-red-50' : ''}`}>
                <td className="py-3 pr-3">
                  <p className="font-medium">{r.name}</p>
                  {r.variant && <p className="text-sm text-slate-600">Variasi: {r.variant}</p>}
                </td>
                <td className="py-3 pr-3 text-right">{formatNumber(r.qty)}</td>
                <td className="py-3 pr-3 text-right">{r.returned > 0 ? formatNumber(r.returned) : '-'}</td>
                <td className="py-3 pr-3 text-right">
                  {r.missing ? <span className="font-semibold text-red-700">HPP kosong</span> : formatRupiah(r.modal)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 font-bold tabular-nums">
              <td className="py-3 pr-3">Total ({formatNumber(rows.length)} produk)</td>
              <td className="py-3 pr-3 text-right">{formatNumber(total.qty)} pcs</td>
              <td className="py-3 pr-3 text-right">{total.returned > 0 ? `${formatNumber(total.returned)} pcs` : '-'}</td>
              <td className="py-3 pr-3 text-right">
                {formatRupiah(total.modal)}
                {anyMissing && <span className="block text-xs font-semibold text-red-700">belum termasuk HPP kosong</span>}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  )
}

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
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-2xl font-bold">Hitung ulang HPP — {formatMonth(month)}</h2>
        <p className="mt-3 text-lg">
          Modal bulan ini dihitung dari HPP yang tersimpan saat upload. Pilih cara menghitung ulang:
        </p>
        {error ? <div className="mt-4"><ErrorBox error={error} /></div> : null}
        <div className="mt-5 flex flex-col gap-3">
          <Button onClick={() => run(true)} disabled={busy}>
            Isi yang HPP-nya kosong saja (disarankan)
          </Button>
          <Button variant="secondary" onClick={() => run(false)} disabled={busy}>
            Semua item pakai HPP terbaru
          </Button>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Batal
          </Button>
        </div>
        <p className="mt-4 text-sm text-slate-500">
          "Semua item" akan mengganti HPP lama dengan HPP saat ini, sehingga profit {formatMonth(month)} bisa berubah.
        </p>
      </div>
    </div>
  )
}

const GROUP_LABEL: Record<OrdersByCreated['status_group'], string> = {
  selesai: 'Selesai',
  proses: 'Masih diproses / dikirim',
  batal: 'Batal / belum bayar',
}

/** Tabel ke-2: semua pesanan berdasarkan tanggal pesanan DIBUAT, apa pun statusnya. */
function IncomingOrdersCard({ incoming, from, to }: { incoming: Incoming; from: string; to: string }) {
  const period = from === to ? formatMonth(from) : `${formatMonth(from)} – ${formatMonth(to)}`
  const title = `Pesanan masuk — ${period}`

  if ('error' in incoming) {
    return (
      <Card title={title}>
        <Alert tone="warning" title="Tabel ini belum aktif">
          Pengelola aplikasi perlu menjalankan file SQL <strong>20261005000000_all_order_statuses.sql</strong> di
          Supabase (lihat README). Bagian profit di atas tidak terpengaruh.
        </Alert>
      </Card>
    )
  }

  // Gabungkan semua bulan dalam rentang per kelompok status.
  const groups = (['selesai', 'proses', 'batal'] as const).map((g) => {
    const rows = incoming.rows.filter((r) => r.status_group === g)
    const sum = (f: (r: OrdersByCreated) => number) => rows.reduce((s, r) => s + f(r), 0)
    return {
      group: g,
      orders: sum((r) => Number(r.order_count)),
      qty: sum((r) => Number(r.qty)),
      returned: sum((r) => Number(r.qty_returned)),
      subtotal: sum((r) => Number(r.subtotal)),
      modal: sum((r) => Number(r.modal ?? 0)),
      modalReturned: sum((r) => Number(r.modal_returned ?? 0)),
      missingHpp: sum((r) => Number(r.items_missing_hpp)),
    }
  })
  const total = groups.reduce(
    (t, g) => ({
      orders: t.orders + g.orders,
      qty: t.qty + g.qty,
      subtotal: t.subtotal + g.subtotal,
      // Modal pesanan batal tidak dihitung: barangnya tidak keluar.
      modal: t.modal + (g.group === 'batal' ? 0 : g.modal),
      missingHpp: t.missingHpp + (g.group === 'batal' ? 0 : g.missingHpp),
    }),
    { orders: 0, qty: 0, subtotal: 0, modal: 0, missingHpp: 0 },
  )
  const selesai = groups[0]

  return (
    <Card title={title}>
      <p className="mb-4 text-slate-600">
        Semua pesanan yang <strong>dibuat</strong> di periode ini, apa pun statusnya. Ini untuk melihat penjualan;
        angka profit di atas tetap hanya dari pesanan yang <strong>sudah selesai & dananya cair</strong>.
      </p>

      {total.qty === 0 ? (
        <Alert tone="info">
          Belum ada data pesanan masuk di periode ini. Upload export pesanan dengan status <strong>Semua</strong>.
        </Alert>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b text-sm text-slate-500">
              <tr>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3 text-right">Pesanan</th>
                <th className="py-2 pr-3 text-right">Qty</th>
                <th className="py-2 pr-3 text-right">Nilai penjualan</th>
                <th className="py-2 pr-3 text-right">Modal (perkiraan)</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.group} className="border-b border-slate-100 tabular-nums">
                  <td className="py-3 pr-3 font-medium">{GROUP_LABEL[g.group]}</td>
                  <td className="py-3 pr-3 text-right">{formatNumber(g.orders)}</td>
                  <td className="py-3 pr-3 text-right">
                    {formatNumber(g.qty)} pcs
                    {g.returned > 0 && (
                      <span className="block text-xs text-slate-500">termasuk retur {formatNumber(g.returned)} pcs</span>
                    )}
                  </td>
                  <td className="py-3 pr-3 text-right">{formatRupiah(g.subtotal)}</td>
                  <td className="py-3 pr-3 text-right">
                    {g.group === 'batal' ? (
                      <span className="text-slate-400">tidak dihitung</span>
                    ) : (
                      <>
                        {formatRupiah(g.modal)}
                        {g.modalReturned > 0 && (
                          <span className="block text-xs text-slate-500">
                            termasuk retur {formatRupiah(g.modalReturned)}
                          </span>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 font-bold tabular-nums">
                <td className="py-3 pr-3">Total semua pesanan</td>
                <td className="py-3 pr-3 text-right">{formatNumber(total.orders)}</td>
                <td className="py-3 pr-3 text-right">{formatNumber(total.qty)} pcs</td>
                <td className="py-3 pr-3 text-right">{formatRupiah(total.subtotal)}</td>
                <td className="py-3 pr-3 text-right">{formatRupiah(total.modal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="mt-4 space-y-3 text-sm text-slate-600">
        {selesai.returned > 0 && (
          <p>
            Retur dihitung di baris Selesai. Qty bersih (tanpa retur) yang selesai:{' '}
            <strong>{formatNumber(selesai.qty - selesai.returned)} pcs</strong>.
          </p>
        )}
        <p>
          Modal pesanan batal tidak dihitung karena barangnya tidak keluar. Modal memakai HPP saat ini untuk pesanan
          yang belum selesai, jadi sifatnya perkiraan.
        </p>
        {total.missingHpp > 0 && (
          <Alert tone="warning">
            {formatNumber(total.missingHpp)} item belum punya HPP, jadi modal di tabel ini belum lengkap.{' '}
            <button type="button" className="underline" onClick={() => navigate('hpp', { kosong: '1' })}>
              Isi HPP
            </button>
          </Alert>
        )}
        {incoming.withoutCreatedAt > 0 && (
          <Alert tone="info">
            {formatNumber(incoming.withoutCreatedAt)} item di-upload sebelum tabel ini ada, jadi belum punya tanggal
            pesanan dibuat dan belum ikut terhitung di sini. Upload ulang export pesanannya (status <strong>Semua</strong>)
            — data tidak akan dobel.
          </Alert>
        )}
      </div>
    </Card>
  )
}
