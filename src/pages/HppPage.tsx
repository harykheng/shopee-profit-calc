import { useEffect, useMemo, useState } from 'react'
import { RupiahInput } from '../components/pickers'
import { Alert, Card, ErrorBox, PageTitle, Spinner, buttonClass, inputClass } from '../components/ui'
import { IconAlertCircle, IconCheck, IconCheckCircle, IconSearch, IconUpload } from '../components/icons'
import { fetchProducts, updateHpp } from '../lib/api'
import { friendlyError } from '../lib/errors'
import { formatNumber } from '../lib/format'
import type { Product, Store } from '../lib/types'

type RowStatus = { state: 'saving' } | { state: 'saved' } | { state: 'error'; message: string }

const SOURCE_LABEL: Record<Product['sku_source'], string | null> = {
  sku: null,
  sku_induk: 'tanpa SKU variasi',
  nama: 'tanpa SKU',
}

export function HppPage({
  stores,
  storeId,
  onlyMissingInitially,
}: {
  stores: Store[]
  storeId: number | null
  onlyMissingInitially: boolean
}) {
  const [products, setProducts] = useState<Product[] | null>(null)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [search, setSearch] = useState('')
  const [onlyMissing, setOnlyMissing] = useState(onlyMissingInitially)
  const [status, setStatus] = useState<Record<number, RowStatus>>({})

  useEffect(() => setOnlyMissing(onlyMissingInitially), [onlyMissingInitially])

  useEffect(() => {
    if (!storeId) return
    let cancelled = false
    setProducts(null)
    setLoadError(null)
    setStatus({})
    fetchProducts(storeId)
      // Urutkan sekali saat dimuat (yang belum ada HPP di atas), supaya baris tidak
      // melompat saat HPP diisi.
      .then((list) => !cancelled && setProducts([...list].sort((a, b) => Number(a.hpp !== null) - Number(b.hpp !== null))))
      .catch((e) => !cancelled && setLoadError(e))
    return () => {
      cancelled = true
    }
  }, [storeId])

  const missingCount = products?.filter((p) => p.hpp === null).length ?? 0

  const visible = useMemo(() => {
    if (!products) return []
    const q = search.trim().toLowerCase()
    return products
      // Baris yang baru diisi tetap tampil walau filter "belum ada HPP" aktif.
      .filter((p) => !onlyMissing || p.hpp === null || status[p.id] !== undefined)
      .filter((p) => !q || `${p.product_name} ${p.variant_name} ${p.sku}`.toLowerCase().includes(q))
  }, [products, search, onlyMissing, status])

  const save = async (product: Product, hpp: number | null) => {
    setStatus((s) => ({ ...s, [product.id]: { state: 'saving' } }))
    try {
      const updated = await updateHpp(product.id, hpp)
      setProducts((list) => list?.map((p) => (p.id === updated.id ? updated : p)) ?? null)
      setStatus((s) => ({ ...s, [product.id]: { state: 'saved' } }))
    } catch (e) {
      setStatus((s) => ({ ...s, [product.id]: { state: 'error', message: friendlyError(e) } }))
    }
  }

  return (
    <>
      <PageTitle
        kicker={stores.length > 1 ? stores.find((s) => s.id === storeId)?.name : undefined}
        subtitle="Modal untuk 1 unit yang kamu jual di Shopee. Untuk paket grosir, isi modal per paket. Ketik angkanya, lalu tekan Enter atau pindah kolom: langsung tersimpan."
      >
        HPP (modal per barang)
      </PageTitle>

      <div className="mb-6">
        <Alert tone="info">
          HPP baru dipakai untuk pesanan berikutnya. Untung bulan yang sudah tersimpan <strong className="text-ink">tidak</strong>{' '}
          ikut berubah, kecuali kamu menekan <strong className="text-ink">Hitung ulang HPP</strong> di Rekap.
        </Alert>
      </div>

      {loadError ? (
        <ErrorBox error={loadError} />
      ) : !products ? (
        <Spinner />
      ) : products.length === 0 ? (
        <Alert tone="info" title="Belum ada produk">
          <p>Produk muncul otomatis setelah kamu upload export pesanan.</p>
          <a href="#/upload" className={`${buttonClass('secondary')} mt-3`}>
            <IconUpload size={18} />
            Ke halaman Upload
          </a>
        </Alert>
      ) : (
        <Card>
          <div className="mb-4 flex flex-wrap items-center gap-4">
            <div className="relative min-w-[14rem] flex-1">
              <IconSearch
                size={18}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
              />
              <input
                type="search"
                placeholder="Cari produk / SKU…"
                aria-label="Cari produk"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`${inputClass} pl-10`}
              />
            </div>
            <label className="flex min-h-11 cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={onlyMissing}
                onChange={(e) => setOnlyMissing(e.target.checked)}
                className="h-5 w-5"
              />
              Hanya yang belum ada HPP
            </label>
          </div>

          {missingCount > 0 ? (
            <p className="mb-4 flex items-center gap-2 font-semibold text-loss">
              <IconAlertCircle size={20} className="shrink-0" />
              {formatNumber(missingCount)} dari {formatNumber(products.length)} produk belum punya HPP.
            </p>
          ) : (
            <p className="mb-4 flex items-center gap-2 font-semibold text-gain">
              <IconCheckCircle size={20} />
              Semua produk sudah punya HPP.
            </p>
          )}

          {/* HP: tiap produk menumpuk (nama, SKU, lalu kolom HPP selebar layar). Dari 640px: empat kolom. */}
          <div>
            <div className="hidden grid-cols-[minmax(0,1fr)_9rem_14rem_7rem] gap-x-4 border-b border-rule py-2 text-sm font-semibold text-ink-3 sm:grid">
              <span>Produk</span>
              <span>SKU</span>
              <span>HPP per unit</span>
              <span />
            </div>
            <ul>
              {visible.map((p) => {
                const st = status[p.id]
                const sourceLabel = SOURCE_LABEL[p.sku_source]
                return (
                  <li
                    key={p.id}
                    className={`grid gap-x-4 gap-y-2 border-b border-line py-3 sm:grid-cols-[minmax(0,1fr)_9rem_14rem_7rem] sm:items-center ${
                      p.hpp === null ? '-mx-3 rounded-xl bg-loss-tint/60 px-3' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="font-semibold">{p.product_name}</p>
                      {p.variant_name && <p className="text-ink-2">Variasi: {p.variant_name}</p>}
                    </div>
                    <div className="text-sm">
                      {p.sku_source === 'sku' ? (
                        <span className="num break-all text-ink-2">
                          <span className="sm:hidden">SKU </span>
                          {p.sku}
                        </span>
                      ) : (
                        <span className="whitespace-nowrap rounded-full border border-sun bg-sun-tint px-2.5 py-0.5 font-semibold text-warn">
                          {sourceLabel}
                        </span>
                      )}
                    </div>
                    <RupiahInput
                      value={p.hpp === null ? null : Number(p.hpp)}
                      onCommit={(v) => save(p, v)}
                      ariaLabel={`HPP ${p.product_name} ${p.variant_name}`}
                      highlight={p.hpp === null}
                      disabled={st?.state === 'saving'}
                    />
                    <div className="text-sm" aria-live="polite">
                      {st?.state === 'saving' && <span className="text-ink-3">Menyimpan…</span>}
                      {st?.state === 'saved' && (
                        <span className="inline-flex items-center gap-1 font-semibold text-gain">
                          <IconCheck size={16} />
                          Tersimpan
                        </span>
                      )}
                      {st?.state === 'error' && <span className="text-loss">{st.message}</span>}
                      {!st && p.hpp === null && <span className="font-semibold text-loss">Belum diisi</span>}
                    </div>
                  </li>
                )
              })}
            </ul>
            {visible.length === 0 && <p className="py-6 text-center text-ink-2">Tidak ada produk yang cocok.</p>}
          </div>
        </Card>
      )}
    </>
  )
}
