import { useEffect, useRef, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { Alert, Brand, Card, ErrorBox, Spinner, Stamp, SupportLink, WhatsAppButton, linkClass } from './components/ui'
import { MonthlyReminderCard } from './components/MonthlyReminder'
import { SupportButton } from './components/SupportButton'
import { StoreNameModal } from './components/StoreNameModal'
import { APP_NAME, hasSupportWhatsApp, isHitungCuan } from './lib/brand'
import { formatDate } from './lib/format'
import { expiryNotice, subscriptionStatus } from './lib/subscription'
import { needsPasswordChange } from './lib/password'
import { setErrorContext } from './lib/reportError'
import { fetchIsPlatformAdmin, fetchStores } from './lib/api'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import type { Store } from './lib/types'
import { LoginPage } from './pages/LoginPage'
import { UploadPage } from './pages/UploadPage'
import { HppPage } from './pages/HppPage'
import { ExpensesPage } from './pages/ExpensesPage'
import { RecapPage } from './pages/RecapPage'
import { AdsPage } from './pages/AdsPage'
import { AccountPage } from './pages/AccountPage'
import { PriceSimPage } from './pages/PriceSimPage'
import { OperatorPage } from './pages/OperatorPage'
import { ROUTES, readHash, type Route } from './lib/router'
import { useActiveIndicator } from './components/motion'
import { IconCalculator, IconChevronDown, IconKey, IconLogout, IconMegaphone, IconReceipt, IconStore, IconTag, IconUpload, IconUser, IconWallet } from './components/icons'

// Hasil dulu (Rekap, Iklan, Simulasi), lalu input bulanan (Upload, HPP, Biaya).
const NAV_ORDER: Route[] = ['rekap', 'iklan', 'simulasi', 'upload', 'hpp', 'biaya']

const NAV_ICONS: Record<Route, typeof IconUpload> = {
  rekap: IconReceipt,
  iklan: IconMegaphone,
  simulasi: IconCalculator,
  akun: IconUser,
  pengelola: IconKey,
  upload: IconUpload,
  hpp: IconTag,
  biaya: IconWallet,
}

function NavLink({ route, current, variant }: { route: Route; current: boolean; variant: 'top' | 'bottom' }) {
  const r = ROUTES.find((x) => x.route === route)
  const Icon = NAV_ICONS[route]
  if (!r) return null
  if (variant === 'bottom') {
    return (
      <a
        href={`#/${route}`}
        aria-current={current ? 'page' : undefined}
        className={`relative flex min-h-14 flex-col items-center justify-center gap-1 text-xs font-semibold transition duration-[260ms] active:scale-95 ${
          current ? 'text-ink' : 'text-ink-3 hover:text-ink'
        }`}
      >
        <span
          data-pill
          className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-[260ms] ${
            current ? 'text-paper' : ''
          }`}
        >
          <Icon size={18} />
        </span>
        {r.short ?? r.label}
      </a>
    )
  }
  return (
    <a
      href={`#/${route}`}
      aria-current={current ? 'page' : undefined}
      className={`relative flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full px-3 font-semibold transition-colors duration-[260ms] ${
        current ? 'text-paper' : 'text-ink-2 hover:text-ink'
      }`}
    >
      <Icon size={17} />
      {r.short ?? r.label}
    </a>
  )
}

const STORE_KEY = 'profit-shopee:store'

function loadStoreId(): number | null {
  try {
    const v = localStorage.getItem(STORE_KEY)
    return v ? Number(v) : null
  } catch {
    return null
  }
}

function saveStoreId(id: number) {
  try {
    localStorage.setItem(STORE_KEY, String(id))
  } catch {
    // abaikan (mode privat)
  }
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)

  useEffect(() => {
    if (!isSupabaseConfigured) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (!isSupabaseConfigured) {
    return (
      <main className="mx-auto max-w-xl p-6">
        <Alert tone="error" title="Aplikasi belum dikonfigurasi">
          Isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY (lihat README).
        </Alert>
      </main>
    )
  }
  if (!authReady) return <Spinner />
  if (!session) return <LoginPage />
  return <MainApp user={session.user} />
}

function MainApp({ user }: { user: User }) {
  const email = user.email ?? ''
  const mustChangePassword = needsPasswordChange(user)
  const [{ route, params }, setLocation] = useState(readHash)
  const topRef = useRef<HTMLElement>(null)
  const barRef = useRef<HTMLElement>(null)
  // Latar menu aktif bergeser ke menu yang baru dipilih.
  const topIndicator = useActiveIndicator(topRef, route, (active, box) => {
    const a = active.getBoundingClientRect()
    const b = box.getBoundingClientRect()
    return { top: a.top - b.top, left: a.left - b.left, width: a.width, height: a.height }
  })
  const barIndicator = useActiveIndicator(barRef, route, (active, box) => {
    const a = (active.querySelector<HTMLElement>('[data-pill]') ?? active).getBoundingClientRect()
    const b = box.getBoundingClientRect()
    return { top: a.top - b.top, left: a.left - b.left, width: a.width, height: a.height }
  })
  const [stores, setStores] = useState<Store[] | null>(null)
  const [storesError, setStoresError] = useState<unknown>(null)
  const [storeId, setStoreIdState] = useState<number | null>(loadStoreId)
  // null = belum dicek. Hanya menentukan tampil/tidaknya ikon Pengelola; database tetap menolak akun lain.
  const [isOperator, setIsOperator] = useState<boolean | null>(null)

  useEffect(() => {
    fetchIsPlatformAdmin().then(setIsOperator)
  }, [])

  useEffect(() => {
    const onHash = () => setLocation(readHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    fetchStores()
      .then((list) => {
        setStores(list)
        setStoreIdState((cur) => (cur && list.some((s) => s.id === cur) ? cur : (list[0]?.id ?? null)))
      })
      .catch(setStoresError)
  }, [])

  const setStoreId = (id: number) => {
    setStoreIdState(id)
    saveStoreId(id)
  }

  const selectedStore = stores?.find((s) => s.id === storeId) ?? null
  // Laporan error hanya membawa toko yang terbukti milik akun ini (id dari localStorage bisa basi).
  useEffect(() => setErrorContext({ storeId: selectedStore ? selectedStore.id : null }), [selectedStore])
  const subscription = subscriptionStatus(selectedStore?.active_until)
  // Layar penuh menggantikan semua halaman: belum punya toko, atau langganan toko terpilih habis.
  const expired = subscription.state === 'expired' && selectedStore !== null
  // Menu disembunyikan kalau belum punya toko, atau langganan habis (saat itu hanya Rekap, baca saja).
  const blocked = stores !== null && (stores.length === 0 || expired)
  const notice = expiryNotice(subscription)

  // Nama toko selalu tampil setelah logo: pemilih kalau tokonya lebih dari satu, label biasa kalau cuma satu.
  const storeSelect =
    stores && stores.length === 1 ? (
      <span
        title={`Toko: ${stores[0].name}`}
        className="inline-flex min-h-11 min-w-0 max-w-[13rem] shrink items-center gap-2 rounded-full bg-tint px-3.5 font-semibold text-ink ring-1 ring-line"
      >
        <IconStore size={17} className="shrink-0 text-accent" />
        <span className="sr-only">Toko: </span>
        <span className="truncate">{stores[0].name}</span>
      </span>
    ) : stores && stores.length > 1 ? (
      <label className="min-w-[9.5rem] shrink">
        <span className="sr-only">Toko</span>
        <span className="relative block">
          <IconStore size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-accent" />
          <select
            value={storeId ?? ''}
            onChange={(e) => setStoreId(Number(e.target.value))}
            className="min-h-11 w-full max-w-[13rem] cursor-pointer appearance-none truncate rounded-full border border-control bg-paper pl-9 pr-8 font-semibold text-ink transition-colors hover:border-ink"
          >
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <IconChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-3" />
        </span>
      </label>
    ) : null

  return (
    <div className="min-h-screen pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
      {/* Toko dibuat tanpa nama (halaman Pengelola): pemiliknya mengisi dulu sebelum memakai aplikasi. */}
      {selectedStore?.name_pending && (
        <StoreNameModal
          key={selectedStore.id}
          storeId={selectedStore.id}
          onSaved={(name) =>
            // Muat ulang dari database (nama bisa saja sudah diisi di perangkat lain); kalau gagal, pakai yang diketik.
            fetchStores()
              .then(setStores)
              .catch(() =>
                setStores((list) =>
                  (list ?? []).map((s) => (s.id === selectedStore.id ? { ...s, name, name_pending: false } : s)),
                ),
              )
          }
        />
      )}
      <SupportButton
        context={{
          email,
          storeName: selectedStore?.name,
          page: ROUTES.find((r) => r.route === route)?.label,
        }}
      />
      <header className="sticky top-0 z-10 border-b border-line bg-canvas/95 backdrop-blur-md">
        {/* Selalu tampil (ikut menempel di atas) sampai pelanggan mengganti password dari pengelola. */}
        {mustChangePassword && route !== 'akun' && (
          <div role="region" aria-label="Pengingat ganti password" className="bg-sun text-ink">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 sm:px-6 lg:px-8">
              <p className="min-w-0 flex-1 font-semibold">
                Kamu masih memakai password dari pengelola. Ganti sekarang supaya akunmu aman.
              </p>
              <a
                href="#/akun"
                className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-ink px-5 font-semibold text-paper transition-transform active:translate-y-px"
              >
                Ganti password
              </a>
            </div>
          </div>
        )}
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:gap-4 sm:px-6 lg:px-8">
          <a href="#/rekap" aria-label={`${APP_NAME}, ke Rekap`} className="inline-flex min-h-11 shrink-0 items-center rounded-md">
            {/* Logo HitungCuan menyusut jadi tandanya saja di HP dan di 1024-1279px (menu ikut di bar atas), supaya
                nama toko tetap terbaca. */}
            {isHitungCuan ? (
              <>
                <img src="/logo/mark.svg" alt="" width={28} height={28} className="size-7 sm:hidden lg:block xl:hidden" />
                <Brand className="max-sm:hidden lg:max-xl:hidden" />
              </>
            ) : (
              <Brand className="max-sm:sr-only" />
            )}
          </a>
          {storeSelect}
          <nav ref={topRef} aria-label="Menu utama" className={`relative ml-auto hidden ${blocked ? '' : 'lg:block'}`}>
            {topIndicator && (
              <span aria-hidden="true" className="nav-indicator absolute rounded-full bg-ink" style={topIndicator} />
            )}
            <ul className="flex gap-1">
              {NAV_ORDER.map((r) => (
                <li key={r}>
                  <NavLink route={r} current={route === r} variant="top" />
                </li>
              ))}
            </ul>
          </nav>
          <div className={`ml-auto flex shrink-0 items-center gap-1 ${blocked ? '' : 'lg:ml-1'}`}>
            {isOperator && (
              <a
                href="#/pengelola"
                aria-current={route === 'pengelola' ? 'page' : undefined}
                title="Pengelola: buat akun uji coba"
                className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors ${
                  route === 'pengelola' ? 'bg-ink text-paper' : 'text-ink-2 hover:bg-tint hover:text-ink'
                }`}
              >
                <IconKey size={19} />
                <span className="sr-only">Pengelola</span>
              </a>
            )}
            <a
              href="#/akun"
              aria-current={route === 'akun' ? 'page' : undefined}
              title={`Akun (${email})`}
              className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors ${
                route === 'akun' ? 'bg-ink text-paper' : 'text-ink-2 hover:bg-tint hover:text-ink'
              }`}
            >
              <IconUser size={19} />
              <span className="sr-only">Akun</span>
            </a>
            <button
              type="button"
              onClick={() => supabase.auth.signOut()}
              title={`Keluar (${email})`}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-tint hover:text-ink"
            >
              <IconLogout size={19} />
              <span className="sr-only">Keluar</span>
            </button>
          </div>
        </div>
      </header>

      {/* HP & iPad: menu di bawah layar, mudah dijangkau jempol. */}
      <nav
        ref={barRef}
        aria-label="Menu utama"
        hidden={blocked}
        className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      >
        {barIndicator && (
          <span aria-hidden="true" className="nav-indicator absolute rounded-full bg-ink" style={barIndicator} />
        )}
        <ul className="mx-auto grid max-w-2xl grid-cols-6 px-1">
          {NAV_ORDER.map((r) => (
            <li key={r}>
              <NavLink route={r} current={route === r} variant="bottom" />
            </li>
          ))}
        </ul>
      </nav>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        {route === 'pengelola' ? (
          // Tidak bergantung pada toko: pengelola bisa saja tidak punya toko sendiri.
          <div className="page-in">
            {isOperator === null ? <Spinner /> : isOperator ? <OperatorPage /> : <NotOperatorScreen />}
          </div>
        ) : route === 'akun' ? (
          <div className="page-in">
            <AccountPage email={email} mustChange={mustChangePassword} stores={stores} storeId={storeId} readOnly={expired} />
          </div>
        ) : storesError ? (
          <ErrorBox error={storesError} />
        ) : !stores ? (
          <Spinner />
        ) : stores.length === 0 ? (
          <NoStoreScreen />
        ) : expired && selectedStore ? (
          <div className="page-in space-y-6">
            <ExpiredBanner storeName={selectedStore.name} activeUntil={subscription.activeUntil} />
            <RecapPage stores={stores} storeId={storeId} readOnly />
          </div>
        ) : (
          <>
            {/* Di luar pembungkus per-halaman supaya tidak berkedip tiap pindah halaman. */}
            {storeId !== null && <MonthlyReminderCard storeId={storeId} route={route} />}
          <div key={route} className="page-in">
            {notice && selectedStore && (
              <div className="mb-6">
                <ExpiryReminder storeName={selectedStore.name} showStore={stores.length > 1} notice={notice} activeUntil={subscription.activeUntil} />
              </div>
            )}
            {route === 'upload' && <UploadPage stores={stores} storeId={storeId} />}
            {route === 'hpp' && (
              <HppPage
                stores={stores}
                storeId={storeId}
               
                onlyMissingInitially={params.get('kosong') === '1'}
              />
            )}
            {route === 'biaya' && (
              <ExpensesPage
                stores={stores}
                storeId={storeId}
               
                initialMonth={params.get('bulan')}
              />
            )}
            {route === 'rekap' && <RecapPage stores={stores} storeId={storeId} />}
            {route === 'iklan' && (
              <AdsPage key={storeId} stores={stores} storeId={storeId} quickCheck={params.get('cek') === '1'} />
            )}
            {route === 'simulasi' && <PriceSimPage stores={stores} storeId={storeId} />}
          </div>
          </>
        )}
      </main>
    </div>
  )
}

/** Alamat #/pengelola dibuka akun biasa. */
function NotOperatorScreen() {
  return (
    <div className="mx-auto max-w-xl py-4 sm:py-10">
      <Card>
        <h1 className="font-display text-3xl font-extrabold leading-tight tracking-tight">Halaman ini khusus pengelola.</h1>
        <p className="mt-3 text-lg leading-relaxed text-ink-2">
          <a href="#/rekap" className={linkClass}>
            Kembali ke Rekap
          </a>
        </p>
      </Card>
    </div>
  )
}

/** Belum bisa memakai aplikasi: jawabannya dulu, lalu satu jalan keluar (chat pengelola). */
function NoStoreScreen() {
  return (
    <div className="mx-auto max-w-xl py-4 sm:py-10">
      <Card>
        <Stamp tone="warn">Belum ada toko</Stamp>
        <h1 className="mt-5 font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
          Akunmu belum terhubung ke toko.
        </h1>
        <p className="mt-3 text-lg leading-relaxed text-ink-2">
          Pengelola perlu menghubungkan akunmu ke tokomu dulu. Setelah itu, muat ulang halaman ini.
        </p>
        <WhatsAppButton className="mt-6" message={`Halo, akun ${APP_NAME} saya belum terhubung ke toko.`}>
          Chat pengelola
        </WhatsAppButton>
      </Card>
    </div>
  )
}

function renewMessage(storeName: string) {
  return `Halo, saya ingin memperpanjang langganan ${APP_NAME} untuk toko ${storeName}.`
}

/** Pengingat beberapa hari sebelum langganan habis. */
function ExpiryReminder({
  storeName,
  showStore,
  notice,
  activeUntil,
}: {
  storeName: string
  showStore: boolean
  notice: string
  activeUntil: string | null
}) {
  return (
    <Alert tone="warning" title={`Langganan ${showStore ? `toko ${storeName} ` : ''}${notice} (${formatDate(activeUntil)}).`}>
      <p>Setelah habis, data tetap aman dan bisa dilihat di Rekap, tapi upload dan perubahan data dimatikan.</p>
      {hasSupportWhatsApp && (
        <p className="mt-2">
          <SupportLink message={renewMessage(storeName)}>Perpanjang lewat WhatsApp</SupportLink>
        </p>
      )}
    </Alert>
  )
}

/** Langganan habis: data tetap bisa dilihat (Rekap, baca saja), mengubah data tidak. */
function ExpiredBanner({ storeName, activeUntil }: { storeName: string; activeUntil: string | null }) {
  return (
    <Alert tone="warning" title={`Langganan ${APP_NAME} toko ${storeName} habis pada ${formatDate(activeUntil)}.`}>
      <p>
        Data kamu aman dan tetap bisa dilihat di Rekap di bawah. Upload, HPP, biaya, iklan, dan simulasi aktif lagi
        setelah langganan diperpanjang.
      </p>
      {hasSupportWhatsApp && (
        <p className="mt-2">
          <SupportLink message={renewMessage(storeName)}>Perpanjang lewat WhatsApp</SupportLink>
        </p>
      )}
    </Alert>
  )
}
