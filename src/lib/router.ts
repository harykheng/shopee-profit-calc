// Navigasi sederhana berbasis hash: "#/hpp?kosong=1".
export type Route = 'upload' | 'hpp' | 'biaya' | 'rekap' | 'iklan' | 'simulasi' | 'akun' | 'pelanggan' | 'pengelola'

/** `short`: label pendek untuk layar kecil (supaya menu tetap muat). */
export const ROUTES: { route: Route; label: string; short?: string }[] = [
  { route: 'upload', label: 'Upload' },
  { route: 'hpp', label: 'HPP' },
  { route: 'biaya', label: 'Biaya' },
  { route: 'rekap', label: 'Rekap' },
  { route: 'iklan', label: 'Iklan' },
  { route: 'simulasi', label: 'Simulasi Harga', short: 'Simulasi' },
  // Tidak ada di menu utama; dibuka dari ikon akun di header dan banner ganti password.
  { route: 'akun', label: 'Akun' },
  // Hanya untuk pengelola (is_platform_admin): halaman awal pengelola = daftar pelanggan; buat akun di "pengelola".
  { route: 'pelanggan', label: 'Pelanggan' },
  { route: 'pengelola', label: 'Buat akun' },
]

export function readHash(): { route: Route; params: URLSearchParams } {
  const [path, query] = window.location.hash.replace(/^#\/?/, '').split('?')
  const route = (ROUTES.some((n) => n.route === path) ? path : 'rekap') as Route
  return { route, params: new URLSearchParams(query ?? '') }
}

/** Alamat hash untuk tautan biasa (<a href>): "#/hpp?kosong=1". */
export function hrefFor(route: Route, params?: Record<string, string>): string {
  const query = params ? '?' + new URLSearchParams(params).toString() : ''
  return `#/${route}${query}`
}

export function navigate(route: Route, params?: Record<string, string>) {
  const query = params ? '?' + new URLSearchParams(params).toString() : ''
  window.location.hash = `/${route}${query}`
}
