import { useEffect, useId, useState, type ChangeEvent } from 'react'
import { Alert, Button, Card, ErrorBox, Modal, PageTitle, ScrollX, Spinner, Stamp, linkClass } from '../components/ui'
import { IconCheck, IconMinus, IconStore, IconUpload } from '../components/icons'
import {
  AdsHowTo,
  AdsPreview,
  AdsSavedList,
  adsProblem,
  groupAdsFiles,
  parseAdsFiles,
  saveAdsGroups,
  type ParsedAdsFile,
  type SavedAdsPeriod,
} from '../components/adsUpload'
import { fetchProducts, findAdShopElsewhere, saveAdjustments, saveIncome, saveOrderItems } from '../lib/api'
import { notifyDataChanged } from '../lib/events'
import { ROUTES, navigate } from '../lib/router'
import { formatDate, formatDateTime, formatNumber, formatRupiah } from '../lib/format'
import { ParseError, type ParseWarning } from '../lib/parsers/common'
import type { AdsParseResult } from '../lib/parsers/ads'
import type { IncomeParseResult } from '../lib/parsers/income'
import type { OrdersParseResult } from '../lib/parsers/orders'
import type { Product, Store, UpsertCounts } from '../lib/types'

type Parsed<T> = { fileName: string; result?: T; error?: unknown; loading?: boolean }

interface SaveSummary {
  storeName: string
  orders?: { inserted: number; updated: number; unchanged: number; skipped: number; newProducts: number }
  income?: UpsertCounts & { totalIncome: number; adjustmentsTotal: number; adjustmentsSaved: number }
  ads?: SavedAdsPeriod[]
  missingHpp: Product[]
}

const PREVIEW_ROWS = 10

// Kartu 1 dan 2 berbagi baris grid (judul, keterangan, kotak upload, preview), jadi kotak uploadnya
// selalu sejajar walau keterangan di salah satu kartu jadi 2 baris. Hanya di layar lebar (kartu berdampingan).
// Subgrid ikut memakan setengah gap grid induk (12px) di tepi bawah, jadi padding bawahnya dikurangi.
const ALIGNED = 'lg:grid lg:grid-rows-subgrid lg:row-span-4 lg:content-start lg:gap-y-0 lg:pb-4'

