import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from 'react'
import { Alert, Button, Card, Modal, PageTitle, Spinner, Stamp, inputClass, linkClass } from '../components/ui'
import { IconCopy, IconWhatsApp } from '../components/icons'
import {
  addTrialSimulations,
  createAccount,
  fetchCustomers,
  fetchTrialSimUsage,
  resetCustomerPassword,
  subscribeStore,
  type TrialSimUsage,
} from '../lib/api'
import { APP_NAME } from '../lib/brand'
import { adminHint, friendlyError } from '../lib/errors'
import { formatDate } from '../lib/format'
import { MIN_PASSWORD_LENGTH } from '../lib/password'
import { TRIAL_MONTH_LIMIT, TRIAL_SIMULATION_LIMIT } from '../lib/trialLimits'
import { wibToday } from '../lib/subscription'
import {
  DEFAULT_TRIAL_DAYS,
  countByGroup,
  customerGroup,
  customerStatus,
  defaultTrialEnd,
  generatePassword,
  resetPasswordMessage,
  lastLoginLabel,
  normalizeTrialForm,
  extendedEnd,
  extensionStart,
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
  const [simUsage, setSimUsage] = useState<Map<number, TrialSimUsage> | null>(null)

  const load = useCallback(() => {
    // Pemakaian simulasi hanya pelengkap: kalau gagal, daftar tetap tampil tanpa itu.
    fetchTrialSimUsage().then(setSimUsage)
    fetchCustomers()
      .then((rows) => {
        setCustomers(rows)
        setListError(null)
      })
      .catch((err) => setListError(errorMessage(err)))
  }, [])
  useEffect(load, [load])

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
          <CustomerList rows={customers} simUsage={simUsage} onChanged={load} />
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
              ? `Dengan batas uji coba: data ${TRIAL_MONTH_LIMIT} bulan, Simulasi Harga ${TRIAL_SIMULATION_LIMIT} produk, tanpa Cek cepat iklan.`
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
  return (
    <>
      <Alert tone="success" title={`Akun ${email} siap dipakai.`}>
        Kirim teks di bawah ke pemiliknya. Password ini hanya tampil sekarang; setelah halaman ini ditutup, password tidak
        bisa dilihat lagi.
      </Alert>
      <ShareMessage message={message} />
      <Button variant="secondary" onClick={onAnother} className="mt-6">
        Buat akun lain
      </Button>
    </>
  )
}

/** Teks siap kirim: salin, atau buka WhatsApp untuk memilih kontak. */
function ShareMessage({ message }: { message: string }) {
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

function CustomerList({
  rows,
  simUsage,
  onChanged,
}: {
  rows: CustomerRow[]
  simUsage: Map<number, TrialSimUsage> | null
  onChanged: () => void
}) {
  const counts = countByGroup(rows)
  const [subscribing, setSubscribing] = useState<CustomerRow | null>(null)
  const [resetting, setResetting] = useState<CustomerRow | null>(null)
  const [addingSims, setAddingSims] = useState<CustomerRow | null>(null)
  const [done, setDone] = useState<string | null>(null)
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
      {done && (
        <div className="mb-4">
          <Alert tone="success">{done}</Alert>
        </div>
      )}
      {shown.length === 0 ? (
        <p className="text-ink-2">{FILTERS.find((f) => f.value === filter)?.empty}</p>
      ) : (
        <ul className="divide-y divide-line">
          {shown.map((r) => (
            <CustomerItem
              key={r.store_id}
              row={r}
              onSubscription={() => setSubscribing(r)}
              onResetPassword={() => setResetting(r)}
              simUsage={r.trial ? (simUsage?.get(r.store_id) ?? null) : null}
              onAddSimulations={() => setAddingSims(r)}
            />
          ))}
        </ul>
      )}
      {resetting && <ResetPasswordDialog row={resetting} onClose={() => setResetting(null)} />}
      {addingSims && (
        <AddSimulationsDialog
          row={addingSims}
          usage={simUsage?.get(addingSims.store_id) ?? null}
          onClose={() => setAddingSims(null)}
          onDone={(u) => {
            setDone(
              `Jatah simulasi ${addingSims.store_name} sekarang ${u.limit} produk (${u.used} terpakai). Kalau pemiliknya sedang membuka Simulasi Harga, minta muat ulang halamannya.`,
            )
            setAddingSims(null)
            onChanged()
          }}
        />
      )}
      {subscribing && (
        <SubscriptionDialog
          row={subscribing}
          onClose={() => setSubscribing(null)}
          onDone={(activeUntil) => {
            setDone(
              subscribing.trial
                ? `${subscribing.store_name} sekarang berlangganan sampai ${formatDate(activeUntil)}. Batas uji coba sudah lepas.`
                : `Langganan ${subscribing.store_name} diperpanjang sampai ${formatDate(activeUntil)}.`,
            )
            setSubscribing(null)
            onChanged()
          }}
        />
      )}
      <p className="mt-4 text-sm text-ink-3">
        Mengubah nama toko dan reset password akun pengelola masih lewat SQL Editor (lihat OPERASI.md).
      </p>
    </>
  )
}

