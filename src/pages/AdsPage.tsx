import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react'
import { Alert, Button, Card, ErrorBox, PageTitle, Spinner, selectClass } from '../components/ui'
import {
  fetchAdReports,
  fetchAdRows,
  fetchIncomeDays,
  fetchItemsCreatedBetween,
  fetchProducts,
  findAdShopElsewhere,
  saveAdReport,
  saveAdsExpense,
} from '../lib/api'
import {
  ADS_TARGET_PROFIT,
  DEFAULT_FEE_RATE,
  PRICE_TARGET_MARGIN,
  analyzeAds,
  feeRateFromIncome,
  fullMonthOf,
  productKey,
  type AdProductResult,
  type AdVerdict,
  type AdsAnalysis,
} from '../lib/adsMath'
import { addMonths, formatDate, formatMonth, formatNumber, formatPercent, formatRupiah, monthEnd } from '../lib/format'
import { ParseError } from '../lib/parsers/common'
import { parseAdsCsv, type AdsParseResult } from '../lib/parsers/ads'
import { navigate } from '../lib/router'
import type { AdReport, Store } from '../lib/types'

type ParsedFile = { fileName: string; result?: AdsParseResult; error?: unknown }

/** File-file yang dipilih, dikelompokkan per periode. */
interface FileGroup {
  key: string
  start: string
  end: string
  files: AdsParseResult[]
  /** "YYYY-MM-01" kalau periodenya tepat 1 bulan penuh. */
  month: string | null
  /** Periode melewati lebih dari 1 bulan (mis. 1 Agu – 30 Sep). */
  multiMonth: boolean
  keseluruhan: AdsParseResult | undefined
  /** Jenis file yang dipilih dua kali untuk periode ini. */
  duplicate: string | undefined
}

interface SavedPeriod {
  key: string
  files: number
  replaced: number
  expense: { month: string; amount: number } | null
  skipped: 'weekly' | 'multi_month' | 'no_keseluruhan' | null
}

function groupFiles(results: AdsParseResult[]): FileGroup[] {
  const map = new Map<string, AdsParseResult[]>()
  for (const r of results) {
    const key = periodKey(r.periodStart, r.periodEnd)
    map.set(key, [...(map.get(key) ?? []), r])
  }
  return [...map.entries()]
    .map(([key, files]) => {
      const { periodStart: start, periodEnd: end } = files[0]
      const sources = files.map((f) => f.source)
      const dup = sources.find((x, i) => sources.indexOf(x) !== i)
      return {
        key,
        start,
        end,
        files,
        month: fullMonthOf(start, end),
        multiMonth: start.slice(0, 7) !== end.slice(0, 7),
        keseluruhan: files.find((f) => f.source === 'keseluruhan'),
        duplicate: dup ? files.find((f) => f.source === dup)?.sourceLabel : undefined,
      }
    })
    .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end))
}

/** Apa yang terjadi dengan Biaya untuk satu kelompok file. */
function expenseNote(g: FileGroup): { tone: 'info' | 'warning' | 'success'; text: ReactNode } {
  if (g.month && g.keseluruhan) {
    return {
      tone: 'success',
      text: (
        <>
          Biaya Iklan Shopee {formatMonth(g.month)} diisi otomatis: <strong>{formatRupiah(g.keseluruhan.totalSpend)}</strong>
        </>
      ),
    }
  }
  if (g.multiMonth) {
    return {
      tone: 'warning',
      text: (
        <>
          File ini berisi <strong>total beberapa bulan sekaligus</strong>. Shopee tidak memberi rincian per bulan, jadi
          angkanya tidak bisa dipecah dan Biaya tidak diisi. Untuk hasil per bulan, download data iklan per bulan (tanggal 1
          – akhir bulan), lalu pilih semua filenya sekaligus di sini.
        </>
      ),
    }
  }
  if (g.month) {
    return {
      tone: 'warning',
      text: (
        <>
          File <strong>Data Keseluruhan</strong> tidak ada, jadi Biaya Iklan Shopee {formatMonth(g.month)} belum diisi.
        </>
      ),
    }
  }
  return { tone: 'info', text: 'Bukan 1 bulan penuh: hanya untuk analisis, Biaya tidak diubah.' }
}

interface Period {
  key: string
  start: string
  end: string
  reports: AdReport[]
}

const periodKey = (start: string, end: string) => `${start}|${end}`

