import { useEffect, useMemo, useState } from 'react'
import { TrialSimBlocked, TrialSimNotice, useTrialSimulation } from '../components/trialSim'
import { manualSimKey, productSimKey } from '../lib/trialLimits'
import { Alert, Button, Card, ErrorBox, NotaTotal, PageTitle, Spinner, Stamp, inputClass, linkClass } from '../components/ui'
import { IconCheck, IconChevronDown, IconSearch } from '../components/icons'
import { RupiahInput } from '../components/pickers'
import {
  DEFAULT_FEE_RATE,
  DEFAULT_TARGETS,
  XTRA_FEE_RATE,
  analyzeAds,
  priceLadder,
  productKey,
  simulatePrice,
  type PriceLadderRow,
  type Targets,
  type SuggestedPrice,
} from '../lib/adsMath'
import {
  fetchAdReports,
  fetchAdRows,
  fetchFeeCategories,
  fetchItemsCreatedBetween,
  fetchLastSalePrice,
  fetchProducts,
  fetchStoreSettings,
  saveProductFees,
} from '../lib/api'
import { effectiveAdminPct } from '../lib/feeCategories'
import { resolveSettings, targetsOf } from '../lib/storeSettings'
import { formatDate, formatPercent, formatRupiah } from '../lib/format'
import { navigate } from '../lib/router'
import type { FeeCategory, Product, Store } from '../lib/types'
import { NotaLine } from './RecapPage'
import { AdGroupSim } from './AdGroupSim'
import { FeeCategoriesPanel } from './FeeCategories'
import {
  DEFAULTS,
  DecimalInput,
  ExtraFeesEditor,
  Field,
  Result,
  TOO_THIN,
  decimal,
  extraFeeLabel,
  extraFeeTotals,
  formatRoas,
  roundUp2,
  useExtraFees,
} from './simShared'

// Semua dihitung di browser. Yang disimpan hanya % admin & XTRA per produk (tombol Simpan).

