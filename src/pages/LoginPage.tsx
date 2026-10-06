import { useState, type FormEvent } from 'react'
import { Button, ErrorBox, inputClass } from '../components/ui'
import { IconReceipt } from '../components/icons'
import { supabase } from '../lib/supabase'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) setError(error)
    setBusy(false)
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-lg border border-line bg-paper p-6 shadow-sheet sm:p-8">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-md bg-rail text-white">
            <IconReceipt size={22} />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Profit Shopee</h1>
            <p className="text-ink-soft">Masuk untuk melanjutkan</p>
          </div>
        </div>

        <label className="mt-6 block font-medium">
          Email
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`mt-1.5 font-normal ${inputClass}`}
          />
        </label>
        <label className="mt-4 block font-medium">
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`mt-1.5 font-normal ${inputClass}`}
          />
        </label>

        {error ? <div className="mt-4"><ErrorBox error={error} /></div> : null}

        <Button type="submit" disabled={busy} className="mt-6 w-full">
          {busy ? 'Memproses…' : 'Masuk'}
        </Button>
        <p className="mt-4 text-sm text-ink-muted">
          Lupa password atau belum punya akun? Hubungi pengelola aplikasi.
        </p>
      </form>
    </main>
  )
}
