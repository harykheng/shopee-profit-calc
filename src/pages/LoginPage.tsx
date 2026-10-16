import { useState, type FormEvent } from 'react'
import { Brand, Button, ErrorBox, SupportLink, inputClass } from '../components/ui'
import { APP_NAME, hasSupportWhatsApp } from '../lib/brand'
import { SupportButton } from '../components/SupportButton'
import { supabase } from '../lib/supabase'

/*
 * Kalimat besar memakai judul landing ("Tokomu sebenarnya cuan atau boncos?"), supaya orang yang datang dari landing
 * merasa sampai di tempat yang sama. Sub-judul menyebut tiga hal yang didapat, urutannya sama dengan bagian
 * "Hasil yang kamu dapat" di landing. Klaim privasi di bawah dicocokkan dengan BUYER_PRIVATE_COLUMNS (README bagian 6).
 */
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
    <main className="mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14 lg:px-8">
      <SupportButton context={{ page: 'Halaman login' }} aboveNav={false} />
      <div>
        <Brand />
        <h1 className="mt-10 font-display text-[2.6rem] font-extrabold leading-[1.05] tracking-tight sm:text-6xl lg:mt-14 lg:text-[3.6rem]">
          Tokomu sebenarnya{' '}
          <span className="block">
            <span className="hl">cuan atau boncos?</span>
          </span>
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-2 sm:text-xl">
          Masuk untuk melihat untung bersih tokomu, iklan yang bikin rugi, dan harga jual yang masih untung.
        </p>
        <p className="mt-6 max-w-xl text-sm text-ink-2 max-lg:hidden">
          Nama, alamat, dan nomor HP pembeli tidak disimpan · Bukan produk resmi Shopee
        </p>
      </div>

      <form onSubmit={submit} className="w-full rounded-3xl bg-paper p-6 shadow-sheet ring-1 ring-line sm:p-8">
        <h2 className="font-display text-2xl font-extrabold tracking-tight">Masuk ke {APP_NAME}</h2>

        <label className="mt-6 block font-semibold">
          Email
          <input
            type="email"
            autoComplete="username"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`mt-1.5 font-normal ${inputClass}`}
          />
        </label>
        <label className="mt-4 block font-semibold">
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

        {error ? (
          <div className="mt-4">
            <ErrorBox error={error} />
          </div>
        ) : null}

        <Button type="submit" disabled={busy} className="mt-6 min-h-12 w-full font-display font-bold">
          {busy ? 'Memeriksa…' : 'Masuk'}
        </Button>
        {hasSupportWhatsApp ? (
          <div className="mt-5 grid gap-1 text-ink-2">
            <p>
              <SupportLink
                message={`Halo, saya lupa password ${APP_NAME}${email.trim() ? ` (email: ${email.trim()})` : ''}. Mohon bantu reset.`}
              >
                Lupa password?
              </SupportLink>
            </p>
            <p>
              Belum punya akun?{' '}
              <SupportLink message={`Halo, saya ingin memakai ${APP_NAME}.`}>Chat pengelola lewat WhatsApp</SupportLink>
            </p>
          </div>
        ) : (
          <p className="mt-5 text-ink-2">Lupa password atau belum punya akun? Hubungi pengelola aplikasi.</p>
        )}
        <p className="mt-6 border-t border-line pt-4 text-sm text-ink-2 lg:hidden">
          Nama, alamat, dan nomor HP pembeli tidak disimpan · Bukan produk resmi Shopee
        </p>
      </form>
    </main>
  )
}
