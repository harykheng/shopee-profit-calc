// Sorotan: seluruh layar digelapkan, satu kotak tetap terang di tempatnya sampai pengguna menekan tombol.
// Kotaknya digambar ulang (children) di atas lapisan gelap, persis di posisi `target`, lewat portal ke <body>
// supaya selalu di atas header, menu bawah, dan tombol bantuan.
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './ui'

export function Spotlight({
  target,
  onClose,
  actionLabel = 'Saya mengerti',
  children,
}: {
  target: RefObject<HTMLElement | null>
  onClose: () => void
  actionLabel?: string
  /** Isi kotak yang disorot (sama dengan isi `target`). */
  children: ReactNode
}) {
  const [rect, setRect] = useState<DOMRect | null>(null)
  const actions = useRef<HTMLDivElement>(null)
  const labelId = useId()

  useLayoutEffect(() => {
    const el = target.current
    if (!el) return
    el.scrollIntoView({ block: 'center' })
    const measure = () => setRect(el.getBoundingClientRect())
    measure()
    // Ukur ulang setelah animasi masuk halaman (.page-in menggeser 4px) selesai.
    const later = window.setTimeout(measure, 250)
    window.addEventListener('resize', measure)
    return () => {
      window.clearTimeout(later)
      window.removeEventListener('resize', measure)
    }
  }, [target])

  useEffect(() => {
    // Halaman di belakang tidak ikut bergulir selama sorotan terbuka.
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Tab') {
        e.preventDefault()
        if (e.key === 'Escape') onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const shown = rect !== null
  useEffect(() => {
    if (shown) actions.current?.querySelector('button')?.focus({ preventScroll: true })
  }, [shown])

  if (!rect) return null
  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby={labelId} className="fixed inset-0 z-50">
      <div className="spotlight-dim absolute inset-0 bg-black/70" onClick={onClose} aria-hidden="true" />
      <div
        id={labelId}
        className="spotlight-lit absolute rounded-2xl bg-paper shadow-[0_0_0_4px_var(--color-sun),0_0_48px_12px_rgb(245_213_71/0.55)]"
        style={{ top: rect.top, left: rect.left, width: rect.width }}
      >
        {children}
      </div>
      <div ref={actions} className="spotlight-lit absolute flex justify-end" style={{ top: rect.bottom + 16, left: rect.left, width: rect.width }}>
        <Button onClick={onClose}>
          {actionLabel}
        </Button>
      </div>
    </div>,
    document.body,
  )
}