export function PriceSimPage({ stores, storeId }: { stores: Store[]; storeId: number | null }) {
  const store = stores.find((s) => s.id === storeId) ?? null
  const [hpp, setHpp] = useState<number | null>(null)
  const [price, setPrice] = useState<number | null>(null)
  const [adminPct, setAdminPct] = useState<number | null>(DEFAULTS.adminPct)
  const [xtra, setXtra] = useState(DEFAULTS.xtra)
  const [processFee, setProcessFee] = useState<number | null>(DEFAULTS.processFee)
  const [packaging, setPackaging] = useState<number | null>(DEFAULTS.packaging)
  const [realisticRoas, setRealisticRoas] = useState<number | null>(DEFAULTS.realisticRoas)
  const [actualRoas, setActualRoas] = useState<number | null>(null)
  const [extraFees, setExtraFees] = useExtraFees(storeId)
  const [mode, setMode] = useState<'satu' | 'grup'>('satu')
  // Produk terakhir yang dipilih: "Ganti / isi manual" dengan HPP yang sama tetap dihitung produk itu (jatah uji coba).
  const [simOrigin, setSimOrigin] = useState<{ key: string; hpp: number | null } | null>(null)

  // Pilih produk yang sudah di-upload (opsional).
  const [products, setProducts] = useState<Product[] | null>(null)
  const [productsError, setProductsError] = useState<unknown>(null)
  const [selected, setSelected] = useState<Product | null>(null)
  const [notes, setNotes] = useState<{ price?: string; roas?: string; fees?: string }>({})
  const [adRoas, setAdRoas] = useState<AdRoasData | null>(null)
  const [feesSaving, setFeesSaving] = useState(false)
  const [feesSaved, setFeesSaved] = useState(false)
  const [feesError, setFeesError] = useState<unknown>(null)
  // Kategori biaya admin milik toko. "Tidak tersedia" kalau SQL 20261014 belum dijalankan: sisanya tetap jalan.
  const [categories, setCategories] = useState<FeeCategory[]>([])
  const [categoriesAvailable, setCategoriesAvailable] = useState(false)
  const [categoryId, setCategoryId] = useState<number | null>(null)
  // Target untung toko (Akun → Pengaturan hitungan). Bawaan sampai pengaturannya dimuat / kalau belum pernah disimpan.
  const [targets, setTargets] = useState<Targets>(DEFAULT_TARGETS)

  useEffect(() => {
    if (!storeId) return
    let cancelled = false
    setProducts(null)
    setProductsError(null)
    setSelected(null)
    setSimOrigin(null)
    setNotes({})
    setAdRoas(null)
    setCategories([])
    setCategoriesAvailable(false)
    setCategoryId(null)
    setTargets(DEFAULT_TARGETS)
    fetchStoreSettings(storeId)
      .then((row) => !cancelled && setTargets(targetsOf(resolveSettings(row))))
      .catch(() => {})
    fetchFeeCategories(storeId)
      .then((list) => {
        if (cancelled) return
        setCategories(list)
        setCategoriesAvailable(true)
      })
      .catch(() => {})
    fetchProducts(storeId)
      .then((list) => !cancelled && setProducts(list))
      .catch((e) => !cancelled && setProductsError(e))
    return () => {
      cancelled = true
    }
  }, [storeId])

  const pick = async (p: Product) => {
    if (!storeId) return
    setSelected(p)
    setFeesSaved(false)
    setFeesError(null)
    setHpp(p.hpp === null ? null : Number(p.hpp))
    setSimOrigin({ key: productSimKey(p.product_name), hpp: p.hpp === null ? null : Number(p.hpp) })
    const effective = effectiveAdminPct(p, categories)
    const cat = p.fee_category_id != null ? (categories.find((c) => c.id === p.fee_category_id) ?? null) : null
    setCategoryId(cat ? cat.id : null)
    setAdminPct(effective ?? DEFAULTS.adminPct)
    setXtra(p.xtra ?? DEFAULTS.xtra)
    setNotes({
      fees: cat
        ? `Dari kategori "${cat.name}".`
        : effective !== null
          ? 'Tersimpan untuk produk ini.'
          : 'Nilai bawaan, belum pernah disimpan untuk produk ini.',
      price: 'Mengambil harga…',
      roas: 'Mengambil data iklan…',
    })

    const [last, ads] = await Promise.all([
      fetchLastSalePrice(storeId, p.sku).catch(() => null),
      (adRoas ? Promise.resolve(adRoas) : loadLatestAdRoas(storeId)).catch(() => null),
    ])
    if (ads) setAdRoas(ads)
    setPrice(last ? last.price : null)
    const roas = ads?.byProduct.get(productKey(p.product_name)) ?? null
    setActualRoas(roas)
    setNotes((n) => ({
      ...n,
      price: last
        ? `Harga pesanan terakhir${last.date ? `, ${formatDate(last.date)}` : ''}.`
        : 'Belum ada pesanan untuk variasi ini. Isi harga jual sendiri.',
      roas:
        roas !== null && ads
          ? `ROAS nyata dari data iklan ${ads.periodLabel}.`
          : ads
            ? `Produk ini tidak ada di data iklan ${ads.periodLabel}.`
            : 'Belum ada data iklan.',
    }))
  }

  const chooseCategory = (id: number | null) => {
    const cat = id === null ? null : (categories.find((c) => c.id === id) ?? null)
    setCategoryId(cat ? cat.id : null)
    if (cat) setAdminPct(cat.admin_pct)
    setFeesSaved(false)
    setNotes((n) => ({ ...n, fees: cat ? `Dari kategori "${cat.name}".` : 'Isian manual.' }))
  }

  const clearPick = () => {
    setCategoryId(null)
    setSelected(null)
    setNotes({})
    setFeesSaved(false)
    setFeesError(null)
  }

  const saveFees = async () => {
    if (!storeId || !selected || adminPct === null) return
    setFeesSaving(true)
    setFeesError(null)
    try {
      await saveProductFees(storeId, selected.product_name, adminPct, xtra, categoriesAvailable ? categoryId : undefined)
      const patch = { admin_pct: adminPct, xtra, ...(categoriesAvailable ? { fee_category_id: categoryId } : {}) }
      setProducts((list) => (list ?? []).map((p) => (p.product_name === selected.product_name ? { ...p, ...patch } : p)))
      setSelected((p) => (p ? { ...p, ...patch } : p))
      setNotes((n) => ({ ...n, fees: 'Tersimpan untuk produk ini.' }))
      setFeesSaved(true)
    } catch (e) {
      setFeesError(e)
    } finally {
      setFeesSaving(false)
    }
  }

  // Biaya tambahan ikut dihitung: yang persen ditambahkan ke % admin, yang rupiah ke biaya per order.
  const extra = extraFeeTotals(extraFees)
  const ready = hpp !== null && price !== null && price > 0 && realisticRoas !== null && realisticRoas > 0
  const rawR = ready
    ? simulatePrice({
        hpp,
        price,
        adminRate: ((adminPct ?? 0) + extra.pct) / 100,
        xtra,
        processFee: (processFee ?? 0) + extra.rp,
        packaging: packaging ?? 0,
        realisticRoas,
        actualRoas,
        targets,
      })
    : null

  // Produk baru: modal sudah ada tapi harga jual belum ditentukan → sarankan harga & target ROAS.
  const rawLadder =
    hpp !== null && hpp > 0 && (price === null || price === 0) && realisticRoas !== null && realisticRoas > 0
      ? priceLadder({
          hpp,
          adminRate: ((adminPct ?? 0) + extra.pct) / 100,
          xtra,
          processFee: (processFee ?? 0) + extra.rp,
          packaging: packaging ?? 0,
          realisticRoas,
          targets,
        })
      : null

  // Akun uji coba: hasil hanya tampil kalau produk ini masih dapat jatah.
  const simKey = !(rawR || rawLadder)
    ? null
    : selected
      ? productSimKey(selected.product_name)
      : simOrigin && simOrigin.hpp === hpp
        ? simOrigin.key
        : hpp !== null
          ? manualSimKey(hpp)
          : null
  const sim = useTrialSimulation(storeId, Boolean(store?.trial), mode === 'satu' ? [simKey] : [])
  const gate = sim.statusOf(simKey)
  const r = gate === 'ok' ? rawR : null
  const ladder = gate === 'ok' ? rawLadder : null
  const recRow = ladder?.rows.find((x) => x.price === ladder.recommended) ?? null

  return (
    <>
      <PageTitle
        kicker={stores.length > 1 ? store?.name : undefined}
        subtitle="Cek dulu sebelum jualan atau ganti harga: untung per order, ROAS minimum supaya iklan tidak rugi, dan harga jual yang masih untung."
      >
        Simulasi Harga
      </PageTitle>

      {/* Satu produk atau satu grup iklan (beberapa produk, satu target ROAS). */}
      <div role="tablist" aria-label="Jenis simulasi" className="mb-8 flex w-fit max-w-full flex-wrap gap-1 rounded-full bg-tint p-1 ring-1 ring-line">
        {(
          [
            ['satu', 'Satu produk', ''],
            ['grup', 'Grup iklan', ' (beberapa produk)'],
          ] as const
        ).map(([id, label, more]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            onClick={() => setMode(id)}
            className={`min-h-10 rounded-full px-4 font-semibold transition-colors duration-150 ${
              mode === id ? 'bg-ink text-paper' : 'text-ink-2 hover:text-ink'
            }`}
          >
            {label}
            {more && <span className="max-sm:hidden">{more}</span>}
          </button>
        ))}
      </div>

      {categoriesAvailable && storeId && (
        <details className="mb-8">
          <summary className="inline-flex min-h-11 cursor-pointer flex-wrap items-center gap-x-2 rounded-full border-2 border-control bg-paper px-5 py-2 font-semibold text-ink transition-colors hover:border-ink">
            Kategori biaya admin
            <span className="font-normal text-ink-2">
              {categories.length === 0 ? '· belum ada, buat dulu supaya biaya admin tiap produk tepat' : `· ${categories.length} kategori`}
            </span>
            <IconChevronDown size={16} className="chev" />
          </summary>
          <div className="mt-4">
            <FeeCategoriesPanel
              storeId={storeId}
              categories={categories}
              onCategories={setCategories}
              products={products}
              onProducts={setProducts}
            />
          </div>
        </details>
      )}

      {mode === 'grup' ? (
        <div key="grup" className="page-in">
          <AdGroupSim
            storeId={storeId}
            trial={Boolean(store?.trial)}
            products={products}
            categories={categories}
            targets={targets}
          />
        </div>
      ) : (
        <div key="satu" className="page-in">
          <TrialSimNotice sim={sim} />

          <Card title="Pilih produk (opsional)" className="mb-6">
            {productsError ? (
              <ErrorBox error={productsError} />
            ) : (
              <ProductPicker products={products} selected={selected} onPick={pick} onClear={clearPick} />
            )}
            {selected && selected.hpp === null && (
              <div className="mt-3">
                <Alert tone="warning" title="HPP produk ini belum diisi.">
                  <button type="button" className={linkClass} onClick={() => navigate('hpp', { kosong: '1' })}>
                    Isi HPP
                  </button>{' '}
                  dulu, atau ketik HPP-nya di bawah.
                </Alert>
              </div>
            )}
          </Card>

          {/* Jawabannya dulu, ikut berubah begitu angka diubah. */}
          <div className="mb-8" aria-live="polite">
            {gate === 'blocked' ? (
              <TrialSimBlocked limit={sim.limit} />
            ) : gate === 'pending' ? (
              <Spinner label="Mengecek jatah simulasi uji coba…" />
            ) : r && price !== null ? (
              <>
                <h2 className="font-display text-3xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
                  Dijual <span className="num whitespace-nowrap">{formatRupiah(price)}</span>,{' '}
                  <span className="hl">{r.profitable ? 'untung' : 'rugi'}</span>{' '}
                  <span className={`num whitespace-nowrap ${r.profitable ? 'text-gain' : 'text-loss'}`}>
                    {formatRupiah(Math.abs(r.profit))}
                  </span>{' '}
                  per order.
                </h2>
                <p className="mt-3 text-lg leading-relaxed text-ink-2">
                  {r.actual ? (
                    <>
                      Dengan iklan (ROAS {decimal(actualRoas ?? 0)}),{' '}
                      <b className={r.actual.profitAfterAds >= 0 ? 'text-gain' : 'text-loss'}>
                        {r.actual.profitAfterAds >= 0 ? 'untung' : 'rugi'} {formatRupiah(Math.abs(r.actual.profitAfterAds))}
                      </b>{' '}
                      per order.
                    </>
                  ) : (
                    'Itu sebelum iklan. Isi ROAS aktual untuk melihat hasil setelah iklan.'
                  )}
                </p>
              </>
            ) : ladder && hpp !== null ? (
              recRow ? (
                <>
                  <h2 className="font-display text-3xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
                    Modal <span className="num whitespace-nowrap">{formatRupiah(hpp)}</span>: jual minimal{' '}
                    <span className="num hl whitespace-nowrap">{formatRupiah(recRow.price)}</span>, isi target ROAS{' '}
                    <span className="num hl whitespace-nowrap">
                      {recRow.targetRoas !== null ? formatRoas(roundUp2(recRow.targetRoas)) : '-'}
                    </span>
                    .
                  </h2>
                  <p className="mt-3 max-w-3xl text-lg leading-relaxed text-ink-2">
                    Harga terendah yang masih untung {formatPercent(targets.adsProfit * 100)} setelah iklan, kalau ROAS iklanmu
                    biasanya{' '}
                    <span className="num">{decimal(realisticRoas ?? 0)}</span>. Pilih harga lain di tabel, atau isi harga jual
                    sendiri.
                  </p>
                </>
              ) : (
                <>
                  <h2 className="font-display text-3xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
                    Dengan ROAS iklan <span className="num">{decimal(realisticRoas ?? 0)}</span>,{' '}
                    <span className="text-loss">
                      berapa pun harganya, iklan tidak bisa untung {formatPercent(targets.adsProfit * 100)}
                    </span>
                    .
                  </h2>
                  <p className="mt-3 text-lg leading-relaxed text-ink-2">
                    Potongan Shopee ditambah biaya iklan sudah lebih besar dari harganya. Jual tanpa iklan, atau cek lagi ROAS
                    realistisnya.
                  </p>
                </>
              )
            ) : (
              <p className="max-w-3xl font-display text-2xl font-bold leading-snug text-ink-2 sm:text-3xl">
                Isi modal (HPP) dulu. Harga jual boleh dikosongkan untuk melihat saran harga.
              </p>
            )}
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
            <Card title="Isi angka" className="self-start">
              <div className="space-y-4">
                <Field
                  label="HPP per unit jual"
                  hint="Paket/bundling: isi HPP per paket."
                  note={selected && selected.hpp !== null ? 'Dari halaman HPP.' : undefined}
                >
                  <RupiahInput value={hpp} onCommit={setHpp} ariaLabel="HPP per unit jual" />
                </Field>
                <Field label="Harga jual" hint="Kosongkan untuk melihat saran harga dari modal." note={notes.price}>
                  <RupiahInput value={price} onCommit={setPrice} ariaLabel="Harga jual" />
                </Field>
                {categoriesAvailable && categories.length > 0 && (
                  <Field label="Kategori biaya admin" hint="Daftar kategori diatur di bagian atas halaman ini.">
                    <select
                      value={categoryId ?? ''}
                      onChange={(e) => chooseCategory(e.target.value === '' ? null : Number(e.target.value))}
                      aria-label="Kategori biaya admin"
                      className={inputClass}
                    >
                      <option value="">Isi persen sendiri</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({decimal(c.admin_pct)}%)
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                <Field label="Biaya admin" note={notes.fees}>
                  <DecimalInput
                    value={adminPct}
                    onCommit={(v) => {
                      setAdminPct(v)
                      setFeesSaved(false)
                    }}
                    ariaLabel="Biaya admin (persen)"
                    suffix="%"
                    disabled={categoryId !== null}
                  />
                </Field>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-control px-3 transition-colors hover:border-ink">
                  <input
                    type="checkbox"
                    checked={xtra}
                    onChange={(e) => {
                      setXtra(e.target.checked)
                      setFeesSaved(false)
                    }}
                    className="h-5 w-5"
                  />
                  <span>
                    Ikut Gratis Ongkir XTRA <span className="num text-ink-3">({formatPercent(XTRA_FEE_RATE * 100)})</span>
                  </span>
                </label>
                {selected && (
                  <div>
                    <Button
                      variant="secondary"
                      className="w-full"
                      onClick={saveFees}
                      disabled={feesSaving || adminPct === null}
                    >
                      {feesSaving ? 'Menyimpan…' : 'Simpan untuk produk ini'}
                    </Button>
                    <p className="mt-1 text-sm text-ink-3">% admin dan XTRA berlaku untuk semua variasi produk ini.</p>
                    {feesSaved && (
                      <p className="mt-1 flex items-center gap-1.5 font-semibold text-gain">
                        <IconCheck size={18} />
                        Tersimpan.
                      </p>
                    )}
                    {feesError ? (
                      <div className="mt-2">
                        <ErrorBox error={feesError} />
                      </div>
                    ) : null}
                  </div>
                )}
                <ExtraFeesEditor fees={extraFees} onChange={setExtraFees} />
                <Field label="Biaya proses pesanan" hint="Per order (tetap, bukan persen).">
                  <RupiahInput value={processFee} onCommit={setProcessFee} ariaLabel="Biaya proses pesanan" />
                </Field>
                <Field label="Packaging per order">
                  <RupiahInput value={packaging} onCommit={setPackaging} ariaLabel="Packaging per order" />
                </Field>
                <Field label="ROAS realistis" hint="ROAS yang biasa didapat di iklan.">
                  <DecimalInput value={realisticRoas} onCommit={setRealisticRoas} ariaLabel="ROAS realistis" />
                </Field>
                <Field label="ROAS aktual (opsional)" hint="ROAS nyata iklan produk ini, kalau sudah jalan." note={notes.roas}>
                  <DecimalInput value={actualRoas} onCommit={setActualRoas} ariaLabel="ROAS aktual" optional />
                </Field>
              </div>
            </Card>

            <div className="min-w-0 space-y-6">
              {!r && ladder ? (
                <PriceLadderCard
                  rows={ladder.rows}
                  recommended={ladder.recommended}
                  realisticRoas={realisticRoas ?? 0}
                  targets={targets}
                  onPick={setPrice}
                />
              ) : !r && gate !== 'ok' ? null : !r ? (
                <Alert title="Hasilnya muncul di sini.">
                  Rincian per order, ROAS balik modal, dan saran harga jual. Angka diperbarui setelah kamu pindah kolom atau
                  menekan Enter.
                </Alert>
              ) : (
                <>
                  <Card title="Rincian per order">
                    <div>
                      <NotaLine op="" label="Harga jual" detail="" amount={formatRupiah(price)} />
                      <NotaLine
                        op="−"
                        label="Biaya admin"
                        detail={`${decimal(adminPct ?? 0)}% × harga jual`}
                        amount={formatRupiah(((price ?? 0) * (adminPct ?? 0)) / 100)}
                      />
                      <NotaLine op="−" label="Biaya proses pesanan" detail="per order" amount={formatRupiah(processFee ?? 0)} />
                      <NotaLine
                        op="−"
                        label="Gratis Ongkir XTRA"
                        detail={xtra ? `${formatPercent(XTRA_FEE_RATE * 100)} × harga jual` : 'tidak ikut'}
                        amount={formatRupiah(r.xtraFee)}
                      />
                      {extraFees
                        .filter((f) => f.value !== null)
                        .map((f) => (
                          <NotaLine
                            key={f.id}
                            op="−"
                            label={extraFeeLabel(f)}
                            detail={f.unit === 'pct' ? `${decimal(f.value ?? 0)}% × harga jual` : 'per order'}
                            amount={formatRupiah(f.unit === 'pct' ? ((price ?? 0) * (f.value ?? 0)) / 100 : (f.value ?? 0))}
                          />
                        ))}
                      <NotaLine op="−" label="Packaging" detail="per order" amount={formatRupiah(packaging ?? 0)} />
                    </div>
                    <div className="tear mt-1">
                      <NotaLine
                        op="="
                        label="Penghasilan"
                        detail={
                          (packaging ?? 0) > 0
                            ? `uang cair dari Shopee ${formatRupiah(r.income)}, dikurangi packaging`
                            : extra.pct > 0 || extra.rp > 0
                              ? `per order, setelah potongan Shopee & biaya tambahan ${formatRupiah(r.totalFee)}`
                              : `uang cair per order (potongan Shopee ${formatRupiah(r.totalFee)})`
                        }
                        amount={formatRupiah(r.income - (packaging ?? 0))}
                      />
                      <NotaLine op="−" label="HPP" detail="modal per unit jual" amount={formatRupiah(hpp)} />
                    </div>
                    <NotaTotal
                      className="mt-1"
                      label="= Untung per order"
                      sub="sebelum iklan"
                      amount={formatRupiah(r.profit)}
                      amountSub={`${formatPercent(r.margin * 100)} dari harga jual`}
                      tone={r.profitable ? 'gain' : 'loss'}
                    />
                    {!r.profitable && (
                      <div className="mt-4">
                        <Alert tone="error" title="Harga ini sudah rugi tanpa iklan." />
                      </div>
                    )}
                  </Card>

                  {r.actual && (
                    // key: kartunya muncul ulang setiap kali vonisnya berubah (untung ↔ rugi).
                    <section
                      key={r.actual.profitAfterAds >= 0 ? 'gain' : 'loss'}
                      className="reveal rounded-3xl bg-paper p-6 shadow-sheet ring-1 ring-line sm:p-7"
                    >
                      <Stamp tone={r.actual.profitAfterAds >= 0 ? 'gain' : 'loss'}>
                        {r.actual.profitAfterAds >= 0 ? 'Iklan untung' : 'Iklan rugi'}
                      </Stamp>
                      <p className="mt-4 font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
                        Dengan iklan, {r.actual.profitAfterAds >= 0 ? 'untung' : 'rugi'}{' '}
                        <span className={`num whitespace-nowrap ${r.actual.profitAfterAds >= 0 ? 'text-gain' : 'text-loss'}`}>
                          {formatRupiah(Math.abs(r.actual.profitAfterAds))}
                        </span>
                        <span className="ml-1.5 font-sans text-lg font-semibold text-ink-2">per order</span>
                      </p>
                      <p className="mt-2 text-ink-2">
                        Biaya iklan per order {formatRupiah(r.actual.adCost)} (harga jual ÷ ROAS aktual{' '}
                        {decimal(actualRoas ?? 0)}). Untung setelah iklan = {formatRupiah(r.profit)} −{' '}
                        {formatRupiah(r.actual.adCost)}.
                      </p>
                    </section>
                  )}

                  <Card title="Hasil">
                    <dl className="divide-y divide-line">
                      <Result
                        label="Balik modal butuh ROAS"
                        value={r.bepRoas !== null ? formatRoas(r.bepRoas) : 'Harga ini sudah rugi tanpa iklan'}
                        bad={r.bepRoas === null}
                        hint={r.bepRoas !== null ? 'Di bawah ROAS ini, iklan rugi.' : undefined}
                      />
                      <Result
                        label="Saran target ROAS di Shopee"
                        value={
                          !r.profitable
                            ? 'Harga ini sudah rugi tanpa iklan'
                            : r.targetRoas !== null
                              ? formatRoas(roundUp2(r.targetRoas))
                              : TOO_THIN
                        }
                        bad={r.targetRoas === null}
                        strong
                        hint={
                          r.profitable
                            ? `Supaya masih untung ${formatPercent(targets.adsProfit * 100)} setelah iklan. Belum termasuk cadangan pesanan batal.`
                            : undefined
                        }
                      />
                      <Result
                        label={`Harga minimum balik modal di ROAS ${decimal(realisticRoas ?? 0)}`}
                        value={priceText(r.priceBreakEven)}
                        bad={r.priceBreakEven === null}
                        hint={exactHint(r.priceBreakEven, 'Di bawah harga ini, iklan dengan ROAS realistis pasti rugi.')}
                      />
                      <Result
                        label={`Harga untuk untung ${formatPercent(targets.adsProfit * 100)} setelah iklan`}
                        value={priceText(r.priceTargetProfit)}
                        bad={r.priceTargetProfit === null}
                        strong
                        hint={exactHint(r.priceTargetProfit, `Dengan ROAS ${decimal(realisticRoas ?? 0)}.`)}
                      />
                      <Result
                        label={`Harga untuk untung ${formatPercent(targets.priceMargin * 100)}`}
                        value={priceText(r.priceTargetMargin)}
                        bad={r.priceTargetMargin === null}
                        hint={exactHint(r.priceTargetMargin, 'Sebelum iklan.')}
                      />
                    </dl>
                    <p className="mt-3 text-sm text-ink-3">Saran harga dibulatkan ke atas ke Rp1.000.</p>
                  </Card>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function priceText(p: SuggestedPrice | null): string {
  return p ? formatRupiah(p.rounded) : TOO_THIN
}

function exactHint(p: SuggestedPrice | null, text: string): string {
  return p ? `${text} Persisnya ${formatRupiah(p.exact)}.` : text
}


interface AdRoasData {
  periodLabel: string
  /** productKey(nama produk) → ROAS nyata. */
  byProduct: Map<string, number>
}

/** ROAS nyata per produk dari periode data iklan terbaru toko ini (null kalau belum ada data iklan). */
async function loadLatestAdRoas(storeId: number): Promise<AdRoasData | null> {
  const reports = await fetchAdReports(storeId)
  const latest = reports[0]
  if (!latest) return null
  const period = reports.filter((r) => r.period_start === latest.period_start && r.period_end === latest.period_end)
  const [rows, items] = await Promise.all([
    fetchAdRows(period),
    fetchItemsCreatedBetween(storeId, latest.period_start, latest.period_end),
  ])
  // Potongan Shopee tidak memengaruhi ROAS nyata; cukup nilai bawaan.
  const analysis = analyzeAds({
    reports: rows,
    orders: items.map((i) => ({
      product_name: i.product_name,
      status_group: i.status_group,
      qty: Number(i.qty),
      returned_qty: Number(i.returned_qty ?? 0),
      subtotal: Number(i.subtotal),
      hpp: null,
    })),
    feeRate: DEFAULT_FEE_RATE,
  })
  const byProduct = new Map<string, number>()
  for (const p of analysis.products) {
    if (p.realRoas !== null && p.netSold >= 0.5) byProduct.set(productKey(p.name), Math.round(p.realRoas * 100) / 100)
  }
  const a = formatDate(latest.period_start)
  const b = formatDate(latest.period_end)
  const periodLabel = latest.period_start.slice(0, 7) === latest.period_end.slice(0, 7) ? `${a.split(' ')[0]}–${b}` : `${a} – ${b}`
  return { periodLabel, byProduct }
}

const ladderTags = (targets: Targets): Record<PriceLadderRow['tags'][number], string> => ({
  balik_modal: 'Balik modal setelah iklan',
  disarankan: 'Disarankan',
  untung_20: `Untung ${formatPercent(targets.priceMargin * 100)} sebelum iklan`,
})

/** Pilihan harga jual untuk modal yang diisi; "Pakai" mengisi harga jual di kiri. */
function PriceLadderCard({
  rows,
  recommended,
  realisticRoas,
  targets,
  onPick,
}: {
  rows: PriceLadderRow[]
  recommended: number | null
  realisticRoas: number
  targets: Targets
  onPick: (price: number) => void
}) {
  const LADDER_TAGS = ladderTags(targets)
  return (
    <Card title="Pilih harga jual">
      <p className="-mt-2 mb-2 text-sm text-ink-2">
        Semua harga dibulatkan ke atas ke Rp1.000. Target ROAS adalah angka yang diisi di Shopee supaya untung{' '}
        {formatPercent(targets.adsProfit * 100)} setelah iklan.
      </p>
      <ul className="divide-y divide-line">
        {rows.map((x) => {
          const rec = x.price === recommended
          return (
            <li
              key={x.price}
              className={`grid items-center gap-x-4 gap-y-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto] ${
                rec ? '-mx-3 rounded-2xl bg-tint px-3' : ''
              }`}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="num font-display text-2xl font-extrabold">{formatRupiah(x.price)}</span>
                  {x.tags.map((t) =>
                    t === 'disarankan' ? (
                      <Stamp key={t} tone="final" size="xs">
                        {LADDER_TAGS[t]}
                      </Stamp>
                    ) : (
                      <span key={t} className="rounded-full border border-control px-2.5 py-0.5 text-xs font-semibold text-ink-2">
                        {LADDER_TAGS[t]}
                      </span>
                    ),
                  )}
                </div>
                <p className="mt-1 text-sm text-ink-2">
                  Untung <b className="num">{formatRupiah(x.profit)}</b> ({formatPercent(x.margin * 100)}) sebelum iklan · isi target ROAS{' '}
                  <b className="num">{x.targetRoas !== null ? formatRoas(roundUp2(x.targetRoas)) : 'tidak mungkin'}</b> · di ROAS{' '}
                  <span className="num">{decimal(realisticRoas)}</span>{' '}
                  <b className={`num ${x.profitAtRealistic >= 0 ? 'text-gain' : 'text-loss'}`}>
                    {x.profitAtRealistic >= 0 ? 'untung' : 'rugi'} {formatRupiah(Math.abs(x.profitAtRealistic))}
                  </b>
                </p>
              </div>
              <Button variant={rec ? 'primary' : 'secondary'} onClick={() => onPick(x.price)} className="justify-self-start sm:justify-self-end">
                Pakai
              </Button>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

const MAX_RESULTS = 30

function ProductPicker({
  products,
  selected,
  onPick,
  onClear,
}: {
  products: Product[] | null
  selected: Product | null
  onPick: (p: Product) => void
  onClear: () => void
}) {
  const [query, setQuery] = useState('')
  const results = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (!products || words.length === 0) return []
    return products.filter((p) => {
      const text = `${p.product_name} ${p.variant_name} ${p.sku}`.toLowerCase()
      return words.every((w) => text.includes(w))
    })
  }, [products, query])

  if (selected) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[16rem] flex-1">
          <p className="line-clamp-3 font-semibold">{selected.product_name}</p>
          {selected.variant_name && <p className="text-ink-2">Variasi: {selected.variant_name}</p>}
        </div>
        <Button variant="secondary" onClick={onClear}>
          Ganti / isi manual
        </Button>
      </div>
    )
  }

  return (
    <div>
      <div className="relative">
        <IconSearch
          size={18}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={products ? 'Ketik nama produk atau SKU' : 'Memuat produk…'}
          aria-label="Cari produk"
          disabled={!products}
          className={`${inputClass} pl-10`}
        />
      </div>
      <p className="mt-1.5 text-sm text-ink-2">
        HPP, harga jual terakhir, dan ROAS aktual terisi otomatis. Atau lewati, lalu isi angkanya sendiri di bawah.
      </p>
      {query.trim() !== '' && (
        <ul className="mt-3 max-h-80 divide-y divide-line overflow-y-auto rounded-xl border border-control">
          {results.length === 0 && <li className="p-3 text-ink-2">Tidak ada produk yang cocok.</li>}
          {results.slice(0, MAX_RESULTS).map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  setQuery('')
                  onPick(p)
                }}
                className="block min-h-11 w-full px-3 py-2 text-left hover:bg-tint"
              >
                <span className="line-clamp-2 font-medium">{p.product_name}</span>
                <span className="text-sm text-ink-2">
                  {p.variant_name || 'tanpa variasi'} · HPP {p.hpp === null ? 'belum diisi' : formatRupiah(Number(p.hpp))}
                </span>
              </button>
            </li>
          ))}
          {results.length > MAX_RESULTS && (
            <li className="p-3 text-sm text-ink-2">
              {results.length - MAX_RESULTS} produk lain. Ketik lebih spesifik.
            </li>
          )}
        </ul>
      )}
    </div>
  )
}


