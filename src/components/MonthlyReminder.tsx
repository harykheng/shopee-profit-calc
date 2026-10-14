// Pengingat rutinitas bulanan: kartu di atas halaman kalau rekap bulan lalu belum lengkap.
import { useEffect, useRef, useState } from 'react'
import { fetchMonthlyRecap, fetchReconciliation, hasRecapBefore } from '../lib/api'
import { onDataChanged } from '../lib/events'
import { addMonths, currentMonth } from '../lib/format'
import { buildReminder, reminderDismissKey, type MonthlyReminder } from '../lib/monthlyReminder'
import { monthStatus } from '../lib/monthStatus'
import { hrefFor, type Route } from '../lib/router'
import { wibToday } from '../lib/subscription'
import { Alert } from './ui'

function dismissedToday(storeId: number, month: string): boolean {
  try {
    return localStorage.getItem(reminderDismissKey(storeId, month)) === wibToday()
  } catch {
    return false
  }
}

/**
 * Tampil kalau bulan lalu belum lengkap (lihat buildReminder). Diperbarui saat pindah halaman dan saat
 * data baru disimpan. Gagal memuat = diam saja: pengingat tidak boleh mengganggu pekerjaan.
 * "Ingatkan besok" menyembunyikannya sampai hari berikutnya (WIB).
 */
export function MonthlyReminderCard({ storeId, route }: { storeId: number; route: Route }) {
  const month = addMonths(currentMonth(), -1)
  const [reminder, setReminder] = useState<MonthlyReminder | null>(null)
  const [hidden, setHidden] = useState(() => dismissedToday(storeId, month))
  const [tick, setTick] = useState(0)
  const latest = useRef(0)

  useEffect(() => onDataChanged(() => setTick((n) => n + 1)), [])
  useEffect(() => setHidden(dismissedToday(storeId, month)), [storeId, month])

  useEffect(() => {
    const run = ++latest.current
    Promise.all([fetchMonthlyRecap(storeId, month, month), fetchReconciliation(storeId, month, month), hasRecapBefore(storeId, month)])
      .then(([recap, days, earlier]) => {
        if (run !== latest.current) return
        const status = recap[0] ? monthStatus(recap[0], days) : null
        setReminder(buildReminder({ month, status, hadEarlierData: earlier }))
      })
      .catch(() => {
        if (run === latest.current) setReminder(null)
      })
  }, [storeId, month, route, tick])

  if (!reminder || hidden) return null

  return (
    <div className="mb-6">
      <Alert tone="info" title={reminder.title}>
        <ul className="mt-1 space-y-2">
          {reminder.items.map((i) => (
            <li key={i.key} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="min-w-0 flex-1">{i.text}</span>
              <a
                href={hrefFor(i.route, i.params)}
                className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-stamp px-4 text-sm font-semibold text-white transition active:scale-[0.97]"
              >
                {i.action}
              </a>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="mt-3 min-h-11 text-sm font-semibold text-stamp-strong underline"
          onClick={() => {
            try {
              localStorage.setItem(reminderDismissKey(storeId, month), wibToday())
            } catch {
              // mode privat: sembunyikan saja sampai halaman dimuat ulang
            }
            setHidden(true)
          }}
        >
          Ingatkan besok
        </button>
      </Alert>
    </div>
  )
}
