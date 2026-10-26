import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Alert, Button, Card, ErrorBox, PageTitle, ScrollX, Spinner, Stamp, buttonClass, linkClass, type StampTone } from '../components/ui'
import { IconAlertCircle, IconCards, IconChevronDown, IconInfo, IconRows, IconSearch, IconUpload } from '../components/icons'
import { AdsQuickCheck } from './AdsQuickCheck'
import { fetchAdReports } from '../lib/api'
import { MIN_LINES_FOR_ACTUAL_FEE, fullMonthOf, type AdProductResult, type AdVerdict, type AdsAnalysis, type Targets } from '../lib/adsMath'
import { loadAdsAnalysis, type Loaded, type Period } from '../lib/adsLoad'
import { addMonths, formatMonth, formatNumber, formatPercent, formatRupiah, formatRupiahShort, monthEnd } from '../lib/format'
import { formatPeriod, periodKey } from '../components/adsUpload'
import { navigate } from '../lib/router'
import { PillSelect } from '../components/pickers'
import type { AdReport, Store } from '../lib/types'

const COMBINED = 'gabungan'

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

export function AdsPage({
  stores,
  storeId,
  quickCheck = false,
}: {
  stores: Store[]
  storeId: number | null
  /** Buka Cek cepat langsung (tautan #/iklan?cek=1). */
  quickCheck?: boolean
}) {
  const store = stores.find((s) => s.id === storeId) ?? null
  const [quickOpen, setQuickOpen] = useState(quickCheck)
  // Tautan ke Cek cepat saat sudah di halaman Iklan: halaman tidak dimuat ulang, jadi buka dari sini.
  const [lastQuick, setLastQuick] = useState(quickCheck)
  if (quickCheck !== lastQuick) {
    setLastQuick(quickCheck)
    if (quickCheck) setQuickOpen(true)
  }
  const [reports, setReports] = useState<AdReport[] | null>(null)
  const [reportsError, setReportsError] = useState<unknown>(null)
  const [selected, setSelected] = useState<string | null>(null)

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
  }, [storeId])

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
      <PageTitle
        kicker={stores.length > 1 ? store?.name : undefined}
        subtitle="Upload data iklan Shopee, lalu lihat produk mana yang perlu dimatikan, dipertahankan, atau dinaikkan target ROAS-nya."
      >
        Iklan
      </PageTitle>

      {/* Data bulanan disimpan lewat halaman Upload; cek iklan beberapa hari lewat Cek cepat (tidak disimpan). */}
      {quickOpen ? (
        <AdsQuickCheck store={store} onClose={() => setQuickOpen(false)} />
      ) : (
        <section className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-tint px-5 py-3 ring-1 ring-line">
          <p className="min-w-0">
            <span className="font-semibold">Mau cek iklan beberapa hari terakhir?</span>{' '}
            <span className="text-ink-2">Cek cepat tanpa menyimpan. Data 1 bulan penuh di-upload di halaman Upload.</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setQuickOpen(true)} disabled={!store}>
              <IconSearch size={18} />
              Cek cepat
            </Button>
            {periods.length > 0 && (
              <a href="#/upload" className={buttonClass('secondary')}>
                <IconUpload size={18} />
                Upload bulanan
              </a>
            )}
          </div>
        </section>
      )}

      {reportsError ? (
        <ErrorBox error={reportsError} />
      ) : !reports ? (
        <Spinner />
      ) : periods.length === 0 ? (
        <Alert title="Belum ada data iklan untuk toko ini.">
          <p>
            Upload file CSV iklan 1 bulan penuh di halaman Upload, bersama export pesanan dan laporan penghasilan. Untuk
            cek iklan beberapa hari saja, pakai Cek cepat di atas.
          </p>
          <a href="#/upload" className={`${buttonClass('primary')} mt-3`}>
            <IconUpload size={18} />
            Ke halaman Upload
          </a>
        </Alert>
      ) : (
        <>
          <div className="mb-8 flex flex-wrap items-center gap-3">
            <label htmlFor="ads-period" className="text-ink-2">
              Periode iklan
            </label>
            <PillSelect id="ads-period" value={selected ?? ''} onChange={(e) => setSelected(e.target.value)}>
              {periods.map((p) => (
                <option key={p.key} value={p.key}>
                  {formatPeriod(p.start, p.end)}
                  {fullMonthOf(p.start, p.end) ? ' (1 bulan)' : ''}
                </option>
              ))}
              {fullMonths.length >= 2 && <option value={COMBINED}>Gabungkan beberapa bulan…</option>}
            </PillSelect>
            {selected === COMBINED && (
              <>
                <label className="flex items-center gap-2 text-ink-2">
                  Dari
                  <PillSelect value={from} onChange={(e) => setRange({ from: e.target.value, to })}>
                    {fullMonths.map((x) => (
                      <option key={x.month} value={x.month}>
                        {formatMonth(x.month)}
                      </option>
                    ))}
                  </PillSelect>
                </label>
                <label className="flex items-center gap-2 text-ink-2">
                  sampai
                  <PillSelect value={to} onChange={(e) => setRange({ from, to: e.target.value })}>
                    {fullMonths.map((x) => (
                      <option key={x.month} value={x.month}>
                        {formatMonth(x.month)}
                      </option>
                    ))}
                  </PillSelect>
                </label>
              </>
            )}
          </div>
          {selected === COMBINED && from > to && (
            <div className="mb-6">
              <Alert tone="error">Bulan "dari" harus sebelum atau sama dengan bulan "sampai".</Alert>
            </div>
          )}
          {period && store && <Analysis key={period.key} storeId={store.id} period={period} />}
        </>
      )}
    </>
  )
}

