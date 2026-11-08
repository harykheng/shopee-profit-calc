import { QUICK_CHECK_TRIAL_NOTE } from '../lib/trialLimits'
import type { ReactNode } from 'react'
import { Alert, ErrorBox, linkClass } from './ui'
import { IconAlertCircle, IconCheck, IconChevronDown, IconInfo } from './icons'
import { saveAdReport, saveAdsExpense } from '../lib/api'
import { fullMonthOf } from '../lib/adsMath'
import { formatDate, formatMonth, formatRupiah, periodDays } from '../lib/format'
import { ParseError } from '../lib/parsers/common'
import { parseAdsCsv, type AdsParseResult } from '../lib/parsers/ads'

// Bagian upload data iklan (CSV) yang dipakai di halaman Upload.

export type ParsedAdsFile = { fileName: string; result?: AdsParseResult; error?: unknown }

/** File-file yang dipilih, dikelompokkan per periode. */
export interface AdsFileGroup {
  key: string
  start: string
  end: string
  files: AdsParseResult[]
  /** "YYYY-MM-01" kalau periodenya tepat 1 bulan penuh. */
  month: string | null
  /** Periode melewati lebih dari 1 bulan (mis. 1 Agu – 30 Sep). */
  multiMonth: boolean
  keseluruhan: AdsParseResult | undefined
  /** Jenis file yang dipilih dua kali untuk periode ini. */
  duplicate: string | undefined
}

export interface SavedAdsPeriod {
  key: string
  files: number
  replaced: number
  expense: { month: string; amount: number } | null
  skipped: 'weekly' | 'multi_month' | 'no_keseluruhan' | null
}

export const periodKey = (start: string, end: string) => `${start}|${end}`

/** "1 Jul 2026 – 31 Jul 2026" → "1–31 Jul 2026" kalau bulan sama. */
export function formatPeriod(start: string, end: string): string {
  const a = formatDate(start)
  const b = formatDate(end)
  if (start.slice(0, 7) === end.slice(0, 7)) return `${a.split(' ')[0]}–${b}`
  return `${a} – ${b}`
}

export async function parseAdsFiles(list: File[]): Promise<ParsedAdsFile[]> {
  const parsed: ParsedAdsFile[] = []
  for (const file of list) {
    try {
      if (!/\.csv$/i.test(file.name)) {
        throw new ParseError('Pilih file .csv dari Iklan Saya → Download Data.')
      }
      parsed.push({ fileName: file.name, result: parseAdsCsv(await file.text()) })
    } catch (error) {
      parsed.push({ fileName: file.name, error })
    }
  }
  return parsed
}

export function groupAdsFiles(results: AdsParseResult[]): AdsFileGroup[] {
  const map = new Map<string, AdsParseResult[]>()
  for (const r of results) {
    const key = periodKey(r.periodStart, r.periodEnd)
    map.set(key, [...(map.get(key) ?? []), r])
  }
  return [...map.entries()]
    .map(([key, files]) => {
      const { periodStart: start, periodEnd: end } = files[0]
      const sources = files.map((f) => f.source)
      const dup = sources.find((x, i) => sources.indexOf(x) !== i)
      return {
        key,
        start,
        end,
        files,
        month: fullMonthOf(start, end),
        multiMonth: start.slice(0, 7) !== end.slice(0, 7),
        keseluruhan: files.find((f) => f.source === 'keseluruhan'),
        duplicate: dup ? files.find((f) => f.source === dup)?.sourceLabel : undefined,
      }
    })
    .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end))
}

/** Masalah yang membuat data iklan tidak boleh disimpan, atau null. */
export function adsProblem(groups: AdsFileGroup[]): string | null {
  const dup = groups.find((g) => g.duplicate)
  return dup
    ? `Ada 2 file jenis "${dup.duplicate}" untuk periode ${formatPeriod(dup.start, dup.end)}. Pilih salah satu saja.`
    : null
}

