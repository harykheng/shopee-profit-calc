import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react'
import { Alert, Button, Card, ErrorBox, PageTitle, Spinner, Stamp, selectClass, type StampTone } from '../components/ui'
import { IconAlertCircle, IconCheck, IconInfo, IconUpload } from '../components/icons'
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
import { addMonths, formatDate, formatMonth, formatNumber, formatPercent, formatRupiah, monthEnd, wibDay } from '../lib/format'
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
  /** Untuk gabungan: bulan-bulan (YYYY-MM-01) yang digabung. */
  months?: string[]
  /** Untuk gabungan: bulan di rentang yang belum punya data iklan 1 bulan penuh. */
  missingMonths?: string[]
}

const COMBINED = 'gabungan'

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

const VERDICTS: Record<AdVerdict, { label: string; tone: StampTone }> = {
  takedown: { label: 'Takedown', tone: 'loss' },
  kurang: { label: 'ROAS terlalu kecil', tone: 'warn' },
  hpp_kosong: { label: 'HPP belum diisi', tone: 'neutral' },
  hero: { label: 'Hero', tone: 'gain' },
  aman: { label: 'Aman', tone: 'gain' },
  belum_cukup: { label: 'Data belum cukup', tone: 'neutral' },
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

  // Bulan yang punya data iklan 1 bulan penuh (bisa digabung tanpa dobel).
  const fullMonths = useMemo(
    () =>
      periods
        .map((p) => ({ month: fullMonthOf(p.start, p.end), p }))
        .filter((x): x is { month: string; p: Period } => x.month !== null)
        .sort((a, b) => a.month.localeCompare(b.month)),
    [periods],
  )
  const [range, setRange] = useState<{ from: string; to: string } | null>(null)
  const from = range?.from ?? fullMonths[Math.max(0, fullMonths.length - 2)]?.month ?? ''
  const to = range?.to ?? fullMonths[fullMonths.length - 1]?.month ?? ''

  const combined = useMemo((): Period | null => {
    if (selected !== COMBINED || !from || !to || from > to) return null
    const inRange = fullMonths.filter((x) => x.month >= from && x.month <= to)
    const missingMonths: string[] = []
    for (let m = from; m <= to; m = addMonths(m, 1)) {
      if (!inRange.some((x) => x.month === m)) missingMonths.push(m)
    }
    return {
      key: `${COMBINED}|${from}|${to}`,
      start: from,
      end: monthEnd(to),
      reports: inRange.flatMap((x) => x.p.reports),
      months: inRange.map((x) => x.month),
      missingMonths,
    }
  }, [selected, from, to, fullMonths])

  const period = selected === COMBINED ? combined : (periods.find((p) => p.key === selected) ?? null)

  return (
    <>
      <PageTitle subtitle="Upload data iklan Shopee, lalu lihat produk mana yang perlu dimatikan, dipertahankan, atau dinaikkan ROAS-nya.">
        Iklan — {store?.name ?? '-'}
      </PageTitle>

      <UploadCard
        store={store}
        stores={stores}
        hasData={periods.length > 0}
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
            <label htmlFor="ads-period" className="font-semibold">
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
              {fullMonths.length >= 2 && <option value={COMBINED}>Gabungkan beberapa bulan…</option>}
            </select>
            {selected === COMBINED && (
              <>
                <label className="flex items-center gap-2 text-ink-soft">
                  Dari
                  <select value={from} onChange={(e) => setRange({ from: e.target.value, to })} className={selectClass}>
                    {fullMonths.map((x) => (
                      <option key={x.month} value={x.month}>
                        {formatMonth(x.month)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-ink-soft">
                  sampai
                  <select value={to} onChange={(e) => setRange({ from, to: e.target.value })} className={selectClass}>
                    {fullMonths.map((x) => (
                      <option key={x.month} value={x.month}>
                        {formatMonth(x.month)}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </div>
          {selected === COMBINED && from > to && (
            <div className="mb-6">
              <Alert tone="error">Bulan "dari" harus sebelum atau sama dengan bulan "sampai".</Alert>
            </div>
          )}
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
  hasData,
  onSaved,
}: {
  store: Store | null
  stores: Store[]
  /** Sudah ada data iklan: kotak upload dilipat supaya hasil analisis tampil duluan. */
  hasData: boolean
  onSaved: (periodKey: string) => void
}) {
  const [open, setOpen] = useState<boolean | null>(null)
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
      setOpen(true)
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

  if (!(open ?? !hasData)) {
    return (
      <section className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-paper px-5 py-3 shadow-sheet">
        <p>
          <span className="font-semibold">Data iklan baru?</span>{' '}
          <span className="text-ink-muted">Upload file CSV per bulan atau per minggu.</span>
        </p>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          <IconUpload size={18} />
          Upload data iklan
        </Button>
      </section>
    )
  }

  return (
    <Card
      title={
        <span className="flex items-center justify-between gap-3">
          Upload data iklan (CSV)
          {hasData && (
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="min-h-11 rounded-md px-3 text-base font-medium text-ink-muted transition-colors hover:bg-counter hover:text-ink"
            >
              Tutup
            </button>
          )}
        </span>
      }
      className="mb-6"
    >
      <details className="mb-4 rounded-md bg-counter/60 px-4 py-3 text-ink-soft">
        <summary className="cursor-pointer font-semibold text-ink">Cara ambil file dari Shopee</summary>
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

      <label className="flex cursor-pointer flex-wrap items-center gap-4 rounded-md border-2 border-dashed border-rule bg-counter/40 p-4 transition-colors hover:border-stamp hover:bg-stamp-tint/40">
        <span className="inline-flex min-h-11 items-center gap-2 rounded-md bg-stamp px-4 font-semibold text-white">
          <IconUpload size={18} />
          Pilih file
        </span>
        <span className="min-w-0 flex-1 truncate text-ink-soft">
          {files.length > 0 ? `${files.length} file dipilih` : 'Boleh pilih beberapa file .csv sekaligus'}
        </span>
        <input key={inputKey} type="file" accept=".csv,text/csv" multiple className="sr-only" onChange={onFiles} />
      </label>

      {files.some((f) => f.error) && (
        <ul className="mt-4 space-y-3">
          {files
            .filter((f) => f.error)
            .map((f) => (
              <li key={f.fileName} className="rounded-md border border-line p-4">
                <p className="break-all text-sm text-ink-muted">{f.fileName}</p>
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
          <section key={g.key} className="mt-4 rounded-md border border-line p-4">
            <h3 className="font-semibold">
              Periode {formatPeriod(g.start, g.end)}
              {g.month && <span className="ml-2 text-base font-normal text-ink-muted">(1 bulan penuh)</span>}
            </h3>
            <ul className="mt-2 space-y-2">
              {g.files.map((r, i) => (
                <li key={`${r.source}-${i}`}>
                  <p className="flex items-center gap-2 font-semibold">
                    <IconCheck size={18} className="text-gain" />
                    {r.sourceLabel}
                  </p>
                  <p className="text-ink-soft">
                    Toko di file: {r.shopName || '-'} · Total biaya <strong>{formatRupiah(r.totalSpend)}</strong>
                    {r.productCount > 0 && ` · ${r.productCount} produk dengan biaya`}
                  </p>
                  {r.warnings.map((w) => (
                    <p key={w.code} className="mt-1 flex gap-2 text-warn">
                      <IconAlertCircle size={18} className="mt-0.5 shrink-0" />
                      {w.message}
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
            akan disimpan ke <strong>{store?.name}</strong>. Kalau salah, ganti toko di pilihan Toko pada menu.
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
  /** Untuk gabungan beberapa bulan: hasil per bulan. */
  perMonth?: { month: string; analysis: AdsAnalysis }[]
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

      const toLine = (i: (typeof items)[number]) => ({
        product_name: i.product_name,
        status_group: i.status_group,
        qty: Number(i.qty),
        subtotal: Number(i.subtotal),
        hpp: i.hpp_snapshot !== null ? Number(i.hpp_snapshot) : (hppBySku.get(i.sku) ?? null),
      })
      const rate = feeRate ?? DEFAULT_FEE_RATE
      const analysis = analyzeAds({ reports, orders: items.map(toLine), feeRate: rate, fallbackHpp })
      // Gabungan: hitung juga per bulan (data iklan & pesanan bulan itu saja) untuk dibandingkan.
      const perMonth =
        period.months && period.months.length > 1
          ? period.months.map((m) => ({
              month: m,
              analysis: analyzeAds({
                reports: reports.filter((r) => r.period === `${m}|${monthEnd(m)}`),
                orders: items.filter((i) => i.created_at && wibDay(i.created_at).slice(0, 7) === m.slice(0, 7)).map(toLine),
                feeRate: rate,
                fallbackHpp,
              }),
            }))
          : undefined
      if (!cancelled) setData({ analysis, feeRate: rate, feeFrom, hasOrders: items.length > 0, perMonth })
    })().catch((e) => !cancelled && setError(e))
    return () => {
      cancelled = true
    }
  }, [storeId, period])

  if (error) return <ErrorBox error={error} />
  if (!data) return <Spinner label="Menghitung…" />

  const { analysis: a } = data
  const periodName = (key: string) => {
    const [start, end] = key.split('|')
    return start && end ? formatPeriod(start, end) : ''
  }
  const noSales = a.products.filter((p) => p.verdict === 'belum_cukup' && p.netSold < 0.5)
  const main = a.products.filter((p) => !noSales.includes(p))
  const counts = new Map<AdVerdict, number>()
  for (const p of main) counts.set(p.verdict, (counts.get(p.verdict) ?? 0) + 1)
  const shown = filter === 'semua' ? main : main.filter((p) => p.verdict === filter)
  // Gabungan: angka tiap produk per bulan (mis. Juli baru jalan sebentar, Agustus penuh).
  const productMonths = new Map<string, MonthFigure[]>()
  for (const { month, analysis } of data.perMonth ?? []) {
    for (const p of analysis.products) {
      productMonths.set(p.code, [...(productMonths.get(p.code) ?? []), { month, p }])
    }
  }

  return (
    <div className="space-y-6">
      <SummaryCard data={data} period={period} />
      {data.perMonth && <PerMonthCard rows={data.perMonth} />}

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
        {period.missingMonths && period.missingMonths.length > 0 && (
          <Alert tone="warning" title="Ada bulan yang belum punya data iklan 1 bulan penuh.">
            {period.missingMonths.map(formatMonth).join(', ')} tidak ikut dihitung. Upload data iklan bulan itu (tanggal 1 –
            akhir bulan).
          </Alert>
        )}
        {a.unallocated.map((u) => (
          <Alert
            key={`${u.period ?? ''}${u.adName}`}
            tone="warning"
            title={`${formatRupiah(u.spend)} biaya "${u.adName}"${period.months && u.period ? ` (${periodName(u.period)})` : ''} belum dirinci per produk.`}
          >
            Upload file{' '}
            <strong>{u.need === 'otomatis' ? 'Rincian Data Iklan Produk Otomatis' : 'Semua Data Grup Iklan'}</strong> untuk
            periode yang sama. Biaya ini tetap dihitung di total.
          </Alert>
        ))}
        {a.periodsWithoutKeseluruhan.length > 0 && (
          <Alert tone="warning">
            File <strong>Data Keseluruhan</strong> belum di-upload untuk{' '}
            {period.months ? a.periodsWithoutKeseluruhan.map(periodName).join(', ') : 'periode ini'}, jadi total biaya
            hanya dari file rincian (iklan per produk belum termasuk).
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
              {VERDICTS[v].label} <span className="num">({counts.get(v)})</span>
            </FilterChip>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {shown.map((p) => (
          <ProductCard key={p.code} p={p} months={data.perMonth ? (productMonths.get(p.code) ?? []) : undefined} />
        ))}
      </div>

      {noSales.length > 0 && (filter === 'semua' || filter === 'belum_cukup') && (
        <details className="rounded-lg border border-line bg-paper p-5 shadow-sheet">
          <summary className="cursor-pointer font-semibold">
            {noSales.length} produk lain belum ada penjualan — total biaya{' '}
            {formatRupiah(noSales.reduce((s, p) => s + p.spend, 0))}
          </summary>
          <p className="mt-2 text-ink-soft">Biayanya masih kecil, tunggu dulu. Kalau sudah banyak klik tapi tetap tidak laku, matikan.</p>
          <ul className="mt-3 divide-y divide-line/70">
            {noSales.map((p) => (
              <li key={p.code} className="flex flex-wrap justify-between gap-x-4 py-2">
                <span className="min-w-0 flex-1">{p.name}</span>
                <span className="num text-ink-soft">
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
      className={`min-h-11 rounded-md border px-3.5 font-medium transition-colors duration-150 ${
        active ? 'border-ink bg-ink text-white' : 'border-line bg-paper text-ink-soft hover:border-ink-muted hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}

function PerMonthCard({ rows }: { rows: { month: string; analysis: AdsAnalysis }[] }) {
  return (
    <Card title="Per bulan">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-left text-base">
          <thead className="text-sm text-ink-muted">
            <tr>
              <th className="py-2 pr-3 font-medium">Bulan</th>
              <th className="py-2 pr-3 text-right font-medium">Biaya iklan</th>
              <th className="py-2 pr-3 text-right font-medium">Omzet iklan (tanpa batal)</th>
              <th className="py-2 pr-3 text-right font-medium">ROAS nyata</th>
              <th className="py-2 text-right font-medium">Untung setelah iklan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/70">
            {rows.map(({ month, analysis: a }) => (
              <tr key={month}>
                <td className="py-2 pr-3 font-semibold">{formatMonth(month)}</td>
                <td className="num py-2 pr-3 text-right">{formatRupiah(a.totalSpend)}</td>
                <td className="num py-2 pr-3 text-right">{formatRupiah(a.netGmv)}</td>
                <td className="num py-2 pr-3 text-right">{formatRoas(a.realRoas)}</td>
                <td className={`num py-2 text-right font-bold ${a.profitAfterAds < 0 ? 'text-loss' : 'text-gain'}`}>
                  {formatRupiah(a.profitAfterAds)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function SummaryCard({ data, period }: { data: Loaded; period: Period }) {
  const a = data.analysis
  const month = fullMonthOf(period.start, period.end)
  return (
    <Card>
      <p className="text-ink-soft">
        {period.months && period.months.length > 1 ? (
          <>
            Gabungan <strong>{period.months.length} bulan</strong> ({period.months.map(formatMonth).join(', ')})
          </>
        ) : (
          <>
            Periode <strong>{formatPeriod(period.start, period.end)}</strong>
          </>
        )}{' '}
        · Potongan Shopee{' '}
        <strong>{formatPercent(data.feeRate * 100)}</strong>{' '}
        {data.feeFrom ? `(dari laporan penghasilan ${data.feeFrom})` : '(perkiraan — laporan penghasilan belum di-upload)'}
      </p>
      <dl className="mt-4 space-y-2 border-t-2 border-dashed border-rule pt-3">
        <Line label="Biaya iklan" value={formatRupiah(a.totalSpend)} strong />
        <Line label="Omzet dari iklan (versi Shopee)" value={formatRupiah(a.adsGmv)} />
        <Line
          label="Omzet dari iklan tanpa pesanan batal"
          value={formatRupiah(a.netGmv)}
          note={`ROAS nyata ${formatRoas(a.realRoas)}`}
        />
        <Line label="Untung produk yang diiklankan (sebelum iklan)" value={formatRupiah(a.profitBeforeAds)} />
        <div className="border-t-2 border-dashed border-rule pt-3">
          <Line
            label="Untung setelah iklan"
            value={formatRupiah(a.profitAfterAds)}
            strong
            tone={a.profitAfterAds < 0 ? 'bad' : 'good'}
          />
        </div>
      </dl>
      {month && period.reports.some((r) => r.source === 'keseluruhan') && (
        <p className="mt-3 text-ink-soft">
          Biaya iklan ini sudah otomatis masuk ke{' '}
          <a href={`#/biaya?bulan=${month}`} className="font-semibold text-stamp underline">
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
  const color = tone === 'bad' ? 'text-loss' : tone === 'good' ? 'text-gain' : ''
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4">
      <dt className={strong ? 'font-semibold' : 'text-ink-soft'}>
        {label}
        {note && <span className="num ml-2 text-sm font-normal text-ink-muted">({note})</span>}
      </dt>
      <dd className={`num ${strong ? 'text-2xl font-bold' : 'font-medium'} ${color}`}>{value}</dd>
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

type MonthFigure = { month: string; p: AdProductResult }

function ProductCard({ p, months }: { p: AdProductResult; months?: MonthFigure[] }) {
  const v = VERDICTS[p.verdict]
  const sold = Math.round(p.netSold)
  return (
    <article className="flex flex-col rounded-lg border border-line bg-paper p-5 shadow-sheet">
      <div className="flex items-start justify-between gap-3">
        <h3 className="line-clamp-2 min-w-0 font-semibold leading-snug" title={p.name}>
          {p.name}
        </h3>
        <Stamp tone={v.tone} className="mt-0.5 shrink-0">
          {v.label}
        </Stamp>
      </div>

      <div className="mt-4 grid grid-cols-3 divide-x divide-line border-y border-line py-2.5 text-center">
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
        <dl className="mt-3 space-y-1.5">
          <Row label="Balik modal butuh ROAS" value={p.bepRoas !== null ? formatRoas(p.bepRoas) : 'tidak mungkin'} />
          <Row
            label="Saran target ROAS di Shopee"
            value={p.shopeeTargetRoas !== null ? formatRoas(roundUp1(p.shopeeTargetRoas)) : 'tidak mungkin'}
            strong
          />
          <Row
            label="Untung per barang (sebelum iklan)"
            value={`${formatRupiah(p.unitProfit)} (${formatPercent((p.margin ?? 0) * 100)})`}
          />
          <div className="border-t-2 border-dashed border-rule pt-2">
            <Row
              label="Untung setelah iklan"
              value={formatRupiah(p.profitAfterAds)}
              tone={(p.profitAfterAds ?? 0) < 0 ? 'bad' : 'good'}
              strong
            />
          </div>
        </dl>
      )}

      {p.margin !== null && p.margin < PRICE_TARGET_MARGIN && p.idealPrice !== null && (
        <p className="mt-3 flex gap-2 text-sm text-warn">
          <IconAlertCircle size={18} className="mt-px shrink-0" />
          <span>
            Untung harga di bawah {formatPercent(PRICE_TARGET_MARGIN * 100)}. Harga sekarang ±{formatRupiah(p.price)};
            supaya {formatPercent(PRICE_TARGET_MARGIN * 100)}:{' '}
            <strong className="num">±{formatRupiah(roundUpPrice(p.idealPrice))}</strong>
          </span>
        </p>
      )}
      {p.hppIncomplete && (
        <p className="mt-2 flex gap-2 text-sm text-warn">
          <IconAlertCircle size={18} className="mt-px shrink-0" />
          Sebagian variasi belum ada HPP-nya.
        </p>
      )}

      {months && (
        <div className="mt-3 border-t border-line/70 pt-2 text-sm text-ink-soft">
          <p className="font-semibold text-ink-soft">Per bulan:</p>
          {months.length <= 1 && <p>Hanya diiklankan di 1 bulan.</p>}
          <ul>
            {months.map(({ month, p: m }) => (
              <li key={month} className="num">
                {formatMonth(month)}: biaya {formatRupiah(m.spend)} · terjual {formatNumber(Math.round(m.netSold))} · ROAS{' '}
                {formatRoas(m.realRoas)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-auto rounded-md bg-counter/70 px-3 py-2.5 text-ink [margin-top:max(0.75rem,auto)]">{advice(p)}</p>
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
    <div className="px-2">
      <p className="text-sm text-ink-muted">{label}</p>
      <p className="num text-lg font-semibold">{value}</p>
      {detail && <p className="text-xs text-ink-muted">{detail}</p>}
    </div>
  )
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: 'good' | 'bad' }) {
  const color = tone === 'bad' ? 'text-loss' : tone === 'good' ? 'text-gain' : ''
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
      <dt className={strong ? 'font-medium text-ink' : 'text-ink-soft'}>{label}</dt>
      <dd className={`${/^[-±\d]|^Rp/.test(value) ? 'num' : ''} ${strong ? 'text-lg font-bold' : 'font-medium'} ${color}`}>
        {value}
      </dd>
    </div>
  )
}

function HowToRead({ feeRate }: { feeRate: number }) {
  return (
    <details className="rounded-lg border border-line bg-paper p-5 shadow-sheet">
      <summary className="flex cursor-pointer items-center gap-2 font-semibold">
        <IconInfo size={18} className="text-stamp" />
        Cara baca angka-angka ini
      </summary>
      <ul className="mt-3 list-disc space-y-2 pl-6 text-ink-soft marker:text-rule">
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
          Label:
          <span className="mt-2 grid gap-2 sm:grid-cols-2">
            <span><Stamp tone="gain" tilt={false} className="!text-xs">Hero</Stamp> ROAS jauh di atas saran</span>
            <span><Stamp tone="gain" tilt={false} className="!text-xs">Aman</Stamp> sesuai target</span>
            <span>
              <Stamp tone="warn" tilt={false} className="!text-xs">ROAS terlalu kecil</Stamp> di atas balik modal, untung belum{' '}
              {formatPercent(ADS_TARGET_PROFIT * 100)}
            </span>
            <span><Stamp tone="loss" tilt={false} className="!text-xs">Takedown</Stamp> iklan rugi</span>
            <span><Stamp tone="neutral" tilt={false} className="!text-xs">Data belum cukup</Stamp> terjual kurang dari 3</span>
          </span>
        </li>
        <li>
          Harga untuk untung {formatPercent(PRICE_TARGET_MARGIN * 100)} = HPP ÷ (1 − potongan Shopee −{' '}
          {formatPercent(PRICE_TARGET_MARGIN * 100)}).
        </li>
      </ul>
    </details>
  )
}
