// Cek cepat iklan: lihat apakah iklan beberapa hari terakhir jalan bagus. File iklan dibaca di browser dan
// TIDAK disimpan; HPP, potongan, target, dan pesanan diambil dari data toko yang sudah tersimpan. Export pesanan
// untuk tanggal yang sama boleh dipilih di sini: disimpan seperti di halaman Upload, lalu hasilnya dihitung ulang.
import { useMemo, useState, type ChangeEvent, type ReactNode } from 'react'
import { Alert, Card, ErrorBox, Spinner, Stamp, linkClass, type StampTone } from '../components/ui'
import { IconUpload, IconX } from '../components/icons'
import { RupiahInput } from '../components/pickers'
import { AdsHowTo, adsProblem, formatPeriod, groupAdsFiles, parseAdsFiles, type ParsedAdsFile } from '../components/adsUpload'
import { saveOrderItems } from '../lib/api'
import { notifyDataChanged } from '../lib/events'
import { ParseError } from '../lib/parsers/common'
import { analyzeUnsavedAds, loadAdsContext, type AdsContext, type Loaded } from '../lib/adsLoad'
import { productKey, type AdProductResult, type AdVerdict } from '../lib/adsMath'
import { QUICK_VERDICT, buildQuickExport, formatRoas, quickExportFileName, quickProducts } from '../lib/adsQuickExport'
import type { AdsParseResult } from '../lib/parsers/ads'
import { formatNumber, formatPercent, formatRupiah, periodDays } from '../lib/format'
import type { Store } from '../lib/types'

interface CheckedPeriod {
  key: string
  start: string
  end: string
  days: number
  data: Loaded
}

/** File satu periode + data toko untuk periode itu (dimuat sekali; analisis dihitung ulang saat HPP sementara diubah). */
interface LoadedPeriod {
  key: string
  start: string
  end: string
  days: number
  files: AdsParseResult[]
  ctx: AdsContext
}

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; files: ParsedAdsFile[]; periods: LoadedPeriod[]; problem: string | null; error: unknown }

// HPP sementara per nama listing, diingat di browser ini per toko. Tidak masuk ke halaman HPP / database.
const tempHppKey = (storeId: number | undefined) => `quick-hpp:${storeId ?? 'none'}`

function readTempHpp(storeId: number | undefined): Record<string, number> {
  try {
    const raw = localStorage.getItem(tempHppKey(storeId))
    const obj: unknown = raw ? JSON.parse(raw) : {}
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {}
    return Object.fromEntries(
      Object.entries(obj).filter((e): e is [string, number] => typeof e[1] === 'number' && Number.isFinite(e[1]) && e[1] >= 0),
    )
  } catch {
    return {}
  }
}

function writeTempHpp(storeId: number | undefined, value: Record<string, number>) {
  try {
    localStorage.setItem(tempHppKey(storeId), JSON.stringify(value))
  } catch {
    // Penyimpanan browser tidak tersedia: tetap berlaku selama halaman terbuka.
  }
}

/** Warna label Cek cepat; teks labelnya di QUICK_VERDICT (sama dengan file .md). */
const TONE: Record<AdVerdict, StampTone> = {
  hero: 'gain',
  aman: 'gain',
  kurang: 'warn',
  takedown: 'loss',
  belum_cukup: 'neutral',
  hpp_kosong: 'neutral',
}
const QUICK = Object.fromEntries(
  (Object.keys(TONE) as AdVerdict[]).map((k) => [k, { ...QUICK_VERDICT[k], tone: TONE[k] }]),
) as Record<AdVerdict, { label: string; tone: StampTone; note: string }>

const roas = formatRoas

