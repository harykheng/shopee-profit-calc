// Pengaturan hitungan per toko (halaman Akun): target untung dan nasib barang retur.
import { useEffect, useState } from 'react'
import { Alert, Button, Card, ErrorBox, Spinner } from '../components/ui'
import { fetchStoreSettings, saveStoreSettings } from '../lib/api'
import {
  DEFAULT_SETTINGS,
  resolveSettings,
  settingsToPercent,
  validateSettings,
  type SettingsPercent,
} from '../lib/storeSettings'
import { DecimalInput, Field } from './simShared'

const DEFAULT_PERCENT = settingsToPercent(DEFAULT_SETTINGS)

export function StoreSettingsCard({
  storeId,
  storeName,
  showStoreName,
  readOnly,
}: {
  storeId: number
  storeName: string
  showStoreName: boolean
  readOnly: boolean
}) {
  const [values, setValues] = useState<SettingsPercent | null>(null)
  const [saved, setSaved] = useState<SettingsPercent | null>(null)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [saveError, setSaveError] = useState<unknown>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let cancelled = false
    setValues(null)
    setLoadError(null)
    setDone(false)
    fetchStoreSettings(storeId)
      .then((row) => {
        if (cancelled) return
        const v = settingsToPercent(resolveSettings(row))
        setValues(v)
        setSaved(v)
      })
      .catch((e) => !cancelled && setLoadError(e))
    return () => {
      cancelled = true
    }
  }, [storeId])

  const set = (patch: Partial<SettingsPercent>) => {
    setValues((v) => (v ? { ...v, ...patch } : v))
    setDone(false)
  }

  const save = async (next: SettingsPercent) => {
    setSaveError(null)
    const problem = validateSettings(next)
    setFormError(problem)
    if (problem) return
    setBusy(true)
    try {
      await saveStoreSettings(storeId, next)
      setValues(next)
      setSaved(next)
      setDone(true)
    } catch (e) {
      setSaveError(e)
    } finally {
      setBusy(false)
    }
  }

  const dirty = values !== null && saved !== null && JSON.stringify(values) !== JSON.stringify(saved)
  const isDefault = values !== null && JSON.stringify(values) === JSON.stringify(DEFAULT_PERCENT)

  return (
    <Card title={showStoreName ? `Pengaturan hitungan: ${storeName}` : 'Pengaturan hitungan'} className="mb-8 max-w-3xl">
      {loadError ? (
        <ErrorBox error={loadError} />
      ) : !values ? (
        <Spinner />
      ) : (
        <>
          {readOnly && (
            <div className="mb-5">
              <Alert tone="warning" title="Langganan habis, pengaturan tidak bisa diubah.">
                Pengaturan aktif lagi setelah langganan diperpanjang.
              </Alert>
            </div>
          )}
          <div className="space-y-5">
            <Field
              label="Target untung setelah iklan"
              hint="Dari harga jual, setelah dikurangi potongan Shopee, modal, dan biaya iklan. Dipakai untuk saran target ROAS (Simulasi Harga) dan label Hero/Aman/Takedown di halaman Iklan. Bawaan 5%."
            >
              <DecimalInput
                value={values.adsTargetProfitPct}
                onCommit={(v) => set({ adsTargetProfitPct: v ?? DEFAULT_PERCENT.adsTargetProfitPct })}
                ariaLabel="Target untung setelah iklan (persen)"
                suffix="%"
                disabled={readOnly}
              />
            </Field>
            <Field
              label="Target untung harga jual (sebelum iklan)"
              hint="Dipakai untuk saran harga jual. Produk yang untungnya di bawah angka ini diberi saran menaikkan harga. Bawaan 20%."
            >
              <DecimalInput
                value={values.priceTargetMarginPct}
                onCommit={(v) => set({ priceTargetMarginPct: v ?? DEFAULT_PERCENT.priceTargetMarginPct })}
                ariaLabel="Target untung harga jual (persen)"
                suffix="%"
                disabled={readOnly}
              />
            </Field>
            <Field
              label="Barang retur yang bisa dijual lagi"
              hint="100% = barang yang diretur kembali ke stok, jadi modalnya tidak dihitung hilang (bawaan). Kalau barang retur biasanya rusak atau tidak bisa dijual lagi, turunkan angkanya: 0% berarti seluruh modal barang retur dihitung sebagai kerugian."
            >
              <DecimalInput
                value={values.returnRecoveryPct}
                onCommit={(v) => set({ returnRecoveryPct: v ?? DEFAULT_PERCENT.returnRecoveryPct })}
                ariaLabel="Barang retur yang bisa dijual lagi (persen)"
                suffix="%"
                disabled={readOnly}
              />
            </Field>
          </div>

          <p className="mt-4 text-sm text-ink-muted">
            Pengaturan retur berlaku untuk <strong>semua bulan</strong> (angka Rekap bulan-bulan lama ikut berubah).
            Harga jual dan HPP yang tersimpan tidak berubah.
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            <Button onClick={() => save(values)} disabled={busy || readOnly || !dirty}>
              {busy ? 'Menyimpan…' : 'Simpan pengaturan'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setValues(DEFAULT_PERCENT)
                void save(DEFAULT_PERCENT)
              }}
              disabled={busy || readOnly || isDefault}
            >
              Kembalikan ke bawaan
            </Button>
          </div>

          {/* Pesan di BAWAH tombol, supaya tombol tidak bergeser. */}
          {formError && (
            <div className="mt-4">
              <Alert tone="error">{formError}</Alert>
            </div>
          )}
          {saveError ? <div className="mt-4"><ErrorBox error={saveError} /></div> : null}
          {done && (
            <div className="mt-4">
              <Alert tone="success">Pengaturan tersimpan. Halaman Rekap, Iklan, dan Simulasi memakainya mulai sekarang.</Alert>
            </div>
          )}
        </>
      )}
    </Card>
  )
}
