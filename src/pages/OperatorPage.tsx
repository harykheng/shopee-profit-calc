import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Alert, Button, Card, PageTitle, Spinner, Stamp, inputClass, linkClass } from '../components/ui'
import { IconCopy, IconWhatsApp } from '../components/icons'
import { createAccount, fetchCustomers } from '../lib/api'
import { APP_NAME } from '../lib/brand'
import { adminHint, friendlyError } from '../lib/errors'
import { formatDate } from '../lib/format'
import { MIN_PASSWORD_LENGTH } from '../lib/password'
import { wibToday } from '../lib/subscription'
import {
  DEFAULT_TRIAL_DAYS,
  countByGroup,
  customerGroup,
  customerStatus,
  defaultTrialEnd,
  generatePassword,
  lastLoginLabel,
  normalizeTrialForm,
  paidEnd,
  asksStoreName,
  storeNameFromEmail,
  summarizeCustomers,
  trialErrorMessage,
  validateTrialForm,
  welcomeMessage,
  type CustomerGroup,
  type CustomerRow,
} from '../lib/trialAccounts'

const errorMessage = (err: unknown) => trialErrorMessage(err, friendlyError, adminHint)

/** Pindah antara daftar pelanggan dan formulir buat akun (untuk pengelola yang juga punya toko sendiri). */
function OperatorTabs({ current }: { current: 'pelanggan' | 'pengelola' }) {
  const tab = (route: 'pelanggan' | 'pengelola', label: string) => (
    <a
      href={`#/${route}`}
      aria-current={current === route ? 'page' : undefined}
      className={`inline-flex min-h-11 items-center rounded-full px-5 font-semibold transition-colors ${
        current === route ? 'bg-ink text-paper' : 'text-ink-2 hover:text-ink'
      }`}
    >
      {label}
    </a>
  )
  return (
    <nav aria-label="Pengelola" className="mb-8 flex w-fit max-w-full flex-wrap gap-1 rounded-full bg-tint p-1 ring-1 ring-line">
      {tab('pelanggan', 'Pelanggan')}
      {tab('pengelola', 'Buat akun')}
    </nav>
  )
}

/**
 * Halaman awal pengelola: semua toko, dikelompokkan uji coba / berlangganan / berakhir.
 * Hanya tampil untuk akun di platform_admins; database tetap menolak akun lain.
 * Isi toko pelanggan (pesanan, untung, HPP) sengaja tidak ada di sini.
 */
