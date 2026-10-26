import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Alert, Button, Card, PageTitle, Spinner, Stamp, inputClass, linkClass } from '../components/ui'
import { IconCopy, IconWhatsApp } from '../components/icons'
import { createTrialAccount, fetchCustomers } from '../lib/api'
import { APP_NAME } from '../lib/brand'
import { adminHint, friendlyError } from '../lib/errors'
import { formatDate } from '../lib/format'
import { MIN_PASSWORD_LENGTH } from '../lib/password'
import { wibToday } from '../lib/subscription'
import {
  DEFAULT_TRIAL_DAYS,
  customerStatus,
  defaultTrialEnd,
  generatePassword,
  lastLoginLabel,
  normalizeTrialForm,
  asksStoreName,
  storeNameFromEmail,
  summarizeCustomers,
  trialErrorMessage,
  validateTrialForm,
  welcomeMessage,
  type CustomerRow,
} from '../lib/trialAccounts'

const errorMessage = (err: unknown) => trialErrorMessage(err, friendlyError, adminHint)

/**
 * Halaman Pengelola: buat akun uji coba (email, password, tanggal berakhir) dan daftar semua toko.
 * Hanya tampil untuk akun di platform_admins; database tetap menolak akun lain.
 * Isi toko pelanggan (pesanan, untung, HPP) sengaja tidak ada di sini.
 */
export function OperatorPage() {
  const [customers, setCustomers] = useState<CustomerRow[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)

  const load = useCallback(() => {
    fetchCustomers()
      .then((rows) => {
        setCustomers(rows)
        setListError(null)
      })
      .catch((err) => setListError(errorMessage(err)))
  }, [])

  useEffect(load, [load])

  const summary = customers ? summarizeCustomers(customers) : null

  return (
    <>
      <PageTitle subtitle="Buat akun uji coba dan lihat semua toko. Isi toko pelanggan (pesanan, untung, HPP) tidak terlihat di sini.">
        Pengelola
      </PageTitle>

      {summary && (
        <p className="mb-8 max-w-[40ch] font-display text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">
          {summary.activeTrials === 0 ? (
            'Belum ada akun uji coba yang aktif.'
          ) : (
            <>
              <span className="hl">{summary.activeTrials} akun uji coba</span> masih aktif
              {summary.neverLoggedIn > 0 ? `, ${summary.neverLoggedIn} belum pernah login.` : '.'}
            </>
          )}
        </p>
      )}

      <CreateTrialCard onCreated={load} />

      <Card title="Semua toko" className="max-w-4xl">
        {listError ? (
          <Alert tone="error" title="Daftar toko gagal dimuat.">
            {listError}
          </Alert>
        ) : !customers ? (
          <Spinner />
        ) : (
          <CustomerList rows={customers} />
        )}
      </Card>
    </>
  )
}

function CreateTrialCard({ onCreated }: { onCreated: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState(() => generatePassword())
  const [storeName, setStoreName] = useState('')
  const [activeUntil, setActiveUntil] = useState(() => defaultTrialEnd())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ email: string; message: string } | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const form = { email, password, storeName, activeUntil }
    const problem = validateTrialForm(form)
    setError(problem)
    if (problem) return
    const clean = normalizeTrialForm(form)
    setBusy(true)
    try {
      await createTrialAccount(clean, asksStoreName(form))
      setCreated({
        email: clean.email,
        message: welcomeMessage({
          appName: APP_NAME,
          loginUrl: `${window.location.origin}/`,
          email: clean.email,
          password: clean.password,
          activeUntil: clean.activeUntil,
        }),
      })
      onCreated()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const reset = () => {
    setCreated(null)
    setEmail('')
    setStoreName('')
    setPassword(generatePassword())
    setActiveUntil(defaultTrialEnd())
    setError(null)
  }

  if (created) {
    return (
      <Card title="Akun sudah dibuat" className="mb-8 max-w-xl">
        <CreatedPanel email={created.email} message={created.message} onAnother={reset} />
      </Card>
    )
  }

  return (
    <Card title="Buat akun uji coba" className="mb-8 max-w-xl">
      <form onSubmit={submit} noValidate>
        <label className="block font-semibold">
          Email
          <input
            type="email"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nama@gmail.com"
            className={`mt-1.5 font-normal ${inputClass}`}
          />
        </label>

        <div className="mt-4">
          <label htmlFor="trial-password" className="block font-semibold">
            Password
          </label>
          <div className="mt-1.5 flex gap-2">
            <input
              id="trial-password"
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`num min-w-0 flex-1 font-normal ${inputClass}`}
            />
            <Button variant="secondary" onClick={() => setPassword(generatePassword())} className="shrink-0">
              Buat acak
            </Button>
          </div>
          <span className="mt-1 block text-sm text-ink-3">
            Minimal {MIN_PASSWORD_LENGTH} karakter. Pemilik akun diminta menggantinya setelah login.
          </span>
        </div>

        <label className="mt-4 block font-semibold">
          Nama toko
          <input
            type="text"
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            placeholder="Boleh dikosongkan"
            maxLength={100}
            className={`mt-1.5 font-normal ${inputClass}`}
          />
          <span className="mt-1 block text-sm font-normal text-ink-3">
            Kosongkan: pemilik akun mengisi nama tokonya sendiri saat pertama login (sementara tertulis{' '}
            {storeNameFromEmail(email) || 'nama dari email'}).
          </span>
        </label>

        <label className="mt-4 block font-semibold">
          Bisa dipakai sampai
          <input
            type="date"
            value={activeUntil}
            min={wibToday()}
            onChange={(e) => setActiveUntil(e.target.value)}
            className={`mt-1.5 font-normal ${inputClass}`}
          />
          <span className="mt-1 block text-sm font-normal text-ink-3">
            Bawaan {DEFAULT_TRIAL_DAYS} hari, hari ini ikut dihitung. Setelah tanggal ini tokonya jadi baca saja: data
            tetap bisa dilihat, upload dan perubahan dimatikan.
          </span>
        </label>

        <Button type="submit" disabled={busy} className="mt-6">
          {busy ? 'Membuat akun…' : 'Buat akun uji coba'}
        </Button>

        {error && (
          <div className="mt-4">
            <Alert tone="error">{error}</Alert>
          </div>
        )}
      </form>
    </Card>
  )
}

