// Panduan pengguna baru: Upload laporan Shopee → Masukkan HPP → Lihat hasil keuntungan.
// Versi lengkap di Rekap, versi satu baris di Upload & HPP. Logikanya di lib/onboarding.ts.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { fetchSetupProgress } from '../lib/api'
import { onDataChanged } from '../lib/events'
import { formatNumber } from '../lib/format'
import {
  formatMark,
  onboardingMarkKey,
  onboardingView,
  parseMark,
  type OnboardingSteps,
  type OnboardingView,
} from '../lib/onboarding'
import type { Route } from '../lib/router'
import { wibToday } from '../lib/subscription'
import { IconArrowRight, IconCheck, IconUpload } from './icons'
import { ButtonLink, Kicker } from './ui'

export type OnboardingState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; view: OnboardingView }

function readMark(storeId: number) {
  try {
    return parseMark(localStorage.getItem(onboardingMarkKey(storeId)))
  } catch {
    return null
  }
}

/**
 * Dimuat ulang saat pindah halaman dan saat data baru disimpan. `enabled` = false untuk toko yang
 * langganannya habis (baca saja): panduan tidak relevan di sana.
 */
export function useOnboarding(storeId: number | null, route: Route, enabled: boolean): OnboardingState {
  const [state, setState] = useState<OnboardingState>({ status: 'loading' })
  const [tick, setTick] = useState(0)
  const latest = useRef(0)
  const lastStore = useRef<number | null>(null)

  useEffect(() => onDataChanged(() => setTick((n) => n + 1)), [])

  useEffect(() => {
    if (!enabled || storeId === null) return
    const run = ++latest.current
    // Ganti toko: jangan tampilkan panduan toko sebelumnya selama memuat.
    if (lastStore.current !== storeId) setState({ status: 'loading' })
    lastStore.current = storeId
    fetchSetupProgress(storeId)
      .then((counts) => {
        if (run !== latest.current) return
        const { view, mark } = onboardingView(counts, readMark(storeId), wibToday())
        if (mark) {
          try {
            localStorage.setItem(onboardingMarkKey(storeId), formatMark(mark))
          } catch {
            // mode privat: panduan tetap jalan dari data, hanya kartu selesai yang tidak muncul
          }
        }
        setState({ status: 'ready', view })
      })
      .catch(() => {
        // Gagal memuat = diam saja; Rekap tetap tampil seperti biasa.
        if (run === latest.current) setState({ status: 'error' })
      })
  }, [storeId, route, tick, enabled])

  return enabled ? state : { status: 'ready', view: { kind: 'none' } }
}

/** Panduan lengkap di Rekap: kalimat jawaban dulu, lalu tiga langkah. */
export function OnboardingGuide({ steps, storeName }: { steps: OnboardingSteps; storeName: string }) {
  const { current } = steps
  const headline =
    current === 1 ? (
      <>
        Mulai dengan <span className="hl">3 langkah</span> ini.
      </>
    ) : (
      <>
        Tinggal <span className="hl">isi HPP</span>, lalu untungmu terlihat.
      </>
    )
  const lead =
    current === 1
      ? steps.ordersDone
        ? 'Export pesanan sudah masuk. Satu file lagi: laporan penghasilan.'
        : steps.incomeDone
          ? 'Laporan penghasilan sudah masuk. Satu file lagi: export pesanan.'
          : `Untung bersih ${storeName} muncul di sini setelah langkah ini selesai. Setelah itu, tiap bulan cukup upload file terbaru.`
      : `${formatNumber(steps.missingHppCount)} dari ${formatNumber(steps.productCount)} produk belum punya HPP (modal per barang). Tanpa HPP, untung terlihat lebih besar dari aslinya.`

  return (
    <section aria-labelledby="onboarding-title" className="space-y-6">
      <div>
        <Kicker>Langkah awal {storeName}</Kicker>
        <h1 id="onboarding-title" className="mt-3 font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">
          {headline}
        </h1>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-ink-2">{lead}</p>
      </div>
      <div className="rounded-3xl bg-paper p-4 shadow-sheet ring-1 ring-line sm:p-6">
        <Progress done={steps.doneCount} />
        <ol className="mt-5 grid gap-4 lg:grid-cols-3">
          <Step n={1} current={current} title="Upload laporan Shopee">
            <ul className="space-y-2 text-sm">
              <FileLine done={steps.ordersDone} name="Export pesanan">
                (.xlsx): Pesanan Saya → Export, status <strong className="text-ink">Semua</strong>.
              </FileLine>
              <FileLine done={steps.incomeDone} name="Penghasilan">
                (.xlsx): Keuangan → Penghasilan Saya → <strong className="text-ink">Sudah Dilepas</strong> → Export. PDF
                laporan bulanan juga bisa.
              </FileLine>
            </ul>
            {current === 1 && (
              <ButtonLink href="#/upload" className="mt-1 self-start font-display font-bold">
                <IconUpload size={18} />
                {steps.ordersDone || steps.incomeDone ? 'Upload file berikutnya' : 'Upload laporan'}
              </ButtonLink>
            )}
          </Step>
          <Step n={2} current={current} title="Masukkan HPP">
            <p className="text-sm text-ink-2">
              {steps.hppDone && current > 2
                ? 'Semua produk sudah punya harga modal.'
                : current === 2
                  ? 'Harga modal per barang. Daftar produknya sudah otomatis dari export pesanan.'
                  : 'Harga modal per barang. Daftar produknya muncul sendiri setelah export pesanan di-upload.'}
            </p>
            {current === 2 && (
              <ButtonLink href="#/hpp?kosong=1" className="mt-1 self-start font-display font-bold">
                Isi HPP
                <IconArrowRight size={18} />
              </ButtonLink>
            )}
          </Step>
          <Step n={3} current={current} title="Lihat hasil keuntungan">
            <p className="text-sm text-ink-2">Untung bersih per bulan dan per produk, plus iklan mana yang rugi.</p>
          </Step>
        </ol>
      </div>
    </section>
  )
}

