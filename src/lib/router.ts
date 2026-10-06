// Navigasi sederhana berbasis hash: "#/hpp?kosong=1".
export type Route = 'upload' | 'hpp' | 'biaya' | 'rekap' | 'iklan' | 'simulasi'

/** `short`: label pendek untuk layar kecil (supaya menu tetap muat). */
export const ROUTES: { route: Route; label: string; short?: string }[] = [
  { route: 'upload', label: 'Upload' },
  { route: 'hpp', label: 'HPP' },
  { route: 'biaya', label: 'Biaya' },
  { route: 'rekap', label: 'Rekap' },
  { route: 'iklan', label: 'Iklan' },
  { route: 'simulasi', label: 'Simulasi Harga', short: 'Simulasi' },
]

export function readHash(): { route: Route; params: URLSearchParams } {
  const [path, query] = window.location.hash.replace(/^#\/?/, '').split('?')
  const route = (ROUTES.some((n) => n.route === path) ? path : 'rekap') as Route
  return { route, params: new URLSearchParams(query ?? '') }
}

export function navigate(route: Route, params?: Record<string, string>) {
  const query = params ? '?' + new URLSearchParams(params).toString() : ''
  window.location.hash = `/${route}${query}`
}
