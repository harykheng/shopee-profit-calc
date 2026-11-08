// Login pertama untuk toko yang dibuat tanpa nama (halaman Pengelola): pemilik mengisi nama tokonya sendiri.
import { useId, useState, type FormEvent } from 'react'
import { setStoreName } from '../lib/api'
import { friendlyError } from '../lib/errors'
import { cleanStoreName, validateStoreName } from '../lib/trialAccounts'
import { Button, Modal, inputClass } from './ui'

export function StoreNameModal({ storeId, onSaved }: { storeId: number; onSaved: (name: string) => void }) {
  const titleId = useId()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const problem = validateStoreName(name)
    setError(problem)
    if (problem) return
    setBusy(true)
    try {
      const clean = cleanStoreName(name)
      await setStoreName(storeId, clean)
      onSaved(clean)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  // Tidak bisa ditutup tanpa mengisi: nama toko dipakai untuk mencocokkan laporan Shopee yang di-upload.
  return (
    <Modal labelledBy={titleId} onClose={() => {}} dismissible={false}>
      <form onSubmit={submit} noValidate>
        <h2 id={titleId} className="font-display text-2xl font-extrabold tracking-tight">
          Apa nama tokomu di Shopee?
        </h2>
        <p className="mt-3 text-ink-2">
          Tulis persis seperti di Seller Centre. Nama ini dicocokkan dengan laporan yang kamu upload, supaya data tidak
          masuk ke toko yang salah.
        </p>
        <label className="mt-4 block font-semibold">
          Nama toko
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            autoComplete="organization"
            placeholder="mis. Toko Cantik Official"
            className={`mt-1.5 font-normal ${inputClass}`}
          />
        </label>
        {error && (
          <p className="mt-2 text-sm font-semibold text-loss" role="alert">
            {error}
          </p>
        )}
        <p className="mt-3 text-sm text-ink-3">Hanya bisa diisi sekali. Kalau salah, hubungi admin untuk menggantinya.</p>
        <div className="mt-5">
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Menyimpan…' : 'Simpan nama toko'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