export function UploadPage({
  stores,
  storeId,
}: {
  stores: Store[]
  storeId: number | null
}) {
  const [orders, setOrders] = useState<Parsed<OrdersParseResult> | null>(null)
  const [income, setIncome] = useState<Parsed<IncomeParseResult> | null>(null)
  const [ads, setAds] = useState<{ files: ParsedAdsFile[]; loading?: boolean } | null>(null)
  const [adsElsewhere, setAdsElsewhere] = useState<{ shop: string; storeName: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<unknown>(null)
  const [summary, setSummary] = useState<SaveSummary | null>(null)
  const [inputKey, setInputKey] = useState(0)
  /** Alamat yang mau dibuka saat file sudah dipilih tapi belum disimpan (memunculkan dialog "simpan dulu"). */
  const [leaveTo, setLeaveTo] = useState<string | null>(null)

  const store = stores.find((s) => s.id === storeId) ?? null
  // Nama toko hanya ditampilkan kalau akun punya lebih dari satu toko (pemilih toko juga hanya ada saat itu).
  const multiStore = stores.length > 1

  const adsOk = (ads?.files ?? []).filter((f) => f.result).map((f) => f.result as AdsParseResult)
  const allAdsGroups = groupAdsFiles(adsOk)
  // Hanya data 1 bulan penuh yang disimpan; periode lain diarahkan ke Cek cepat di halaman Iklan.
  const adsGroups = allAdsGroups.filter((g) => g.month !== null)
  const adsSkipped = allAdsGroups.length - adsGroups.length
  const adsBlocked = adsProblem(adsGroups)

  const onOrdersFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSummary(null)
    setOrders({ fileName: file.name, loading: true })
    try {
      if (/\.pdf$/i.test(file.name)) {
        throw new ParseError(
          'Ini file PDF. Untuk export pesanan, pilih file Excel (.xlsx) dari Pesanan Saya → Export. ' +
            'File PDF laporan penghasilan di-upload di kotak "2. Laporan penghasilan".',
        )
      }
      if (/\.csv$/i.test(file.name)) {
        throw new ParseError(
          'Ini file CSV. Untuk export pesanan, pilih file Excel (.xlsx). File CSV data iklan di-upload di kotak "3. Data iklan".',
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
            'File Excel export pesanan di-upload di kotak "1. Export pesanan".',
        )
      }
      if (/\.csv$/i.test(file.name)) {
        throw new ParseError(
          'Ini file CSV. Untuk laporan penghasilan, pilih file PDF. File CSV data iklan di-upload di kotak "3. Data iklan".',
        )
      }
      const { parseIncomeFile } = await import('../lib/parsers/incomeFile')
      const result = await parseIncomeFile(await file.arrayBuffer())
      setIncome({ fileName: file.name, result })
    } catch (error) {
      setIncome({ fileName: file.name, error })
    }
  }

  const onAdsFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const list = [...(e.target.files ?? [])]
    if (list.length === 0) return
    setSummary(null)
    setAdsElsewhere(null)
    setAds({ files: [], loading: true })
    const files = await parseAdsFiles(list)
    setAds({ files })
    const shop = files.find((p) => p.result?.shopName)?.result?.shopName
    if (shop && store) {
      try {
        const other = await findAdShopElsewhere(shop, store.id)
        const otherStore = stores.find((s) => s.id === other)
        if (otherStore) setAdsElsewhere({ shop, storeName: otherStore.name })
      } catch {
        // Tabel belum ada / gagal cek: abaikan, error akan muncul saat simpan.
      }
    }
  }

  const clearFiles = () => {
    setOrders(null)
    setIncome(null)
    setAds(null)
    setAdsElsewhere(null)
    setInputKey((k) => k + 1)
  }

  const leave = (href: string) => {
    setLeaveTo(null)
    window.location.hash = href.slice(1)
  }

  const reset = () => {
    clearFiles()
    setSummary(null)
    setSaveError(null)
  }

  const hasData = Boolean(orders?.result || income?.result || adsGroups.length > 0)
  const reading = Boolean(orders?.loading || income?.loading || ads?.loading)
  const hasFileErrors = Boolean(orders?.error || income?.error || ads?.files.some((f) => f.error))
  const canSave = Boolean(store) && hasData && !adsBlocked && !reading && !saving

  // File yang sudah dibaca tapi belum disimpan hilang kalau pindah halaman. Tahan semua tautan di dalam
  // aplikasi (menu, logo) dan tanya dulu; menutup / memuat ulang tab memakai peringatan browser.
  useEffect(() => {
    if (!hasData) return
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const link = e.target instanceof Element ? e.target.closest('a[href^="#/"]') : null
      const href = link?.getAttribute('href')
      if (!href || link?.getAttribute('target') === '_blank' || /^#\/upload(\?|$)/.test(href)) return
      e.preventDefault()
      setLeaveTo(href)
    }
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    document.addEventListener('click', onClick, true)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      document.removeEventListener('click', onClick, true)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [hasData])

  /** Mengembalikan true kalau tersimpan. */
  const save = async (): Promise<boolean> => {
    if (!store || !canSave) return false
    setSaving(true)
    setSaveError(null)
    let savedSomething = false
    try {
      const out: SaveSummary = { storeName: store.name, missingHpp: [] }
      if (orders?.result) {
        const r = orders.result
        const counts = await saveOrderItems(store.id, r.items)
        savedSomething = true
        out.orders = { ...counts, skipped: r.invalid }
        const uploadedSkus = new Set(r.items.map((i) => i.sku))
        out.missingHpp = (await fetchProducts(store.id)).filter((p) => p.hpp === null && uploadedSkus.has(p.sku))
      }
      if (income?.result) {
        const r = income.result
        const counts = await saveIncome(store.id, r.days)
        savedSomething = true
        // Hanya panggil kalau ada penyesuaian, supaya laporan tanpa penyesuaian tetap bisa
        // disimpan walau SQL tambahan belum dijalankan.
        const adj = r.adjustments.length > 0 ? await saveAdjustments(store.id, r.adjustments) : null
        out.income = {
          ...counts,
          totalIncome: r.totalIncome,
          adjustmentsTotal: r.adjustments.reduce((s, a) => s + a.amount, 0),
          adjustmentsSaved: adj ? adj.inserted + adj.updated + adj.unchanged : 0,
        }
      }
      if (adsGroups.length > 0) {
        out.ads = await saveAdsGroups(store.id, adsGroups)
        savedSomething = true
      }
      setSummary(out)
      clearFiles()
      return true
    } catch (error) {
      // File tetap dipilih: simpan ulang aman karena data yang sudah masuk tidak akan dobel.
      setSaveError(error)
      return false
    } finally {
      if (savedSomething) notifyDataChanged()
      setSaving(false)
    }
  }

  return (
    <>
      <PageTitle
        kicker={multiStore ? store?.name : undefined}
        subtitle="Pilih semua laporan dari Seller Centre Shopee, cek preview-nya, lalu simpan sekali. Upload file yang sama dua kali aman, datanya tidak akan dobel."
      >
        Upload laporan
      </PageTitle>

      {multiStore && (
        <div className="mb-8 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-tint px-5 py-4 ring-1 ring-line">
          <IconStore size={22} className="shrink-0 text-accent" />
          <span className="text-ink-2">Disimpan ke toko</span>
          <strong className="font-display text-xl font-extrabold">{store?.name ?? '-'}</strong>
          <span className="text-sm text-ink-2">(ganti toko di bar atas)</span>
        </div>
      )}

      <div className="mb-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
        <Card title="1. Export pesanan (.xlsx)" className={ALIGNED}>
          <p className="mb-3 text-ink-2">
            Seller Centre → Pesanan Saya → Export, status <strong className="text-ink">Semua</strong>.
          </p>
          <FileInput key={`o${inputKey}`} accept=".xlsx,.xls" onChange={onOrdersFile} />
          <OrdersPreview parsed={orders} />
        </Card>
        <Card title="2. Laporan penghasilan (.pdf)" className={ALIGNED}>
          <p className="mb-3 text-ink-2">Seller Centre → Keuangan → Penghasilan Saya → laporan bulanan.</p>
          <FileInput key={`i${inputKey}`} accept=".pdf,application/pdf" onChange={onIncomeFile} />
          <IncomePreview parsed={income} store={store} multiStore={multiStore} />
        </Card>
        <Card
          title={
            <>
              3. Data iklan (.csv){' '}
              <span className="font-sans text-base font-normal text-ink-2">· kalau tokomu beriklan</span>
            </>
          }
          className="lg:col-span-2"
        >
          <p className="mb-3 text-ink-2">
            Seller Centre → Iklan Saya → Download Data, periode <strong className="text-ink">1 bulan penuh</strong>. Tiap
            periode terdiri dari beberapa file: pilih semuanya sekaligus. Mau cek iklan beberapa hari terakhir?{' '}
            <a href="#/iklan?cek=1" className={linkClass}>
              Pakai Cek cepat
            </a>{' '}
            (tidak disimpan).
          </p>
          <AdsHowTo />
          <FileInput
            key={`a${inputKey}`}
            accept=".csv,text/csv"
            multiple
            placeholder="Boleh pilih beberapa file .csv sekaligus"
            onChange={onAdsFiles}
          />
          {ads?.loading ? (
            <Spinner label="Membaca file…" />
          ) : ads ? (
            <AdsPreview
              files={ads.files}
              groups={allAdsGroups}
              problem={adsBlocked}
              elsewhere={adsElsewhere}
              storeName={store?.name}
            />
          ) : null}
        </Card>
      </div>

      {(hasData || saveError != null) && (
        <Card title="Simpan laporan" className="mb-6">
          <p className="text-ink-2">
            Yang akan disimpan
            {multiStore ? (
              <>
                {' '}ke toko <strong className="text-ink">{store?.name ?? '(belum dipilih)'}</strong>
              </>
            ) : null}
            :
          </p>
          <ul className="mb-4 mt-2 space-y-1">
            <SaveItem ok={Boolean(orders?.result)} label="Export pesanan" />
            <SaveItem ok={Boolean(income?.result)} label="Laporan penghasilan" />
            <SaveItem
              ok={adsGroups.length > 0}
              label={
                adsGroups.length > 0
                  ? `Data iklan (${adsGroups.reduce((n, g) => n + g.files.length, 0)} file, ${adsGroups.length} bulan)`
                  : 'Data iklan'
              }
            />
          </ul>
          {adsSkipped > 0 && (
            <div className="mb-4">
              <Alert tone="info">
                {adsSkipped} periode data iklan bukan 1 bulan penuh, jadi tidak ikut disimpan. Cek di{' '}
                <a href="#/iklan?cek=1" className={linkClass}>
                  Cek cepat
                </a>
                .
              </Alert>
            </div>
          )}
          {hasFileErrors && (
            <div className="mb-4">
              <Alert tone="warning">File yang gagal dibaca (tanda merah di atas) tidak ikut disimpan.</Alert>
            </div>
          )}
          {adsBlocked && (
            <div className="mb-4">
              <Alert tone="error">{adsBlocked}</Alert>
            </div>
          )}
          {saveError ? (
            <div className="mb-4">
              <ErrorBox error={saveError} />
              <p className="mt-2 text-sm text-ink-2">
                File masih dipilih. Tekan Simpan lagi: data yang sudah sempat masuk tidak akan dobel.
              </p>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Button onClick={save} disabled={!canSave}>
              {saving ? 'Menyimpan…' : multiStore ? `Simpan semua ke ${store?.name ?? 'toko'}` : 'Simpan semua'}
            </Button>
            <Button variant="secondary" onClick={reset} disabled={saving}>
              Batal
            </Button>
          </div>
        </Card>
      )}

      {summary && <SaveSummaryCard summary={summary} multiStore={multiStore} onAgain={reset} />}

      {leaveTo && (
        <UnsavedDialog
          target={leaveTo}
          files={[
            ...(orders?.result ? [orders.fileName] : []),
            ...(income?.result ? [income.fileName] : []),
            ...(ads?.files ?? [])
              .filter((f) => f.result && adsGroups.some((g) => g.files.includes(f.result!)))
              .map((f) => f.fileName),
          ]}
          storeName={multiStore ? (store?.name ?? null) : null}
          saving={saving}
          canSave={canSave}
          error={saveError}
          onSave={async () => {
            if (await save()) leave(leaveTo)
          }}
          onDiscard={() => leave(leaveTo)}
          onCancel={() => setLeaveTo(null)}
        />
      )}
    </>
  )
}

/** Dialog saat pindah halaman padahal laporan yang sudah dibaca belum disimpan. */
function UnsavedDialog({
  target,
  files,
  storeName,
  saving,
  canSave,
  error,
  onSave,
  onDiscard,
  onCancel,
}: {
  target: string
  files: string[]
  storeName: string | null
  saving: boolean
  canSave: boolean
  error: unknown
  onSave: () => void
  onDiscard: () => void
  onCancel: () => void
}) {
  const titleId = useId()
  const path = target.replace(/^#\/?/, '').split('?')[0]
  const page = ROUTES.find((r) => r.route === path)?.label ?? 'halaman berikutnya'
  return (
    <Modal labelledBy={titleId} onClose={onCancel} dismissible={!saving}>
      <h2 id={titleId} className="font-display text-2xl font-extrabold tracking-tight">
        Simpan laporan dulu?
      </h2>
      <p className="mt-3 text-ink-2">
        File ini sudah dibaca tapi <strong className="text-ink">belum disimpan</strong>
        {storeName && <> ke toko <strong className="text-ink">{storeName}</strong></>}. Kalau pindah ke {page} sekarang,
        kamu harus upload ulang file-nya.
      </p>
      <ul className="mt-3 list-disc space-y-1 pl-6 text-sm">
        {files.map((f) => (
          <li key={f} className="break-all">{f}</li>
        ))}
      </ul>
      {error ? <div className="mt-4"><ErrorBox error={error} /></div> : null}
      <div className="mt-5 flex flex-col gap-3">
        <Button onClick={onSave} disabled={!canSave}>
          {saving ? 'Menyimpan…' : `Simpan, lalu buka ${page}`}
        </Button>
        <Button variant="secondary" onClick={onDiscard} disabled={saving}>
          Buka {page} tanpa menyimpan
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={saving}>
          Batal
        </Button>
      </div>
    </Modal>
  )
}

function SaveItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className={`flex items-center gap-2 ${ok ? 'font-semibold text-ink' : 'text-ink-3'}`}>
      {ok ? <IconCheck size={18} className="shrink-0 text-gain" /> : <IconMinus size={18} className="shrink-0" />}
      {label}
      {!ok && <span className="text-sm font-normal">(tidak ada file)</span>}
    </li>
  )
}

function FileInput({
  accept,
  multiple,
  placeholder = 'Belum ada file dipilih',
  onChange,
}: {
  accept: string
  multiple?: boolean
  placeholder?: string
  onChange: (e: ChangeEvent<HTMLInputElement>) => void
}) {
  const [name, setName] = useState('')
  return (
    <label className="flex cursor-pointer flex-wrap items-center gap-4 rounded-2xl border-2 border-dashed border-control/70 bg-tint p-4 transition-colors hover:border-accent focus-within:border-accent">
      <span className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-ink px-4 font-semibold text-paper">
        <IconUpload size={18} />
        Pilih file
      </span>
      <span className="min-w-0 flex-1 truncate text-ink-2">{name || placeholder}</span>
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        onChange={(e) => {
          const files = e.target.files ?? []
          setName(files.length > 1 ? `${files.length} file dipilih` : (files[0]?.name ?? ''))
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
  if (parsed.error) return <div className="mt-4"><ErrorBox error={parsed.error} reportFile={{ kind: 'export pesanan', fileName: parsed.fileName }} /></div>
  const r = parsed.result!
  const statusEntries = Object.entries(r.byStatus).sort((a, b) => b[1] - a[1])
  const notDone = r.items.filter((i) => i.status_group !== 'selesai').length
  const rows = showAll ? r.items : r.items.slice(0, PREVIEW_ROWS)
  return (
    <div className="mt-4">
      <Alert tone="success" title={parsed.fileName}>
        {formatNumber(r.items.length)} item dari {formatNumber(r.orderCount)} pesanan siap disimpan
        {' '}({statusEntries.map(([s, n]) => `${s}: ${formatNumber(n)}`).join(', ')}).
        {notDone > 0 && (
          <> Yang belum selesai atau batal hanya masuk tabel "Semua pesanan" di Rekap, tidak dihitung untung.</>
        )}
      </Alert>
      <Warnings warnings={r.warnings} />
      <ScrollX className="mt-4">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-rule text-ink-3">
            <tr>
              <th className="py-2 pr-3 font-semibold">No. pesanan</th>
              <th className="py-2 pr-3 font-semibold">Produk</th>
              <th className="py-2 pr-3 text-right font-semibold">Qty</th>
              <th className="py-2 pr-3 font-semibold">Selesai</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.order_no + i.sku} className="border-b border-line align-top">
                <td className="num py-2 pr-3 text-xs">{i.order_no}</td>
                <td className="py-2 pr-3">
                  {i.product_name}
                  {i.variant_name && <span className="text-ink-2"> ({i.variant_name})</span>}
                </td>
                <td className="py-2 pr-3 text-right num">
                  {i.qty}
                  {i.returned_qty > 0 && <span className="block text-xs text-warn">retur {i.returned_qty}</span>}
                </td>
                <td className="num whitespace-nowrap py-2 pr-3 text-xs">{formatDateTime(i.completed_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollX>
      {r.items.length > PREVIEW_ROWS && (
        <button type="button" className={`${linkClass} mt-2 min-h-11`} onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Tampilkan lebih sedikit' : `Tampilkan semua (${r.items.length})`}
        </button>
      )}
    </div>
  )
}

function normalizeName(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function IncomePreview({
  parsed,
  store,
  multiStore,
}: {
  parsed: Parsed<IncomeParseResult> | null
  store: Store | null
  multiStore: boolean
}) {
  if (!parsed) return null
  if (parsed.loading) return <Spinner label="Membaca file…" />
  if (parsed.error) return <div className="mt-4"><ErrorBox error={parsed.error} reportFile={{ kind: 'laporan penghasilan', fileName: parsed.fileName }} /></div>
  const r = parsed.result!
  const adjustmentsTotal = r.adjustments.reduce((s, a) => s + a.amount, 0)
  const shopMismatch =
    store &&
    r.shopName &&
    !normalizeName(r.shopName).includes(normalizeName(store.name)) &&
    !normalizeName(store.name).includes(normalizeName(r.shopName))
  return (
    <div className="mt-4">
      <Alert tone="success" title={parsed.fileName}>
        Periode {formatDate(r.periodStart)} – {formatDate(r.periodEnd)}: {r.days.length} hari dana dilepas, total
        penghasilan <strong className="num">{formatRupiah(r.totalIncome + adjustmentsTotal)}</strong>
        {adjustmentsTotal !== 0 && <> (termasuk biaya penyesuaian {formatRupiah(adjustmentsTotal)})</>}.
      </Alert>
      {shopMismatch && (
        <div className="mt-4">
          <Alert tone="warning" title="Nama toko berbeda">
            Nama toko di PDF: <strong>{r.shopName}</strong>. {multiStore ? 'Toko yang dipilih' : 'Nama toko di akunmu'}:{' '}
            <strong>{store!.name}</strong>.{' '}
            {multiStore
              ? 'Pastikan toko yang dipilih sudah benar sebelum menyimpan.'
              : 'Kalau ini memang PDF tokomu (hanya beda penulisan nama), lanjutkan simpan; kalau bukan, jangan disimpan.'}
          </Alert>
        </div>
      )}
      {r.adjustments.length > 0 && (
        <div className="mt-4">
          <Alert tone="info" title={`Biaya penyesuaian: ${formatRupiah(adjustmentsTotal)}`}>
            <p>Dicatat Shopee terpisah dari tabel harian, dan otomatis ikut dihitung sebagai penghasilan.</p>
            <ul className="mt-1 list-disc pl-6 text-sm">
              {r.adjustments.map((a, i) => (
                <li key={i}>
                  {formatDate(a.date)} · {a.description} · {formatRupiah(a.amount)}
                </li>
              ))}
            </ul>
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
          <thead className="sticky top-0 border-b border-rule bg-paper text-ink-3">
            <tr>
              <th className="py-2 pr-3 font-semibold">Tanggal dana dilepas</th>
              <th className="py-2 pr-3 text-right font-semibold">Subtotal pesanan</th>
              <th className="py-2 pr-3 text-right font-semibold">Penghasilan</th>
            </tr>
          </thead>
          <tbody>
            {r.days.map((d) => (
              <tr key={d.released_date} className="border-b border-line">
                <td className="num py-2 pr-3">{formatDate(d.released_date)}</td>
                <td className="py-2 pr-3 text-right num">{formatRupiah(d.subtotal_pesanan)}</td>
                <td className="py-2 pr-3 text-right num">{formatRupiah(d.total_income)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-ink font-bold">
              <td className="py-2 pr-3">Total</td>
              <td className="py-2 pr-3 text-right num">
                {formatRupiah(r.days.reduce((s, d) => s + d.subtotal_pesanan, 0))}
              </td>
              <td className="py-2 pr-3 text-right num">{formatRupiah(r.totalIncome)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

function SaveSummaryCard({
  summary,
  multiStore,
  onAgain,
}: {
  summary: SaveSummary
  multiStore: boolean
  onAgain: () => void
}) {
  const { orders, income, ads, missingHpp } = summary
  return (
    <Card
      title={
        <span className="flex flex-wrap items-center justify-between gap-3">
          {multiStore ? `Tersimpan ke ${summary.storeName}` : 'Laporan tersimpan'}
          <Stamp tone="gain" delay={150}>Tersimpan</Stamp>
        </span>
      }
      className="mb-6"
    >
      <div className="grid gap-4 md:grid-cols-2">
        {orders && (
          <div className="rounded-2xl bg-tint p-4">
            <p className="font-semibold">Item pesanan</p>
            <ul className="mt-2 space-y-1">
              <li>Baru: <strong className="num">{formatNumber(orders.inserted)}</strong></li>
              <li>Diperbarui: <strong className="num">{formatNumber(orders.updated)}</strong></li>
              <li>Sudah ada, tidak berubah: <strong className="num">{formatNumber(orders.unchanged)}</strong></li>
              {orders.skipped > 0 && (
                <li>Dilewati (data tidak lengkap): <strong className="num">{formatNumber(orders.skipped)}</strong></li>
              )}
            </ul>
          </div>
        )}
        {income && (
          <div className="rounded-2xl bg-tint p-4">
            <p className="font-semibold">Penghasilan per hari</p>
            <ul className="mt-2 space-y-1">
              <li>Baru: <strong className="num">{formatNumber(income.inserted)}</strong></li>
              <li>Diperbarui: <strong className="num">{formatNumber(income.updated)}</strong></li>
              <li>Sudah ada, tidak berubah: <strong className="num">{formatNumber(income.unchanged)}</strong></li>
              <li>Total penghasilan di file: <strong className="num">{formatRupiah(income.totalIncome + income.adjustmentsTotal)}</strong></li>
              {income.adjustmentsSaved > 0 && (
                <li>
                  Termasuk {formatNumber(income.adjustmentsSaved)} biaya penyesuaian:{' '}
                  <strong className="num">{formatRupiah(income.adjustmentsTotal)}</strong>
                </li>
              )}
            </ul>
          </div>
        )}
        {ads && (
          <div className="rounded-2xl bg-tint p-4 md:col-span-2">
            <p className="font-semibold">
              Data iklan ({formatNumber(ads.reduce((n, p) => n + p.files, 0))} file)
            </p>
            <AdsSavedList saved={ads} />
          </div>
        )}
      </div>

      {orders && missingHpp.length > 0 && (
        <div className="mt-4">
          <Alert tone="warning" title={`${missingHpp.length} produk belum punya HPP`}>
            <p>Modal produk ini belum bisa dihitung. Isi HPP-nya supaya untung bersihnya akurat.</p>
            <ul className="mt-2 list-disc pl-6">
              {missingHpp.slice(0, 15).map((p) => (
                <li key={p.id}>
                  {p.product_name}
                  {p.variant_name && ` (${p.variant_name})`}
                </li>
              ))}
              {missingHpp.length > 15 && <li>…dan {missingHpp.length - 15} lainnya</li>}
            </ul>
            <Button className="mt-3" onClick={() => navigate('hpp', { kosong: '1' })}>
              Isi HPP sekarang
            </Button>
          </Alert>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        <Button variant={orders && missingHpp.length > 0 ? 'secondary' : 'primary'} onClick={() => navigate('rekap')}>
          Lihat Rekap
        </Button>
        {ads && (
          <Button variant="secondary" onClick={() => navigate('iklan')}>
            Lihat analisis iklan
          </Button>
        )}
        <Button variant="secondary" onClick={onAgain}>Upload file lain</Button>
      </div>
    </Card>
  )
}
