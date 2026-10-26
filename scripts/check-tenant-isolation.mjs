// Uji pemisahan data antar-toko di project Supabase yang SEDANG JALAN (bukan membaca SQL).
//
// Login sebagai dua akun tes (A dan B, masing-masing punya toko sendiri), lalu sebagai A mencoba
// membaca, mengubah, menghapus, dan menulis data toko B, memanggil fungsi admin dan fungsi halaman
// Pengelola (membuat akun, daftar pelanggan), dan memperpanjang langganannya sendiri. Akun A dan B harus
// akun tes biasa, BUKAN pengelola. Juga mencoba membaca tanpa login. Semua percobaan itu HARUS ditolak atau
// kosong. Hasil: tabel LULUS / GAGAL / CEK / DILEWATI, kode keluar 1 kalau ada yang GAGAL atau CEK.
//
// Pakai dua akun TES (bukan pelanggan sungguhan). Skrip ini menulis satu baris penanda ke toko B
// lewat akun B sendiri (biaya bulan Januari 1999) dan menghapusnya lagi di akhir. Kalau ada celah dan
// sebuah percobaan A ternyata berhasil menulis, skrip menghapus tulisan itu dan melaporkannya GAGAL.
// Fungsi admin dipanggil hanya dengan argumen yang tidak bisa merusak (hapus toko: mode hitung saja
// dan nama toko yang sengaja salah).
//
// Cara pakai (lihat README bagian 8, "Uji pemisahan data antar-toko"):
//   TEST_A_EMAIL=... TEST_A_PASSWORD=... TEST_B_EMAIL=... TEST_B_PASSWORD=... npm run check:tenants
// URL dan kunci diambil dari SUPABASE_URL / SUPABASE_ANON_KEY, atau VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.
import { createClient } from '@supabase/supabase-js'

const MARK = 'uji-pemisahan-toko'
const CANARY_MONTH = '1999-01-01'

const env = (...names) => names.map((n) => process.env[n]?.trim()).find(Boolean) ?? ''
const url = env('SUPABASE_URL', 'VITE_SUPABASE_URL')
const anonKey = env('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY')
const creds = {
  A: { email: env('TEST_A_EMAIL'), password: env('TEST_A_PASSWORD') },
  B: { email: env('TEST_B_EMAIL'), password: env('TEST_B_PASSWORD') },
}

function die(message) {
  console.error(`\n${message}\n`)
  process.exit(2)
}

if (!url || !anonKey) die('Isi SUPABASE_URL dan SUPABASE_ANON_KEY (atau jalankan dengan --env-file=.env.local).')
if (!creds.A.email || !creds.A.password || !creds.B.email || !creds.B.password) {
  die('Isi TEST_A_EMAIL, TEST_A_PASSWORD, TEST_B_EMAIL, TEST_B_PASSWORD: dua akun tes dengan toko berbeda.')
}
if (creds.A.email.toLowerCase() === creds.B.email.toLowerCase()) die('Akun A dan B harus berbeda.')

const newClient = () => createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })

// --- Hasil -------------------------------------------------------------------------

const results = []
const record = (status, name, detail = '') => results.push({ status, name, detail })
const pass = (name, detail) => record('LULUS', name, detail)
const fail = (name, detail) => record('GAGAL', name, detail)
const skip = (name, detail) => record('DILEWATI', name, detail)
/** Hasil yang tidak bisa disimpulkan (error lain): belum terbukti aman, perlu dicek manual. */
const check = (name, detail) => record('CEK', name, detail)

/** Ditolak database: tidak punya hak, atau melanggar aturan RLS. */
const isDenied = (error) =>
  !!error &&
  (error.code === '42501' ||
    /permission denied|row-level security|not allowed|violates row-level/i.test(error.message ?? ''))

/** Tabel/fungsi belum ada di project ini (migration belum dijalankan): tidak bisa diuji. */
const isMissing = (error) =>
  !!error && (['42P01', 'PGRST202', 'PGRST205', '42883'].includes(error.code) || /does not exist|could not find/i.test(error.message ?? ''))