/** "1 Jul 2026 – 31 Jul 2026" → "1–31 Jul 2026" kalau bulan sama. */
function formatPeriod(start: string, end: string): string {
  const a = formatDate(start)
  const b = formatDate(end)
  if (start.slice(0, 7) === end.slice(0, 7)) return `${a.split(' ')[0]}–${b}`
  return `${a} – ${b}`
}

/** ROAS 1 desimal, gaya Indonesia: 10.38 → "10,4". */
function formatRoas(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '–'
  return new Intl.NumberFormat('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)
}

/** Target dibulatkan ke atas (lebih aman), mis. 11.53 → 11.6. */
const roundUp1 = (v: number) => Math.ceil(v * 10 - 1e-9) / 10
/** Harga dibulatkan ke atas ke ratusan. */
const roundUpPrice = (v: number) => Math.ceil(v / 100) * 100

const VERDICTS: Record<AdVerdict, { label: string; icon: string; pill: string; border: string }> = {
  takedown: { label: 'Takedown', icon: '🔴', pill: 'bg-red-100 text-red-800', border: 'border-red-300' },
  kurang: { label: 'ROAS terlalu kecil', icon: '🟠', pill: 'bg-amber-100 text-amber-900', border: 'border-amber-300' },
  hpp_kosong: { label: 'HPP belum diisi', icon: '⚪', pill: 'bg-slate-100 text-slate-700', border: 'border-slate-200' },
  hero: { label: 'Hero', icon: '⭐', pill: 'bg-emerald-100 text-emerald-800', border: 'border-emerald-300' },
  aman: { label: 'Aman', icon: '🟢', pill: 'bg-emerald-50 text-emerald-800', border: 'border-emerald-200' },
  belum_cukup: { label: 'Data belum cukup', icon: '⚪', pill: 'bg-slate-100 text-slate-700', border: 'border-slate-200' },
}

const VERDICT_ORDER: AdVerdict[] = ['takedown', 'kurang', 'hpp_kosong', 'hero', 'aman', 'belum_cukup']

export function AdsPage({ stores, storeId }: { stores: Store[]; storeId: number | null }) {
  const store = stores.find((s) => s.id === storeId) ?? null
  const [reports, setReports] = useState<AdReport[] | null>(null)
  const [reportsError, setReportsError] = useState<unknown>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!storeId) return
    let cancelled = false
    setReportsError(null)
    fetchAdReports(storeId)
      .then((list) => {
        if (cancelled) return
        setReports(list)
        setSelected((cur) =>
          cur && list.some((r) => periodKey(r.period_start, r.period_end) === cur)
            ? cur
            : list[0]
              ? periodKey(list[0].period_start, list[0].period_end)
              : null,
        )
      })
      .catch((e) => !cancelled && setReportsError(e))
    return () => {
      cancelled = true
    }
  }, [storeId, reloadKey])

  const periods = useMemo(() => {
    const map = new Map<string, Period>()
    for (const r of reports ?? []) {
      const key = periodKey(r.period_start, r.period_end)
      const p = map.get(key) ?? { key, start: r.period_start, end: r.period_end, reports: [] }
      p.reports.push(r)
      map.set(key, p)
    }
    return [...map.values()]
  }, [reports])

  const period = periods.find((p) => p.key === selected) ?? null

  return (
    <>
      <PageTitle subtitle="Upload data iklan Shopee, lalu lihat produk mana yang perlu dimatikan, dipertahankan, atau dinaikkan ROAS-nya.">
        Iklan — {store?.name ?? '-'}
      </PageTitle>

      <UploadCard
        store={store}
        stores={stores}
        onSaved={(key) => {
          setSelected(key)
          setReloadKey((k) => k + 1)
        }}
      />

      {reportsError ? (
        <ErrorBox error={reportsError} />
      ) : !reports ? (
        <Spinner />
      ) : periods.length === 0 ? (
        <Alert title="Belum ada data iklan untuk toko ini.">Upload file iklan di atas untuk mulai.</Alert>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <label htmlFor="ads-period" className="text-lg font-semibold">
              Periode iklan:
            </label>
            <select
              id="ads-period"
              value={selected ?? ''}
              onChange={(e) => setSelected(e.target.value)}
              className={selectClass}
            >
              {periods.map((p) => (
                <option key={p.key} value={p.key}>
                  {formatPeriod(p.start, p.end)}
                  {fullMonthOf(p.start, p.end) ? ' (1 bulan)' : ''}
                </option>
              ))}
            </select>
          </div>
          {period && store && <Analysis key={`${period.key}#${reloadKey}`} storeId={store.id} period={period} />}
        </>
      )}
    </>
  )
}

