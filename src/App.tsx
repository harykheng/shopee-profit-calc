import { useEffect, useRef, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { Alert, ErrorBox, Spinner, SupportLink } from './components/ui'
import { APP_NAME } from './lib/brand'
import { formatDate } from './lib/format'
import { expiryNotice, subscriptionStatus } from './lib/subscription'
import { needsPasswordChange } from './lib/password'
import { fetchStores } from './lib/api'
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
import { ROUTES, readHash, type Route } from './lib/router'
import { useActiveIndicator } from './components/motion'
import { IconCalculator, IconChevronDown, IconLogout, IconMegaphone, IconReceipt, IconStore, IconTag, IconUpload, IconUser, IconWallet } from './components/icons'

// Hasil dulu (Rekap, Iklan, Simulasi), lalu input bulanan (Upload, HPP, Biaya).
const NAV_ORDER: Route[] = ['rekap', 'iklan', 'simulasi', 'upload', 'hpp', 'biaya']

const NAV_ICONS: Record<Route, typeof IconUpload> = {
  rekap: IconReceipt,
  iklan: IconMegaphone,
  simulasi: IconCalculator,
  akun: IconUser,
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
          current ? 'text-on-field' : 'text-on-field-muted hover:text-on-field'
        }`}
      >
        <span
          data-pill
          className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-[260ms] ${
            current ? 'text-field-deep' : ''
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
      className={`relative flex min-h-10 items-center gap-2 whitespace-nowrap rounded-full px-4 font-semibold transition-colors duration-[260ms] ${
        current ? 'text-field' : 'text-on-field-muted hover:text-on-field'
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
  const subscription = subscriptionStatus(selectedStore?.active_until)
  // Layar penuh menggantikan semua halaman: belum punya toko, atau langganan toko terpilih habis.
  const expired = subscription.state === 'expired' && selectedStore !== null
  // Menu disembunyikan kalau belum punya toko, atau langganan habis (saat itu hanya Rekap, baca saja).
  const blocked = stores !== null && (stores.length === 0 || expired)
  const notice = expiryNotice(subscription)

  // Pemilih toko hanya muncul kalau user punya lebih dari satu toko.
  const storeSelect =
    stores && stores.length > 1 ? (
      <label className="min-w-0">
        <span className="sr-only">Toko</span>
        <span className="relative block">
          <IconStore size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-field-muted" />
          <select
            value={storeId ?? ''}
            onChange={(e) => setStoreId(Number(e.target.value))}
            className="min-h-10 w-full max-w-[12rem] cursor-pointer appearance-none truncate rounded-full border border-on-field/35 bg-transparent pl-9 pr-8 font-semibold text-on-field transition-colors hover:border-on-field/70 [&>option]:text-ink"
          >
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <IconChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-on-field-muted" />
        </span>
      </label>
    ) : null

  return (
    <div className="min-h-screen pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
      <header className="on-field sticky top-0 z-10 bg-field/90 backdrop-blur-md">
        {/* Selalu tampil (ikut menempel di atas) sampai pelanggan mengganti password dari admin. */}
        {mustChangePassword && route !== 'akun' && (
          <div role="region" aria-label="Pengingat ganti password" className="bg-[#ffcf5c] text-ink">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 sm:px-6 lg:px-8">
              <p className="min-w-0 flex-1 font-semibold">
                Kamu masih memakai password dari admin. Ganti sekarang supaya akunmu aman.
              </p>
              <a
                href="#/akun"
                className="inline-flex min-h-10 shrink-0 items-center rounded-full bg-ink px-5 font-semibold text-white transition active:scale-[0.97]"
              >
                Ganti password
              </a>
            </div>
          </div>
        )}
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <a href="#/rekap" className="shrink-0 font-display text-xl font-bold tracking-tight text-on-field max-sm:sr-only">
            {APP_NAME}
          </a>
          {storeSelect}
          <nav ref={topRef} aria-label="Menu utama" className={`relative ml-auto hidden ${blocked ? '' : 'lg:block'}`}>
            {topIndicator && (
              <span aria-hidden="true" className="nav-indicator absolute rounded-full bg-on-field" style={topIndicator} />
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
            <a
              href="#/akun"
              aria-current={route === 'akun' ? 'page' : undefined}
              title={`Akun (${email})`}
              className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/10 hover:text-on-field ${
                route === 'akun' ? 'bg-white/15 text-on-field' : 'text-on-field-muted'
              }`}
            >
              <IconUser size={19} />
              <span className="sr-only">Akun</span>
            </a>
            <button
              type="button"
              onClick={() => supabase.auth.signOut()}
              title={`Keluar (${email})`}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-on-field-muted transition-colors hover:bg-white/10 hover:text-on-field"
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
        className="on-field fixed inset-x-0 bottom-0 z-10 bg-field-deep pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {barIndicator && (
          <span aria-hidden="true" className="nav-indicator absolute rounded-full bg-lime" style={barIndicator} />
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
        {route === 'akun' ? (
          <div className="page-in">
            <AccountPage email={email} mustChange={mustChangePassword} />
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
            {route === 'iklan' && <AdsPage key={storeId} stores={stores} storeId={storeId} />}
            {route === 'simulasi' && <PriceSimPage stores={stores} storeId={storeId} />}
          </div>
        )}
      </main>
    </div>
  )
}

function NoStoreScreen() {
  return (
    <div className="mx-auto max-w-xl">
      <Alert tone="warning" title="Akun ini belum terhubung ke toko. Hubungi admin.">
        <p>Setelah admin menghubungkan akunmu ke sebuah toko, muat ulang halaman ini.</p>
        <p className="mt-3">
          <SupportLink message={`Halo, akun ${APP_NAME} saya belum terhubung ke toko.`}>
            Hubungi admin lewat WhatsApp
          </SupportLink>
        </p>
      </Alert>
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
      <p className="mt-2">
        <SupportLink message={renewMessage(storeName)}>Perpanjang lewat WhatsApp</SupportLink>
      </p>
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
      <p className="mt-2">
        <SupportLink message={renewMessage(storeName)}>Perpanjang lewat WhatsApp</SupportLink>
      </p>
    </Alert>
  )
}
