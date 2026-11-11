import { useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Alert, Brand, Button, ButtonLink, Spinner, WhatsAppButton, inputClass, linkClass } from '../components/ui'
import { SupportButton } from '../components/SupportButton'
import { APP_NAME, hasSupportWhatsApp } from '../lib/brand'
import { claimTrialLink, fetchTrialLinkState } from '../lib/api'
import { friendlyError } from '../lib/errors'
import { formatDate } from '../lib/format'
import { MIN_PASSWORD_LENGTH } from '../lib/password'
import { supabase } from '../lib/supabase'
import { DEFAULT_TRIAL_DAYS, defaultTrialEnd, trialErrorMessage } from '../lib/trialAccounts'
import { linkProblem, trialLimitsSentence, validateSignup, type TrialLinkState } from '../lib/trialLinks'

/** Pesan dari database (link salah, email sudah terdaftar, isian salah) sudah ditulis untuk pemakai. */
const errorMessage = (err: unknown) => trialErrorMessage(err, friendlyError, () => null)

/**
 * Halaman daftar dari link uji coba (#/coba?kode=…). Calon pelanggan mengisi email + password sendiri;
 * akun uji coba dibuat database, lalu ia langsung masuk ke aplikasi. Tata letaknya mengikuti halaman login.
 */
export function SignupPage({ code, session, onFinished }: { code: string; session: Session | null; onFinished: () => void }) {
  const [state, setState] = useState<TrialLinkState | null>(code ? null : 'invalid')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Akun sudah dibuat tapi masuk otomatis gagal (jarang): minta masuk manual.
  const [createdOnly, setCreatedOnly] = useState<string | null>(null)

  useEffect(() => {
    if (!code) return
    // Kalau pengecekan gagal (mis. internet putus), formulir tetap tampil; database memeriksa lagi saat daftar.
    fetchTrialLinkState(code).then(setState, () => setState('ok'))
  }, [code])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const problem = validateSignup({ email, password })
    setError(problem)
    if (problem) return
    setBusy(true)
    try {
      const created = await claimTrialLink(code, email, password)
      const { error: loginError } = await supabase.auth.signInWithPassword({ email: created.email, password })
      if (loginError) {
        setCreatedOnly(created.email)
        setBusy(false)
        return
      }
      onFinished()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  const problem = state ? linkProblem(state) : null
  // Sedang membuat akun / baru saja masuk: jangan tampilkan pesan "kamu sedang masuk sebagai…".
  const loggedInElsewhere = session && !busy

  return (
    <main className="mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14 lg:px-8">
      <SupportButton context={{ page: 'Daftar uji coba' }} aboveNav={false} />
      <div>
        <Brand />
        <h1 className="mt-10 font-display text-[2.6rem] font-extrabold leading-[1.05] tracking-tight sm:text-6xl lg:mt-14 lg:text-[3.6rem]">
          Coba gratis{' '}
          <span className="block">
            <span className="hl">{DEFAULT_TRIAL_DAYS} hari.</span>
          </span>
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-2 sm:text-xl">
          Lihat untung bersih tokomu, iklan yang bikin rugi, dan harga jual yang masih untung. Cukup email dan password,
          langsung bisa dipakai.
        </p>
        <p className="mt-6 max-w-xl text-sm text-ink-2 max-lg:hidden">
          Nama, alamat, dan nomor HP pembeli tidak disimpan · Bukan produk resmi Shopee
        </p>
      </div>

      <div className="w-full rounded-3xl bg-paper p-6 shadow-sheet ring-1 ring-line sm:p-8">
        {state === null ? (
          <Spinner label="Memeriksa link…" />
        ) : createdOnly ? (
          <>
            <Alert tone="success" title="Akunmu sudah dibuat.">
              Masuk dengan email {createdOnly} dan password yang tadi kamu buat.
            </Alert>
            <ButtonLink href="#/" className="mt-6 min-h-12 w-full font-display font-bold">
              Masuk
            </ButtonLink>
          </>
        ) : loggedInElsewhere ? (
          <>
            <h2 className="font-display text-2xl font-extrabold tracking-tight">Kamu sedang masuk.</h2>
            <p className="mt-3 text-ink-2 [overflow-wrap:anywhere]">
              Akun {session.user.email} sedang terbuka di perangkat ini. Untuk membuat akun uji coba baru, keluar dulu.
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <Button onClick={() => supabase.auth.signOut()} className="min-h-12 font-display font-bold">
                Keluar, lalu buat akun baru
              </Button>
              <ButtonLink href="#/" variant="secondary">
                Buka {APP_NAME} dengan akun ini
              </ButtonLink>
            </div>
          </>
        ) : problem ? (
          <>
            <h2 className="font-display text-2xl font-extrabold tracking-tight">{problem}</h2>
            <p className="mt-3 text-ink-2">Minta link baru ke pengelola {APP_NAME}.</p>
            {hasSupportWhatsApp && (
              <WhatsAppButton className="mt-6 w-full" message={`Halo, link uji coba ${APP_NAME} saya tidak bisa dipakai. Boleh minta link baru?`}>
                Minta link baru
              </WhatsAppButton>
            )}
            <p className="mt-5 text-ink-2">
              Sudah punya akun?{' '}
              <a href="#/" className={linkClass}>
                Masuk
              </a>
            </p>
          </>
        ) : (
          <form onSubmit={submit} noValidate>
            <h2 className="font-display text-2xl font-extrabold tracking-tight">Buat akun uji coba</h2>

            <label className="mt-6 block font-semibold">
              Email
              <input
                type="email"
                autoComplete="username"
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@gmail.com"
                className={`mt-1.5 font-normal ${inputClass}`}
              />
            </label>
            <div className="mt-4">
              <label htmlFor="signup-password" className="block font-semibold">
                Buat password
              </label>
              <div className="mt-1.5 flex gap-2">
                <input
                  id="signup-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`min-w-0 flex-1 font-normal ${inputClass}`}
                />
                <Button variant="secondary" onClick={() => setShowPassword((v) => !v)} className="shrink-0">
                  {showPassword ? 'Sembunyikan' : 'Lihat'}
                </Button>
              </div>
              <span className="mt-1 block text-sm text-ink-3">
                Minimal {MIN_PASSWORD_LENGTH} karakter. Simpan baik-baik: dipakai untuk masuk lagi nanti.
              </span>
            </div>

            {error && (
              <div className="mt-4">
                <Alert tone="error">{error}</Alert>
              </div>
            )}

            <Button type="submit" disabled={busy} className="mt-6 min-h-12 w-full font-display font-bold">
              {busy ? 'Menyiapkan akunmu…' : `Mulai uji coba ${DEFAULT_TRIAL_DAYS} hari`}
            </Button>
            <p className="mt-4 text-sm text-ink-3">
              Aktif sampai {formatDate(defaultTrialEnd())}, tanpa pembayaran. {trialLimitsSentence()}
            </p>
            <p className="mt-5 text-ink-2">
              Sudah punya akun?{' '}
              <a href="#/" className={linkClass}>
                Masuk
              </a>
            </p>
          </form>
        )}
        <p className="mt-6 border-t border-line pt-4 text-sm text-ink-2 lg:hidden">
          Nama, alamat, dan nomor HP pembeli tidak disimpan · Bukan produk resmi Shopee
        </p>
      </div>
    </main>
  )
}