// --- Upload -------------------------------------------------------------------

function UploadCard({
  store,
  stores,
  onSaved,
}: {
  store: Store | null
  stores: Store[]
  onSaved: (periodKey: string) => void
}) {
  const [files, setFiles] = useState<ParsedFile[]>([])
  const [inputKey, setInputKey] = useState(0)
  const [elsewhere, setElsewhere] = useState<{ shop: string; storeName: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<unknown>(null)
  const [saved, setSaved] = useState<SavedPeriod[] | null>(null)

  const ok = files.filter((f) => f.result).map((f) => f.result as AdsParseResult)
  const groups = groupFiles(ok)
  const shopNames = new Set(ok.map((r) => r.shopName).filter(Boolean))
  const dup = groups.find((g) => g.duplicate)
  const problem = dup
    ? `Ada 2 file jenis "${dup.duplicate}" untuk periode ${formatPeriod(dup.start, dup.end)}. Pilih salah satu saja.`
    : null

  const onFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const list = [...(e.target.files ?? [])]
    if (list.length === 0) return
    setSaved(null)
    setSaveError(null)
    setElsewhere(null)
    const parsed: ParsedFile[] = []
    for (const file of list) {
      try {
        if (!/\.csv$/i.test(file.name)) {
          throw new ParseError('Pilih file .csv dari Iklan Saya → Download Data.')
        }
        parsed.push({ fileName: file.name, result: parseAdsCsv(await file.text()) })
      } catch (error) {
        parsed.push({ fileName: file.name, error })
      }
    }
    setFiles(parsed)
    const shop = parsed.find((p) => p.result?.shopName)?.result?.shopName
    if (shop && store) {
      try {
        const other = await findAdShopElsewhere(shop, store.id)
        const otherStore = stores.find((s) => s.id === other)
        if (otherStore) setElsewhere({ shop, storeName: otherStore.name })
      } catch {
        // Tabel belum ada / gagal cek: abaikan, error akan muncul saat simpan.
      }
    }
  }

  const reset = () => {
    setFiles([])
    setElsewhere(null)
    setSaveError(null)
    setInputKey((k) => k + 1)
  }

  const save = async () => {
    if (!store || groups.length === 0 || problem) return
    setSaving(true)
    setSaveError(null)
    try {
      const out: SavedPeriod[] = []
      for (const g of groups) {
        let replaced = 0
        for (const r of g.files) {
          const res = await saveAdReport(store.id, r)
          if (res.replaced) replaced++
        }
        let expense: SavedPeriod['expense'] = null
        if (g.month && g.keseluruhan) {
          await saveAdsExpense(
            store.id,
            g.month,
            g.keseluruhan.totalSpend,
            `Otomatis dari data iklan (upload ${formatDate(new Date().toISOString())})`,
          )
          expense = { month: g.month, amount: g.keseluruhan.totalSpend }
        }
        out.push({
          key: g.key,
          files: g.files.length,
          replaced,
          expense,
          skipped: expense ? null : g.multiMonth ? 'multi_month' : g.month ? 'no_keseluruhan' : 'weekly',
        })
      }
      setSaved(out)
      // Tampilkan periode yang paling baru.
      const latest = [...groups].sort((a, b) => b.end.localeCompare(a.end) || b.start.localeCompare(a.start))[0]
      onSaved(latest.key)
      reset()
    } catch (error) {
      setSaveError(error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card title="Upload data iklan (CSV)" className="mb-6">
      <details className="mb-4 rounded-xl bg-slate-50 p-4 text-slate-700">
        <summary className="cursor-pointer text-lg font-semibold">Cara ambil file dari Shopee</summary>
        <ol className="mt-3 list-decimal space-y-2 pl-6">
          <li>
            Seller Centre → <strong>Iklan Saya</strong> → <strong>Download Data</strong>.
          </li>
          <li>
            Pilih periode: <strong>1 bulan penuh</strong> (tanggal 1 – akhir bulan) supaya Biaya iklan terisi otomatis,
            atau <strong>7 hari</strong> untuk cek mingguan. Mau beberapa bulan? Download <strong>per bulan</strong>{' '}
            (file 2 bulan sekaligus tidak bisa dipecah per bulan), lalu pilih semua filenya sekaligus.
          </li>
          <li>
            Untuk tiap periode, download file ini, lalu pilih semuanya sekaligus di bawah:
            <ul className="mt-1 list-disc pl-6">
              <li>
                <strong>Data Keseluruhan</strong> — total semua iklan (untuk Biaya)
              </li>
              <li>
                <strong>Rincian Data Iklan Produk Otomatis</strong> — biaya per produk
              </li>
              <li>
                <strong>Semua Data Grup Iklan</strong> — kalau memakai grup iklan
              </li>
            </ul>
          </li>
        </ol>
      </details>

      <label className="flex cursor-pointer flex-wrap items-center gap-4 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-4 hover:border-orange-400">
        <span className="flex min-h-12 items-center rounded-xl bg-orange-600 px-5 text-lg font-semibold text-white">
          Pilih file
        </span>
        <span className="min-w-0 flex-1 truncate text-lg text-slate-600">
          {files.length > 0 ? `${files.length} file dipilih` : 'Boleh pilih beberapa file .csv sekaligus'}
        </span>
        <input key={inputKey} type="file" accept=".csv,text/csv" multiple className="sr-only" onChange={onFiles} />
      </label>

      {files.some((f) => f.error) && (
        <ul className="mt-4 space-y-3">
          {files
            .filter((f) => f.error)
            .map((f) => (
              <li key={f.fileName} className="rounded-xl border border-slate-200 p-4">
                <p className="break-all text-sm text-slate-500">{f.fileName}</p>
                <div className="mt-2">
                  <ErrorBox error={f.error} />
                </div>
              </li>
            ))}
        </ul>
      )}

      {groups.map((g) => {
        const note = expenseNote(g)
        return (
          <section key={g.key} className="mt-4 rounded-xl border border-slate-200 p-4">
            <h3 className="text-lg font-bold">
              Periode {formatPeriod(g.start, g.end)}
              {g.month && <span className="ml-2 text-base font-normal text-slate-500">(1 bulan penuh)</span>}
            </h3>
            <ul className="mt-2 space-y-2">
              {g.files.map((r, i) => (
                <li key={`${r.source}-${i}`}>
                  <p className="font-semibold">✅ {r.sourceLabel}</p>
                  <p className="text-slate-700">
                    Toko di file: {r.shopName || '-'} · Total biaya <strong>{formatRupiah(r.totalSpend)}</strong>
                    {r.productCount > 0 && ` · ${r.productCount} produk dengan biaya`}
                  </p>
                  {r.warnings.map((w) => (
                    <p key={w.code} className="mt-1 text-amber-700">
                      ⚠️ {w.message}
                    </p>
                  ))}
                </li>
              ))}
            </ul>
            <div className="mt-3">
              <Alert tone={note.tone}>{note.text}</Alert>
            </div>
          </section>
        )
      })}

      {problem && (
        <div className="mt-4">
          <Alert tone="error">{problem}</Alert>
        </div>
      )}
      {shopNames.size > 1 && (
        <div className="mt-4">
          <Alert tone="warning">File-file ini dari toko yang berbeda ({[...shopNames].join(', ')}). Cek lagi.</Alert>
        </div>
      )}
      {elsewhere && (
        <div className="mt-4">
          <Alert tone="warning" title="Cek toko dulu">
            Data iklan toko "{elsewhere.shop}" sebelumnya disimpan ke <strong>{elsewhere.storeName}</strong>. Sekarang
            akan disimpan ke <strong>{store?.name}</strong>. Kalau salah, ganti toko di menu kanan atas.
          </Alert>
        </div>
      )}

      {ok.length > 0 && !problem && (
        <div className="mt-4">
          {saveError ? (
            <div className="mb-3">
              <ErrorBox error={saveError} />
            </div>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Button onClick={save} disabled={saving || !store}>
              {saving
                ? 'Menyimpan…'
                : `Simpan ${groups.length > 1 ? `${groups.length} periode ` : ''}ke ${store?.name ?? 'toko'}`}
            </Button>
            <Button variant="secondary" onClick={reset} disabled={saving}>
              Batal
            </Button>
          </div>
        </div>
      )}

      {saved && (
        <div className="mt-4">
          <Alert tone="success" title={`Data iklan tersimpan (${saved.reduce((n, p) => n + p.files, 0)} file).`}>
            <ul className="space-y-1">
              {saved.map((p) => {
                const [start, end] = p.key.split('|')
                return (
                  <li key={p.key}>
                    <strong>{formatPeriod(start, end)}</strong>:{' '}
                    {p.expense
                      ? `Biaya Iklan Shopee ${formatMonth(p.expense.month)} diisi otomatis ${formatRupiah(p.expense.amount)}.`
                      : p.skipped === 'multi_month'
                        ? 'total beberapa bulan, hanya untuk analisis (Biaya tidak diisi).'
                        : p.skipped === 'no_keseluruhan'
                          ? 'Biaya belum diisi karena file Data Keseluruhan tidak ada.'
                          : 'hanya untuk analisis (Biaya tidak diubah).'}
                    {p.replaced > 0 && ` ${p.replaced} file menggantikan upload sebelumnya (tidak dobel).`}
                  </li>
                )
              })}
            </ul>
          </Alert>
        </div>
      )}
    </Card>
  )
}

// --- Analisis -----------------------------------------------------------------

interface Loaded {
  analysis: AdsAnalysis
  feeRate: number
  feeFrom: string | null
  hasOrders: boolean
}

function Analysis({ storeId, period }: { storeId: number; period: Period }) {
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [filter, setFilter] = useState<AdVerdict | 'semua'>('semua')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const monthStart = `${period.start.slice(0, 7)}-01`
      const lastMonth = `${period.end.slice(0, 7)}-01`
      const [reports, items, products, incomeDays] = await Promise.all([
        fetchAdRows(period.reports),
        fetchItemsCreatedBetween(storeId, period.start, period.end),
        fetchProducts(storeId),
        fetchIncomeDays(storeId, addMonths(monthStart, -3), monthEnd(lastMonth)),
      ])

      // Potongan Shopee: bulan periode iklan; kalau belum ada, 3 bulan sebelumnya; kalau tidak ada juga, 15%.
      const inPeriod = incomeDays.filter((d) => d.released_date >= monthStart)
      let feeRate = feeRateFromIncome(inPeriod)
      let feeFrom: string | null = null
      if (feeRate !== null) {
        feeFrom = monthStart === lastMonth ? formatMonth(monthStart) : `${formatMonth(monthStart)} – ${formatMonth(lastMonth)}`
      } else {
        feeRate = feeRateFromIncome(incomeDays)
        if (feeRate !== null) feeFrom = '3 bulan sebelumnya'
      }

      const hppBySku = new Map(products.map((p) => [p.sku, p.hpp === null ? null : Number(p.hpp)]))
      const fallback = new Map<string, number[]>()
      for (const p of products) {
        if (p.hpp === null) continue
        const k = productKey(p.product_name)
        fallback.set(k, [...(fallback.get(k) ?? []), Number(p.hpp)])
      }
      const fallbackHpp = new Map([...fallback].map(([k, v]) => [k, v.reduce((s, x) => s + x, 0) / v.length]))

      const analysis = analyzeAds({
        reports,
        orders: items.map((i) => ({
          product_name: i.product_name,
          status_group: i.status_group,
          qty: Number(i.qty),
          subtotal: Number(i.subtotal),
          hpp: i.hpp_snapshot !== null ? Number(i.hpp_snapshot) : (hppBySku.get(i.sku) ?? null),
        })),
        feeRate: feeRate ?? DEFAULT_FEE_RATE,
        fallbackHpp,
      })
      if (!cancelled) setData({ analysis, feeRate: feeRate ?? DEFAULT_FEE_RATE, feeFrom, hasOrders: items.length > 0 })
    })().catch((e) => !cancelled && setError(e))
    return () => {
      cancelled = true
    }
  }, [storeId, period])

  if (error) return <ErrorBox error={error} />
  if (!data) return <Spinner label="Menghitung…" />

  const { analysis: a } = data
  const sources = new Set(period.reports.map((r) => r.source))
  const noSales = a.products.filter((p) => p.verdict === 'belum_cukup' && p.netSold < 0.5)
  const main = a.products.filter((p) => !noSales.includes(p))
  const counts = new Map<AdVerdict, number>()
  for (const p of main) counts.set(p.verdict, (counts.get(p.verdict) ?? 0) + 1)
  const shown = filter === 'semua' ? main : main.filter((p) => p.verdict === filter)

  return (
    <div className="space-y-6">
      <SummaryCard data={data} period={period} />

      <div className="space-y-3">
        {!data.hasOrders && (
          <Alert tone="warning" title="Export pesanan untuk periode ini belum di-upload.">
            Pesanan batal belum dikurangi dan HPP belum bisa dicocokkan. Upload export pesanan (status Semua) di halaman{' '}
            <a href="#/upload" className="font-semibold underline">
              Upload
            </a>
            .
          </Alert>
        )}
        {a.unallocated.map((u) => (
          <Alert key={u.adName} tone="warning" title={`${formatRupiah(u.spend)} biaya "${u.adName}" belum dirinci per produk.`}>
            Upload file{' '}
            <strong>{u.need === 'otomatis' ? 'Rincian Data Iklan Produk Otomatis' : 'Semua Data Grup Iklan'}</strong> untuk
            periode yang sama. Biaya ini tetap dihitung di total.
          </Alert>
        ))}
        {!sources.has('keseluruhan') && (
          <Alert tone="warning">
            File <strong>Data Keseluruhan</strong> belum di-upload untuk periode ini, jadi total biaya hanya dari file rincian
            (iklan per produk belum termasuk).
          </Alert>
        )}
        {a.productsWithoutProfit > 0 && (
          <Alert tone="warning">
            {a.productsWithoutProfit} produk yang terjual belum ada HPP-nya, jadi untungnya belum ikut dihitung.{' '}
            <button type="button" className="font-semibold underline" onClick={() => navigate('hpp', { kosong: '1' })}>
              Isi HPP
            </button>
          </Alert>
        )}
      </div>

      {main.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Saring label">
          <FilterChip active={filter === 'semua'} onClick={() => setFilter('semua')}>
            Semua ({main.length})
          </FilterChip>
          {VERDICT_ORDER.filter((v) => counts.get(v)).map((v) => (
            <FilterChip key={v} active={filter === v} onClick={() => setFilter(v)}>
              {VERDICTS[v].icon} {VERDICTS[v].label} ({counts.get(v)})
            </FilterChip>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {shown.map((p) => (
          <ProductCard key={p.code} p={p} />
        ))}
      </div>

      {noSales.length > 0 && (filter === 'semua' || filter === 'belum_cukup') && (
        <details className="rounded-2xl border border-slate-200 bg-white p-5">
          <summary className="cursor-pointer text-lg font-semibold">
            ⚪ {noSales.length} produk lain belum ada penjualan — total biaya{' '}
            {formatRupiah(noSales.reduce((s, p) => s + p.spend, 0))}
          </summary>
          <p className="mt-2 text-slate-600">Biayanya masih kecil, tunggu dulu. Kalau sudah banyak klik tapi tetap tidak laku, matikan.</p>
          <ul className="mt-3 divide-y divide-slate-100">
            {noSales.map((p) => (
              <li key={p.code} className="flex flex-wrap justify-between gap-x-4 py-2">
                <span className="min-w-0 flex-1">{p.name}</span>
                <span className="tabular-nums text-slate-600">
                  {formatRupiah(p.spend)} · {formatNumber(p.clicks)} klik
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <HowToRead feeRate={data.feeRate} />
    </div>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-12 rounded-full border px-4 text-base font-semibold ${
        active ? 'border-orange-600 bg-orange-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
      }`}
    >
      {children}
    </button>
  )
}

function SummaryCard({ data, period }: { data: Loaded; period: Period }) {
  const a = data.analysis
  const month = fullMonthOf(period.start, period.end)
  return (
    <Card>
      <p className="text-slate-600">
        Periode <strong>{formatPeriod(period.start, period.end)}</strong> · Potongan Shopee{' '}
        <strong>{formatPercent(data.feeRate * 100)}</strong>{' '}
        {data.feeFrom ? `(dari laporan penghasilan ${data.feeFrom})` : '(perkiraan — laporan penghasilan belum di-upload)'}
      </p>
      <dl className="mt-4 space-y-2 text-lg">
        <Line label="Biaya iklan" value={formatRupiah(a.totalSpend)} strong />
        <Line label="Omzet dari iklan (versi Shopee)" value={formatRupiah(a.adsGmv)} />
        <Line
          label="Omzet dari iklan tanpa pesanan batal"
          value={formatRupiah(a.netGmv)}
          note={`ROAS nyata ${formatRoas(a.realRoas)}`}
        />
        <Line label="Untung produk yang diiklankan (sebelum iklan)" value={formatRupiah(a.profitBeforeAds)} />
        <div className="border-t-2 border-dashed border-slate-300 pt-2">
          <Line
            label="Untung setelah iklan"
            value={formatRupiah(a.profitAfterAds)}
            strong
            tone={a.profitAfterAds < 0 ? 'bad' : 'good'}
          />
        </div>
      </dl>
      {month && period.reports.some((r) => r.source === 'keseluruhan') && (
        <p className="mt-3 text-slate-600">
          Biaya iklan ini sudah otomatis masuk ke{' '}
          <a href={`#/biaya?bulan=${month}`} className="font-semibold text-orange-700 underline">
            Biaya {formatMonth(month)}
          </a>
          .
        </p>
      )}
    </Card>
  )
}

function Line({
  label,
  value,
  note,
  strong,
  tone,
}: {
  label: string
  value: string
  note?: string
  strong?: boolean
  tone?: 'good' | 'bad'
}) {
  const color = tone === 'bad' ? 'text-red-700' : tone === 'good' ? 'text-emerald-700' : ''
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4">
      <dt className={strong ? 'font-bold' : 'text-slate-700'}>
        {label}
        {note && <span className="ml-2 text-base font-normal text-slate-500">({note})</span>}
      </dt>
      <dd className={`tabular-nums ${strong ? 'text-2xl font-bold' : 'font-semibold'} ${color}`}>{value}</dd>
    </div>
  )
}

function advice(p: AdProductResult): string {
  const target = p.shopeeTargetRoas !== null ? formatRoas(roundUp1(p.shopeeTargetRoas)) : null
  const ideal = p.idealPrice !== null ? formatRupiah(roundUpPrice(p.idealPrice)) : null
  switch (p.verdict) {
    case 'takedown':
      if (p.netSold < 0.5) return `Sudah habis ${formatRupiah(p.spend)} tanpa penjualan. Matikan iklan produk ini.`
      if (p.unitProfit !== null && p.unitProfit <= 0)
        return `Harga jual sekarang sudah rugi bahkan tanpa iklan. Naikkan harga${ideal ? ` ke ±${ideal}` : ''} dulu.`
      if (target === null)
        return `Untung per barang terlalu tipis, iklan pasti rugi. Matikan iklan${ideal ? `, atau naikkan harga ke ±${ideal}` : ''}.`
      return `ROAS nyata di bawah balik modal. Matikan iklan, atau naikkan target ROAS di Shopee ke ${target}.`
    case 'kurang':
      if (target === null)
        return `Target untung 5% tidak mungkin dengan harga sekarang. Naikkan harga${ideal ? ` ke ±${ideal}` : ''}.`
      return `${(p.profitAfterAds ?? 0) >= 0 ? 'Masih untung, tapi' : 'Rugi tipis,'} belum sampai target 5%. Naikkan target ROAS di Shopee ke ${target}.`
    case 'hero':
      return `Iklan ini menghasilkan. Pertahankan${target ? ` (target ROAS minimal ${target})` : ''}; budget boleh dinaikkan.`
    case 'aman':
      return `Sudah sesuai target. Pertahankan target ROAS di Shopee minimal ${target}.`
    case 'belum_cukup':
      return `Baru ${formatNumber(Math.round(p.netSold))} terjual, tunggu data lebih banyak sebelum memutuskan.`
    case 'hpp_kosong':
      return 'Isi HPP produk ini supaya untung dan ROAS sarannya bisa dihitung.'
  }
}

function ProductCard({ p }: { p: AdProductResult }) {
  const v = VERDICTS[p.verdict]
  const sold = Math.round(p.netSold)
  return (
    <article className={`flex flex-col rounded-2xl border-2 bg-white p-5 shadow-sm ${v.border}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-3 py-1 text-base font-bold ${v.pill}`}>
          {v.icon} {v.label}
        </span>
      </div>
      <h3 className="line-clamp-2 text-lg font-semibold" title={p.name}>
        {p.name}
      </h3>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Mini label="Biaya iklan" value={formatRupiah(p.spend)} />
        <Mini
          label="Terjual"
          value={formatNumber(sold)}
          detail={p.batalQty > 0 ? `Shopee: ${formatNumber(p.adsSold)} (ada batal)` : undefined}
        />
        <Mini
          label="ROAS nyata"
          value={formatRoas(p.realRoas)}
          detail={p.shopeeRoas !== null && Math.abs((p.shopeeRoas ?? 0) - (p.realRoas ?? 0)) >= 0.05 ? `Shopee: ${formatRoas(p.shopeeRoas)}` : undefined}
        />
      </div>

      {p.unitProfit !== null && (
        <dl className="mt-3 space-y-1">
          <Row label="Balik modal butuh ROAS" value={p.bepRoas !== null ? formatRoas(p.bepRoas) : 'tidak mungkin'} />
          <Row
            label="Saran target ROAS di Shopee"
            value={p.shopeeTargetRoas !== null ? formatRoas(roundUp1(p.shopeeTargetRoas)) : 'tidak mungkin'}
            strong
          />
          <Row
            label="Untung setelah iklan"
            value={formatRupiah(p.profitAfterAds)}
            tone={(p.profitAfterAds ?? 0) < 0 ? 'bad' : 'good'}
            strong
          />
          <Row
            label="Untung per barang (sebelum iklan)"
            value={`${formatRupiah(p.unitProfit)} (${formatPercent((p.margin ?? 0) * 100)})`}
          />
        </dl>
      )}

      {p.margin !== null && p.margin < PRICE_TARGET_MARGIN && p.idealPrice !== null && (
        <p className="mt-2 text-amber-800">
          ⚠️ Untung harga di bawah {formatPercent(PRICE_TARGET_MARGIN * 100)}. Harga sekarang ±{formatRupiah(p.price)};
          supaya {formatPercent(PRICE_TARGET_MARGIN * 100)}: <strong>±{formatRupiah(roundUpPrice(p.idealPrice))}</strong>
        </p>
      )}
      {p.hppIncomplete && <p className="mt-2 text-amber-800">⚠️ Sebagian variasi belum ada HPP-nya.</p>}

      <p className="mt-3 rounded-xl bg-slate-50 p-3 text-base text-slate-800">{advice(p)}</p>
      {p.verdict === 'hpp_kosong' && (
        <Button variant="secondary" className="mt-3 self-start" onClick={() => navigate('hpp', { kosong: '1' })}>
          Isi HPP
        </Button>
      )}
    </article>
  )
}

function Mini({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-2 py-2">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-lg font-bold tabular-nums">{value}</p>
      {detail && <p className="text-xs text-slate-500">{detail}</p>}
    </div>
  )
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: 'good' | 'bad' }) {
  const color = tone === 'bad' ? 'text-red-700' : tone === 'good' ? 'text-emerald-700' : ''
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
      <dt className="text-slate-600">{label}</dt>
      <dd className={`tabular-nums ${strong ? 'text-lg font-bold' : 'font-semibold'} ${color}`}>{value}</dd>
    </div>
  )
}

function HowToRead({ feeRate }: { feeRate: number }) {
  return (
    <details className="rounded-2xl border border-slate-200 bg-white p-5">
      <summary className="cursor-pointer text-lg font-semibold">ⓘ Cara baca angka-angka ini</summary>
      <ul className="mt-3 list-disc space-y-2 pl-6 text-slate-700">
        <li>
          <strong>ROAS</strong> = omzet ÷ biaya iklan. ROAS 10 artinya biaya iklan Rp1.000 menghasilkan omzet Rp10.000.
        </li>
        <li>
          <strong>ROAS nyata</strong>: angka "terjual" dan omzet di laporan iklan Shopee ikut menghitung pesanan yang
          kemudian <strong>batal</strong>. Aplikasi menguranginya memakai data pesanan periode yang sama.
        </li>
        <li>
          <strong>Untung per barang</strong> = harga jual − potongan Shopee ({formatPercent(feeRate * 100)}) − HPP, sebelum
          iklan dan packaging.
        </li>
        <li>
          <strong>Balik modal butuh ROAS</strong>: di bawah angka ini, iklan produk itu rugi.
        </li>
        <li>
          <strong>Saran target ROAS di Shopee</strong>: angka untuk diisi di pengaturan iklan (GMV Max ROAS) supaya masih
          untung {formatPercent(ADS_TARGET_PROFIT * 100)} dari harga jual setelah iklan. Sudah termasuk cadangan untuk
          pesanan batal.
        </li>
        <li>
          Label: <strong>⭐ Hero</strong> = ROAS jauh di atas saran · <strong>🟢 Aman</strong> = sesuai target ·{' '}
          <strong>🟠 ROAS terlalu kecil</strong> = di atas balik modal tapi untung belum {formatPercent(ADS_TARGET_PROFIT * 100)} ·{' '}
          <strong>🔴 Takedown</strong> = iklan rugi · <strong>⚪ Data belum cukup</strong> = terjual kurang dari 3.
        </li>
        <li>
          Harga untuk untung {formatPercent(PRICE_TARGET_MARGIN * 100)} = HPP ÷ (1 − potongan Shopee −{' '}
          {formatPercent(PRICE_TARGET_MARGIN * 100)}).
        </li>
      </ul>
    </details>
  )
}