export function CustomersPage({ showTabs }: { showTabs: boolean }) {
  const [customers, setCustomers] = useState<CustomerRow[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)

  useEffect(() => {
    fetchCustomers()
      .then((rows) => {
        setCustomers(rows)
        setListError(null)
      })
      .catch((err) => setListError(errorMessage(err)))
  }, [])

  const counts = customers ? countByGroup(customers) : null
  const summary = customers ? summarizeCustomers(customers) : null

  return (
    <>
      <PageTitle subtitle="Siapa yang sedang uji coba, siapa yang sudah berlangganan. Isi toko pelanggan (pesanan, untung, HPP) tidak terlihat di sini.">
        Pelanggan
      </PageTitle>
      {showTabs && <OperatorTabs current="pelanggan" />}

      {counts && summary && (
        <div className="mb-8">
          <p className="max-w-[40ch] font-display text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">
            <span className="hl">{counts.paid} berlangganan</span>, {counts.trial} sedang uji coba.
          </p>
          {(summary.neverLoggedIn > 0 || counts.ended > 0) && (
            <p className="mt-2 text-lg text-ink-2">
              {[
                summary.neverLoggedIn > 0 ? `${summary.neverLoggedIn} akun uji coba belum pernah login` : null,
                counts.ended > 0 ? `${counts.ended} toko sudah berakhir (baca saja)` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              .
            </p>
          )}
        </div>
      )}

      <Card className="max-w-4xl">
        {listError ? (
          <Alert tone="error" title="Daftar pelanggan gagal dimuat.">
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

/** Formulir buat akun: uji coba atau langsung berlangganan. */
export function OperatorPage({ showTabs }: { showTabs: boolean }) {
  return (
    <>
      <PageTitle subtitle="Buat akun uji coba atau akun yang langsung berlangganan. Teks login siap dikirim lewat WhatsApp.">
        Buat akun
      </PageTitle>
      {showTabs && <OperatorTabs current="pengelola" />}
      <CreateTrialCard />
    </>
  )
}

type AccountKind = 'trial' | 'paid'

function CreateTrialCard() {
  const [kind, setKindState] = useState<AccountKind>('trial')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState(() => generatePassword())
  const [storeName, setStoreName] = useState('')
  const [activeUntil, setActiveUntil] = useState(() => defaultTrialEnd())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ email: string; message: string } | null>(null)
  const trial = kind === 'trial'

  const setKind = (k: AccountKind) => {
    setKindState(k)
    setActiveUntil(k === 'trial' ? defaultTrialEnd() : paidEnd(1))
    setError(null)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const form = { email, password, storeName, activeUntil }
    const problem = validateTrialForm(form)
    setError(problem)
    if (problem) return
    const clean = normalizeTrialForm(form)
    setBusy(true)
    try {
      await createAccount(clean, { askName: asksStoreName(form), trial })
      setCreated({
        email: clean.email,
        message: welcomeMessage({
          appName: APP_NAME,
          loginUrl: `${window.location.origin}/`,
          email: clean.email,
          password: clean.password,
          activeUntil: clean.activeUntil,
          trial,
        }),
      })
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
    setActiveUntil(trial ? defaultTrialEnd() : paidEnd(1))
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
    <Card className="mb-8 max-w-xl">
      <form onSubmit={submit} noValidate>
        <fieldset>
          <legend className="font-semibold">Jenis akun</legend>
          <div className="mt-1.5 flex w-fit max-w-full flex-wrap gap-1 rounded-full bg-tint p-1 ring-1 ring-line">
            {(
              [
                ['trial', `Uji coba ${DEFAULT_TRIAL_DAYS} hari`],
                ['paid', 'Langsung berlangganan'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
                className={`min-h-11 rounded-full px-4 font-semibold transition-colors ${
                  kind === k ? 'bg-ink text-paper' : 'text-ink-2 hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="mt-1 block text-sm text-ink-3">
            {trial
              ? 'Dengan batas uji coba: data 1 bulan, Simulasi Harga 50 produk, tanpa Cek cepat iklan.'
              : 'Tanpa batas uji coba. Pakai untuk pelanggan yang sudah membayar.'}
          </span>
        </fieldset>

        <label className="mt-4 block font-semibold">
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
            {trial ? `Bawaan ${DEFAULT_TRIAL_DAYS} hari, hari ini ikut dihitung.` : 'Hari ini ikut dihitung.'} Setelah
            tanggal ini tokonya jadi baca saja: data tetap bisa dilihat, upload dan perubahan dimatikan.
          </span>
        </label>
        {!trial && (
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Lama berlangganan">
            {(
              [
                [1, '1 bulan'],
                [12, '1 tahun'],
              ] as const
            ).map(([months, label]) => (
              <button
                key={months}
                type="button"
                aria-pressed={activeUntil === paidEnd(months)}
                onClick={() => setActiveUntil(paidEnd(months))}
                className={`min-h-11 rounded-full border-2 px-4 font-semibold transition-colors ${
                  activeUntil === paidEnd(months)
                    ? 'border-ink bg-ink text-paper'
                    : 'border-control bg-paper text-ink hover:border-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <Button type="submit" disabled={busy} className="mt-6">
          {busy ? 'Membuat akun…' : trial ? 'Buat akun uji coba' : 'Buat akun berlangganan'}
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

type Filter = CustomerGroup | 'all'

const FILTERS: { value: Filter; label: string; empty: string }[] = [
  { value: 'trial', label: 'Uji coba', empty: 'Tidak ada akun uji coba yang aktif. Buat di tab Buat akun.' },
  { value: 'paid', label: 'Berlangganan', empty: 'Belum ada pelanggan berlangganan yang aktif.' },
  { value: 'ended', label: 'Berakhir', empty: 'Belum ada toko yang berakhir.' },
  { value: 'all', label: 'Semua', empty: 'Belum ada toko.' },
]

/** Yang paling perlu diurus di atas: aktif → yang paling cepat berakhir; berakhir → yang paling baru berakhir. */
function sortRows(rows: CustomerRow[], filter: Filter): CustomerRow[] {
  const end = (r: CustomerRow) => r.active_until ?? '9999-12-31'
  return [...rows].sort((a, b) => (filter === 'ended' ? end(b).localeCompare(end(a)) : end(a).localeCompare(end(b))))
}

function CustomerList({ rows }: { rows: CustomerRow[] }) {
  const counts = countByGroup(rows)
  const [filter, setFilter] = useState<Filter>(counts.trial > 0 ? 'trial' : counts.paid > 0 ? 'paid' : 'all')
  const shown = useMemo(
    () => sortRows(filter === 'all' ? rows : rows.filter((r) => customerGroup(r) === filter), filter),
    [rows, filter],
  )

  if (rows.length === 0) return <p className="text-ink-2">Belum ada toko. Buat akun pertama di tab Buat akun.</p>

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Tampilkan">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            aria-pressed={filter === f.value}
            className={`min-h-11 rounded-full border-2 px-4 font-semibold transition-colors ${
              filter === f.value ? 'border-ink bg-ink text-paper' : 'border-control bg-paper text-ink hover:border-ink'
            }`}
          >
            {f.label} ({f.value === 'all' ? rows.length : counts[f.value]})
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="text-ink-2">{FILTERS.find((f) => f.value === filter)?.empty}</p>
      ) : (
        <ul className="divide-y divide-line">
          {shown.map((r) => (
            <CustomerItem key={r.store_id} row={r} />
          ))}
        </ul>
      )}
      <p className="mt-4 text-sm text-ink-3">
        Memperpanjang, menjadikan uji coba berlangganan, atau reset password masih lewat SQL Editor (lihat OPERASI.md).
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
          <Stamp tone={row.trial ? 'neutral' : 'gain'} size="xs" tilt={false}>
            {row.trial ? 'Uji coba' : 'Berlangganan'}
          </Stamp>
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
