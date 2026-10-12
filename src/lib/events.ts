// Kabar sederhana antar halaman: "data baru saja disimpan" (upload, biaya), supaya pengingat bulanan
// langsung diperbarui tanpa menunggu pindah halaman.
const DATA_CHANGED = 'profit-data-changed'

export function notifyDataChanged() {
  window.dispatchEvent(new Event(DATA_CHANGED))
}

/** Berlangganan kabar data berubah. Mengembalikan fungsi untuk berhenti. */
export function onDataChanged(handler: () => void): () => void {
  window.addEventListener(DATA_CHANGED, handler)
  return () => window.removeEventListener(DATA_CHANGED, handler)
}
