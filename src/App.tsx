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

const NAV_GROUPS: { title: string; routes: Route[] }[] = [
  { title: 'Lihat hasil', routes: ['rekap', 'iklan', 'simulasi'] },
  { title: 'Input bulanan', routes: ['upload', 'hpp', 'biaya'] },
]

const NAV_ICONS: Record<Route, typeof IconUpload> = {
  rekap: IconReceipt,
  iklan: IconMegaphone,
  simulasi: IconCalculator,
  upload: IconUpload,
  hpp: IconTag,
  biaya: IconWallet,
}

function NavLink({ route, current, variant }: { route: Route; current: boolean; variant: 'rail' | 'bottom' }) {
  const r = ROUTES.find((x) => x.route === route)
  const Icon = NAV_ICONS[route]
  if (!r) return null
  if (variant === 'bottom') {
    return (
      <a
        href={`#/${route}`}
        aria-current={current ? 'page' : undefined}
        className={`relative flex min-h-14 flex-col items-center justify-center gap-1 text-xs font-medium transition duration-[260ms] active:scale-95 ${
          current ? 'text-white' : 'text-rail-text hover:text-white'
        }`}
      >
        <span
          data-pill
          className={`flex h-7 w-12 items-center justify-center rounded-md transition-colors duration-[260ms] ${
            current ? 'text-stamp' : ''
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
      className={`relative flex min-h-11 items-center gap-3 whitespace-nowrap rounded-md px-3 font-medium transition-colors duration-[260ms] ${
        current ? 'text-ink' : 'text-rail-text hover:bg-white/5 hover:text-white'
      }`}
    >
      <Icon size={18} className={current ? 'text-stamp' : ''} />
      {r.label}
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
  const railRef = useRef<HTMLElement>(null)
  const barRef = useRef<HTMLElement>(null)
  // Latar menu aktif bergeser ke menu yang baru dipilih.
  const railIndicator = useActiveIndicator(railRef, route, (active, box) => {
    const a = active.getBoundingClientRect()
    const b = box.getBoundingClientRect()
    return { top: a.top - b.top + box.scrollTop, left: a.left - b.left, width: a.width, height: a.height }
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

  const storeSelect = (variant: 'rail' | 'bar') =>
    stores && stores.length > 0 ? (
      <label className={variant === 'rail' ? 'block' : 'min-w-0'}>
        <span className={variant === 'rail' ? 'mb-1.5 block text-xs font-medium text-rail-text' : 'sr-only'}>Toko</span>
        <span className="relative block">
          <IconStore
            size={18}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-rail-text"
          />
          <select
            value={storeId ?? ''}
            onChange={(e) => setStoreId(Number(e.target.value))}
            className={`min-h-11 w-full cursor-pointer appearance-none truncate rounded-md border border-white/10 bg-rail-raised pl-10 pr-9 text-base font-semibold text-white transition-colors hover:border-white/25 focus:border-white/40 focus:outline-none ${
              variant === 'bar' ? 'max-w-[12rem]' : ''
            }`}
          >
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <IconChevronDown
            size={18}
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-rail-text"
          />
        </span>
      </label>
    ) : null

  const logout = (
    <button
      type="button"
      onClick={() => supabase.auth.signOut()}
      className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-rail-text transition-colors hover:bg-white/5 hover:text-white"
    >
      <IconLogout size={18} />
      <span className="max-sm:sr-only">Keluar</span>
    </button>
  )

  return (
    <div className="min-h-screen pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)] lg:pb-0">
      {/* Laptop: rel samping (latar penuh setinggi halaman, isinya menempel di atas). */}
      <div className="hidden bg-rail lg:block">
        <aside className="sticky top-0 flex h-screen flex-col px-4 py-5 text-rail-text">
          <a href="#/rekap" className="flex items-center gap-2.5 rounded-md px-2 py-1 text-white">
            <IconReceipt size={22} />
            <span className="text-lg font-semibold tracking-tight">Profit Shopee</span>
          </a>
          <div className="mt-6">{storeSelect('rail')}</div>
          <nav ref={railRef} aria-label="Menu utama" className="relative mt-6 flex flex-1 flex-col gap-5 overflow-y-auto">
            {railIndicator && (
              <span aria-hidden="true" className="nav-indicator absolute rounded-md bg-paper" style={railIndicator} />
            )}
            {NAV_GROUPS.map((g) => (
              <div key={g.title}>
                <p className="mb-1.5 px-3 text-xs font-medium text-rail-text/80">{g.title}</p>
                <ul className="flex flex-col gap-0.5">
                  {g.routes.map((r) => (
                    <li key={r}>
                      <NavLink route={r} current={route === r} variant="rail" />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
          <div className="border-t border-white/10 pt-4">
            <p className="truncate px-3 pb-2 text-sm text-rail-text/80" title={email}>
              {email}
            </p>
            {logout}
          </div>
        </aside>
      </div>

      <div className="min-w-0">
        {/* HP & iPad: bar atas untuk toko & keluar, menu di bawah layar (mudah dijangkau jempol). */}
        <header className="sticky top-0 z-10 bg-rail text-rail-text lg:hidden">
          <div className="flex items-center gap-3 px-4 py-2.5">
            <a href="#/rekap" className="flex shrink-0 items-center gap-2 text-white">
              <IconReceipt size={20} />
              <span className="font-semibold tracking-tight">Profit</span>
            </a>
            <div className="ml-auto flex min-w-0 items-center gap-1">
              {storeSelect('bar')}
              {logout}
            </div>
          </div>
        </header>
        <nav
          ref={barRef}
          aria-label="Menu utama"
          className="fixed inset-x-0 bottom-0 z-10 bg-rail pb-[env(safe-area-inset-bottom)] lg:hidden"
        >
          {barIndicator && (
            <span aria-hidden="true" className="nav-indicator absolute rounded-md bg-paper" style={barIndicator} />
          )}
          <ul className="mx-auto grid max-w-2xl grid-cols-6 px-1">
            {NAV_GROUPS.flatMap((g) => g.routes).map((r) => (
              <li key={r}>
                <NavLink route={r} current={route === r} variant="bottom" />
              </li>
            ))}
          </ul>
        </nav>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
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
    </div>
  )
}
