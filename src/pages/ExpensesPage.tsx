import { useEffect, useState } from 'react'
import { MonthPicker, RupiahInput, StorePicker } from '../components/pickers'
import { Alert, Button, Card, ErrorBox, PageTitle, Spinner } from '../components/ui'
import { fetchExpenses, saveExpenses } from '../lib/api'
import { addMonths, currentMonth, formatMonth, formatRupiah } from '../lib/format'
import { EXPENSE_CATEGORIES, type ExpenseCategory, type Store } from '../lib/types'

type Values = Record<ExpenseCategory, { amount: number | null; note: string }>

const emptyValues = (): Values => ({
  iklan_shopee: { amount: null, note: '' },
  meta_ads: { amount: null, note: '' },
  packaging: { amount: null, note: '' },
  lain_lain: { amount: null, note: '' },
})

export function ExpensesPage({
  stores,
  storeId,
  onStoreChange,
}: {
  stores: Store[]
  storeId: number | null
  onStoreChange: (id: number) => void
}) {
  // Biaya biasanya direkap setelah bulan selesai → default bulan lalu.
  const [month, setMonth] = useState(() => addMonths(currentMonth(), -1))
  const [values, setValues] = useState<Values | null>(null)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<unknown>(null)
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!storeId) return
    let cancelled = false
    setValues(null)
    setLoadError(null)
    setSaved(false)
    setDirty(false)
    fetchExpenses(storeId, month)
      .then((rows) => {
        if (cancelled) return
        const v = emptyValues()
        for (const r of rows) v[r.category] = { amount: Number(r.amount), note: r.note }
        setValues(v)
      })
      .catch((e) => !cancelled && setLoadError(e))
    return () => {
      cancelled = true
    }
  }, [storeId, month])

  const update = (cat: ExpenseCategory, patch: Partial<Values[ExpenseCategory]>) => {
    setValues((v) => (v ? { ...v, [cat]: { ...v[cat], ...patch } } : v))
    setSaved(false)
    setDirty(true)
  }

  const save = async () => {
    if (!storeId || !values) return
    setSaving(true)
    setSaveError(null)
    try {
      await saveExpenses(
        storeId,
        month,
        EXPENSE_CATEGORIES.map(({ key }) => ({
          category: key,
          amount: values[key].amount ?? 0,
          note: values[key].note.trim(),
        })),
      )
      setSaved(true)
      setDirty(false)
    } catch (e) {
      setSaveError(e)
    } finally {
      setSaving(false)
    }
  }

  const total = values ? EXPENSE_CATEGORIES.reduce((s, c) => s + (values[c.key].amount ?? 0), 0) : 0
  const storeName = stores.find((s) => s.id === storeId)?.name ?? ''

  return (
    <>
      <PageTitle subtitle="Biaya di luar laporan penghasilan Shopee, mis. iklan (dibayar dari saldo iklan), Meta Ads, packaging.">
        Biaya
      </PageTitle>

      <Card className="mb-6">
        <div className="flex flex-col gap-4">
          <StorePicker stores={stores} value={storeId} onChange={onStoreChange} />
          <MonthPicker value={month} onChange={setMonth} label="Bulan:" />
        </div>
      </Card>

      {loadError ? (
        <ErrorBox error={loadError} />
      ) : !values ? (
        <Spinner />
      ) : (
        <Card title={`${storeName} — ${formatMonth(month)}`}>
          <div className="space-y-5">
            {EXPENSE_CATEGORIES.map(({ key, label }) => (
              <div key={key} className="grid gap-3 md:grid-cols-[12rem_16rem_1fr] md:items-center">
                <p className="text-lg font-semibold">{label}</p>
                <RupiahInput
                  value={values[key].amount}
                  onCommit={(amount) => update(key, { amount })}
                  ariaLabel={`Biaya ${label}`}
                />
                <input
                  type="text"
                  placeholder="Catatan (opsional)"
                  aria-label={`Catatan ${label}`}
                  value={values[key].note}
                  onChange={(e) => update(key, { note: e.target.value })}
                  className="min-h-12 rounded-xl border border-slate-300 px-4 text-lg focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200"
                />
              </div>
            ))}
          </div>

          <p className="mt-6 text-xl">
            Total biaya: <strong className="tabular-nums">{formatRupiah(total)}</strong>
          </p>

          {saveError ? <div className="mt-4"><ErrorBox error={saveError} /></div> : null}
          {saved && (
            <div className="mt-4">
              <Alert tone="success">Biaya {formatMonth(month)} tersimpan.</Alert>
            </div>
          )}
          {dirty && !saving && <p className="mt-4 text-amber-700">Ada perubahan yang belum disimpan.</p>}

          <Button className="mt-4" onClick={save} disabled={saving}>
            {saving ? 'Menyimpan…' : 'Simpan biaya'}
          </Button>
        </Card>
      )}
    </>
  )
}
