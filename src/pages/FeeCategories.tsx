// Kategori biaya admin milik toko: daftar kategori + persen, dan kategori tiap produk.
// Tarif Shopee berbeda per kategori dan berubah-ubah, jadi tidak ada angka bawaan: diisi sendiri dari Seller Centre.
import { useMemo, useState } from 'react'
import { Alert, Button, Card, ErrorBox, inputClass } from '../components/ui'
import { IconSearch } from '../components/icons'
import { deleteFeeCategory, saveFeeCategory, saveProductCategory } from '../lib/api'
import { effectiveAdminPct } from '../lib/feeCategories'
import { formatNumber } from '../lib/format'
import type { FeeCategory, Product } from '../lib/types'
import { DecimalInput, decimal } from './simShared'

const PRODUCT_ROWS = 100

interface Props {
  storeId: number
  categories: FeeCategory[]
  onCategories: (next: FeeCategory[]) => void
  products: Product[] | null
  onProducts: (next: Product[]) => void
}

/** Satu baris per nama produk (semua variasinya memakai kategori yang sama). */
function productGroups(products: Product[]) {
  const map = new Map<string, Product[]>()
  for (const p of products) map.set(p.product_name, [...(map.get(p.product_name) ?? []), p])
  return [...map].map(([name, variants]) => ({ name, variants, first: variants[0] }))
}

