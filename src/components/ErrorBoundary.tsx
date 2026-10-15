// Menangkap error saat menampilkan halaman. Tanpa ini, satu komponen yang gagal membuat seluruh layar putih
// tanpa pesan. Error-nya dilaporkan ke pengelola (client_errors), pelanggan diberi jalan keluar.
import { Component, type ReactNode } from 'react'
import { APP_NAME } from '../lib/brand'
import { reportError } from '../lib/reportError'
import { Alert, SupportLink } from './ui'

interface State {
  failed: boolean
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    reportError('render', error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="mx-auto max-w-xl p-6">
        <Alert tone="error" title="Halaman ini mengalami gangguan.">
          <p>Datamu aman. Coba muat ulang halaman; kalau masih sama, hubungi pengelola.</p>
          <p className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
            <button
              type="button"
              className="min-h-11 rounded-full bg-accent px-5 font-semibold text-white transition-[background-color,transform] hover:bg-accent-hover active:translate-y-px"
              onClick={() => window.location.reload()}
            >
              Muat ulang
            </button>
            <SupportLink message={`Halo, ${APP_NAME} saya menampilkan "Halaman ini mengalami gangguan" di ${window.location.hash || 'halaman awal'}.`}>
              Hubungi pengelola lewat WhatsApp
            </SupportLink>
          </p>
        </Alert>
      </main>
    )
  }
}
