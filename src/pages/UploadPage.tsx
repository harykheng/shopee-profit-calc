import { useState, type ChangeEvent } from 'react'
import { StorePicker } from '../components/pickers'
import { Alert, Button, Card, ErrorBox, PageTitle, Spinner } from '../components/ui'
import { fetchProducts, saveIncome, saveOrderItems } from '../lib/api'
import { navigate } from '../lib/router'
import { formatDate, formatDateTime, formatNumber, formatRupiah } from '../lib/format'
import { ParseError, type ParseWarning } from '../lib/parsers/common'
import type { IncomeParseResult } from '../lib/parsers/income'
import type { OrdersParseResult } from '../lib/parsers/orders'
import type { Product, Store, UpsertCounts } from '../lib/types'

type Parsed<T> = { fileName: string; result?: T; error?: unknown; loading?: boolean }

interface SaveSummary {
  storeName: string
  orders?: { inserted: number; updated: number; unchanged: number; skipped: number; newProducts: number }
  income?: UpsertCounts & { totalIncome: number }
  missingHpp: Product[]
}

const PREVIEW_ROWS = 10

export function UploadPage({
  stores,
  storeId,
  onStoreChange,
}: {
  stores: Store[]
  storeId: number | null
  onStoreChange: (id: number) => void
}) {
  const [orders, setOrders] = useState<Parsed<OrdersParseResult> | null>(null)
  const [income, setIncome] = useState<Parsed<IncomeParseResult> | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<unknown>(null)
  const [summary, setSummary] = useState<SaveSummary | null>(null)
  const [inputKey, setInputKey] = useState(0)

  const store = stores.find((s) => s.id === storeId) ?? null

  const onOrdersFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSummary(null)
    setOrders({ fileName: file.name, loading: true })
    try {
      if (/\.pdf$/i.test(file.name)) {
        throw new ParseError(
          'Ini file PDF. Untuk export pesanan, pilih file Excel (.xlsx) dari Pesanan Saya → Export. ' +
            'File PDF laporan penghasilan di-upload di kotak "Laporan penghasilan (PDF)".',
        )
      }
      const { parseOrdersFile } = await import('../lib/parsers/orders')
      const result = parseOrdersFile(await file.arrayBuffer())
      setOrders({ fileName: file.name, result })
    } catch (error) {
      setOrders({ fileName: file.name, error })
    }
  }

  const onIncomeFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSummary(null)
    setIncome({ fileName: file.name, loading: true })
    try {
      if (/\.xlsx?$/i.test(file.name)) {
        throw new ParseError(
          'Ini file Excel. Untuk laporan penghasilan, pilih file PDF "Catatan Transaksi Penghasilan". ' +
            'File Excel export pesanan di-upload di kotak "Export pesanan (Excel)".',
        )
      }
      const { parseIncomeFile } = await import('../lib/parsers/incomeFile')
      const result = await parseIncomeFile(await file.arrayBuffer())
      setIncome({ fileName: file.name, result })
    } catch (error) {
      setIncome({ fileName: file.name, error })
    }
  }

  const reset = () => {
    setOrders(null)
    setIncome(null)
    setSummary(null)
    setSaveError(null)
    setInputKey((k) => k + 1)
  }

  const canSave = Boolean(store && (orders?.result || income?.result)) && !saving

  const save = async () => {
    if (!store) return
    setSaving(true)
    setSaveError(null)
    try {
      const out: SaveSummary = { storeName: store.name, missingHpp: [] }
      if (orders?.result) {
        const r = orders.result
        const counts = await saveOrderItems(store.id, r.items)
        const skipped = Object.values(r.skipped.byStatus).reduce((a, b) => a + b, 0) + r.skipped.invalid
        out.orders = { ...counts, skipped }
        const uploadedSkus = new Set(r.items.map((i) => i.sku))
        out.missingHpp = (await fetchProducts(store.id)).filter((p) => p.hpp === null && uploadedSkus.has(p.sku))
      }
      if (income?.result) {
        const counts = await saveIncome(store.id, income.result.days)
        out.income = { ...counts, totalIncome: income.result.totalIncome }
      }
      setSummary(out)
      setOrders(null)
      setIncome(null)
      setInputKey((k) => k + 1)
    } catch (error) {
      setSaveError(error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageTitle subtitle="Upload export pesanan dan/atau laporan penghasilan dari Shopee.">Upload</PageTitle>

      <Card title="1. Pilih toko" className="mb-6">
        <StorePicker stores={stores} value={storeId} onChange={onStoreChange} />
      </Card>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card title="2a. Export pesanan (Excel)">
          <p className="mb-3 text-slate-600">Seller Centre → Pesanan Saya → Export. File .xlsx</p>
          <FileInput key={`o${inputKey}`} accept=".xlsx,.xls" onChange={onOrdersFile} />
          <OrdersPreview parsed={orders} />
        </Card>
        <Card title="2b. Laporan penghasilan (PDF)">
          <p className="mb-3 text-slate-600">Keuangan → Penghasilan Saya → laporan bulanan. File .pdf</p>
          <FileInput key={`i${inputKey}`} accept=".pdf,application/pdf" onChange={onIncomeFile} />
          <IncomePreview parsed={income} store={store} />
        </Card>
      </div>

      {(orders?.result || income?.result) && (
        <Card title="3. Simpan" className="mb-6">
          <p className="mb-4 text-lg">
            Data akan disimpan ke toko <strong>{store?.name ?? '(belum dipilih)'}</strong>. Upload file yang sama dua
            kali aman — data tidak akan dobel.
          </p>
          {saveError ? <div className="mb-4"><ErrorBox error={saveError} /></div> : null}
          <div className="flex flex-wrap gap-3">
            <Button onClick={save} disabled={!canSave}>
              {saving ? 'Menyimpan…' : `Simpan ke ${store?.name ?? 'toko'}`}
            </Button>
            <Button variant="secondary" onClick={reset} disabled={saving}>
              Batal
            </Button>
          </div>
        </Card>
      )}

      {summary && <SaveSummaryCard summary={summary} onAgain={reset} />}
    </>
  )
}

function FileInput({ accept, onChange }: { accept: string; onChange: (e: ChangeEvent<HTMLInputElement>) => void }) {
  const [name, setName] = useState('')
  return (
    <label className="flex cursor-pointer flex-wrap items-center gap-4 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-4 hover:border-orange-400">
      <span className="flex min-h-12 items-center rounded-xl bg-orange-600 px-5 text-lg font-semibold text-white">
        Pilih file
      </span>
      <span className="min-w-0 flex-1 truncate text-lg text-slate-600">{name || 'Belum ada file dipilih'}</span>
      <input
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => {
          setName(e.target.files?.[0]?.name ?? '')
          onChange(e)
        }}
      />
    </label>
  )
}

