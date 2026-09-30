import { useEffect, useState } from 'react'
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
import { ROUTES, readHash } from './lib/router'

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

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <span className="mr-2 text-xl font-bold text-orange-600">Profit Shopee</span>
          <nav className="flex flex-1 flex-wrap gap-2">
            {ROUTES.map((n) => (
              <a
                key={n.route}
                href={`#/${n.route}`}
                aria-current={route === n.route ? 'page' : undefined}
                className={`flex min-h-12 items-center rounded-xl px-5 text-lg font-semibold ${
                  route === n.route ? 'bg-orange-100 text-orange-800' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                {n.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-500 md:inline">{email}</span>
            <button
              type="button"
              onClick={() => supabase.auth.signOut()}
              className="min-h-12 rounded-xl px-4 text-lg text-slate-600 hover:bg-slate-100"
            >
              Keluar
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {storesError ? (
          <ErrorBox error={storesError} />
        ) : !stores ? (
          <Spinner />
        ) : (
          <>
            {route === 'upload' && <UploadPage stores={stores} storeId={storeId} onStoreChange={setStoreId} />}
            {route === 'hpp' && (
              <HppPage
                stores={stores}
                storeId={storeId}
                onStoreChange={setStoreId}
                onlyMissingInitially={params.get('kosong') === '1'}
              />
            )}
            {route === 'biaya' && <ExpensesPage stores={stores} storeId={storeId} onStoreChange={setStoreId} />}
            {route === 'rekap' && <RecapPage stores={stores} storeId={storeId} onStoreChange={setStoreId} />}
          </>
        )}
      </main>
    </div>
  )
}
