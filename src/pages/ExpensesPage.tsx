import { useEffect, useState } from 'react'
import { MonthPicker, RupiahInput } from '../components/pickers'
import { Alert, Button, Card, ErrorBox, PageTitle, Spinner, inputClass } from '../components/ui'
import { IconAlertCircle } from '../components/icons'
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
  initialMonth,
}: {
  stores: Store[]
  storeId: number | null
  /** Dari link "Isi biaya" di Rekap, mis. "2026-08-01". */
  initialMonth?: string | null
}) {
  // Biaya biasanya direkap setelah bulan selesai → default bulan lalu.
  const pickMonth = (m?: string | null) => (m && /^\d{4}-\d{2}-01$/.test(m) ? m : addMonths(currentMonth(), -1))
  const [month, setMonth] = useState(() => pickMonth(initialMonth))
  useEffect(() => {
    if (initialMonth) setMonth(pickMonth(initialMonth))
  }, [initialMonth])
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

      <div className="mb-6">
        <MonthPicker value={month} onChange={setMonth} label="Bulan:" />
      </div>

      {loadError ? (
        <ErrorBox error={loadError} />
      ) : !values ? (
        <Spinner />
      ) : (
        <Card title={`${storeName} — ${formatMonth(month)}`}>
          <div className="space-y-5">
            {EXPENSE_CATEGORIES.map(({ key, label }) => (
              <div key={key} className="grid gap-3 md:grid-cols-[12rem_16rem_1fr] md:items-center">
                <p className="font-medium">{label}</p>
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
                  className={inputClass}
                />
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-baseline justify-between gap-3 border-t-2 border-dashed border-rule pt-4">
            <span className="font-bold uppercase tracking-wide">Total biaya</span>
            <strong className="num text-2xl font-bold">{formatRupiah(total)}</strong>
          </div>

          {/* Pesan status di BAWAH tombol, supaya tombol tidak bergeser saat ditekan. */}
          <Button className="mt-4" onClick={save} disabled={saving}>
            {saving ? 'Menyimpan…' : 'Simpan biaya'}
          </Button>

          {saveError ? <div className="mt-4"><ErrorBox error={saveError} /></div> : null}
          {saved && (
            <div className="mt-4">
              <Alert tone="success">Biaya {formatMonth(month)} tersimpan.</Alert>
            </div>
          )}
          {dirty && !saving && (
            <p className="mt-4 flex items-center gap-2 text-warn">
              <IconAlertCircle size={18} />
              Ada perubahan yang belum disimpan.
            </p>
          )}
        </Card>
      )}
    </>
  )
}