function CreatedPanel({ email, message, onAnother }: { email: string; message: string; onAnother: () => void }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <>
      <Alert tone="success" title={`Akun ${email} siap dipakai.`}>
        Kirim teks di bawah ke pemiliknya. Password ini hanya tampil sekarang; setelah halaman ini ditutup, password tidak
        bisa dilihat lagi.
      </Alert>
      <pre className="mt-4 whitespace-pre-wrap rounded-2xl bg-tint p-4 font-sans text-base leading-relaxed text-ink [overflow-wrap:anywhere]">
        {message}
      </pre>
      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
        <Button onClick={copy}>
          <IconCopy size={18} />
          {copied ? 'Tersalin' : 'Salin teks'}
        </Button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex min-h-11 items-center gap-2 ${linkClass}`}
        >
          <IconWhatsApp size={18} />
          Kirim lewat WhatsApp
        </a>
      </div>
      <p className="sr-only" aria-live="polite">
        {copied ? 'Teks sudah disalin.' : ''}
      </p>
      <Button variant="secondary" onClick={onAnother} className="mt-6">
        Buat akun lain
      </Button>
    </>
  )
}

type Filter = 'trial' | 'all'

function CustomerList({ rows }: { rows: CustomerRow[] }) {
  const trialCount = rows.filter((r) => r.trial).length
  const [filter, setFilter] = useState<Filter>(trialCount > 0 ? 'trial' : 'all')
  const shown = useMemo(() => (filter === 'trial' ? rows.filter((r) => r.trial) : rows), [rows, filter])

  if (rows.length === 0) return <p className="text-ink-2">Belum ada toko.</p>

  const chip = (value: Filter, label: string) => (
    <button
      type="button"
      onClick={() => setFilter(value)}
      aria-pressed={filter === value}
      className={`min-h-11 rounded-full border-2 px-4 font-semibold transition-colors ${
        filter === value ? 'border-ink bg-ink text-paper' : 'border-control bg-paper text-ink hover:border-ink'
      }`}
    >
      {label}
    </button>
  )

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Tampilkan">
        {chip('trial', `Uji coba (${trialCount})`)}
        {chip('all', `Semua (${rows.length})`)}
      </div>
      {shown.length === 0 ? (
        <p className="text-ink-2">Belum ada akun uji coba. Buat lewat formulir di atas.</p>
      ) : (
        <ul className="divide-y divide-line">
          {shown.map((r) => (
            <CustomerItem key={r.store_id} row={r} />
          ))}
        </ul>
      )}
      <p className="mt-4 text-sm text-ink-3">
        Memperpanjang, mengubah tanggal, atau reset password masih lewat SQL Editor (lihat OPERASI.md).
      </p>
    </>
  )
}

function CustomerItem({ row }: { row: CustomerRow }) {
  const status = customerStatus(row.active_until)
  const statusColor = status.state === 'expired' || status.state === 'expiring' ? 'text-warn' : 'text-ink-2'
  return (
    <li className="grid gap-x-6 gap-y-1 py-4 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-semibold [overflow-wrap:anywhere]">{row.store_name}</span>
          {row.trial && (
            <Stamp tone="neutral" size="xs" tilt={false}>
              Uji coba
            </Stamp>
          )}
        </p>
        <p className="text-ink-2 [overflow-wrap:anywhere]">
          {row.owner_emails.length ? row.owner_emails.join(', ') : 'Belum ada akun yang terhubung'}
        </p>
      </div>
      <div className="text-sm sm:text-right">
        <p className={`font-semibold ${statusColor}`}>
          {status.label}
          {row.active_until && status.state !== 'expired' && (
            <span className="font-normal text-ink-3"> · s.d. {formatDate(row.active_until)}</span>
          )}
        </p>
        <p className="text-ink-3">Login terakhir: {lastLoginLabel(row.last_sign_in_at)}</p>
      </div>
    </li>
  )
}
