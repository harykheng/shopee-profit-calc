// Jatah simulasi akun uji coba (10 produk per hari). Toko berbayar: semua langsung "ok", tanpa panggilan ke server.
import { useEffect, useRef, useState } from 'react'
import { claimTrialSimulation } from '../lib/api'
import { TRIAL_SIMULATION_LIMIT, trialSimNotice } from '../lib/trialLimits'
import { Alert } from './ui'

// Satu produk dan Grup iklan memakai hook masing-masing; sisa jatah dibagikan lewat event ini supaya angkanya sama.
const USED_EVENT = 'trial-sim-used'
function shareUsed(storeId: number, used: number) {
  window.dispatchEvent(new CustomEvent(USED_EVENT, { detail: { storeId, used } }))
}

export type SimGate = 'ok' | 'pending' | 'blocked'

export interface TrialSim {
  trial: boolean
  /** null = belum tahu. */
  used: number | null
  limit: number
  statusOf: (key: string | null) => SimGate
}

/**
 * Minta izin untuk setiap kunci produk di `keys` (sekali per kunci). Hasil yang ditolak tetap ditolak
 * sampai halaman dibuka ulang; jatahnya kembali besok. Kalau server tidak bisa dihubungi atau SQL-nya
 * belum dijalankan, simulasi tetap boleh (jangan sampai pelanggan terhalang karena gangguan).
 */
export function useTrialSimulation(storeId: number | null, trial: boolean, keys: (string | null)[]): TrialSim {
  const [status, setStatus] = useState<Record<string, SimGate>>({})
  const [used, setUsed] = useState<number | null>(null)
  const [limit, setLimit] = useState(TRIAL_SIMULATION_LIMIT)
  const asked = useRef(new Set<string>())
  const wanted = [...new Set(keys.filter((k): k is string => Boolean(k)))]
  const joined = wanted.join('\n')

  useEffect(() => {
    setStatus({})
    setUsed(null)
    asked.current = new Set()
    if (!trial || !storeId) return
    let cancelled = false
    const onUsed = (e: Event) => {
      const d = (e as CustomEvent<{ storeId: number; used: number }>).detail
      if (d.storeId === storeId) setUsed(d.used)
    }
    window.addEventListener(USED_EVENT, onUsed)
    claimTrialSimulation(storeId, null)
      .then((r) => {
        if (cancelled) return
        setUsed(r.used)
        setLimit(r.limit)
      })
      .catch(() => {})
    return () => {
      cancelled = true
      window.removeEventListener(USED_EVENT, onUsed)
    }
  }, [storeId, trial])

  useEffect(() => {
    if (!trial || !storeId) return
    const fresh = wanted.filter((k) => !asked.current.has(k))
    if (fresh.length === 0) return
    for (const k of fresh) asked.current.add(k)
    setStatus((s) => ({ ...s, ...Object.fromEntries(fresh.map((k) => [k, 'pending' as const])) }))
    let cancelled = false
    ;(async () => {
      // Satu per satu: jatahnya dihitung berurutan di server.
      for (const k of fresh) {
        const r = await claimTrialSimulation(storeId, k).catch(() => null)
        if (cancelled) {
          asked.current.delete(k)
          continue
        }
        if (r) {
          setLimit(r.limit)
          shareUsed(storeId, r.used)
        }
        setStatus((s) => ({ ...s, [k]: !r || r.allowed ? 'ok' : 'blocked' }))
      }
    })()
    return () => {
      cancelled = true
    }
    // `joined` mewakili isi `wanted` (array baru tiap render).
  }, [joined, storeId, trial])

  return {
    trial,
    used,
    limit,
    statusOf: (key) => (!trial || !key ? 'ok' : (status[key] ?? 'pending')),
  }
}

/** Satu baris sisa jatah, hanya untuk toko uji coba. */
export function TrialSimNotice({ sim }: { sim: TrialSim }) {
  if (!sim.trial || sim.used === null) return null
  return <p className="mb-6 text-sm text-ink-2">{trialSimNotice(sim.used, sim.limit)}</p>
}

export function TrialSimBlocked({ limit }: { limit: number }) {
  return (
    <Alert tone="warning" title={`Jatah simulasi uji coba hari ini sudah habis (${limit} produk).`}>
      Produk yang sudah kamu coba hari ini tetap bisa dibuka lagi. Jatahnya kembali besok, atau berlangganan supaya
      simulasi tidak dibatasi.
    </Alert>
  )
}
