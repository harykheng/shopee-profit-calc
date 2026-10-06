// Gerak kecil: angka berputar naik, konfeti potongan nota, penanda menu yang bergeser.
// Semua menghormati "kurangi gerak" di perangkat; tanpa library tambahan.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { createPortal } from 'react-dom'

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/** Angka yang berputar naik ke `target` setiap kali `target` berubah (±0,7 detik). */
export function useCountUp(target: number, duration = 700): number {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0))
  const fromRef = useRef(value)

  useEffect(() => {
    if (prefersReducedMotion()) {
      fromRef.current = target
      setValue(target)
      return
    }
    const from = fromRef.current
    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      const v = from + (target - from) * eased
      fromRef.current = v
      setValue(v)
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, duration])

  return value
}

const BIT_COLORS = ['var(--color-stamp)', 'var(--color-gain)', 'var(--color-warn-line)', 'var(--color-rule)', 'var(--color-ink)']

/**
 * Perayaan kecil: potongan kertas nota menyembur dari tengah `anchor`, sekali, ±1 detik.
 * Setiap kali `fireKey` berubah (dan bukan null) semburan baru dimulai.
 */
export function Confetti({
  anchor,
  fireKey,
  delay = 0,
}: {
  anchor: RefObject<HTMLElement | null>
  fireKey: string | number | null
  /** Jeda sebelum menyembur (ms), mis. menunggu cap selesai dicapkan. */
  delay?: number
}) {
  const [burst, setBurst] = useState<{ key: string | number; x: number; y: number } | null>(null)

  useEffect(() => {
    if (fireKey === null || prefersReducedMotion()) return
    let hide = 0
    const show = window.setTimeout(() => {
      const rect = anchor.current?.getBoundingClientRect()
      if (!rect) return
      setBurst({ key: fireKey, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
      hide = window.setTimeout(() => setBurst(null), 1600)
    }, delay)
    return () => {
      window.clearTimeout(show)
      window.clearTimeout(hide)
    }
  }, [fireKey, anchor, delay])

  if (!burst) return null
  // Lapisan selayar yang memotong potongan di luar layar (supaya halaman tidak melebar),
  // dipasang langsung di <body> supaya tidak ikut bergeser oleh animasi induknya.
  return createPortal(
    <div key={burst.key} aria-hidden="true" className="pointer-events-none fixed inset-0 z-30 overflow-hidden">
      <div className="absolute" style={{ left: burst.x, top: burst.y }}>
      {Array.from({ length: 26 }, (_, i) => {
        // Sebar melingkar, lebih banyak ke atas, lalu jatuh sedikit.
        const angle = (i / 26) * Math.PI * 2 + Math.random() * 0.4
        const dist = 70 + Math.random() * 90
        const style = {
          width: i % 3 === 0 ? 10 : 7,
          height: i % 3 === 0 ? 4 : 7,
          background: BIT_COLORS[i % BIT_COLORS.length],
          '--x': `${Math.cos(angle) * dist}px`,
          '--y': `${Math.sin(angle) * dist * 0.8 + 40}px`,
          '--r': `${Math.round(Math.random() * 540 - 270)}deg`,
          '--d': `${Math.round(Math.random() * 90)}ms`,
        } as CSSProperties
        return <span key={i} className="confetti-bit" style={style} />
      })}
      </div>
    </div>,
    document.body,
  )
}

/**
 * Posisi penanda menu aktif di dalam `container` (elemen ber-`position: relative`).
 * `measure` menerima link aktif dan mengembalikan kotak penanda relatif ke container.
 */
export function useActiveIndicator(
  container: RefObject<HTMLElement | null>,
  activeKey: string,
  measure: (active: HTMLElement, box: HTMLElement) => { top: number; left: number; width: number; height: number },
): CSSProperties | null {
  const [style, setStyle] = useState<CSSProperties | null>(null)
  const measureRef = useRef(measure)
  measureRef.current = measure

  useLayoutEffect(() => {
    const box = container.current
    if (!box) return
    const update = () => {
      const active = box.querySelector<HTMLElement>('[aria-current="page"]')
      if (!active || active.offsetParent === null) {
        setStyle(null)
        return
      }
      setStyle(measureRef.current(active, box))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(box)
    return () => ro.disconnect()
  }, [container, activeKey])

  return style
}

const CELEBRATED_KEY = 'profit-shopee:dirayakan'

/**
 * Kunci untuk <Confetti fireKey>: berisi `key` sekali saja (setelah `delay` ms) untuk setiap `key`
 * yang belum pernah dirayakan di browser ini; selain itu null.
 */
export function useCelebrateOnce(key: string | null, delay = 0): string | null {
  const [fire, setFire] = useState<string | null>(null)
  useEffect(() => {
    if (!key) return
    let seen: string[] = []
    try {
      seen = JSON.parse(localStorage.getItem(CELEBRATED_KEY) ?? '[]')
    } catch {
      seen = []
    }
    if (seen.includes(key)) return
    // Dicatat saat benar-benar dirayakan (bukan saat dijadwalkan), supaya pembatalan tidak menghilangkannya.
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(CELEBRATED_KEY, JSON.stringify([...seen, key].slice(-50)))
      } catch {
        // abaikan (mode privat): perayaan bisa muncul lagi, tidak apa-apa
      }
      setFire(key)
    }, delay)
    return () => window.clearTimeout(t)
  }, [key, delay])
  return fire
}