/** Unduh teks sebagai file di browser (tanpa server). */
function downloadText(fileName: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function AdsQuickCheck({ store, onClose }: { store: Store | null; onClose: () => void }) {
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [inputKey, setInputKey] = useState(0)
  const [tempHpp, setTempHppState] = useState<Record<string, number>>(() => readTempHpp(store?.id))

  const setTempHpp = (key: string, value: number | null) => {
    const next = { ...tempHpp }
    if (value === null) delete next[key]
    else next[key] = value
    setTempHppState(next)
    writeTempHpp(store?.id, next)
  }

  const [ordersSave, setOrdersSave] = useState<OrdersSave>({ kind: 'idle' })

  /** Baca & simpan export pesanan (sama dengan halaman Upload). Berhenti di file pertama yang gagal. */
  const saveOrdersFiles = async (storeId: number, files: File[]): Promise<OrdersSave> => {
    let orderCount = 0
    for (const file of files) {
      try {
        const { parseOrdersFile } = await import('../lib/parsers/orders')
        const result = parseOrdersFile(await file.arrayBuffer())
        await saveOrderItems(storeId, result.items)
        orderCount += result.orderCount
      } catch (error) {
        return { kind: 'error', fileName: file.name, error }
      }
    }
    notifyDataChanged()
    return { kind: 'saved', fileNames: files.map((f) => f.name), orderCount, stillMissing: [] }
  }

  /** Tandai periode yang masih tanpa pesanan setelah export pesanan disimpan. */
  const withMissing = (save: OrdersSave, periods: LoadedPeriod[]): OrdersSave =>
    save.kind === 'saved'
      ? { ...save, stillMissing: periods.filter((p) => p.ctx.items.length === 0).map((p) => formatPeriod(p.start, p.end)) }
      : save

  // Data iklan (.csv) dan export pesanan (.xlsx) boleh dipilih sekaligus. Pesanan disimpan dulu, supaya
  // perhitungan iklan langsung memakai variasi yang terjual dan pesanan batal.
  const onFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const list = [...(e.target.files ?? [])]
    if (list.length === 0 || !store) return
    setState({ kind: 'loading' })
    const orderFiles = list.filter((f) => /\.xlsx?$/i.test(f.name))
    const adFiles = list.filter((f) => !/\.xlsx?$/i.test(f.name))
    const save = orderFiles.length > 0 ? await saveOrdersFiles(store.id, orderFiles) : ({ kind: 'idle' } as const)
    setOrdersSave(save)
    if (adFiles.length === 0) {
      setState({
        kind: 'done',
        files: [],
        periods: [],
        problem: save.kind === 'saved' ? 'Export pesanan tersimpan. Pilih juga file data iklan (.csv) untuk tanggal yang sama.' : null,
        error: null,
      })
      return
    }
    const files = await parseAdsFiles(adFiles)
    const groups = groupAdsFiles(files.flatMap((f) => (f.result ? [f.result] : [])))
    const problem =
      adsProblem(groups) ??
      (groups.length > 2 ? `Ada ${groups.length} periode. Pilih maksimal 2 periode untuk dibandingkan.` : null)
    if (problem || groups.length === 0) {
      setState({ kind: 'done', files, periods: [], problem, error: null })
      return
    }
    try {
      const periods = await Promise.all(
        groups.map(async (g) => ({
          key: g.key,
          start: g.start,
          end: g.end,
          days: periodDays(g.start, g.end),
          files: g.files,
          ctx: await loadAdsContext(store.id, g.start, g.end),
        })),
      )
      setState({ kind: 'done', files, periods, problem: null, error: null })
      setOrdersSave(withMissing(save, periods))
    } catch (error) {
      setState({ kind: 'done', files, periods: [], problem: null, error })
    }
  }

  // Export pesanan dipilih setelah hasil keluar: simpan, lalu muat ulang data toko untuk periode yang sedang
  // dicek. File iklan tidak perlu dipilih ulang.
  const onOrdersFile = async (file: File) => {
    if (!store || state.kind !== 'done') return
    const current = state
    setOrdersSave({ kind: 'saving', fileName: file.name })
    if (!/\.xlsx?$/i.test(file.name)) {
      setOrdersSave({
        kind: 'error',
        fileName: file.name,
        error: new ParseError('Pilih file Excel (.xlsx) dari Pesanan Saya → Export, untuk tanggal yang sama dengan data iklan.'),
      })
      return
    }
    const save = await saveOrdersFiles(store.id, [file])
    if (save.kind !== 'saved') {
      setOrdersSave(save)
      return
    }
    try {
      const periods = await Promise.all(
        current.periods.map(async (p) => ({ ...p, ctx: await loadAdsContext(store.id, p.start, p.end) })),
      )
      setState({ ...current, periods })
      setOrdersSave(withMissing(save, periods))
    } catch (error) {
      setOrdersSave({ kind: 'error', fileName: file.name, error })
    }
  }

  const reset = () => {
    setState({ kind: 'idle' })
    setOrdersSave({ kind: 'idle' })
    setInputKey((k) => k + 1)
  }

  const done = state.kind === 'done' ? state : null
  // Hitung ulang (tanpa memuat ulang data) setiap kali HPP sementara berubah.
  const checked = useMemo((): CheckedPeriod[] => {
    if (!done) return []
    const temp = new Map(Object.entries(tempHpp))
    return done.periods.map((p) => ({
      key: p.key,
      start: p.start,
      end: p.end,
      days: p.days,
      data: analyzeUnsavedAds(p.ctx, p.files, temp),
    }))
  }, [done, tempHpp])
  const latest = checked[checked.length - 1] ?? null
  const previous = checked.length > 1 ? checked[0] : null

  return (
    <Card
      title={
        <span className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex flex-wrap items-center gap-3">
            Cek cepat iklan
            <Stamp tone="neutral" tilt={false} size="xs">
              Data iklan tidak disimpan
            </Stamp>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 font-sans text-base font-semibold text-ink-2 transition-colors hover:bg-tint hover:text-ink"
          >
            <IconX size={18} />
            Tutup
          </button>
        </span>
      }
      className="reveal mb-8"
    >
      <p className="mb-3 text-ink-2">
        Untuk melihat apakah iklan beberapa hari terakhir jalan bagus. Download data iklan periode pendek (mis. 3 atau 7
        hari) <strong className="text-ink">dan export pesanan untuk tanggal yang sama</strong>, lalu pilih semua
        filenya sekaligus di sini. Boleh <strong className="text-ink">2 periode</strong> untuk dibandingkan, mis.
        minggu lalu dan minggu ini.
      </p>
      <ul className="mb-3 list-disc space-y-1 pl-6 text-sm text-ink-2">
        <li>
          <strong className="text-ink">Data iklan (.csv)</strong>: dibaca saja, tidak disimpan. Hasilnya hilang saat
          halaman ditutup.
        </li>
        <li>
          <strong className="text-ink">Export pesanan (.xlsx)</strong>: Seller Centre → Pesanan Saya → Export, status{' '}
          <strong className="text-ink">Semua</strong>. Disimpan seperti di halaman Upload (dipakai juga untuk Rekap),
          supaya ketahuan variasi mana yang terjual. Data pembeli tidak dibaca.
        </li>
      </ul>
      <AdsHowTo />

      <label className="flex cursor-pointer flex-wrap items-center gap-4 rounded-2xl border-2 border-dashed border-control/70 bg-tint p-4 transition-colors hover:border-accent focus-within:border-accent">
        <span className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-ink px-4 font-semibold text-paper">
          <IconUpload size={18} />
          Pilih file
        </span>
        <span className="min-w-0 flex-1 truncate text-ink-2">
          {done
            ? `${done.files.length} file iklan${ordersSave.kind === 'saved' ? ` + ${ordersSave.fileNames.length} pesanan` : ''}`
            : 'Data iklan (.csv) + export pesanan (.xlsx), boleh sekaligus'}
        </span>
        <input
          key={inputKey}
          type="file"
          accept=".csv,text/csv,.xlsx,.xls"
          multiple
          className="sr-only"
          disabled={!store || state.kind === 'loading'}
          onChange={onFiles}
        />
      </label>

      {state.kind === 'loading' && <Spinner label="Membaca file, menyimpan pesanan, dan menghitung…" />}

      {done && (
        <div className="mt-4 space-y-4">
          {done.files
            .filter((f) => f.error)
            .map((f) => (
              <div key={f.fileName} className="rounded-2xl bg-tint p-4">
                <p className="break-all text-sm text-ink-2">{f.fileName}</p>
                <div className="mt-2">
                  <ErrorBox error={f.error} reportFile={{ kind: 'data iklan', fileName: f.fileName }} />
                </div>
              </div>
            ))}
          {!latest && ordersSave.kind === 'error' && (
            <ErrorBox error={ordersSave.error} reportFile={{ kind: 'export pesanan', fileName: ordersSave.fileName }} />
          )}
          {done.problem && <Alert tone={ordersSave.kind === 'saved' && done.files.length === 0 ? 'info' : 'error'}>{done.problem}</Alert>}
          {done.error ? <ErrorBox error={done.error} /> : null}

          {latest && (
            <>
              <Alert tone="warning" title="Angka beberapa hari cenderung terlalu bagus">
                Pesanan yang batal atau diretur biasanya baru kelihatan 1–2 minggu kemudian, jadi belum ikut dikurangi.
                Pakai untuk melihat arah, bukan untung akhir.
              </Alert>
              <OrdersBox checked={checked} save={ordersSave} onFile={onOrdersFile} />

              <div className={`grid gap-4 ${previous ? 'md:grid-cols-2' : ''}`}>
                {previous && <PeriodSummary period={previous} label="Sebelumnya" />}
                <PeriodSummary period={latest} label={previous ? 'Terbaru' : undefined} compare={previous} />
              </div>

              <ProductList latest={latest} previous={previous} onTempHpp={setTempHpp} />

              <section className="rounded-2xl bg-tint p-4">
                <p className="font-semibold">Mau bertanya lebih dalam ke Claude?</p>
                <p className="mt-1 text-sm text-ink-2">
                  Download hasil ini sebagai file .md, lalu lampirkan di chat Claude. Isinya angka per produk
                  (termasuk HPP dan untung) beserta cara membacanya; tanpa data pembeli. HPP dan untung adalah
                  rahasia toko, jadi bagikan hanya ke layanan yang kamu percaya.
                </p>
                <button
                  type="button"
                  onClick={() => downloadExport(store, checked)}
                  className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg bg-ink px-4 font-semibold text-paper"
                >
                  Download untuk Claude (.md)
                </button>
              </section>

              <button type="button" onClick={reset} className={`${linkClass} min-h-11`}>
                Cek file lain
              </button>
            </>
          )}
        </div>
      )}
    </Card>
  )
}

