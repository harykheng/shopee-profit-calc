// Gerak kecil: angka berputar naik dan penanda menu yang bergeser. Seperti landing HitungCuan, tanpa konfeti
// dan tanpa judul yang naik per kata. Semua menghormati "kurangi gerak" di perangkat; tanpa library tambahan.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'

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