// --- Analisis -----------------------------------------------------------------

function Analysis({ storeId, period }: { storeId: number; period: Period }) {
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [filter, setFilter] = useState<AdVerdict | 'semua'>('semua')
  const [view, setView] = useState<AdsView>(readAdsView)
  const chooseView = (v: AdsView) => {
    setView(v)
    saveAdsView(v)
  }

  useEffect(() => {
    let cancelled = false
    loadAdsAnalysis(storeId, period)
      .then((loaded) => !cancelled && setData(loaded))
      .catch((e) => !cancelled && setError(e))
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
      <AdsStory analysis={a} period={period} />
      <SummaryCard data={data} period={period} />
      {data.perMonth && <PerMonthCard rows={data.perMonth} />}

      <div className="space-y-3">
        {!data.hasOrders && (
          <Alert tone="warning" title="Export pesanan untuk periode ini belum di-upload.">
            Pesanan batal &amp; retur belum dikurangi dan HPP belum bisa dicocokkan. Upload export pesanan (status Semua) di halaman{' '}
            <a href="#/upload" className={linkClass}>
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
            <button type="button" className={linkClass} onClick={() => navigate('hpp', { kosong: '1' })}>
              Isi HPP
            </button>
          </Alert>
        )}
      </div>

      {main.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
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
          <ViewSwitch view={view} onChange={chooseView} />
        </div>
      )}

      {view === 'daftar' ? (
        <ProductList
          products={shown}
          targets={data.targets}
          monthsOf={data.perMonth ? (code) => productMonths.get(code) ?? [] : undefined}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {shown.map((p, i) => (
            <ProductCard
              key={p.code}
              p={p}
              targets={data.targets}
              months={data.perMonth ? (productMonths.get(p.code) ?? []) : undefined}
              stampDelay={Math.min(i, 8) * 60}
              tilt={i % 2 ? 3 : -3}
            />
          ))}
        </div>
      )}

      {noSales.length > 0 && (filter === 'semua' || filter === 'belum_cukup') && (
        <details className="rounded-3xl bg-paper p-5 shadow-sheet ring-1 ring-line">
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-semibold">
            <span>
              {noSales.length} produk lain belum ada penjualan, total biaya{' '}
              <span className="num">{formatRupiah(noSales.reduce((s, p) => s + p.spend, 0))}</span>
            </span>
            <IconChevronDown size={16} className="chev shrink-0" />
          </summary>
          <p className="mt-2 text-ink-2">Biayanya masih kecil, tunggu dulu. Kalau sudah banyak klik tapi tetap tidak laku, matikan.</p>
          <ul className="mt-3 divide-y divide-line">
            {noSales.map((p) => (
              <li key={p.code} className="flex flex-wrap justify-between gap-x-4 py-2">
                <span className="min-w-0 flex-1">{p.name}</span>
                <span className="num text-ink-2">
                  {formatRupiah(p.spend)} · {formatNumber(p.clicks)} klik
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <HowToRead feeRate={data.feeRate} targets={data.targets} />
    </div>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-11 rounded-full border-2 px-4 font-semibold transition duration-150 active:translate-y-px ${
        active ? 'border-ink bg-ink text-paper' : 'border-control bg-paper text-ink hover:border-ink'
      }`}
    >
      {children}
    </button>
  )
}

function PerMonthCard({ rows }: { rows: { month: string; analysis: AdsAnalysis }[] }) {
  return (
    <Card title="Per bulan">
      <ScrollX>
        <table className="w-full min-w-[34rem] text-left text-base">
          <thead className="border-b border-rule text-sm text-ink-3">
            <tr>
              <th className="py-2 pr-3 font-semibold">Bulan</th>
              <th className="py-2 pr-3 text-right font-semibold">Biaya iklan</th>
              <th className="py-2 pr-3 text-right font-semibold">Omzet iklan (tanpa batal & retur)</th>
              <th className="py-2 pr-3 text-right font-semibold">ROAS nyata</th>
              <th className="py-2 text-right font-semibold">Untung setelah iklan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
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
      </ScrollX>
    </Card>
  )
}

/** Jawabannya dulu, sebagai kalimat besar: iklan periode ini untung/rugi berapa. */
function AdsStory({ analysis: a, period }: { analysis: AdsAnalysis; period: Period }) {
  const month = fullMonthOf(period.start, period.end)
  const label =
    period.months && period.months.length > 1
      ? `${formatMonth(period.months[0])} – ${formatMonth(period.months[period.months.length - 1])}`
      : month
        ? formatMonth(month)
        : formatPeriod(period.start, period.end)
  const loss = a.profitAfterAds < 0
  const takedown = a.products.filter((p) => p.verdict === 'takedown').length
  return (
    <div>
      <h2 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">
        {label}, iklan <span className="hl">{loss ? 'rugi' : 'untung'}</span>{' '}
        <span className={`num whitespace-nowrap ${loss ? 'text-loss' : 'text-gain'}`}>{formatRupiahShort(Math.abs(a.profitAfterAds))}</span>
      </h2>
      <p className="mt-3 text-lg leading-relaxed text-ink-2">
        {takedown > 0 ? (
          <>
            <b className="text-ink">{formatNumber(takedown)} iklan sebaiknya dimatikan</b> (stiker Takedown di bawah).
          </>
        ) : (
          'Tidak ada iklan yang perlu dimatikan.'
        )}{' '}
        Biaya iklan <span className="num">{formatRupiah(a.totalSpend)}</span>.
      </p>
    </div>
  )
}

function SummaryCard({ data, period }: { data: Loaded; period: Period }) {
  const a = data.analysis
  const month = fullMonthOf(period.start, period.end)
  return (
    <Card>
      <p className="text-ink-2">
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
        {data.feeFrom ? `(dari laporan penghasilan ${data.feeFrom})` : '(perkiraan, karena laporan penghasilan belum di-upload)'}
      </p>
      <FeeCoverage products={a.products} />
      <dl className="tear mt-4 space-y-2 pt-3">
        <Line label="Biaya iklan" value={formatRupiah(a.totalSpend)} strong />
        <Line label="Omzet dari iklan (versi Shopee)" value={formatRupiah(a.adsGmv)} />
        <Line
          label="Omzet dari iklan tanpa pesanan batal & retur"
          value={formatRupiah(a.netGmv)}
          note={`ROAS nyata ${formatRoas(a.realRoas)}`}
        />
        <Line label="Untung produk yang diiklankan (sebelum iklan)" value={formatRupiah(a.profitBeforeAds)} />
        <div className="border-t-2 border-ink pt-3">
          <Line
            label="Untung setelah iklan"
            value={formatRupiah(a.profitAfterAds)}
            strong
            tone={a.profitAfterAds < 0 ? 'bad' : 'good'}
          />
        </div>
      </dl>
      {month && period.reports.some((r) => r.source === 'keseluruhan') && (
        <p className="mt-3 text-ink-2">
          Biaya iklan ini sudah otomatis masuk ke{' '}
          <a href={`#/biaya?bulan=${month}`} className={linkClass}>
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
      <dt className={strong ? 'font-semibold' : 'text-ink-2'}>
        {label}
        {note && <span className="num ml-2 text-sm font-normal text-ink-3">({note})</span>}
      </dt>
      <dd className={`num ${strong ? 'font-display text-2xl font-extrabold' : 'font-medium'} ${color}`}>{value}</dd>
    </div>
  )
}

function advice(p: AdProductResult, targets: Targets): string {
  const adsPct = formatPercent(targets.adsProfit * 100)
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
        return `Target untung ${adsPct} tidak mungkin dengan harga sekarang. Naikkan harga${ideal ? ` ke ±${ideal}` : ''}.`
      return `${(p.profitAfterAds ?? 0) >= 0 ? 'Masih untung, tapi' : 'Rugi tipis,'} belum sampai target ${adsPct}. Naikkan target ROAS di Shopee ke ${target}.`
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

function ProductCard({
  p,
  targets,
  months,
  stampDelay = 0,
  tilt = -3,
}: {
  p: AdProductResult
  targets: Targets
  months?: MonthFigure[]
  stampDelay?: number
  tilt?: number
}) {
  const v = VERDICTS[p.verdict]
  return (
    <article className="flex flex-col rounded-3xl bg-paper p-5 shadow-sheet ring-1 ring-line sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <h3 className="line-clamp-2 min-w-0 font-semibold leading-snug" title={p.name}>
          {p.name}
        </h3>
        <Stamp tone={v.tone} delay={stampDelay} tilt={tilt} className="mt-0.5 shrink-0">
          {v.label}
        </Stamp>
      </div>

      <div className="mt-4 grid grid-cols-3 divide-x divide-line border-y border-line py-2.5 text-center">
        <Mini label="Biaya iklan" value={formatRupiah(p.spend)} />
        <Mini label="Terjual" value={formatNumber(Math.round(p.netSold))} detail={soldDetail(p)} />
        <Mini label="ROAS nyata" value={formatRoas(p.realRoas)} detail={roasDetail(p)} />
      </div>

      <ProductDetails p={p} targets={targets} months={months} />
    </article>
  )
}

/** "Shopee: 36 (ada batal & retur)" kalau angka Shopee beda karena pesanan batal/retur. */
function soldDetail(p: AdProductResult): string | undefined {
  if (p.batalQty <= 0 && p.returQty <= 0) return undefined
  const why = [p.batalQty > 0 && 'batal', p.returQty > 0 && 'retur'].filter(Boolean).join(' & ')
  return `Shopee: ${formatNumber(p.adsSold)} (ada ${why})`
}

function roasDetail(p: AdProductResult): string | undefined {
  return p.shopeeRoas !== null && Math.abs((p.shopeeRoas ?? 0) - (p.realRoas ?? 0)) >= 0.05 ? `Shopee: ${formatRoas(p.shopeeRoas)}` : undefined
}

/**
 * Isi kartu di bawah angka utama: harga, ROAS balik modal & saran, untung, peringatan, per bulan, dan saran.
 * `inList`: dipakai di tampilan daftar, yang barisnya sudah menampilkan untung setelah iklan.
 */
function ProductDetails({
  p,
  targets,
  months,
  inList = false,
}: {
  p: AdProductResult
  targets: Targets
  months?: MonthFigure[]
  inList?: boolean
}) {
  return (
    <>
      {inList && (
        // Di HP baris daftar hanya berisi biaya & untung; terjual dan ROAS nyata tampil di sini.
        <div className="space-y-1.5 border-b border-line pb-3 pt-1 sm:hidden">
          <dl>
            <Row label="Terjual" value={formatNumber(Math.round(p.netSold))} />
          </dl>
          {soldDetail(p) && <p className="text-sm text-ink-3">{soldDetail(p)}</p>}
          <dl>
            <Row label="ROAS nyata" value={formatRoas(p.realRoas)} />
          </dl>
          {roasDetail(p) && <p className="text-sm text-ink-3">{roasDetail(p)}</p>}
        </div>
      )}

      {p.price !== null && (
        <div className="mt-3">
          <dl>
            <Row label="Harga jual rata-rata" value={formatRupiah(p.price)} />
          </dl>
          <p className="text-sm text-ink-3">
            {p.priceSource === 'pesanan'
              ? 'Dari export pesanan (subtotal ÷ qty, tanpa batal).'
              : 'Perkiraan dari data iklan (omzet ÷ terjual). Upload export pesanan supaya tepat.'}
          </p>
        </div>
      )}

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
          {!inList && (
            <div className="tear pt-2">
              <Row
                label="Untung setelah iklan"
                value={formatRupiah(p.profitAfterAds)}
                tone={(p.profitAfterAds ?? 0) < 0 ? 'bad' : 'good'}
                strong
              />
            </div>
          )}
        </dl>
      )}

      {p.unitProfit !== null && (
        <p className="mt-2 text-sm text-ink-3">
          Potongan Shopee {formatPercent(p.feeRate * 100)} ·{' '}
          {p.feeSource === 'aktual'
            ? 'asli dari laporan penghasilan'
            : p.feeSource === 'produk'
              ? 'disesuaikan admin produk ini'
              : 'rata-rata toko'}
        </p>
      )}

      {p.margin !== null && p.margin < targets.priceMargin && p.idealPrice !== null && (
        <p className="mt-3 flex gap-2 text-sm text-warn">
          <IconAlertCircle size={18} className="mt-px shrink-0" />
          <span>
            Untung harga di bawah {formatPercent(targets.priceMargin * 100)}. Harga sekarang ±{formatRupiah(p.price)};
            supaya {formatPercent(targets.priceMargin * 100)}:{' '}
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
        <div className="mt-3 border-t border-line pt-2 text-sm text-ink-2">
          <p className="font-semibold">Per bulan:</p>
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

      <p className="mt-auto rounded-2xl bg-tint px-4 py-3 text-ink [margin-top:max(1rem,auto)]">{advice(p, targets)}</p>
      {p.verdict === 'hpp_kosong' && (
        <Button variant="secondary" className="mt-3 self-start" onClick={() => navigate('hpp', { kosong: '1' })}>
          Isi HPP
        </Button>
      )}
    </>
  )
}

type AdsView = 'kartu' | 'daftar'
const VIEW_KEY = 'iklan-tampilan'

/** Pilihan kartu/daftar diingat di browser ini saja; kalau penyimpanan diblokir, kembali ke kartu. */
function readAdsView(): AdsView {
  try {
    return localStorage.getItem(VIEW_KEY) === 'daftar' ? 'daftar' : 'kartu'
  } catch {
    return 'kartu'
  }
}

function saveAdsView(view: AdsView) {
  try {
    localStorage.setItem(VIEW_KEY, view)
  } catch {
    // Mode privat / penyimpanan diblokir: pilihan berlaku sampai halaman ditutup.
  }
}

function ViewSwitch({ view, onChange }: { view: AdsView; onChange: (v: AdsView) => void }) {
  const options: { id: AdsView; label: string; Icon: typeof IconCards }[] = [
    { id: 'kartu', label: 'Kartu', Icon: IconCards },
    { id: 'daftar', label: 'Daftar', Icon: IconRows },
  ]
  return (
    <div role="group" aria-label="Tampilan" className="flex w-fit gap-1 rounded-full bg-tint p-1 ring-1 ring-line">
      {options.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          aria-pressed={view === id}
          onClick={() => onChange(id)}
          className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 font-semibold transition-colors duration-150 ${
            view === id ? 'bg-ink text-paper' : 'text-ink-2 hover:text-ink'
          }`}
        >
          <Icon size={18} />
          {label}
        </button>
      ))}
    </div>
  )
}

/** Kolom tampilan daftar mulai layar lebar: produk, label, 4 angka, panah buka. */
const LIST_COLS = 'lg:grid-cols-[minmax(0,1fr)_12rem_7rem_4.5rem_5.5rem_9rem_1.25rem]'

/**
 * Tampilan daftar: satu baris per produk (nama, label, biaya, terjual, ROAS nyata, untung setelah iklan).
 * Ketuk baris untuk membuka rinciannya (sama dengan isi kartu). Di HP angkanya turun ke bawah nama.
 */
function ProductList({
  products,
  targets,
  monthsOf,
}: {
  products: AdProductResult[]
  targets: Targets
  monthsOf?: (code: string) => MonthFigure[]
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  const toggle = (code: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (!next.delete(code)) next.add(code)
      return next
    })
  return (
    <div className="overflow-hidden rounded-3xl bg-paper shadow-sheet ring-1 ring-line">
      <div aria-hidden="true" className={`hidden gap-x-4 border-b border-line px-6 py-3 text-sm text-ink-3 lg:grid ${LIST_COLS}`}>
        <span>Produk</span>
        <span>Label</span>
        <span className="text-right">Biaya iklan</span>
        <span className="text-right">Terjual</span>
        <span className="text-right">ROAS nyata</span>
        <span className="text-right">Untung setelah iklan</span>
        <span />
      </div>
      <ul className="divide-y divide-line">
        {products.map((p, i) => {
          const isOpen = open.has(p.code)
          const v = VERDICTS[p.verdict]
          const after = p.profitAfterAds
          return (
            <li key={p.code}>
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => toggle(p.code)}
                className={`grid w-full gap-x-4 gap-y-3 px-5 py-4 text-left transition-colors duration-150 hover:bg-tint/60 sm:px-6 lg:items-center ${LIST_COLS}`}
              >
                {/* HP & tablet: nama + panah, label di bawahnya. Layar lebar: semuanya jadi kolom tabel. */}
                <span className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 lg:contents">
                  <span className="line-clamp-2 font-semibold leading-snug" title={p.name}>
                    {p.name}
                  </span>
                  <IconChevronDown
                    size={18}
                    className={`mt-0.5 text-ink-3 transition-transform duration-150 lg:order-last lg:mt-0 ${isOpen ? 'rotate-180' : ''}`}
                  />
                  <span className="justify-self-start">
                    <Stamp tone={v.tone} delay={Math.min(i, 8) * 60} tilt={i % 2 ? 3 : -3} className="whitespace-nowrap">
                      {v.label}
                    </Stamp>
                  </span>
                </span>
                <span className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4 lg:contents">
                  <ListCell label="Biaya iklan" value={formatRupiah(p.spend)} />
                  <ListCell label="Terjual" value={formatNumber(Math.round(p.netSold))} detail={soldDetail(p)} hideOnPhone />
                  <ListCell label="ROAS nyata" value={formatRoas(p.realRoas)} detail={roasDetail(p)} hideOnPhone />
                  <ListCell
                    label="Untung setelah iklan"
                    value={after === null ? '-' : formatRupiah(after)}
                    className={after === null ? '' : after < 0 ? 'text-loss' : 'text-gain'}
                    strong
                  />
                </span>
              </button>
              {isOpen && (
                <div className="flex flex-col px-5 pb-5 sm:px-6 lg:pl-6 lg:pr-[calc(1.5rem+1.25rem+1rem)]">
                  <ProductDetails p={p} targets={targets} months={monthsOf?.(p.code)} inList />
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function ListCell({
  label,
  value,
  detail,
  className = '',
  strong,
  hideOnPhone,
}: {
  label: string
  value: string
  detail?: string
  className?: string
  strong?: boolean
  /** Di HP (< 640px) baris hanya menampilkan biaya & untung; angka ini pindah ke rincian. */
  hideOnPhone?: boolean
}) {
  return (
    <span className={`min-w-0 lg:text-right ${hideOnPhone ? 'hidden sm:block' : ''}`}>
      <span className="block text-xs text-ink-3 lg:sr-only">{label}</span>
      <span className={`num block ${strong ? 'font-bold' : 'font-semibold'} ${className}`}>{value}</span>
      {detail && <span className="block text-xs text-ink-3">{detail}</span>}
    </span>
  )
}

function Mini({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="px-2">
      <p className="text-sm text-ink-3">{label}</p>
      <p className="num text-lg font-semibold">{value}</p>
      {detail && <p className="text-xs text-ink-3">{detail}</p>}
    </div>
  )
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: 'good' | 'bad' }) {
  const color = tone === 'bad' ? 'text-loss' : tone === 'good' ? 'text-gain' : ''
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
      <dt className={strong ? 'font-semibold text-ink' : 'text-ink-2'}>{label}</dt>
      <dd className={`${/^[-±\d]|^Rp/.test(value) ? 'num' : ''} ${strong ? 'text-lg font-bold' : 'font-medium'} ${color}`}>
        {value}
      </dd>
    </div>
  )
}

/**
 * Seberapa banyak produk yang potongannya sudah tepat (asli dari laporan, atau admin produk/kategori).
 * Hanya tampil kalau ada yang belum, supaya jelas apa yang bisa diperbaiki.
 */
function FeeCoverage({ products }: { products: AdProductResult[] }) {
  const withProfit = products.filter((p) => p.unitProfit !== null)
  const actual = withProfit.filter((p) => p.feeSource === 'aktual').length
  const known = withProfit.filter((p) => p.feeSource !== 'rata-rata').length
  if (withProfit.length === 0 || known === withProfit.length) return null
  return (
    <p className="mt-2 flex gap-2 text-sm text-ink-2">
      <IconInfo size={16} className="mt-0.5 shrink-0 text-accent" />
      <span>
        {known === 0
          ? 'Semua produk memakai potongan rata-rata toko.'
          : `${formatNumber(known)} dari ${formatNumber(withProfit.length)} produk memakai potongan ${
              actual === known ? 'asli dari laporan penghasilan' : actual > 0 ? 'asli atau admin produk' : 'admin produk'
            }, sisanya rata-rata toko.`}{' '}
        {actual > 0 ? (
          <>Potongan asli butuh minimal {MIN_LINES_FOR_ACTUAL_FEE} pesanan per produk di laporan penghasilan. Untuk produk lain,{' '}</>
        ) : (
          <>
            Upload laporan penghasilan Excel <strong>Sudah Dilepas</strong> supaya potongan tiap produk memakai angka asli
            (butuh minimal {MIN_LINES_FOR_ACTUAL_FEE} pesanan per produk), atau{' '}
          </>
        )}
        <button type="button" className={linkClass} onClick={() => navigate('simulasi')}>
          atur kategori admin di Simulasi Harga
        </button>
        .
      </span>
    </p>
  )
}

function HowToRead({ feeRate, targets }: { feeRate: number; targets: Targets }) {
  return (
    <details className="rounded-3xl bg-paper p-5 shadow-sheet ring-1 ring-line">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-semibold">
        <IconInfo size={18} className="shrink-0 text-accent" />
        Cara baca angka-angka ini
        <IconChevronDown size={16} className="chev" />
      </summary>
      <ul className="mt-3 list-disc space-y-2 pl-6 text-ink-2 marker:text-rule">
        <li>
          <strong>ROAS</strong> = omzet ÷ biaya iklan. ROAS 10 artinya biaya iklan Rp1.000 menghasilkan omzet Rp10.000.
        </li>
        <li>
          <strong>ROAS nyata</strong>: angka "terjual" dan omzet di laporan iklan Shopee ikut menghitung pesanan yang
          kemudian <strong>batal</strong> atau <strong>diretur</strong>. Aplikasi menguranginya memakai data pesanan
          periode yang sama (porsi batal + retur per produk).
        </li>
        <li>
          <strong>Untung per barang</strong> = harga jual − potongan Shopee − HPP, sebelum iklan dan packaging. Potongan
          Shopee dimulai dari rata-rata toko ({formatPercent(feeRate * 100)}, dari laporan penghasilan), lalu digeser
          sesuai biaya admin tiap produk kalau sudah diisi, supaya total tetap cocok dengan uang yang benar-benar cair.
        </li>
        <li>
          <strong>Balik modal butuh ROAS</strong>: di bawah angka ini, iklan produk itu rugi.
        </li>
        <li>
          <strong>Saran target ROAS di Shopee</strong>: angka untuk diisi di pengaturan iklan (GMV Max ROAS) supaya masih
          untung {formatPercent(targets.adsProfit * 100)} dari harga jual setelah iklan. Sudah termasuk cadangan untuk
          pesanan batal dan retur.
        </li>
        <li>
          Label:
          <span className="mt-2 grid gap-3 sm:grid-cols-2">
            <span><Stamp tone="gain" tilt={false} size="xs">Hero</Stamp> ROAS jauh di atas saran</span>
            <span><Stamp tone="gain" tilt={false} size="xs">Aman</Stamp> sesuai target</span>
            <span>
              <Stamp tone="warn" tilt={false} size="xs">ROAS terlalu kecil</Stamp> di atas balik modal, untung belum{' '}
              {formatPercent(targets.adsProfit * 100)}
            </span>
            <span><Stamp tone="loss" tilt={false} size="xs">Takedown</Stamp> iklan rugi</span>
            <span><Stamp tone="neutral" tilt={false} size="xs">Data belum cukup</Stamp> terjual kurang dari 3</span>
          </span>
        </li>
        <li>
          Harga untuk untung {formatPercent(targets.priceMargin * 100)} = HPP ÷ (1 − potongan Shopee −{' '}
          {formatPercent(targets.priceMargin * 100)}).
        </li>
        <li>
          Target untung {formatPercent(targets.adsProfit * 100)} (setelah iklan) dan {formatPercent(targets.priceMargin * 100)}{' '}
          (harga jual) adalah pengaturan tokomu.{' '}
          <button type="button" className={linkClass} onClick={() => navigate('akun')}>
            Ubah di halaman Akun
          </button>
          .
        </li>
      </ul>
    </details>
  )
}
