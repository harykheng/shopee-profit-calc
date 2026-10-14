import { useState, type FormEvent } from 'react'
import { Alert, Button, Card, ErrorBox, PageTitle, SupportLink, inputClass } from '../components/ui'
import { hasSupportWhatsApp } from '../lib/brand'
import { MIN_PASSWORD_LENGTH, validateNewPassword } from '../lib/password'
import { supabase } from '../lib/supabase'
import type { Store } from '../lib/types'
import { StoreSettingsCard } from './StoreSettings'

/** Pesan WhatsApp ke pengelola yang menyebut akun dan toko, supaya pengelola tahu data siapa yang dimaksud. */
function supportRequest(first: string, email: string, storeName?: string): string {
  return [first, `Akun: ${email}`, storeName ? `Toko: ${storeName}` : null].filter(Boolean).join('\n')
}

/** Akun: email dan ganti password. Bisa dibuka walau langganan habis atau belum punya toko. */
export function AccountPage({
  email,
  mustChange,
  stores,
  storeId,
  readOnly,
}: {
  email: string
  mustChange: boolean
  /** null = daftar toko belum selesai dimuat. */
  stores: Store[] | null
  storeId: number | null
  /** Langganan toko terpilih habis: pengaturan toko hanya bisa dilihat. */
  readOnly: boolean
}) {
  const store = stores?.find((s) => s.id === storeId) ?? null
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [done, setDone] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setDone(false)
    setError(null)
    const problem = validateNewPassword(password, confirm)
    setFormError(problem)
    if (problem) return
    setBusy(true)
    // password_changed menandai bahwa password ini sudah milik pelanggan sendiri (banner di atas hilang).
    const { error } = await supabase.auth.updateUser({ password, data: { password_changed: true } })
    setBusy(false)
    if (error) {
      setError(error)
      return
    }
    setPassword('')
    setConfirm('')
    setDone(true)
  }

  // Selama masih memakai password dari admin, formnya tampil paling atas (itu tujuan tombol di banner kuning).
  const passwordCard = (
    <Card title="Ganti password" className="max-w-xl">
        {mustChange && (
          <div className="mb-5">
            <Alert tone="warning" title="Kamu masih memakai password dari admin.">
              Ganti dengan password milikmu sendiri supaya akunmu aman. Cukup sekali.
            </Alert>
          </div>
        )}
        <form onSubmit={submit} noValidate>
          <label className="block font-medium">
            Password baru
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`mt-1.5 font-normal ${inputClass}`}
            />
            <span className="mt-1 block text-sm font-normal text-ink-muted">Minimal {MIN_PASSWORD_LENGTH} karakter.</span>
          </label>
          <label className="mt-4 block font-medium">
            Ulangi password baru
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={`mt-1.5 font-normal ${inputClass}`}
            />
          </label>

          <Button type="submit" disabled={busy} className="mt-6">
            {busy ? 'Menyimpan…' : 'Simpan password baru'}
          </Button>

          {/* Pesan di BAWAH tombol, supaya tombol tidak bergeser. */}
          {formError && (
            <div className="mt-4">
              <Alert tone="error">{formError}</Alert>
            </div>
          )}
          {error ? <div className="mt-4"><ErrorBox error={error} /></div> : null}
          {done && (
            <div className="mt-4">
              <Alert tone="success">Password sudah diganti. Pakai password baru ini saat login berikutnya.</Alert>
            </div>
          )}
        </form>
    </Card>
  )

  const dataCard = (
    <Card title="Data saya" className="mb-8 max-w-3xl">
      <p className="text-ink-soft">
        Data tokomu (pesanan, penghasilan, HPP, biaya, iklan) adalah milikmu. Kamu bisa meminta salinannya, atau meminta
        data dan akunmu dihapus, kapan saja. Pengelola memprosesnya secara manual.
      </p>
      <p className="mt-2 text-sm text-ink-muted">
        Penghapusan tidak bisa dibatalkan. Minta salinan dulu kalau kamu masih membutuhkan datanya.
      </p>
      {hasSupportWhatsApp ? (
        <p className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
          <SupportLink message={supportRequest('Halo, saya ingin meminta salinan seluruh data toko saya.', email, store?.name)}>
            Minta salinan data
          </SupportLink>
          <SupportLink message={supportRequest('Halo, saya ingin data toko dan akun saya dihapus.', email, store?.name)}>
            Minta hapus data & akun
          </SupportLink>
        </p>
      ) : (
        <p className="mt-4 font-semibold">Untuk meminta salinan atau penghapusan, hubungi pengelola aplikasi.</p>
      )}
    </Card>
  )

  return (
    <>
      <PageTitle subtitle={`Masuk sebagai ${email || '-'}`}>Akun</PageTitle>

      {mustChange && passwordCard}

      {store && (
        <StoreSettingsCard
          storeId={store.id}
          storeName={store.name}
          showStoreName={(stores?.length ?? 0) > 1}
          readOnly={readOnly}
        />
      )}

      {dataCard}
      {!mustChange && passwordCard}
    </>
  )
}