function Warnings({ warnings }: { warnings: ParseWarning[] }) {
  if (warnings.length === 0) return null
  return (
    <div className="mt-4 space-y-3">
      {warnings.map((w) => (
        <Alert key={w.code} tone="warning">
          <p>{w.message}</p>
          {w.examples && w.examples.length > 0 && (
            <p className="mt-1 text-sm opacity-80">Contoh: {w.examples.slice(0, 3).join('; ')}</p>
          )}
        </Alert>
      ))}
    </div>
  )
}

function OrdersPreview({ parsed }: { parsed: Parsed<OrdersParseResult> | null }) {
  const [showAll, setShowAll] = useState(false)
  if (!parsed) return null
  if (parsed.loading) return <Spinner label="Membaca file…" />
  if (parsed.error) return <div className="mt-4"><ErrorBox error={parsed.error} /></div>
  const r = parsed.result!
  const skippedEntries = Object.entries(r.skipped.byStatus)
  const rows = showAll ? r.items : r.items.slice(0, PREVIEW_ROWS)
  return (
    <div className="mt-4">
      <Alert tone="success" title={parsed.fileName}>
        {formatNumber(r.items.length)} item dari {formatNumber(r.orderCount)} pesanan selesai siap disimpan.
        {skippedEntries.length > 0 && (
          <> Dilewati: {skippedEntries.map(([s, n]) => `${s} (${n})`).join(', ')}.</>
        )}
      </Alert>
      <Warnings warnings={r.warnings} />
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b text-slate-500">
            <tr>
              <th className="py-2 pr-3">No. pesanan</th>
              <th className="py-2 pr-3">Produk</th>
              <th className="py-2 pr-3 text-right">Qty</th>
              <th className="py-2 pr-3">Selesai</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.order_no + i.sku} className="border-b border-slate-100 align-top">
                <td className="py-2 pr-3 font-mono text-xs">{i.order_no}</td>
                <td className="py-2 pr-3">
                  {i.product_name}
                  {i.variant_name && <span className="text-slate-500"> — {i.variant_name}</span>}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {i.qty}
                  {i.returned_qty > 0 && <span className="block text-xs text-amber-700">retur {i.returned_qty}</span>}
                </td>
                <td className="whitespace-nowrap py-2 pr-3">{formatDateTime(i.completed_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {r.items.length > PREVIEW_ROWS && (
        <button type="button" className="mt-2 min-h-12 text-lg text-orange-700 underline" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Tampilkan lebih sedikit' : `Tampilkan semua (${r.items.length})`}
        </button>
      )}
    </div>
  )
}

function normalizeName(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function IncomePreview({ parsed, store }: { parsed: Parsed<IncomeParseResult> | null; store: Store | null }) {
  if (!parsed) return null
  if (parsed.loading) return <Spinner label="Membaca file…" />
  if (parsed.error) return <div className="mt-4"><ErrorBox error={parsed.error} /></div>
  const r = parsed.result!
  const shopMismatch =
    store &&
    r.shopName &&
    !normalizeName(r.shopName).includes(normalizeName(store.name)) &&
    !normalizeName(store.name).includes(normalizeName(r.shopName))
  return (
    <div className="mt-4">
      <Alert tone="success" title={parsed.fileName}>
        Periode {formatDate(r.periodStart)} – {formatDate(r.periodEnd)}: {r.days.length} hari dana dilepas, total
        penghasilan <strong>{formatRupiah(r.totalIncome)}</strong>.
      </Alert>
      {shopMismatch && (
        <div className="mt-4">
          <Alert tone="warning" title="Nama toko berbeda">
            Nama toko di PDF: <strong>{r.shopName}</strong>. Toko yang dipilih: <strong>{store!.name}</strong>. Pastikan
            toko yang dipilih sudah benar sebelum menyimpan.
          </Alert>
        </div>
      )}
      {r.summary.pengembalianDana ? (
        <div className="mt-4">
          <Alert tone="info">Pengembalian dana (refund) bulan ini: {formatRupiah(r.summary.pengembalianDana)}</Alert>
        </div>
      ) : null}
      <Warnings warnings={r.warnings} />
      <div className="mt-4 max-h-96 overflow-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 border-b bg-white text-slate-500">
            <tr>
              <th className="py-2 pr-3">Tanggal dana dilepas</th>
              <th className="py-2 pr-3 text-right">Subtotal pesanan</th>
              <th className="py-2 pr-3 text-right">Penghasilan</th>
            </tr>
          </thead>
          <tbody>
            {r.days.map((d) => (
              <tr key={d.released_date} className="border-b border-slate-100">
                <td className="py-2 pr-3">{formatDate(d.released_date)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{formatRupiah(d.subtotal_pesanan)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{formatRupiah(d.total_income)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td className="py-2 pr-3">Total</td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {formatRupiah(r.days.reduce((s, d) => s + d.subtotal_pesanan, 0))}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">{formatRupiah(r.totalIncome)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

function SaveSummaryCard({ summary, onAgain }: { summary: SaveSummary; onAgain: () => void }) {
  const { orders, income, missingHpp } = summary
  return (
    <Card title={`Berhasil disimpan ke ${summary.storeName}`} className="mb-6 border-emerald-300">
      <div className="grid gap-4 md:grid-cols-2">
        {orders && (
          <div className="rounded-xl bg-slate-50 p-4 text-lg">
            <p className="font-semibold">Item pesanan</p>
            <ul className="mt-2 space-y-1">
              <li>Baru: <strong>{formatNumber(orders.inserted)}</strong></li>
              <li>Diperbarui: <strong>{formatNumber(orders.updated)}</strong></li>
              <li>Sudah ada, tidak berubah: <strong>{formatNumber(orders.unchanged)}</strong></li>
              <li>Dilewati (belum selesai / batal / data rusak): <strong>{formatNumber(orders.skipped)}</strong></li>
            </ul>
          </div>
        )}
        {income && (
          <div className="rounded-xl bg-slate-50 p-4 text-lg">
            <p className="font-semibold">Penghasilan per hari</p>
            <ul className="mt-2 space-y-1">
              <li>Baru: <strong>{formatNumber(income.inserted)}</strong></li>
              <li>Diperbarui: <strong>{formatNumber(income.updated)}</strong></li>
              <li>Sudah ada, tidak berubah: <strong>{formatNumber(income.unchanged)}</strong></li>
              <li>Total penghasilan di file: <strong>{formatRupiah(income.totalIncome)}</strong></li>
            </ul>
          </div>
        )}
      </div>

      {orders && missingHpp.length > 0 && (
        <div className="mt-4">
          <Alert tone="error" title={`${missingHpp.length} produk belum punya HPP`}>
            <p>Modal untuk produk ini belum bisa dihitung. Isi HPP-nya supaya profit akurat.</p>
            <ul className="mt-2 list-disc pl-6">
              {missingHpp.slice(0, 15).map((p) => (
                <li key={p.id}>
                  {p.product_name}
                  {p.variant_name && ` — ${p.variant_name}`}
                </li>
              ))}
              {missingHpp.length > 15 && <li>…dan {missingHpp.length - 15} lainnya</li>}
            </ul>
            <Button className="mt-3" variant="danger" onClick={() => navigate('hpp', { kosong: '1' })}>
              Isi HPP sekarang
            </Button>
          </Alert>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        <Button variant="secondary" onClick={onAgain}>Upload file lain</Button>
        <Button variant="secondary" onClick={() => navigate('rekap')}>Lihat rekap</Button>
      </div>
    </Card>
  )
}
