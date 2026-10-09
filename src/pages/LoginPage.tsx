import { useState, type FormEvent } from 'react'
import { Button, ErrorBox, inputClass } from '../components/ui'
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
    <main className="mx-auto grid min-h-screen max-w-5xl items-center gap-10 p-4 sm:p-8 lg:grid-cols-[1.1fr_1fr]">
      <div className="on-field text-on-field">
        <p className="font-display text-lg font-bold text-lime">Profit Shopee</p>
        <h1 className="mt-3 font-display text-5xl font-bold leading-[1.02] tracking-tight sm:text-6xl">
          Berapa untung toko bulan ini?
        </h1>
        <p className="mt-4 max-w-md text-lg text-on-field-muted">Masuk dulu, ceritanya langsung muncul.</p>
      </div>
      <form onSubmit={submit} className="w-full rounded-3xl bg-paper p-6 shadow-sheet sm:p-8">
        <h2 className="font-display text-2xl font-bold tracking-tight">Masuk</h2>

        <label className="mt-5 block font-medium">
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