export function FeeCategoriesPanel({ storeId, categories, onCategories, products, onProducts }: Props) {
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPct, setNewPct] = useState<number | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [onlyEmpty, setOnlyEmpty] = useState(false)

  const groups = useMemo(() => (products ? productGroups(products) : []), [products])
  const usage = useMemo(() => {
    const m = new Map<number, number>()
    for (const g of groups) {
      const id = g.first.fee_category_id
      if (id !== null && id !== undefined) m.set(id, (m.get(id) ?? 0) + 1)
    }
    return m
  }, [groups])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  const add = () => {
    if (!newName.trim()) return setFormError('Isi nama kategori dulu.')
    if (newPct === null) return setFormError('Isi persen biaya adminnya.')
    if (newPct >= 100) return setFormError('Persen admin harus di bawah 100.')
    setFormError(null)
    void run(async () => {
      const row = await saveFeeCategory(storeId, { name: newName, adminPct: newPct })
      onCategories([...categories, row].sort((a, b) => a.name.localeCompare(b.name, 'id')))
      setNewName('')
      setNewPct(null)
    })
  }

  const update = (cat: FeeCategory, patch: { name?: string; adminPct?: number }) => {
    const name = (patch.name ?? cat.name).trim()
    const adminPct = patch.adminPct ?? cat.admin_pct
    if (!name || adminPct >= 100 || (name === cat.name && adminPct === cat.admin_pct)) return
    void run(async () => {
      const row = await saveFeeCategory(storeId, { id: cat.id, name, adminPct })
      onCategories(categories.map((c) => (c.id === cat.id ? row : c)).sort((a, b) => a.name.localeCompare(b.name, 'id')))
      // Database menyalin persen baru ke produk-produk kategori ini (cadangan); samakan tampilan di sini.
      if (products && row.admin_pct !== cat.admin_pct) {
        onProducts(products.map((p) => (p.fee_category_id === cat.id ? { ...p, admin_pct: row.admin_pct } : p)))
      }
    })
  }

  const remove = (cat: FeeCategory) =>
    run(async () => {
      await deleteFeeCategory(storeId, cat.id)
      onCategories(categories.filter((c) => c.id !== cat.id))
      // Produk yang memakainya kembali ke isian manual (persen terakhirnya tetap tersimpan).
      if (products) onProducts(products.map((p) => (p.fee_category_id === cat.id ? { ...p, fee_category_id: null } : p)))
      setConfirmId(null)
    })

  const assign = (name: string, categoryId: number | null) => {
    const cat = categoryId === null ? null : (categories.find((c) => c.id === categoryId) ?? null)
    void run(async () => {
      await saveProductCategory(storeId, name, cat ? cat.id : null, cat ? cat.admin_pct : undefined)
      if (products) {
        onProducts(
          products.map((p) =>
            p.product_name === name
              ? { ...p, fee_category_id: cat ? cat.id : null, ...(cat ? { admin_pct: cat.admin_pct } : {}) }
              : p,
          ),
        )
      }
    })
  }

  const hasCategory = (g: { first: Product }) =>
    g.first.fee_category_id != null && categories.some((c) => c.id === g.first.fee_category_id)
  const q = search.trim().toLowerCase()
  const shown = groups
    .filter((g) => !onlyEmpty || !hasCategory(g))
    .filter((g) => !q || g.name.toLowerCase().includes(q))
  const withoutCategory = groups.filter((g) => !hasCategory(g)).length

  return (
    <Card title="Kategori biaya admin" className="mb-8">
      <p className="max-w-3xl text-ink-soft">
        Biaya admin Shopee berbeda tiap kategori produk dan bisa berubah. Isi kategori tokomu <strong>sekali</strong>{' '}
        beserta persennya (lihat Seller Centre → Pusat Edukasi Penjual), lalu pilihkan kategori untuk tiap produk.
        Kalau Shopee mengubah persennya, ubah di sini saja: semua produk di kategori itu ikut. Halaman Iklan dan
        Simulasi memakai angka ini.
      </p>

      {error ? <div className="mt-4"><ErrorBox error={error} /></div> : null}

      <h3 className="mt-6 font-display text-lg font-bold">Daftar kategori</h3>
      {categories.length === 0 ? (
        <p className="mt-2 text-ink-muted">Belum ada kategori. Tambahkan yang pertama di bawah.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line/70">
          {categories.map((c) => (
            <li key={c.id} className="grid gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_9rem_auto] sm:items-center">
              <input
                type="text"
                defaultValue={c.name}
                key={`${c.id}-${c.name}`}
                aria-label={`Nama kategori ${c.name}`}
                onBlur={(e) => update(c, { name: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                disabled={busy}
                className={inputClass}
              />
              <DecimalInput
                value={c.admin_pct}
                onCommit={(v) => v !== null && update(c, { adminPct: v })}
                ariaLabel={`Persen admin ${c.name}`}
                suffix="%"
                disabled={busy}
              />
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-ink-muted">{formatNumber(usage.get(c.id) ?? 0)} produk</span>
                {confirmId === c.id ? (
                  <>
                    <Button variant="danger" className="!px-4" disabled={busy} onClick={() => remove(c)}>
                      Ya, hapus
                    </Button>
                    <Button variant="secondary" className="!px-4" onClick={() => setConfirmId(null)}>
                      Batal
                    </Button>
                  </>
                ) : (
                  <Button variant="secondary" className="!px-4" disabled={busy} onClick={() => setConfirmId(c.id)}>
                    Hapus
                  </Button>
                )}
              </div>
              {confirmId === c.id && (
                <p className="text-sm text-warn sm:col-span-3">
                  {(usage.get(c.id) ?? 0) > 0
                    ? `${formatNumber(usage.get(c.id) ?? 0)} produk memakai kategori ini; mereka kembali ke isian manual dengan persen terakhirnya (${decimal(c.admin_pct)}%).`
                    : 'Kategori ini belum dipakai produk mana pun.'}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 grid gap-3 rounded-2xl bg-counter/60 p-4 sm:grid-cols-[minmax(0,1fr)_9rem_auto] sm:items-start">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Nama kategori, mis. Skincare"
          aria-label="Nama kategori baru"
          className={inputClass}
        />
        <DecimalInput value={newPct} onCommit={setNewPct} ariaLabel="Persen admin kategori baru" suffix="%" placeholder="persen" />
        <Button onClick={add} disabled={busy}>
          Tambah kategori
        </Button>
        {formError && <p className="text-sm font-semibold text-loss sm:col-span-3">{formError}</p>}
      </div>

      <h3 className="mt-8 font-display text-lg font-bold">Kategori tiap produk</h3>
      {!products ? (
        <p className="mt-2 text-ink-muted">Memuat produk…</p>
      ) : groups.length === 0 ? (
        <p className="mt-2 text-ink-muted">Produk muncul di sini setelah export pesanan di-upload.</p>
      ) : categories.length === 0 ? (
        <p className="mt-2 text-ink-muted">Buat kategori dulu, lalu pilihkan untuk tiap produk di sini.</p>
      ) : (
        <>
          <p className="mt-2 text-ink-soft">
            {withoutCategory === 0 ? (
              'Semua produk sudah punya kategori.'
            ) : (
              <>
                <strong>{formatNumber(withoutCategory)}</strong> dari {formatNumber(groups.length)} produk belum punya
                kategori (memakai isian manual atau nilai bawaan). Berlaku untuk semua variasi produk.
              </>
            )}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <div className="relative min-w-[14rem] flex-1">
              <IconSearch size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
              <input
                type="search"
                placeholder="Cari produk…"
                aria-label="Cari produk"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`${inputClass} pl-10`}
              />
            </div>
            <label className="flex min-h-11 cursor-pointer items-center gap-3">
              <input type="checkbox" checked={onlyEmpty} onChange={(e) => setOnlyEmpty(e.target.checked)} className="h-5 w-5" />
              Hanya yang belum punya kategori
            </label>
          </div>
          <ul className="mt-2 divide-y divide-line/70">
            {shown.slice(0, PRODUCT_ROWS).map((g) => {
              const eff = effectiveAdminPct(g.first, categories)
              const catId = hasCategory(g) ? (g.first.fee_category_id as number) : null
              return (
                <li key={g.name} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_16rem] sm:items-center">
                  <div className="min-w-0">
                    <p className="truncate font-medium" title={g.name}>{g.name}</p>
                    <p className="text-sm text-ink-muted">
                      {g.variants.length > 1 ? `${formatNumber(g.variants.length)} variasi · ` : ''}
                      {catId === null
                        ? eff === null
                          ? 'belum diisi (nilai bawaan dipakai)'
                          : `isian manual ${decimal(eff)}%`
                        : `${decimal(eff ?? 0)}%`}
                    </p>
                  </div>
                  <select
                    value={catId ?? ''}
                    disabled={busy}
                    onChange={(e) => assign(g.name, e.target.value === '' ? null : Number(e.target.value))}
                    aria-label={`Kategori ${g.name}`}
                    className={inputClass}
                  >
                    <option value="">Isi manual / belum dipilih</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({decimal(c.admin_pct)}%)
                      </option>
                    ))}
                  </select>
                </li>
              )
            })}
          </ul>
          {shown.length === 0 && <p className="py-4 text-center text-ink-muted">Tidak ada produk yang cocok.</p>}
          {shown.length > PRODUCT_ROWS && (
            <Alert tone="info">Menampilkan {PRODUCT_ROWS} dari {formatNumber(shown.length)} produk. Cari nama produk untuk mempersempit.</Alert>
          )}
        </>
      )}
    </Card>
  )
}
