import { useState, type FormEvent } from 'react'
import { Alert, Button, Card, ErrorBox, PageTitle, inputClass } from '../components/ui'
import { MIN_PASSWORD_LENGTH, validateNewPassword } from '../lib/password'
import { supabase } from '../lib/supabase'

/** Akun: email dan ganti password. Bisa dibuka walau langganan habis atau belum punya toko. */
export function AccountPage({ email, mustChange }: { email: string; mustChange: boolean }) {
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

  return (
    <>
      <PageTitle subtitle={`Masuk sebagai ${email || '-'}`}>Akun</PageTitle>

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
    </>
  )
}