function CustomerItem({
  row,
  onSubscription,
  onResetPassword,
  simUsage,
  onAddSimulations,
}: {
  row: CustomerRow
  onSubscription: () => void
  onResetPassword: () => void
  /** Hanya toko uji coba, dan hanya kalau SQL 20261102 sudah dijalankan. */
  simUsage: TrialSimUsage | null
  onAddSimulations: () => void
}) {
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
        {simUsage && (
          <p className={simUsage.used >= simUsage.limit ? 'font-semibold text-warn' : 'text-ink-3'}>
            Simulasi: {simUsage.used} dari {simUsage.limit} produk{simUsage.used >= simUsage.limit ? ', habis' : ''}
          </p>
        )}
        {/* Uji coba → berlangganan; berlangganan dengan tanggal berakhir → perpanjang (toko tanpa batas tidak perlu). */}
        <div className="mt-2 flex flex-wrap gap-2 sm:justify-end">
          {simUsage && (
            <Button variant="secondary" onClick={onAddSimulations}>
              Tambah jatah simulasi
            </Button>
          )}
          {row.owner_emails.length > 0 && (
            <Button variant="secondary" onClick={onResetPassword}>
              Reset password
            </Button>
          )}
          {(row.trial || row.active_until) && (
            <Button variant="secondary" onClick={onSubscription}>
              {row.trial ? 'Jadikan berlangganan' : 'Perpanjang'}
            </Button>
          )}
        </div>
      </div>
    </li>
  )
}

/**
 * Jendela "Jadikan berlangganan" (toko uji coba, mulai hari ini) atau "Perpanjang" (toko berlangganan: lanjut dari
 * tanggal berakhir sekarang kalau masih aktif, atau mulai hari ini kalau sudah berakhir).
 */