function downloadExport(store: Store | null, checked: CheckedPeriod[]) {
  const last = checked[checked.length - 1]
  if (!store || !last) return
  const text = buildQuickExport({
    storeName: store.name,
    createdAt: new Date().toISOString(),
    periods: checked.map((c) => ({
      start: c.start,
      end: c.end,
      days: c.days,
      analysis: c.data.analysis,
      targets: c.data.targets,
      hasOrders: c.data.hasOrders,
    })),
  })
  downloadText(quickExportFileName(store.name, last.end), text)
}

type OrdersSave =
  | { kind: 'idle' }
  | { kind: 'saving'; fileName: string }
  | { kind: 'saved'; fileNames: string[]; orderCount: number; stillMissing: string[] }
  | { kind: 'error'; fileName: string; error: unknown }

/**
 * Status pesanan untuk tanggal yang dicek: peringatan + tombol kalau belum ada, hasil simpan, dan tombol untuk
 * memperbarui pesanan (mis. pesanan hari terakhir belum ikut).
 */
function OrdersBox({ checked, save, onFile }: { checked: CheckedPeriod[]; save: OrdersSave; onFile: (file: File) => void }) {
  const [inputKey, setInputKey] = useState(0)
  const missing = checked.filter((c) => !c.data.hasOrders)

  const picker = (label: string, primary: boolean) => (
    <label
      className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-4 font-semibold focus-within:outline focus-within:outline-2 focus-within:outline-accent ${
        primary ? 'bg-ink text-paper' : 'bg-paper text-ink ring-1 ring-line hover:ring-accent'
      }`}
    >
      <IconUpload size={18} />
      {label}
      <input
        key={inputKey}
        type="file"
        accept=".xlsx,.xls"
        className="sr-only"
        disabled={save.kind === 'saving'}
        onChange={(e) => {
          const file = e.target.files?.[0]
          setInputKey((k) => k + 1)
          if (file) onFile(file)
        }}
      />
    </label>
  )

  return (
    <div className="space-y-3">
      {save.kind === 'saved' && (
        <Alert tone={save.stillMissing.length > 0 ? 'warning' : 'success'} title="Export pesanan tersimpan">
          {formatNumber(save.orderCount)} pesanan dari {save.fileNames.join(', ')} disimpan; hasil di bawah sudah
          memakainya.
          {save.stillMissing.length > 0 &&
            ` Tapi tidak ada pesanan yang dibuat pada ${save.stillMissing.join(' dan ')}. Pastikan tanggal export pesanan sama dengan data iklan.`}
        </Alert>
      )}
      {missing.length > 0 ? (
        <Alert tone="warning" title="Pesanan tanggal ini belum ada, label Stop/Lanjut belum pasti">
          <p>
            Export pesanan{' '}
            {missing.length > 1 ? 'untuk kedua periode' : `untuk ${formatPeriod(missing[0].start, missing[0].end)}`} belum
            di-upload, jadi aplikasi belum tahu <strong>variasi mana yang terjual</strong> dan pesanan batal belum
            dikurangi. Produk dengan beberapa variasi bisa keliru jadi Stop.
          </p>
          <p className="mt-1">Pilih export pesanan Shopee (status Semua) dengan tanggal yang sama.</p>
          <div className="mt-3">{picker('Pilih export pesanan', true)}</div>
        </Alert>
      ) : (
        <div className="flex flex-col items-start gap-3 rounded-2xl bg-tint p-4 text-sm text-ink-2 sm:flex-row sm:items-center">
          <p className="min-w-0 flex-1">
            Pesanan untuk tanggal ini sudah ada. Kalau pesanan hari terakhir belum ikut, pilih export pesanan terbaru.
          </p>
          {picker('Perbarui pesanan', false)}
        </div>
      )}
      {save.kind === 'saving' && <Spinner label="Menyimpan pesanan dan menghitung ulang…" />}
      {save.kind === 'error' && (
        <ErrorBox error={save.error} reportFile={{ kind: 'export pesanan', fileName: save.fileName }} />
      )}
    </div>
  )
}

function PeriodSummary({ period, label, compare }: { period: CheckedPeriod; label?: string; compare?: CheckedPeriod | null }) {
  const a = period.data.analysis
  const before = compare?.data.analysis
  return (
    <section className="rounded-2xl bg-tint p-4">
      <p className="text-sm font-semibold text-ink-3">
        {label ? `${label} · ` : ''}
        {formatPeriod(period.start, period.end)} ({period.days} hari)
      </p>
      <dl className="mt-2 space-y-1.5">
        <SummaryRow label="Biaya iklan" value={formatRupiah(a.totalSpend)} />
        <SummaryRow
          label="ROAS nyata"
          value={roas(a.realRoas)}
          change={before ? trend(a.realRoas, before.realRoas) : undefined}
        />
        <SummaryRow
          label="Untung setelah iklan"
          value={formatRupiah(a.profitAfterAds)}
          tone={a.profitAfterAds < 0 ? 'loss' : 'gain'}
        />
      </dl>
      {a.productsWithoutProfit > 0 && (
        <p className="mt-2 text-sm text-ink-3">{a.productsWithoutProfit} produk terjual belum punya HPP, untungnya belum dihitung.</p>
      )}
      {a.products.some((p) => p.hppTemp) && (
        <p className="mt-2 text-sm text-ink-3">
          Termasuk {a.products.filter((p) => p.hppTemp).length} produk dengan HPP sementara.
        </p>
      )}
    </section>
  )
}

function SummaryRow({ label, value, tone, change }: { label: string; value: string; tone?: 'gain' | 'loss'; change?: Trend }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
      <dt className="text-ink-2">{label}</dt>
      <dd className={`num font-semibold ${tone === 'loss' ? 'text-loss' : tone === 'gain' ? 'text-gain' : ''}`}>
        {value}
        {change && <TrendBadge t={change} />}
      </dd>
    </div>
  )
}

type Trend = { dir: 'up' | 'down' | 'flat'; text: string }

function trend(now: number | null, before: number | null | undefined): Trend | undefined {
  if (now === null || before === null || before === undefined || before <= 0) return undefined
  const change = now / before - 1
  if (Math.abs(change) < 0.05) return { dir: 'flat', text: 'sama' }
  return { dir: change > 0 ? 'up' : 'down', text: `${change > 0 ? '+' : '−'}${formatPercent(Math.abs(change) * 100)}` }
}

function TrendBadge({ t }: { t: Trend }) {
  const cls = t.dir === 'up' ? 'text-gain' : t.dir === 'down' ? 'text-loss' : 'text-ink-3'
  const arrow = t.dir === 'up' ? '▲' : t.dir === 'down' ? '▼' : '='
  return (
    <span className={`ml-2 text-sm font-semibold ${cls}`}>
      <span aria-hidden>{arrow}</span> {t.text}
      <span className="sr-only"> dibanding periode sebelumnya</span>
    </span>
  )
}

type OnTempHpp = (key: string, value: number | null) => void

function ProductList({
  latest,
  previous,
  onTempHpp,
}: {
  latest: CheckedPeriod
  previous: CheckedPeriod | null
  onTempHpp: OnTempHpp
}) {
  const before = new Map((previous?.data.analysis.products ?? []).map((p) => [p.code, p]))
  const products = quickProducts(latest.data.analysis)
  if (products.length === 0) return <Alert>Belum ada produk dengan biaya iklan di periode ini.</Alert>
  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {products.map((p) => (
        <ProductRow key={p.code} p={p} before={before.get(p.code)} onTempHpp={onTempHpp} />
      ))}
    </ul>
  )
}

function ProductRow({
  p,
  before,
  onTempHpp,
}: {
  p: AdProductResult
  before: AdProductResult | undefined
  onTempHpp: OnTempHpp
}) {
  const v = QUICK[p.verdict]
  // HPP dari halaman HPP / pesanan tidak ada (atau sedang memakai isian sementara): boleh diisi di sini.
  const needsHpp = p.hpp === null || p.hppTemp || p.hppAvgVariants > 1
  const cpc = p.clicks > 0 ? p.spend / p.clicks : null
  const conv = p.clicks > 0 ? p.adsSold / p.clicks : null
  const roasTrend = before ? trend(p.realRoas, before.realRoas) : undefined
  return (
    <li className="flex flex-col rounded-2xl p-4 ring-1 ring-line">
      <div className="flex items-start justify-between gap-3">
        <p className="line-clamp-2 min-w-0 font-semibold leading-snug" title={p.name}>
          {p.name}
        </p>
        <Stamp tone={v.tone} tilt={false} size="xs" className="shrink-0">
          {v.label}
        </Stamp>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <Metric label="Biaya iklan" value={formatRupiah(p.spend)} />
        <Metric label="Terjual" value={formatNumber(Math.round(p.netSold))} detail={p.adsSold !== Math.round(p.netSold) ? `Shopee: ${formatNumber(p.adsSold)}` : undefined} />
        <Metric label="Biaya per klik" value={cpc !== null ? formatRupiah(cpc) : '–'} detail={`${formatNumber(p.clicks)} klik`} />
        <Metric label="Klik jadi pesanan" value={conv !== null ? formatPercent(conv * 100) : '–'} />
        <Metric
          label="ROAS nyata"
          value={roas(p.realRoas)}
          extra={roasTrend && <TrendBadge t={roasTrend} />}
          detail={before ? `sebelumnya ${roas(before.realRoas)}` : undefined}
        />
        <Metric label="Balik modal butuh ROAS" value={p.bepRoas !== null ? roas(p.bepRoas) : p.unitProfit === null ? '–' : 'tidak mungkin'} />
      </dl>
      {p.hppAvgVariants > 1 && (
        <p className="mt-3 rounded-xl border border-sun bg-sun-tint p-3 text-sm text-ink">
          <strong>Belum pasti.</strong> HPP = rata-rata {p.hppAvgVariants} variasi, karena pesanan tanggal ini belum
          ada; belum tentu variasi yang terjual. Pilih export pesanan di atas, atau isi HPP sementara.
        </p>
      )}
      {needsHpp && (
        <div className="mt-3 rounded-xl bg-tint p-3">
          <p className="mb-1.5 text-sm font-semibold">HPP sementara per barang</p>
          <RupiahInput
            value={p.hppTemp ? p.hpp : null}
            onCommit={(value) => onTempHpp(productKey(p.name), value)}
            ariaLabel={`HPP sementara ${p.name}`}
          />
          <p className="mt-1 text-xs text-ink-3">
            {p.hppTemp
              ? 'Dipakai hanya di Cek cepat, diingat di browser ini. Isi HPP resmi di halaman HPP.'
              : p.hppAvgVariants > 1
                ? 'Kalau tahu variasi mana yang laku, isi HPP rata-ratanya di sini. Tidak disimpan ke halaman HPP.'
                : 'Produk ini belum punya HPP. Isi perkiraan modal per barang untuk melihat Lanjut/Stop. Tidak disimpan ke halaman HPP.'}
          </p>
        </div>
      )}
      <p className="mt-3 text-sm text-ink-2">{p.hppTemp && p.verdict !== 'hpp_kosong' ? `${v.note} (pakai HPP sementara)` : v.note}</p>
    </li>
  )
}

function Metric({ label, value, detail, extra }: { label: string; value: string; detail?: string; extra?: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-ink-3">{label}</dt>
      <dd className="num text-base font-semibold text-ink">
        {value}
        {extra}
      </dd>
      {detail && <dd className="text-xs text-ink-3">{detail}</dd>}
    </div>
  )
}