/** Simpan semua periode iklan; Biaya Iklan Shopee diisi kalau ada Data Keseluruhan 1 bulan penuh. */
export async function saveAdsGroups(storeId: number, groups: AdsFileGroup[]): Promise<SavedAdsPeriod[]> {
  const out: SavedAdsPeriod[] = []
  for (const g of groups) {
    let replaced = 0
    for (const r of g.files) {
      const res = await saveAdReport(storeId, r)
      if (res.replaced) replaced++
    }
    let expense: SavedAdsPeriod['expense'] = null
    if (g.month && g.keseluruhan) {
      await saveAdsExpense(
        storeId,
        g.month,
        g.keseluruhan.totalSpend,
        `Otomatis dari data iklan (upload ${formatDate(new Date().toISOString())})`,
      )
      expense = { month: g.month, amount: g.keseluruhan.totalSpend }
    }
    out.push({
      key: g.key,
      files: g.files.length,
      replaced,
      expense,
      skipped: expense ? null : g.multiMonth ? 'multi_month' : g.month ? 'no_keseluruhan' : 'weekly',
    })
  }
  return out
}

/** Apa yang terjadi dengan satu kelompok file di halaman Upload (hanya 1 bulan penuh yang disimpan). */
function expenseNote(g: AdsFileGroup, trial: boolean): { tone: 'info' | 'warning' | 'success'; text: ReactNode } {
  if (g.month && g.keseluruhan) {
    return {
      tone: 'success',
      text: (
        <>
          Biaya Iklan Shopee {formatMonth(g.month)} diisi otomatis: <strong>{formatRupiah(g.keseluruhan.totalSpend)}</strong>
        </>
      ),
    }
  }
  if (g.multiMonth) {
    return {
      tone: 'warning',
      text: (
        <>
          <strong>Tidak disimpan.</strong> File ini berisi total beberapa bulan sekaligus dan Shopee tidak memberi rincian
          per bulan. Download data iklan <strong>per bulan</strong> (tanggal 1 – akhir bulan), lalu pilih semua filenya
          sekaligus di sini.
        </>
      ),
    }
  }
  if (g.month) {
    return {
      tone: 'warning',
      text: (
        <>
          File <strong>Data Keseluruhan</strong> tidak ada, jadi Biaya Iklan Shopee {formatMonth(g.month)} belum diisi.
        </>
      ),
    }
  }
  return {
    tone: 'info',
    text: (
      <>
        <strong>Tidak disimpan:</strong> ini data {periodDays(g.start, g.end)} hari. Halaman Upload hanya menyimpan data 1
        bulan penuh.{' '}
        {trial ? (
          QUICK_CHECK_TRIAL_NOTE
        ) : (
          <>
            Untuk cek iklan beberapa hari, pakai{' '}
            <a href="#/iklan?cek=1" className={linkClass}>
              Cek cepat di halaman Iklan
            </a>
            .
          </>
        )}
      </>
    ),
  }
}

export function AdsHowTo() {
  return (
    <details className="mb-4 rounded-2xl bg-tint px-4 py-2 text-ink-2">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-semibold text-ink">
        <IconInfo size={18} className="shrink-0 text-accent" />
        Cara ambil file dari Shopee
        <IconChevronDown size={16} className="chev" />
      </summary>
      <ol className="mb-2 mt-1 list-decimal space-y-2 pl-6">
        <li>
          Seller Centre → <strong>Iklan Saya</strong> → <strong>Download Data</strong>.
        </li>
        <li>
          Pilih periode: <strong>1 bulan penuh</strong> (tanggal 1 – akhir bulan) supaya Biaya iklan terisi otomatis,
          atau <strong>7 hari</strong> untuk cek mingguan. Mau beberapa bulan? Download <strong>per bulan</strong>{' '}
          (file 2 bulan sekaligus tidak bisa dipecah per bulan), lalu pilih semua filenya sekaligus.
        </li>
        <li>
          Untuk tiap periode, download file ini, lalu pilih semuanya sekaligus di bawah:
          <ul className="mt-1 list-disc pl-6">
            <li>
              <strong>Data Keseluruhan</strong>: total semua iklan (untuk Biaya)
            </li>
            <li>
              <strong>Rincian Data Iklan Produk Otomatis</strong>: biaya per produk
            </li>
            <li>
              <strong>Semua Data Grup Iklan</strong>: kalau memakai grup iklan
            </li>
          </ul>
        </li>
      </ol>
    </details>
  )
}