const short = (error) => (error ? `${error.code ?? ''} ${error.message ?? ''}`.trim().slice(0, 140) : '')

// --- Persiapan ---------------------------------------------------------------------

async function signIn(label) {
  const client = newClient()
  const { data, error } = await client.auth.signInWithPassword(creds[label])
  if (error || !data.user) die(`Login akun ${label} (${creds[label].email}) gagal: ${short(error)}`)
  const { data: stores, error: storesError } = await client.from('stores').select('id, name, active_until').order('id')
  if (storesError) die(`Akun ${label} gagal membaca daftar toko: ${short(storesError)}`)
  if (!stores?.length) die(`Akun ${label} belum terhubung ke toko mana pun (store_members).`)
  return { client, user: data.user, stores, storeIds: new Set(stores.map((s) => s.id)) }
}

console.log(`Project: ${url}`)
const A = await signIn('A')
const B = await signIn('B')
const shared = [...A.storeIds].filter((id) => B.storeIds.has(id))
if (shared.length) die(`Akun A dan B sama-sama anggota toko ${shared.join(', ')}. Pakai dua akun dengan toko yang berbeda.`)

const storeA = A.stores[0]
const storeB = B.stores[0]
console.log(`Akun A: ${creds.A.email} → toko ${[...A.storeIds].join(', ')}`)
console.log(`Akun B: ${creds.B.email} → toko ${[...B.storeIds].join(', ')} (target: toko ${storeB.id})\n`)

// Langganan habis membuat toko jadi baca saja. Kalau toko A habis, kontrol positif gagal; kalau toko B habis,
// penanda tidak bisa ditulis. Keduanya membuat sebagian uji tidak bisa disimpulkan, jadi diberi tahu di awal.
const todayWib = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)
for (const [label, store] of [['A', storeA], ['B', storeB]]) {
  if (store.active_until && store.active_until < todayWib) {
    console.log(`Catatan: langganan toko ${label} (${store.id}) habis ${store.active_until}; uji tulis jadi kurang lengkap.\n`)
  }
}

// Tabel dan view yang punya kolom store_id. "view" diuji juga karena view tanpa security_invoker
// melewati RLS.
const STORE_TABLES = [
  'products',
  'order_items',
  'income',
  'income_adjustments',
  'income_orders',
  'expenses',
  'ad_reports',
  'fee_categories',
  'store_settings',
  'store_members',
  'monthly_recap',
  'product_monthly_recap',
  'order_item_income',
  'income_order_match',
  'income_product_monthly',
  'income_monthly_breakdown',
  'daily_reconciliation',
  'orders_by_created',
]

// --- Baris penanda di toko B (ditulis B sendiri), supaya percobaan baca/ubah/hapus A punya sasaran ---

let canaryId = null
{
  const { data, error } = await B.client
    .from('expenses')
    .upsert(
      { store_id: storeB.id, month: CANARY_MONTH, category: 'lain_lain', amount: 1, note: MARK },
      { onConflict: 'store_id,month,category' },
    )
    .select('id')
    .single()
  if (error) {
    console.log(`Catatan: akun B tidak bisa menulis penanda (${short(error)}). Uji ubah/hapus lewat penanda dilewati.`)
    console.log('         (Biasanya karena langganan toko B sudah habis: toko B jadi baca saja.)\n')
  } else canaryId = data.id
}

/**
 * Hapus semua jejak uji: kontrol di toko A (lewat A), dan apa pun yang lolos ke toko B (lewat B, pemiliknya).
 * Penanda biaya bulan 1999 milik B hanya dihapus di akhir (`final`).
 */
