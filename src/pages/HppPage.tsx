import { useEffect, useMemo, useState } from 'react'
import { RupiahInput } from '../components/pickers'
import { Alert, Card, ErrorBox, PageTitle, Spinner, inputClass } from '../components/ui'
import { IconCheck, IconCheckCircle, IconSearch } from '../components/icons'
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
      <PageTitle subtitle="Harga pokok (modal) per 1 unit yang dijual di Shopee — untuk paket grosir, isi HPP per paket. Ketik angka lalu tekan Enter untuk menyimpan.">
        HPP — {stores.find((s) => s.id === storeId)?.name}
      </PageTitle>


      <div className="mb-6">
        <Alert tone="info">
          Mengubah HPP <strong>tidak</strong> mengubah profit bulan yang sudah tersimpan. Kalau ingin bulan tertentu
          memakai HPP terbaru, gunakan tombol <strong>Hitung ulang HPP</strong> di halaman Rekap.
        </Alert>
      </div>

      {loadError ? (
        <ErrorBox error={loadError} />
      ) : !products ? (
        <Spinner />
      ) : products.length === 0 ? (
        <Alert tone="info" title="Belum ada produk">
          Produk otomatis muncul di sini setelah Anda meng-upload export pesanan.
        </Alert>
      ) : (
        <Card>
          <div className="mb-4 flex flex-wrap items-center gap-4">
            <div className="relative min-w-[14rem] flex-1">
              <IconSearch
                size={18}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
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
            <p className="mb-4 font-semibold text-loss">
              {formatNumber(missingCount)} dari {formatNumber(products.length)} produk belum punya HPP.
            </p>
          ) : (
            <p className="mb-4 flex items-center gap-2 font-semibold text-gain">
              <IconCheckCircle size={20} />
              Semua produk sudah punya HPP.
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-rule text-sm text-ink-muted">
                <tr>
                  <th className="py-2 pr-3 font-medium">Produk</th>
                  <th className="py-2 pr-3 font-medium">SKU</th>
                  <th className="w-56 py-2 pr-3 font-medium">HPP per pcs</th>
                  <th className="w-28 py-2" />
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => {
                  const st = status[p.id]
                  const sourceLabel = SOURCE_LABEL[p.sku_source]
                  return (
                    <tr key={p.id} className={`border-b border-line/70 align-middle ${p.hpp === null ? 'bg-loss-tint/50' : ''}`}>
                      <td className="py-3 pr-3">
                        <p className="font-medium">{p.product_name}</p>
                        {p.variant_name && <p className="text-ink-soft">Variasi: {p.variant_name}</p>}
                      </td>
                      <td className="py-3 pr-3 text-sm">
                        {p.sku_source === 'sku' ? (
                          <span className="num text-ink-soft">{p.sku}</span>
                        ) : (
                          <span className="whitespace-nowrap rounded-md bg-warn-tint px-2 py-1 text-warn">{sourceLabel}</span>
                        )}
                      </td>
                      <td className="py-3 pr-3">
                        <RupiahInput
                          value={p.hpp === null ? null : Number(p.hpp)}
                          onCommit={(v) => save(p, v)}
                          ariaLabel={`HPP ${p.product_name} ${p.variant_name}`}
                          highlight={p.hpp === null}
                          disabled={st?.state === 'saving'}
                        />
                      </td>
                      <td className="py-3 text-sm">
                        {st?.state === 'saving' && <span className="text-ink-muted">Menyimpan…</span>}
                        {st?.state === 'saved' && (
                          <span className="inline-flex items-center gap-1 text-gain">
                            <IconCheck size={16} />
                            Tersimpan
                          </span>
                        )}
                        {st?.state === 'error' && <span className="text-loss">{st.message}</span>}
                        {!st && p.hpp === null && <span className="font-semibold text-loss">Belum diisi</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {visible.length === 0 && <p className="py-6 text-center text-ink-muted">Tidak ada produk yang cocok.</p>}
          </div>
        </Card>
      )}
    </>
  )
}