/** Preview file iklan yang dipilih: error per file, lalu ringkasan per periode dan peringatan toko. */
export function AdsPreview({
  files,
  groups,
  problem,
  elsewhere,
  storeName,
  trial = false,
}: {
  files: ParsedAdsFile[]
  groups: AdsFileGroup[]
  problem: string | null
  elsewhere: { shop: string; storeName: string } | null
  storeName: string | undefined
  /** Toko uji coba: Cek cepat tidak tersedia, jadi tidak ditautkan. */
  trial?: boolean
}) {
  const shopNames = new Set(groups.flatMap((g) => g.files.map((r) => r.shopName)).filter(Boolean))
  return (
    <>
      {files.some((f) => f.error) && (
        <ul className="mt-4 space-y-3">
          {files
            .filter((f) => f.error)
            .map((f) => (
              <li key={f.fileName} className="rounded-2xl bg-tint p-4">
                <p className="break-all text-sm text-ink-2">{f.fileName}</p>
                <div className="mt-2">
                  <ErrorBox error={f.error} reportFile={{ kind: 'data iklan', fileName: f.fileName }} />
                </div>
              </li>
            ))}
        </ul>
      )}

      {groups.map((g) => {
        const note = expenseNote(g, trial)
        return (
          <section key={g.key} className="mt-4 rounded-2xl bg-tint p-4">
            <h3 className="font-semibold">
              Periode {formatPeriod(g.start, g.end)}
              {g.month && <span className="ml-2 text-base font-normal text-ink-2">(1 bulan penuh)</span>}
            </h3>
            <ul className="mt-2 space-y-2">
              {g.files.map((r, i) => (
                <li key={`${r.source}-${i}`}>
                  <p className="flex items-center gap-2 font-semibold">
                    <IconCheck size={18} className="text-gain" />
                    {r.sourceLabel}
                  </p>
                  <p className="text-ink-2">
                    Toko di file: {r.shopName || '-'} · Total biaya <strong>{formatRupiah(r.totalSpend)}</strong>
                    {r.productCount > 0 && ` · ${r.productCount} produk dengan biaya`}
                  </p>
                  {r.warnings.map((w) => (
                    <p key={w.code} className="mt-1 flex gap-2 text-warn">
                      <IconAlertCircle size={18} className="mt-0.5 shrink-0" />
                      {w.message}
                    </p>
                  ))}
                </li>
              ))}
            </ul>
            <div className="mt-3">
              <Alert tone={note.tone}>{note.text}</Alert>
            </div>
          </section>
        )
      })}

      {problem && (
        <div className="mt-4">
          <Alert tone="error">{problem}</Alert>
        </div>
      )}
      {shopNames.size > 1 && (
        <div className="mt-4">
          <Alert tone="warning">File-file ini dari toko yang berbeda ({[...shopNames].join(', ')}). Cek lagi.</Alert>
        </div>
      )}
      {elsewhere && (
        <div className="mt-4">
          <Alert tone="warning" title="Cek toko dulu">
            Data iklan toko "{elsewhere.shop}" sebelumnya disimpan ke <strong>{elsewhere.storeName}</strong>. Sekarang
            akan disimpan ke <strong>{storeName}</strong>. Kalau salah, ganti toko di pilihan Toko pada menu.
          </Alert>
        </div>
      )}
    </>
  )
}

/** Hasil simpan data iklan, satu baris per periode. */
export function AdsSavedList({ saved }: { saved: SavedAdsPeriod[] }) {
  return (
    <ul className="mt-2 space-y-1">
      {saved.map((p) => {
        const [start, end] = p.key.split('|')
        return (
          <li key={p.key}>
            <strong>{formatPeriod(start, end)}</strong>:{' '}
            {p.expense
              ? `Biaya Iklan Shopee ${formatMonth(p.expense.month)} diisi otomatis ${formatRupiah(p.expense.amount)}.`
              : p.skipped === 'multi_month'
                ? 'total beberapa bulan, hanya untuk analisis (Biaya tidak diisi).'
                : p.skipped === 'no_keseluruhan'
                  ? 'Biaya belum diisi karena file Data Keseluruhan tidak ada.'
                  : 'hanya untuk analisis (Biaya tidak diubah).'}
            {p.replaced > 0 && ` ${p.replaced} file menggantikan upload sebelumnya (tidak dobel).`}
          </li>
        )
      })}
    </ul>
  )
}
