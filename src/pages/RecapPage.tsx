import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { MonthPicker, StorePicker } from '../components/pickers'
import { Alert, Button, Card, ErrorBox, PageTitle, Spinner, Stat } from '../components/ui'
import {
  fetchMonthlyRecap,
  fetchProductRecap,
  fetchReconciliation,
  fetchReturnedItems,
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
import type { DailyReconciliation, MonthlyRecap, ProductRecap, ReturnedItem, Store } from '../lib/types'

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

  const rangeValid = from <= to

  const load = useCallback(async () => {
    if (!storeId || !rangeValid) return
    setData(null)
    setError(null)
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
      modal: t.modal + Number(m.total_modal),
      expenses: t.expenses + Number(m.total_expenses),
      profit: t.profit + Number(m.net_profit),
    }),
    { income: 0, modal: 0, expenses: 0, profit: 0 },
  )
  const margin = totals.income > 0 ? (totals.profit / totals.income) * 100 : null
  const inaccurate = data.months.some((m) => m.items_missing_hpp > 0)
  const profitTone = inaccurate ? 'warning' : totals.profit >= 0 ? 'good' : 'bad'

  return (
    <div className="space-y-6">
      <RecapWarnings data={data} onRecalc={onRecalc} />

      <Card title={data.months.length > 1 ? 'Total periode' : formatMonth(data.months[0].month)}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat label="Penghasilan dilepas" value={formatRupiah(totals.income)} />
          <Stat label="Modal (HPP)" value={formatRupiah(totals.modal)} />
          <Stat label="Biaya" value={formatRupiah(totals.expenses)} />
          <Stat
            label="Profit bersih"
            value={formatRupiah(totals.profit)}
            tone={profitTone}
            note={inaccurate ? 'Belum akurat: ada HPP kosong' : undefined}
          />
          <Stat label="Margin" value={formatPercent(margin)} tone={inaccurate ? 'warning' : undefined} />
        </div>
      </Card>

      <Card title="Per bulan">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b text-sm text-slate-500">
              <tr>
                <th className="py-2 pr-3">Bulan</th>
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
                    {m.items_missing_hpp > 0 && (
                      <span className="ml-2 rounded-lg bg-red-100 px-2 py-0.5 text-sm text-red-800">HPP kosong</span>
                    )}
                  </td>
                  <td className="py-3 pr-3 text-right">{formatRupiah(Number(m.total_income))}</td>
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

      <ProductTable products={data.products} />
    </div>
  )
}

function ExpenseBreakdown({ m }: { m: MonthlyRecap }) {
  const parts = [
    ['Iklan Shopee', m.iklan_shopee],
    ['Meta Ads', m.meta_ads],
    ['Packaging', m.packaging],
    ['Lain-lain', m.lain_lain],
  ].filter(([, v]) => Number(v) > 0)
  if (parts.length === 0) return <span className="block text-xs text-amber-700">belum diisi</span>
  return (
    <span className="block text-xs text-slate-500">
      {parts.map(([label, v]) => `${label} ${formatRupiah(Number(v))}`).join(' · ')}
    </span>
  )
}

function RecapWarnings({ data, onRecalc }: { data: RecapData; onRecalc: (month: string) => void }) {
  const byMonth = new Map<string, DailyReconciliation[]>()
  for (const d of data.reconciliation) {
    const list = byMonth.get(d.month) ?? []
    list.push(d)
    byMonth.set(d.month, list)
  }

  const alerts: ReactNode[] = []
  for (const m of data.months) {
    const days = byMonth.get(m.month) ?? []
    const label = formatMonth(m.month)

    if (m.items_missing_hpp > 0) {
      alerts.push(
        <Alert key={`hpp-${m.month}`} tone="error" title={`${label}: ${m.items_missing_hpp} item belum punya HPP — profit belum akurat`}>
          <p>Modal item ini dihitung Rp0, jadi profit terlihat lebih besar dari sebenarnya.</p>
          <p className="mt-1">Isi HPP-nya dulu, lalu tekan "Hitung ulang HPP" untuk bulan ini.</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Button variant="danger" onClick={() => navigate('hpp', { kosong: '1' })}>Isi HPP</Button>
            <Button variant="secondary" onClick={() => onRecalc(m.month)}>Hitung ulang HPP</Button>
          </div>
        </Alert>,
      )
    }

    const missingOrders = days.filter((d) => d.has_income && d.difference > 0)
    if (missingOrders.length > 0) {
      const amount = missingOrders.reduce((s, d) => s + Number(d.difference), 0)
      alerts.push(
        <Alert key={`mo-${m.month}`} tone="warning" title={`${label}: ada dana cair yang data pesanannya belum di-upload`}>
          <p>
            Dana senilai {formatRupiah(amount)} (subtotal pesanan) cair di tanggal{' '}
            {missingOrders.map((d) => formatDate(d.day)).join(', ')}, tapi pesanannya tidak ditemukan. Modalnya belum
            terhitung, jadi profit terlihat lebih besar.
          </p>
          <p className="mt-1">
            Biasanya ini pesanan yang dibuat bulan sebelumnya — upload export pesanan{' '}
            <strong>{formatMonth(addMonths(m.month, -1))}</strong>.
          </p>
        </Alert>,
      )
    }

    const missingIncome = days.filter((d) => d.has_orders && !d.has_income)
    if (missingIncome.length > 0) {
      alerts.push(
        <Alert key={`mi-${m.month}`} tone="warning" title={`${label}: ada pesanan selesai tanpa data penghasilan`}>
          {formatNumber(missingIncome.reduce((s, d) => s + d.order_count, 0))} pesanan selesai di tanggal{' '}
          {missingIncome.map((d) => formatDate(d.day)).join(', ')}, tapi penghasilannya belum ada. Upload laporan
          penghasilan (PDF) {label} kalau sudah tersedia.
        </Alert>,
      )
    }

    const refunds = days.filter((d) => d.has_income && d.has_orders && d.difference < 0)
    if (refunds.length > 0) {
      const amount = refunds.reduce((s, d) => s + Number(d.difference), 0)
      alerts.push(
        <Alert key={`rf-${m.month}`} tone="info" title={`${label}: pengembalian dana / refund ${formatRupiah(amount)}`}>
          Di tanggal {refunds.map((d) => formatDate(d.day)).join(', ')} dana yang cair lebih kecil dari nilai pesanan.
          Ini wajar kalau ada retur/refund; penghasilan sudah memakai angka dari laporan Shopee.
        </Alert>,
      )
    }

    if (Number(m.total_income) === 0 && days.length === 0) {
      alerts.push(
        <Alert key={`ni-${m.month}`} tone="warning" title={`${label}: belum ada data penghasilan`}>
          Upload laporan penghasilan (PDF) {label} supaya profit bisa dihitung.
        </Alert>,
      )
    }
  }

  if (data.returned.length > 0) {
    alerts.push(
      <Alert key="returned" tone="info" title={`${data.returned.length} item dengan barang retur`}>
        <p>Qty yang diretur tidak dihitung sebagai modal.</p>
        <ul className="mt-2 list-disc pl-6 text-sm">
          {data.returned.slice(0, 20).map((r) => (
            <li key={r.order_no + r.sku}>
              {formatDate(r.completed_at)} · {r.order_no} · {r.product_name}
              {r.variant_name && ` — ${r.variant_name}`} · retur {r.returned_qty} dari {r.qty}
              {r.return_status && ` (${r.return_status})`}
            </li>
          ))}
        </ul>
      </Alert>,
    )
  }

  if (alerts.length === 0) return null
  return <div className="space-y-3">{alerts}</div>
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
