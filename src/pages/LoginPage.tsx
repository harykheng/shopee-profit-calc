import { useState, type FormEvent } from 'react'
import { Button, ErrorBox } from '../components/ui'
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

  const inputClass =
    'mt-1 min-h-12 w-full rounded-xl border border-slate-300 px-4 text-lg focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200'

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-bold text-orange-600">Profit Shopee</h1>
        <p className="mt-1 text-lg text-slate-600">Masuk untuk melanjutkan</p>

        <label className="mt-6 block text-lg font-medium">
          Email
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="mt-4 block text-lg font-medium">
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </label>

        {error ? <div className="mt-4"><ErrorBox error={error} /></div> : null}

        <Button type="submit" disabled={busy} className="mt-6 w-full">
          {busy ? 'Memproses…' : 'Masuk'}
        </Button>
        <p className="mt-4 text-sm text-slate-500">
          Lupa password atau belum punya akun? Hubungi pengelola aplikasi.
        </p>
      </form>
    </main>
  )
}
