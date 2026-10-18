// Biaya tambahan di Simulasi Harga: biaya lain yang diisi sendiri
// (mis. komisi affiliate %, biaya layanan Rp per order).

export interface ExtraFee {
  id: string
  name: string
  value: number | null
  unit: 'pct' | 'rp'
}

/** Jumlah biaya tambahan: persen (dari harga jual) dan rupiah per order. */
export function extraFeeTotals(fees: ExtraFee[]): { pct: number; rp: number } {
  let pct = 0
  let rp = 0
  for (const f of fees) {
    if (f.value === null) continue
    if (f.unit === 'pct') pct += f.value
    else rp += f.value
  }
  return { pct, rp }
}

export const extraFeeLabel = (f: ExtraFee) => f.name.trim() || 'Biaya tambahan'
