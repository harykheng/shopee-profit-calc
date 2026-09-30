import { useEffect, useMemo, useState } from 'react'
import { RupiahInput, StorePicker } from '../components/pickers'
import { Alert, Card, ErrorBox, PageTitle, Spinner } from '../components/ui'
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
  onStoreChange,
  onlyMissingInitially,
}: {
  stores: Store[]
  storeId: number | null
  onStoreChange: (id: number) => void
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
      <PageTitle subtitle="Harga pokok (modal) per produk. Ketik angka lalu tekan Enter atau pindah kolom untuk menyimpan.">
        HPP
      </PageTitle>

      <Card className="mb-6">
        <StorePicker stores={stores} value={storeId} onChange={onStoreChange} />
      </Card>

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
            <input
              type="search"
              placeholder="Cari produk / SKU…"
              aria-label="Cari produk"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-h-12 flex-1 rounded-xl border border-slate-300 px-4 text-lg focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200"
            />
            <label className="flex min-h-12 items-center gap-3 text-lg">
              <input
                type="checkbox"
                checked={onlyMissing}
                onChange={(e) => setOnlyMissing(e.target.checked)}
                className="h-6 w-6 accent-orange-600"
              />
              Hanya yang belum ada HPP
            </label>
          </div>

          {missingCount > 0 ? (
            <p className="mb-4 text-lg font-semibold text-red-700">
              {formatNumber(missingCount)} dari {formatNumber(products.length)} produk belum punya HPP.
            </p>
          ) : (
            <p className="mb-4 text-lg font-semibold text-emerald-700">Semua produk sudah punya HPP. 👍</p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Produk</th>
                  <th className="py-2 pr-3">SKU</th>
                  <th className="w-56 py-2 pr-3">HPP per pcs</th>
                  <th className="w-28 py-2" />
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => {
                  const st = status[p.id]
                  const sourceLabel = SOURCE_LABEL[p.sku_source]
                  return (
                    <tr key={p.id} className={`border-b border-slate-100 align-middle ${p.hpp === null ? 'bg-red-50' : ''}`}>
                      <td className="py-3 pr-3">
                        <p className="font-medium">{p.product_name}</p>
                        {p.variant_name && <p className="text-slate-600">Variasi: {p.variant_name}</p>}
                      </td>
                      <td className="py-3 pr-3 text-sm">
                        {p.sku_source === 'sku' ? (
                          <span className="font-mono">{p.sku}</span>
                        ) : (
                          <span className="whitespace-nowrap rounded-lg bg-amber-100 px-2 py-1 text-amber-900">{sourceLabel}</span>
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
                        {st?.state === 'saving' && <span className="text-slate-500">Menyimpan…</span>}
                        {st?.state === 'saved' && <span className="text-emerald-700">Tersimpan ✓</span>}
                        {st?.state === 'error' && <span className="text-red-700">{st.message}</span>}
                        {!st && p.hpp === null && <span className="font-semibold text-red-700">Belum diisi</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {visible.length === 0 && <p className="py-6 text-center text-lg text-slate-500">Tidak ada produk yang cocok.</p>}
          </div>
        </Card>
      )}
    </>
  )
}
