// Pengaturan hitungan per toko: target untung dan nasib barang retur. Fungsi murni (tanpa Supabase).
import { ADS_TARGET_PROFIT, PRICE_TARGET_MARGIN, type Targets } from './adsMath'

/** Baris tabel store_settings. Kolom kosong (null) = pakai nilai bawaan. */
export interface StoreSettingsRow {
  store_id: number
  ads_target_profit_pct: number | null
  price_target_margin_pct: number | null
  return_recovery_pct: number | null
}

/** Pengaturan yang sudah terisi bawaan, dalam pecahan 0–1. */
export interface StoreSettings {
  /** Untung yang diinginkan setelah iklan, dari harga jual. */
  adsTargetProfit: number
  /** Untung yang diinginkan dari harga jual, sebelum iklan. */
  priceTargetMargin: number
  /** Porsi barang retur yang bisa dijual lagi. 1 = semua kembali ke stok. */
  returnRecovery: number
}

export const DEFAULT_SETTINGS: StoreSettings = {
  adsTargetProfit: ADS_TARGET_PROFIT,
  priceTargetMargin: PRICE_TARGET_MARGIN,
  returnRecovery: 1,
}

/** Bentuk yang diisi di formulir (persen, bukan pecahan). */
export interface SettingsPercent {
  adsTargetProfitPct: number
  priceTargetMarginPct: number
  returnRecoveryPct: number
}

const num = (v: number | string | null | undefined) => (v === null || v === undefined ? null : Number(v))

export function resolveSettings(row: Partial<StoreSettingsRow> | null | undefined): StoreSettings {
  const ads = num(row?.ads_target_profit_pct)
  const price = num(row?.price_target_margin_pct)
  const recovery = num(row?.return_recovery_pct)
  return {
    adsTargetProfit: ads === null ? DEFAULT_SETTINGS.adsTargetProfit : ads / 100,
    priceTargetMargin: price === null ? DEFAULT_SETTINGS.priceTargetMargin : price / 100,
    returnRecovery: recovery === null ? DEFAULT_SETTINGS.returnRecovery : recovery / 100,
  }
}

export function settingsToPercent(s: StoreSettings): SettingsPercent {
  // Dibulatkan supaya 0.05 × 100 tidak tampil 5.000000000000001.
  const pct = (v: number) => Math.round(v * 10000) / 100
  return {
    adsTargetProfitPct: pct(s.adsTargetProfit),
    priceTargetMarginPct: pct(s.priceTargetMargin),
    returnRecoveryPct: pct(s.returnRecovery),
  }
}

export function targetsOf(s: StoreSettings): Targets {
  return { adsProfit: s.adsTargetProfit, priceMargin: s.priceTargetMargin }
}

/** Pesan kesalahan untuk isian pengaturan, atau null kalau semuanya benar. Batas sama dengan check di database. */
export function validateSettings(v: SettingsPercent): string | null {
  const ok = (n: number, min: number, max: number) => Number.isFinite(n) && n >= min && n <= max
  if (!ok(v.adsTargetProfitPct, 0, 50)) return 'Target untung setelah iklan harus antara 0% dan 50%.'
  if (!ok(v.priceTargetMarginPct, 0, 90)) return 'Target untung harga jual harus antara 0% dan 90%.'
  if (!ok(v.returnRecoveryPct, 0, 100)) return 'Barang retur yang bisa dijual lagi harus antara 0% dan 100%.'
  return null
}