async function cleanup(final = false) {
  const targets = [
    [A.client, storeA.id],
    [B.client, storeB.id],
    [A.client, storeB.id],
  ]
  for (const [client, storeId] of targets) {
    await client.from('expenses').delete().eq('store_id', storeId).eq('month', CANARY_MONTH).eq('category', 'meta_ads')
    if (final || storeId !== storeB.id) {
      await client.from('expenses').delete().eq('store_id', storeId).eq('month', CANARY_MONTH).eq('category', 'lain_lain')
    }
    await client.from('income').delete().eq('store_id', storeId).eq('released_date', CANARY_MONTH)
    await client.from('income_adjustments').delete().eq('store_id', storeId).eq('released_date', CANARY_MONTH).eq('description', MARK)
    await client.from('income_orders').delete().eq('store_id', storeId).eq('order_no', MARK)
    await client.from('order_items').delete().eq('store_id', storeId).eq('order_no', MARK)
    await client.from('products').delete().eq('store_id', storeId).eq('sku', MARK)
    await client.from('fee_categories').delete().eq('store_id', storeId).eq('name', MARK)
  }
  await A.client.from('store_members').delete().eq('store_id', storeB.id).eq('user_id', A.user.id)
}

try {
  // --- 1. Membaca data toko B -------------------------------------------------------
  for (const table of STORE_TABLES) {
    const name = `A membaca ${table} milik toko B`
    const own = await B.client.from(table).select('store_id', { count: 'exact', head: true }).eq('store_id', storeB.id)
    if (isMissing(own.error)) {
      skip(name, 'tabel/view belum ada (migration belum dijalankan)')
      continue
    }
    const res = await A.client.from(table).select('*').eq('store_id', storeB.id).limit(5)
    if (isDenied(res.error)) pass(name, 'ditolak')
    else if (res.error) check(name, `error lain: ${short(res.error)}`)
    else if (res.data.length > 0) fail(name, `BOCOR: ${res.data.length}+ baris terbaca`)
    else if (!own.count) skip(name, 'kosong, tapi toko B memang belum punya data di sini (belum terbukti)')
    else pass(name, `0 baris (toko B punya ${own.count})`)
  }

  // Tanpa filter: semua yang bisa A baca harus milik toko A sendiri.
  for (const table of STORE_TABLES) {
    const name = `A membaca ${table} tanpa filter`
    const res = await A.client.from(table).select('store_id').limit(1000)
    if (isMissing(res.error)) continue
    if (isDenied(res.error)) {
      pass(name, 'ditolak')
      continue
    }
    if (res.error) {
      check(name, `error lain: ${short(res.error)}`)
      continue
    }
    const foreign = res.data.filter((r) => r.store_id != null && !A.storeIds.has(r.store_id))
    if (foreign.length) fail(name, `BOCOR: ${foreign.length} baris dari toko lain (${[...new Set(foreign.map((r) => r.store_id))].join(', ')})`)
    else pass(name, `${res.data.length} baris, semuanya milik toko A`)
  }

  // ad_rows tidak punya store_id: lewat laporan iklan milik B.
  {
    const name = 'A membaca ad_rows milik toko B'
    const reports = await B.client.from('ad_reports').select('id').eq('store_id', storeB.id).limit(50)
    if (isMissing(reports.error)) skip(name, 'tabel belum ada')
    else if (!reports.data?.length) skip(name, 'toko B belum punya data iklan (belum terbukti)')
    else {
      const res = await A.client.from('ad_rows').select('report_id').in('report_id', reports.data.map((r) => r.id)).limit(5)
      if (isDenied(res.error) || (!res.error && res.data.length === 0)) pass(name, 'ditolak / 0 baris')
      else fail(name, res.error ? short(res.error) : `BOCOR: ${res.data.length}+ baris`)
    }
  }

  {
    const name = 'A melihat toko B di daftar toko'
    const res = await A.client.from('stores').select('id').eq('id', storeB.id)
    if (isDenied(res.error) || (!res.error && res.data.length === 0)) pass(name, 'tidak terlihat')
    else fail(name, res.error ? short(res.error) : 'BOCOR: toko B terlihat')
  }

  for (const table of ['client_errors', 'client_error_summary']) {
    const name = `A membaca ${table} (laporan error semua pelanggan)`
    const res = await A.client.from(table).select('*').limit(5)
    if (isMissing(res.error)) skip(name, 'belum ada')
    else if (isDenied(res.error) || (!res.error && res.data.length === 0)) pass(name, 'ditolak / 0 baris')
    else fail(name, res.error ? short(res.error) : `BOCOR: ${res.data.length}+ baris`)
  }

  // --- 2. Mengubah dan menghapus data toko B ---------------------------------------
  if (canaryId) {
    {
      const name = 'A mengubah biaya milik toko B'
      const res = await A.client.from('expenses').update({ note: `${MARK}-diubah-A` }).eq('id', canaryId).select('id')
      if (isDenied(res.error) || (!res.error && res.data.length === 0)) pass(name, 'tidak ada baris berubah')
      else fail(name, res.error ? short(res.error) : 'BOCOR: baris toko B berhasil diubah')
    }
    {
      const name = 'A menghapus biaya milik toko B'
      const res = await A.client.from('expenses').delete().eq('id', canaryId).select('id')
      if (isDenied(res.error) || (!res.error && res.data.length === 0)) pass(name, 'tidak ada baris terhapus')
      else fail(name, res.error ? short(res.error) : 'BOCOR: baris toko B terhapus')
    }
    {
      const name = 'Penanda toko B masih utuh setelah percobaan A'
      const res = await B.client.from('expenses').select('note').eq('id', canaryId).maybeSingle()
      if (res.data?.note === MARK) pass(name, 'utuh')
      else fail(name, res.data ? `isinya berubah jadi "${res.data.note}"` : 'hilang')
    }
  } else {
    skip('A mengubah / menghapus data toko B', 'penanda tidak bisa ditulis oleh akun B')
  }

  // --- 3. Menulis ke toko B ---------------------------------------------------------
  // Tiap percobaan dijalankan dulu ke toko A sendiri (kontrol positif): kalau itu berhasil, isian datanya
  // sah, jadi penolakan di toko B memang karena pemisahan toko, bukan karena kolom yang salah.
  const writes = [
    {
      name: 'A menulis biaya ke toko B',
      run: (id) => A.client.from('expenses').insert({ store_id: id, month: CANARY_MONTH, category: 'meta_ads', amount: 0, note: MARK }),
    },
    {
      name: 'A menulis kategori admin ke toko B',
      run: (id) => A.client.from('fee_categories').insert({ store_id: id, name: MARK, admin_pct: 1 }),
    },
    {
      name: 'A upload penghasilan ke toko B (RPC upsert_income)',
      run: (id) => A.client.rpc('upsert_income', { p_store_id: id, p_rows: [{ released_date: CANARY_MONTH, total_income: 0 }] }),
    },
    {
      name: 'A upload laporan penghasilan Excel ke toko B (RPC save_income_report)',
      run: (id) =>
        A.client.rpc('save_income_report', {
          p_store_id: id,
          // Periode 1 hari penanda saja, supaya kontrol ke toko A tidak mengganti data lain.
          p_period_start: CANARY_MONTH,
          p_period_end: CANARY_MONTH,
          p_days: [{ released_date: CANARY_MONTH, total_income: 0 }],
          p_adjustments: [{ released_date: CANARY_MONTH, description: MARK, amount: 0 }],
          p_orders: [{ order_no: MARK, line_no: 1, released_date: CANARY_MONTH, total_income: 0 }],
        }),
    },
    {
      name: 'A upload pesanan ke toko B (RPC upsert_order_items)',
      run: (id) =>
        A.client.rpc('upsert_order_items', {
          p_store_id: id,
          p_items: [
            {
              order_no: MARK,
              sku: MARK,
              sku_source: 'sku',
              product_name: MARK,
              variant_name: '',
              qty: 1,
              returned_qty: 0,
              status: 'Selesai',
              status_group: 'selesai',
              return_status: '',
              completed_at: `${CANARY_MONTH}T00:00:00+07:00`,
              created_at: `${CANARY_MONTH}T00:00:00+07:00`,
              subtotal: 0,
            },
          ],
        }),
    },
    // Tanpa kontrol positif: pelanggan memang tidak boleh menulis ini sama sekali / ke toko sendiri pun dibatasi.
    { name: 'A menjadikan dirinya anggota toko B', run: (id) => A.client.from('store_members').insert({ store_id: id, user_id: A.user.id }), noControl: true },
    {
      name: 'A mengirim laporan error atas nama toko B',
      run: (id) => A.client.from('client_errors').insert({ store_id: id, kind: 'handled', message: MARK, fingerprint: MARK }),
      noControl: true,
    },
  ]
  for (const w of writes) {
    if (!w.noControl) {
      const control = await w.run(storeA.id)
      await cleanup()
      if (isMissing(control.error)) {
        skip(w.name, 'tabel/fungsi belum ada')
        continue
      }
      if (control.error) {
        check(w.name, `kontrol ke toko A sendiri gagal, uji tidak bisa disimpulkan: ${short(control.error)}`)
        continue
      }
    }
    const res = await w.run(storeB.id)
    if (isMissing(res.error)) skip(w.name, 'tabel/fungsi belum ada')
    else if (isDenied(res.error)) pass(w.name, w.noControl ? 'ditolak' : 'ditolak (ke toko A sendiri berhasil)')
    else if (res.error) check(w.name, `error lain: ${short(res.error)}`)
    else fail(w.name, 'BOCOR: berhasil menulis ke toko B (sudah dibersihkan)')
  }

  // --- 4. Memperpanjang langganan sendiri ------------------------------------------
  {
    const name = 'A memperpanjang langganan tokonya sendiri'
    const res = await A.client.from('stores').update({ active_until: '2099-12-31' }).eq('id', storeA.id).select('id')
    if (isDenied(res.error) || (!res.error && res.data.length === 0)) pass(name, 'ditolak')
    else {
      fail(name, res.error ? short(res.error) : 'BOCOR: active_until berhasil diubah pelanggan')
      if (!res.error) await A.client.from('stores').update({ active_until: storeA.active_until }).eq('id', storeA.id)
    }
  }

  // --- 5. Fungsi admin (hanya dengan argumen yang tidak bisa merusak) ---------------
  const adminCalls = [
    ['admin_export_store', { p_store_id: storeB.id }],
    ['admin_delete_store', { p_store_id: storeB.id, p_confirm_name: `${MARK}-nama-salah`, p_dry_run: true }],
    ['admin_list_orphan_users', {}],
    ['admin_purge_client_errors', { p_days: 36500 }],
    ['admin_add_customer', { p_email: `${MARK}@contoh.invalid`, p_store_name: MARK, p_active_until: null }],
    ['admin_set_platform_admin', { p_email: `${MARK}@contoh.invalid`, p_admin: false }],
  ]
  for (const [fn, args] of adminCalls) {
    const name = `A memanggil fungsi admin ${fn}`
    const res = await A.client.rpc(fn, args)
    if (res.error?.code === 'PGRST202') pass(name, 'tidak terlihat oleh pelanggan')
    else if (isDenied(res.error)) pass(name, 'ditolak')
    else fail(name, res.error ? `fungsinya BERJALAN: ${short(res.error)}` : 'BOCOR: fungsinya berjalan')
  }

  // --- 5b. Halaman Pengelola: akun biasa tidak boleh membuat akun atau melihat pelanggan ---
  {
    const name = 'A dianggap pengelola (is_platform_admin)'
    const res = await A.client.rpc('is_platform_admin')
    if (isMissing(res.error)) skip(name, 'fungsi belum ada (migration 20261026000000 belum dijalankan)')
    else if (res.error) check(name, `error lain: ${short(res.error)}`)
    else if (res.data === true) check(name, 'akun tes A adalah pengelola; pakai akun tes yang bukan pengelola')
    else pass(name, 'tidak')
  }
  const platformCalls = [
    [
      'A membuat akun lewat platform_create_trial',
      () =>
        A.client.rpc('platform_create_trial', {
          p_email: `${MARK}-bocor@contoh.invalid`,
          p_password: 'UjiPemisahan123',
          p_store_name: MARK,
          p_active_until: todayWib,
        }),
    ],
    ['A melihat daftar pelanggan lewat platform_list_customers', () => A.client.rpc('platform_list_customers')],
    ['A membaca daftar pengelola (platform_admins)', () => A.client.from('platform_admins').select('*').limit(5)],
    ['A menjadikan dirinya pengelola', () => A.client.from('platform_admins').insert({ user_id: A.user.id })],
    ['A memakai jatah simulasi toko B (use_trial_simulation)', () => A.client.rpc('use_trial_simulation', { p_store_id: storeB.id, p_key: MARK })],
    ['A membaca jatah simulasi uji coba (trial_simulations)', () => A.client.from('trial_simulations').select('*').limit(5)],
  ]
  for (const [name, run] of platformCalls) {
    const res = await run()
    if (isMissing(res.error)) skip(name, 'belum ada (migration 20261026000000 / 20261027000000 belum dijalankan)')
    else if (isDenied(res.error)) pass(name, 'ditolak')
    else if (res.error) check(name, `error lain: ${short(res.error)}`)
    else if (Array.isArray(res.data) && res.data.length === 0) pass(name, '0 baris')
    else fail(name, 'BOCOR: berhasil dipanggil akun biasa')
  }

  // --- 6. Tanpa login ---------------------------------------------------------------
  const anon = newClient()
  for (const table of ['stores', ...STORE_TABLES, 'ad_rows']) {
    const name = `Tanpa login membaca ${table}`
    const res = await anon.from(table).select('*').limit(1)
    if (isMissing(res.error)) continue
    if (isDenied(res.error) || res.error?.code === 'PGRST301' || (!res.error && res.data.length === 0)) pass(name, 'ditolak / 0 baris')
    else if (res.error) check(name, `error lain: ${short(res.error)}`)
    else fail(name, 'BOCOR: data terbaca tanpa login')
  }
  {
    const name = 'Tanpa login upload penghasilan (RPC)'
    const res = await anon.rpc('upsert_income', { p_store_id: storeB.id, p_rows: [{ released_date: CANARY_MONTH, total_income: 0 }] })
    if (res.error) pass(name, 'ditolak')
    else fail(name, 'BOCOR: berhasil tanpa login (sudah dibersihkan)')
  }
  {
    const name = 'Tanpa login membuat akun (platform_create_trial)'
    const res = await anon.rpc('platform_create_trial', {
      p_email: `${MARK}-anon@contoh.invalid`,
      p_password: 'UjiPemisahan123',
      p_store_name: MARK,
      p_active_until: todayWib,
    })
    if (res.error) pass(name, 'ditolak')
    else fail(name, 'BOCOR: akun berhasil dibuat tanpa login')
  }
} finally {
  await cleanup(true)
  await A.client.auth.signOut()
  await B.client.auth.signOut()
}

// --- Laporan ------------------------------------------------------------------------

const width = Math.max(...results.map((r) => r.name.length))
for (const r of results) console.log(`${r.status.padEnd(8)}  ${r.name.padEnd(width)}  ${r.detail}`)
const count = (s) => results.filter((r) => r.status === s).length
console.log(`\n${count('LULUS')} lulus, ${count('GAGAL')} gagal, ${count('CEK')} perlu dicek, ${count('DILEWATI')} dilewati.`)
if (count('DILEWATI')) {
  console.log('Yang dilewati belum terbukti aman: isi toko B dengan data (upload export pesanan, penghasilan, iklan), lalu jalankan lagi.')
}
if (count('CEK')) console.log('Yang "CEK" berakhir dengan error lain, jadi belum terbukti aman. Baca pesannya.')
process.exit(count('GAGAL') || count('CEK') ? 1 : 0)
