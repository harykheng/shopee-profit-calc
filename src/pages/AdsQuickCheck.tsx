// Cek cepat iklan: lihat apakah iklan beberapa hari terakhir jalan bagus. File dibaca di browser dan
// TIDAK disimpan; HPP, potongan, target, dan pesanan diambil dari data toko yang sudah tersimpan.
import { useMemo, useState, type ChangeEvent, type ReactNode } from 'react'
import { Alert, Card, ErrorBox, Spinner, Stamp, linkClass, type StampTone } from '../components/ui'
import { IconUpload, IconX } from '../components/icons'
import { RupiahInput } from '../components/pickers'
import { AdsHowTo, adsProblem, formatPeriod, groupAdsFiles, parseAdsFiles, type ParsedAdsFile } from '../components/adsUpload'
import { analyzeUnsavedAds, loadAdsContext, type AdsContext, type Loaded } from '../lib/adsLoad'
import { productKey, type AdProductResult, type AdVerdict } from '../lib/adsMath'
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

/** Vonis versi tes: aturannya sama dengan halaman Iklan, labelnya dibuat untuk keputusan lanjut / stop. */
const QUICK: Record<AdVerdict, { label: string; tone: StampTone; note: string }> = {
  hero: { label: 'Lanjut', tone: 'gain', note: 'ROAS jauh di atas target. Iklan jalan bagus.' },
  aman: { label: 'Lanjut', tone: 'gain', note: 'ROAS sudah di atas target untung.' },
  kurang: { label: 'Lanjut, pantau', tone: 'warn', note: 'Sudah balik modal, tapi belum mencapai target untung.' },
  takedown: { label: 'Stop', tone: 'loss', note: 'Biaya iklan sudah lebih besar dari untung yang dihasilkan.' },
  belum_cukup: { label: 'Belum cukup data', tone: 'neutral', note: 'Penjualannya masih terlalu sedikit untuk dinilai.' },
  hpp_kosong: { label: 'Isi HPP', tone: 'neutral', note: 'HPP belum diisi, jadi untungnya belum bisa dihitung.' },
}
const ORDER: AdVerdict[] = ['takedown', 'kurang', 'hpp_kosong', 'belum_cukup', 'aman', 'hero']

const roas = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(v)
    ? '–'
    : new Intl.NumberFormat('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v)

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

  const onFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const list = [...(e.target.files ?? [])]
    if (list.length === 0 || !store) return
    setState({ kind: 'loading' })
    const files = await parseAdsFiles(list)
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
    } catch (error) {
      setState({ kind: 'done', files, periods: [], problem: null, error })
    }
  }

  const reset = () => {
    setState({ kind: 'idle' })
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
              Tidak disimpan
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
        hari), lalu pilih filenya di sini. Boleh <strong className="text-ink">2 periode</strong> sekaligus untuk
        dibandingkan, mis. minggu lalu dan minggu ini. Hasilnya hilang saat halaman ditutup.
      </p>
      <AdsHowTo />

      <label className="flex cursor-pointer flex-wrap items-center gap-4 rounded-2xl border-2 border-dashed border-control/70 bg-tint p-4 transition-colors hover:border-accent focus-within:border-accent">
        <span className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-ink px-4 font-semibold text-paper">
          <IconUpload size={18} />
          Pilih file
        </span>
        <span className="min-w-0 flex-1 truncate text-ink-2">
          {done ? `${done.files.length} file dibaca` : 'Boleh pilih beberapa file .csv sekaligus'}
        </span>
        <input
          key={inputKey}
          type="file"
          accept=".csv,text/csv"
          multiple
          className="sr-only"
          disabled={!store || state.kind === 'loading'}
          onChange={onFiles}
        />
      </label>

      {state.kind === 'loading' && <Spinner label="Membaca file dan menghitung…" />}

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
          {done.problem && <Alert tone="error">{done.problem}</Alert>}
          {done.error ? <ErrorBox error={done.error} /> : null}

          {latest && (
            <>
              <Alert tone="warning" title="Angka beberapa hari cenderung terlalu bagus">
                Pesanan yang batal atau diretur biasanya baru kelihatan 1–2 minggu kemudian, jadi belum ikut dikurangi.
                Pakai untuk melihat arah, bukan untung akhir.
              </Alert>
              {!latest.data.hasOrders && (
                <Alert tone="info">
                  Export pesanan untuk tanggal ini belum di-upload, jadi pesanan batal belum dikurangi sama sekali. HPP
                  diambil dari halaman HPP; produk yang belum punya HPP bisa diisi HPP sementara di kartunya.
                </Alert>
              )}

              <div className={`grid gap-4 ${previous ? 'md:grid-cols-2' : ''}`}>
                {previous && <PeriodSummary period={previous} label="Sebelumnya" />}
                <PeriodSummary period={latest} label={previous ? 'Terbaru' : undefined} compare={previous} />
              </div>

              <ProductList latest={latest} previous={previous} onTempHpp={setTempHpp} />

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
  const products = [...latest.data.analysis.products]
    .filter((p) => p.spend > 0)
    .sort((a, b) => ORDER.indexOf(a.verdict) - ORDER.indexOf(b.verdict) || b.spend - a.spend)
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
  const needsHpp = p.hpp === null || p.hppTemp
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