/** Kartu di Rekap pada hari langkah awal selesai. Angka untungnya ada di Nota di bawahnya (tidak diulang). */
export function OnboardingFinished({ storeName }: { storeName: string }) {
  return (
    <div className="mb-8 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl bg-mintbg px-4 py-3 sm:px-5">
      <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gain text-white">
        <IconCheck size={18} strokeWidth={3} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink">3 dari 3 langkah selesai.</p>
        <p className="text-sm text-ink-2">
          Ini rekap pertama {storeName}. Bulan depan cukup upload file terbaru; pengingat muncul kalau ada yang kurang.
        </p>
      </div>
    </div>
  )
}

/** Versi satu baris di halaman Upload & HPP: langkah ke berapa, dan tombol ke langkah berikutnya. */
export function OnboardingStrip({ view, route }: { view: OnboardingView; route: Route }) {
  if (view.kind === 'none') return null
  const current = view.kind === 'guide' ? view.steps.current : 3
  const done = view.kind === 'guide' ? view.steps.doneCount : 2
  const next =
    current === 1
      ? route === 'upload'
        ? null
        : { href: '#/upload', label: 'Upload laporan' }
      : current === 2
        ? route === 'hpp'
          ? null
          : { href: '#/hpp?kosong=1', label: 'Isi HPP' }
        : { href: '#/rekap', label: 'Lihat hasil keuntungan' }
  const text =
    current === 1
      ? 'Langkah 1 dari 3: upload export pesanan dan laporan penghasilan.'
      : current === 2
        ? 'Langkah 2 dari 3: isi HPP produk yang masih kosong.'
        : 'Laporan dan HPP sudah lengkap. Untung bersihmu sudah dihitung.'

  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl bg-tint px-4 py-3 ring-1 ring-line">
      <StepDots done={done} current={current} />
      <p className="min-w-[14rem] flex-1 font-semibold text-ink">{text}</p>
      {next && (
        <a
          href={next.href}
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-accent px-4 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-accent-hover active:translate-y-px"
        >
          {next.label}
          <IconArrowRight size={16} />
        </a>
      )}
    </div>
  )
}

function Progress({ done }: { done: number }) {
  return (
    <div className="flex items-center gap-3 text-sm font-semibold text-ink-2">
      <span className="shrink-0">{formatNumber(done)} dari 3 selesai</span>
      <div aria-hidden="true" className="h-2 flex-1 overflow-hidden rounded-full bg-tint">
        <div className="h-full rounded-full bg-gain transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${(done / 3) * 100}%` }} />
      </div>
    </div>
  )
}

function StepDots({ done, current }: { done: number; current: number }) {
  return (
    <span aria-hidden="true" className="flex shrink-0 gap-1.5">
      {[1, 2, 3].map((n) => (
        <span
          key={n}
          className={`flex size-7 items-center justify-center rounded-full font-display text-sm font-bold ${
            n <= done ? 'bg-gain text-white' : n === current ? 'bg-ink text-paper' : 'bg-rule text-paper'
          }`}
        >
          {n <= done ? <IconCheck size={14} strokeWidth={3} /> : n}
        </span>
      ))}
    </span>
  )
}

function Step({ n, current, title, children }: { n: number; current: number; title: string; children: ReactNode }) {
  const state = n < current ? 'done' : n === current ? 'now' : 'wait'
  const box = {
    done: 'bg-mintbg',
    now: 'bg-paper ring-2 ring-ink',
    wait: 'bg-tint',
  }[state]
  const badge = {
    done: 'bg-gain text-white',
    now: 'bg-ink text-paper',
    wait: 'bg-rule text-paper',
  }[state]
  const label = { done: 'Selesai', now: 'Sekarang', wait: 'Nanti' }[state]
  return (
    <li className={`flex min-w-0 flex-col gap-3 rounded-2xl p-5 ${box}`} aria-current={state === 'now' ? 'step' : undefined}>
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className={`num flex size-9 shrink-0 items-center justify-center rounded-full font-display text-lg font-bold ${badge}`}>
          {state === 'done' ? <IconCheck size={18} strokeWidth={3} /> : n}
        </span>
        <span
          className={`text-xs font-bold uppercase tracking-wider ${
            state === 'now' ? 'rounded-md bg-sun-tint px-2 py-0.5 text-sun-ink' : state === 'done' ? 'text-gain' : 'text-ink-3'
          }`}
        >
          {label}
        </span>
      </div>
      <p className={`font-display text-xl font-bold leading-snug ${state === 'wait' ? 'text-ink-3' : ''}`}>{title}</p>
      {children}
    </li>
  )
}

/** File yang sudah tersimpan cukup disebut namanya; cara download-nya hanya untuk yang belum. */
function FileLine({ done, name, children }: { done: boolean; name: string; children: ReactNode }) {
  return (
    <li className="flex gap-2">
      <span aria-hidden="true" className={`mt-0.5 shrink-0 font-bold ${done ? 'text-gain' : 'text-ink-3'}`}>
        {done ? <IconCheck size={16} strokeWidth={3} /> : '○'}
      </span>
      <span className="min-w-0 text-ink-2">
        {name}
        {done ? <span className="font-semibold text-gain"> tersimpan.</span> : <> {children}</>}
      </span>
    </li>
  )
}