function SubscriptionDialog({
  row,
  onClose,
  onDone,
}: {
  row: CustomerRow
  onClose: () => void
  onDone: (activeUntil: string) => void
}) {
  const titleId = useId()
  const extend = !row.trial
  const endAfter = (months: number) => (extend ? extendedEnd(row.active_until, months) : paidEnd(months))
  const [activeUntil, setActiveUntil] = useState(() => endAfter(1))
  const stillActive = extend && extensionStart(row.active_until) !== wibToday()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(activeUntil) || activeUntil < wibToday()) {
      setError('Tanggal berakhir tidak boleh sebelum hari ini.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await subscribeStore(row.store_id, activeUntil)
      onDone(activeUntil)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal labelledBy={titleId} onClose={onClose} dismissible={!busy}>
      <h2 id={titleId} className="font-display text-2xl font-extrabold tracking-tight">
        {extend ? `Perpanjang ${row.store_name}` : `Jadikan ${row.store_name} berlangganan`}
      </h2>
      <p className="mt-3 text-ink-2">
        {!extend
          ? 'Batas uji coba langsung lepas. Langganan dihitung mulai hari ini'
          : stillActive
            ? `Langganan sekarang sampai ${formatDate(row.active_until!)}. Perpanjangan dihitung setelah tanggal itu, jadi sisa harinya tidak hilang`
            : `Langganan sudah berakhir ${formatDate(row.active_until!)}. Perpanjangan dihitung mulai hari ini`}
        {row.owner_emails.length > 0 && <> ({row.owner_emails.join(', ')})</>}.
      </p>
      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Lama berlangganan">
        {(
          [
            [1, '1 bulan'],
            [12, '1 tahun'],
          ] as const
        ).map(([months, label]) => (
          <button
            key={months}
            type="button"
            aria-pressed={activeUntil === endAfter(months)}
            onClick={() => setActiveUntil(endAfter(months))}
            className={`min-h-11 rounded-full border-2 px-4 font-semibold transition-colors ${
              activeUntil === endAfter(months) ? 'border-ink bg-ink text-paper' : 'border-control bg-paper text-ink hover:border-ink'
            }`}
          >
            {extend ? `+${label}` : label}
          </button>
        ))}
      </div>
      <label className="mt-4 block font-semibold">
        Berlangganan sampai
        <input
          type="date"
          value={activeUntil}
          min={wibToday()}
          onChange={(e) => setActiveUntil(e.target.value)}
          className={`mt-1.5 font-normal ${inputClass}`}
        />
      </label>
      {error && (
        <div className="mt-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      <div className="mt-5 flex flex-col gap-3">
        <Button onClick={save} disabled={busy}>
          {busy
            ? 'Menyimpan…'
            : `${extend ? 'Perpanjang' : 'Jadikan berlangganan'}${activeUntil ? ` sampai ${formatDate(activeUntil)}` : ''}`}
        </Button>
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Batal
        </Button>
      </div>
    </Modal>
  )
}

/**
 * Jendela "Reset password": password acak baru untuk pemilik toko, lalu teks siap kirim. Akun pengelola ditolak
 * database (tetap lewat SQL Editor). Pemiliknya keluar dari semua perangkat dan diminta mengganti password lagi.
 */
function ResetPasswordDialog({ row, onClose }: { row: CustomerRow; onClose: () => void }) {
  const titleId = useId()
  const [email, setEmail] = useState(row.owner_emails[0] ?? '')
  const [password, setPassword] = useState(() => generatePassword())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const save = async () => {
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password minimal ${MIN_PASSWORD_LENGTH} karakter.`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await resetCustomerPassword(email, password)
      setMessage(resetPasswordMessage({ appName: APP_NAME, loginUrl: `${window.location.origin}/`, email, password }))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal labelledBy={titleId} onClose={onClose} dismissible={!busy}>
      <h2 id={titleId} className="font-display text-2xl font-extrabold tracking-tight">
        Reset password {row.store_name}
      </h2>
      {message ? (
        <>
          <div className="mt-4">
            <Alert tone="success" title="Password sudah diganti.">
              Pemiliknya sudah dikeluarkan dari semua perangkat. Kirim teks ini; password hanya tampil sekarang.
            </Alert>
          </div>
          <ShareMessage message={message} />
          <Button variant="secondary" onClick={onClose} className="mt-6 w-full">
            Selesai
          </Button>
        </>
      ) : (
        <>
          <p className="mt-3 text-ink-2">
            Password lama langsung tidak berlaku dan pemiliknya keluar dari semua perangkat. Setelah login, ia diminta
            mengganti password lagi.
          </p>
          {row.owner_emails.length > 1 ? (
            <label className="mt-4 block font-semibold">
              Akun
              <select value={email} onChange={(e) => setEmail(e.target.value)} className={`mt-1.5 font-normal ${inputClass}`}>
                {row.owner_emails.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="mt-4 font-semibold [overflow-wrap:anywhere]">{email}</p>
          )}
          <label htmlFor="reset-password" className="mt-4 block font-semibold">
            Password baru
          </label>
          <div className="mt-1.5 flex gap-2">
            <input
              id="reset-password"
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
          {error && (
            <div className="mt-4">
              <Alert tone="error">{error}</Alert>
            </div>
          )}
          <div className="mt-5 flex flex-col gap-3">
            <Button onClick={save} disabled={busy || !email}>
              {busy ? 'Menyimpan…' : 'Reset password'}
            </Button>
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Batal
            </Button>
          </div>
        </>
      )}
    </Modal>
  )
}

const SIM_AMOUNTS = [10, 25, 50] as const

/** Jendela "Tambah jatah simulasi" untuk satu toko uji coba. Tambahan menumpuk di atas jatah sekarang. */
function AddSimulationsDialog({
  row,
  usage,
  onClose,
  onDone,
}: {
  row: CustomerRow
  usage: TrialSimUsage | null
  onClose: () => void
  onDone: (usage: TrialSimUsage) => void
}) {
  const titleId = useId()
  const [amount, setAmount] = useState<number | null>(25)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    if (amount === null || !Number.isInteger(amount) || amount < 1 || amount > 1000) {
      setError('Isi tambahan 1 sampai 1000 produk.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      onDone(await addTrialSimulations(row.store_id, amount))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal labelledBy={titleId} onClose={onClose} dismissible={!busy}>
      <h2 id={titleId} className="font-display text-2xl font-extrabold tracking-tight">
        Tambah jatah simulasi {row.store_name}
      </h2>
      <p className="mt-3 text-ink-2">
        {usage ? `Sekarang ${usage.used} dari ${usage.limit} produk terpakai. ` : ''}Tambahan berlaku untuk toko ini saja,
        selama masa uji coba.
      </p>
      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Jumlah tambahan">
        {SIM_AMOUNTS.map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={amount === n}
            onClick={() => setAmount(n)}
            className={`min-h-11 rounded-full border-2 px-4 font-semibold transition-colors ${
              amount === n ? 'border-ink bg-ink text-paper' : 'border-control bg-paper text-ink hover:border-ink'
            }`}
          >
            +{n}
          </button>
        ))}
      </div>
      <label className="mt-4 block font-semibold">
        Tambahan (produk)
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={1000}
          value={amount ?? ''}
          onChange={(e) => setAmount(e.target.value === '' ? null : Number(e.target.value))}
          className={`num mt-1.5 font-normal ${inputClass}`}
        />
      </label>
      {error && (
        <div className="mt-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      <div className="mt-5 flex flex-col gap-3">
        <Button onClick={save} disabled={busy}>
          {busy
            ? 'Menyimpan…'
            : amount && usage
              ? `Tambah ${amount} produk (jadi ${usage.limit + amount})`
              : amount
                ? `Tambah ${amount} produk`
                : 'Tambah jatah'}
        </Button>
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Batal
        </Button>
      </div>
    </Modal>
  )
}
