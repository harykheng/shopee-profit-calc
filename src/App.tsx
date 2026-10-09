import { useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Alert, ErrorBox, Spinner } from './components/ui'
import { fetchStores } from './lib/api'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import type { Store } from './lib/types'
import { LoginPage } from './pages/LoginPage'
import { UploadPage } from './pages/UploadPage'
import { HppPage } from './pages/HppPage'
import { ExpensesPage } from './pages/ExpensesPage'
import { RecapPage } from './pages/RecapPage'
import { AdsPage } from './pages/AdsPage'
import { PriceSimPage } from './pages/PriceSimPage'
import { ROUTES, readHash, type Route } from './lib/router'
import { useActiveIndicator } from './components/motion'
import { IconCalculator, IconChevronDown, IconLogout, IconMegaphone, IconReceipt, IconStore, IconTag, IconUpload, IconWallet } from './components/icons'

// Hasil dulu (Rekap, Iklan, Simulasi), lalu input bulanan (Upload, HPP, Biaya).
const NAV_ORDER: Route[] = ['rekap', 'iklan', 'simulasi', 'upload', 'hpp', 'biaya']

const NAV_ICONS: Record<Route, typeof IconUpload> = {
  rekap: IconReceipt,
  iklan: IconMegaphone,
  simulasi: IconCalculator,
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
  return <MainApp email={session.user.email ?? ''} />
}

function MainApp({ email }: { email: string }) {
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

  const storeSelect =
    stores && stores.length > 0 ? (
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
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <a href="#/rekap" className="shrink-0 font-display text-xl font-bold tracking-tight text-on-field max-sm:sr-only">
            Profit Shopee
          </a>
          {storeSelect}
          <nav ref={topRef} aria-label="Menu utama" className="relative ml-auto hidden lg:block">
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
          <button
            type="button"
            onClick={() => supabase.auth.signOut()}
            title={`Keluar (${email})`}
            className="ml-auto inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-on-field-muted transition-colors hover:bg-white/10 hover:text-on-field lg:ml-1"
          >
            <IconLogout size={19} />
            <span className="sr-only">Keluar</span>
          </button>
        </div>
      </header>

      {/* HP & iPad: menu di bawah layar, mudah dijangkau jempol. */}
      <nav
        ref={barRef}
        aria-label="Menu utama"
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
        {storesError ? (
          <ErrorBox error={storesError} />
        ) : !stores ? (
          <Spinner />
        ) : (
          <div key={route} className="page-in">
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
