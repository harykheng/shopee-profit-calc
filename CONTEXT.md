# CONTEXT — Profit Shopee / HitungCuan

Ringkasan proyek untuk siapa pun yang melanjutkan pengembangan (developer atau asisten AI). Baca ini
dulu sebelum mengubah kode. Untuk **pemakai aplikasi**: [PANDUAN.md](PANDUAN.md). Untuk **setup**
(Supabase, akun, deploy, migration): [README.md](README.md). Untuk **operasional** (ekspor/hapus data
toko, pantau error): [OPERASI.md](OPERASI.md). Fakta produk: [PRODUCT.md](PRODUCT.md). Sistem desain:
[DESIGN.md](DESIGN.md).

Terakhir diperbarui: 26 Oktober 2026 (halaman Pengelola).

---

## 1. Aplikasi ini apa

Web app yang mengubah file export Shopee menjadi keputusan: **untung bersih per bulan dan per
produk**, iklan mana yang rugi, dan harga/target ROAS yang masih untung. Satu kode, dua deploy
(`VITE_APP_NAME`):

1. **Profit Shopee** (keluarga): 3 akun, 2 toko kosmetik (**Harel Beauty**, **Oraiste Beauty House**),
   semua akun melihat kedua toko, tanpa langganan.
2. **HitungCuan** (banyak pelanggan): penjual Shopee kecil, tiap akun hanya melihat tokonya sendiri,
   langganan per toko (`stores.active_until`). Toko yang langganannya habis = **baca saja**.

Pemakai **bukan orang teknis**, terutama di **laptop**; HP/iPad harus tetap jalan. Pengelola membuat
akun uji coba di halaman **Pengelola** (`#/pengelola`, hanya akun di `platform_admins`), memperpanjang
langganan lewat SQL, dan jadi kontak bantuan (WhatsApp, `VITE_SUPPORT_WA`). Tidak ada daftar sendiri,
pembayaran, atau reset password mandiri: "Lupa password?" membuka WhatsApp, lalu pengelola menjalankan
`admin_reset_password` (OPERASI.md). Password asli tidak pernah bisa dibaca (hanya hash bcrypt).

Pertanyaan yang dijawab:
1. Bulan ini untung berapa, dan kenapa? (Rekap)
2. Iklan mana yang dimatikan, dipertahankan, atau diubah target ROAS-nya? (Iklan)
3. Sebelum jualan / ganti harga: jual berapa, target ROAS berapa? (Simulasi Harga)

```
Untung bersih = Uang masuk dari Shopee (dana dilepas + penyesuaian) − Modal (qty terjual × HPP) − Biaya
```

## 2. Aturan wajib (jangan dilanggar)

- **Bahasa Indonesia** sederhana untuk semua teks aplikasi dan dokumen pemakai.
- **Privasi pembeli**: nama, alamat, no. HP, username, catatan pembeli, no. resi, metode bayar
  **tidak pernah dibaca maupun disimpan**. Daftar kolom pesanan di `BUYER_PRIVATE_COLUMNS`
  (`src/lib/shopeeColumns.ts`, ada test-nya). Parser penghasilan Excel juga tidak membaca kolom pembeli
  (ada test-nya).
- **File Shopee asli** hanya di `sample-data/` (gitignored). Jangan di-commit atau disalin. `*.xlsx` /
  `*.csv` di-gitignore kecuali `tests/fixtures/` (isinya DUMMY). Test yang butuh file palsu sebaiknya
  membuat workbook di dalam test (lihat `tests/incomeXlsx.test.ts`).
- **Pemisahan toko**: semua tabel pakai RLS. Anggota toko boleh **membaca** (`is_store_member`),
  **menulis** hanya kalau langganan aktif (`is_store_active`). View wajib `security_invoker = true`.
  Tabel/view baru yang punya `store_id` harus ditambahkan ke `supabase/uji-pemisahan-toko.sql` dan
  `scripts/check-tenant-isolation.mjs`, serta ke `admin_export_store` / `admin_delete_store`.
- **Halaman Pengelola** hanya untuk akun di `platform_admins` (diisi lewat SQL Editor dengan
  `admin_set_platform_admin`). Fungsinya `security definer` dan **wajib** menolak akun lain
  (`is_platform_admin()`); halaman itu menampilkan data akun (email, tanggal, login terakhir), **tidak
  pernah** isi toko pelanggan. Fungsi `security definer` baru yang bisa dipanggil aplikasi harus
  ditambahkan ke daftar pengecualian dan diuji di `uji-pemisahan-toko.sql` + `check-tenant-isolation.mjs`.
- **Perubahan database** hanya lewat file SQL **baru** di `supabase/migrations/` (aman diulang, tidak
  menghapus data). Pemilik menjalankannya **manual** di SQL Editor Supabase, jadi setiap fitur yang
  butuh SQL **harus disebutkan jelas**, termasuk urutannya terhadap deploy, dan dicatat di README.
- **Upload ulang file yang sama harus aman** (upsert / ganti per periode, tidak dobel).
- **HPP dikunci saat item menjadi Selesai** (`hpp_snapshot`); mengubah HPP tidak mengubah bulan yang
  tersimpan kecuali lewat **Hitung ulang HPP** (HPP yang masih kosong diisi otomatis saat buka Rekap).
- **Untung bersih bulanan (`monthly_recap`) jangan diubah diam-diam**: perubahan rumus = keputusan
  pemilik.
- Setiap perubahan: `npm test` dan `npm run build` harus lulus.

## 3. Stack & deploy

- React 19 + Vite + TypeScript + Tailwind CSS v4 (token di `@theme`, `src/index.css`).
- Supabase (Postgres + Auth + RLS). Aplikasi hanya pakai `VITE_SUPABASE_URL` dan
  `VITE_SUPABASE_ANON_KEY`. **Jangan** pakai service_role.
- File dibaca **di browser**: SheetJS (`xlsx`, versi di `vendor/`) untuk export pesanan dan penghasilan
  Excel, pdf.js untuk penghasilan PDF, parser CSV sendiri untuk iklan. File asli tidak di-upload.
- Vitest untuk test. Tidak ada library chart/UI tambahan.
- Deploy: **Cloudflare Workers Builds** (static assets, `wrangler.jsonc`). Build menulis
  `dist/_headers` (CSP, anti-iframe, HSTS). README masih menjelaskan Vercel juga; keduanya bisa.
- Branch: `main` = production. `multi-tenant` = branch kerja HitungCuan, masuk ke `main` lewat PR.
- Navigasi pakai hash (`#/rekap`, `#/iklan?cek=1`, …), lihat `src/lib/router.ts`.

## 4. Struktur kode

```
supabase/migrations/        Skema, RLS, fungsi simpan, view rekap (urut nama file)
supabase/uji-pemisahan-toko.sql  Uji pemisahan toko langsung di SQL Editor (semua harus LULUS)
scripts/check-tenant-isolation.mjs  Uji yang sama lewat API dengan 2 akun tes
src/lib/shopeeColumns.ts    SATU-SATUNYA tempat nama kolom/label file Shopee (pesanan, PDF, Excel penghasilan, CSV iklan)
src/lib/parsers/            orders.ts (xlsx pesanan), income.ts + incomeFile.ts + pdfText.ts (PDF),
                            incomeXlsx.ts (Excel "Sudah Dilepas"), ads.ts (csv), common.ts
src/lib/api.ts              Semua query Supabase
src/lib/monthStatus.ts      Status bulan "Angka final / Belum lengkap"
src/lib/recapMath.ts        Hitungan Rekap: perkiraan/untung pesanan, rincian omzet (incomeBreakdown),
                            untung per produk (productRows/sortProducts), diagnosa Bab 1 (recapInsights)
src/lib/adsMath.ts          Iklan per produk, potongan asli per Kode Produk, simulasi harga, grup iklan
src/lib/adsLoad.ts          Memuat data untuk analisis iklan (halaman Iklan, Cek cepat, bab Iklan di Rekap)
src/lib/feeCategories.ts    Kategori biaya admin per toko
src/lib/storeSettings.ts    Pengaturan hitungan per toko (target untung, retur)
src/lib/trialAccounts.ts    Halaman Pengelola: password acak, tanggal bawaan (7 hari), cek isian, teks WhatsApp, status pelanggan
src/lib/trialLimits.ts      Batas uji coba: bulan yang diisi upload, cek 1 bulan, kunci jatah simulasi per produk, pesan
src/components/trialSim.tsx Hook jatah simulasi uji coba (Satu produk & Grup iklan) + pesan jatah habis
src/lib/errors.ts           Pesan error ramah + petunjuk migration yang belum dijalankan (untuk pengelola)
src/lib/format.ts           Format Rupiah/angka/bulan (formatRupiahShort = "Rp2,78 juta", dibulatkan ke bawah)
src/pages/                  Login, Upload, HPP, Biaya, Rekap, Iklan (+ AdsQuickCheck), Simulasi (+ AdGroupSim), Akun, Pengelola (OperatorPage)
src/components/             ui.tsx, pickers.tsx, icons.tsx, motion.tsx, adsUpload.tsx, MonthlyReminder.tsx
tests/                      Test Vitest; *.local.test.ts memakai file asli di sample-data/ (dilewati kalau tidak ada)
```

Fungsi hitungan dibuat **murni** (tanpa Supabase) di `src/lib/*` supaya bisa dites; halaman hanya
memuat data dan menampilkan.

## 5. Data & database

Migration (jalankan berurutan; file baru ditandai):

| File | Isi |
|---|---|
| `20260930000000_init.sql` | Toko, produk, order_items, income (per tanggal cair), expenses; RLS; view rekap |
| `20261004000000_income_adjustments.sql` | Biaya penyesuaian dari laporan penghasilan |
| `20261005000000_all_order_statuses.sql` | Semua status pesanan (selesai/proses/batal) + "Pesanan masuk" |
| `20261006000000_ads.sql` | Laporan & baris data iklan |
| `20261007000000_product_fee_settings.sql` | `admin_pct` & `xtra` per produk |
| `20261012000000_multi_tenant.sql` | `store_members`, `active_until`, RLS per toko |
| `20261013000000_read_only_when_expired.sql` | Baca saja kalau langganan habis |
| `20261014000000_fee_categories.sql` | Kategori biaya admin |
| `20261015000000_store_settings.sql` | Pengaturan hitungan per toko; modal retur yang hilang |
| `20261016000000_operations.sql` | `client_errors`, fungsi admin ekspor/hapus toko |
| **`20261020000000_income_orders.sql`** | Tabel `income_orders` (penghasilan per pesanan & produk), `income_adjustments.order_no`, RPC `save_income_report`. **Wajib sebelum deploy PR #25** |
| **`20261021000000_income_per_order_views.sql`** | View `order_item_income`, `income_order_match`, `income_product_monthly`; kolom baru di `product_monthly_recap` |
| **`20261022000000_income_monthly_breakdown.sql`** | View `income_monthly_breakdown` (Bab 2 Rekap dari omzet) |
| **`20261023000000_admin_reset_password.sql`** | Fungsi admin `admin_reset_password(email, password)` untuk SQL Editor: ganti password (bcrypt), hapus penanda `password_changed` supaya banner muncul lagi, keluarkan semua sesi. Tidak dipakai aplikasi |
| **`20261103000000_trial_simulation_10.sql`** | `trial_simulation_limit()` = **10** (sebelumnya 50). Jalankan sebelum/bersamaan deploy |
| **`20261102000000_trial_simulation_bonus.sql`** | `stores.trial_sim_bonus`; `use_trial_simulation` memakai batas 50 + bonus toko; `platform_add_trial_simulations(id, n)` (pengelola, 1–1000, menumpuk) dan `platform_trial_simulation_usage()` (pemakaian per toko uji coba). Boleh sebelum/sesudah deploy |
| **`20261101000000_platform_reset_password.sql`** | `platform_reset_password(email, password)`: hanya pengelola, hanya akun yang anggota toko, **menolak akun pengelola** (supaya tidak bisa saling ambil alih); memanggil `admin_reset_password`. Tombol **Reset password** di Pelanggan. Boleh sebelum/sesudah deploy |
| **`20261031000000_platform_set_subscription.sql`** | `platform_subscribe_store(store_id, sampai)`: hanya pengelola; `trial = false` + tanggal langganan (tombol **Jadikan berlangganan** di Pelanggan). Boleh sebelum/sesudah deploy |
| **`20261030000000_platform_create_account.sql`** | `platform_create_account(email, password, nama, sampai, minta_nama, uji_coba)`: memanggil `platform_create_trial` (4 parameter, cek pengelola) lalu mengatur `trial` & `name_pending`. Untuk akun yang langsung berlangganan. Jalankan sebelum/bersamaan deploy |
| **`20261029000000_store_name_by_customer.sql`** | `stores.name_pending`; `platform_create_trial(…, p_ask_name)` (versi 5 parameter, memanggil versi 4) memasang tanda kalau nama dikosongkan pengelola; `set_store_name()` (security definer, anggota toko, sekali saja). Aplikasi menampilkan jendela "nama tokomu di Shopee" saat login. Boleh sebelum/sesudah deploy |
| **`20261028000000_trial_limits_total.sql`** | Angka batas uji coba jadi data **1 bulan** dan simulasi **50 produk selama uji coba** (`use_trial_simulation` menghitung produk berbeda sepanjang masa uji coba, catatan lama tidak dihapus). Butuh 20261027; jalankan sebelum/bersamaan deploy |
| **`20261027000000_trial_limits.sql`** | Batas toko uji coba (`stores.trial`): trigger per perintah di `income`, `income_adjustments`, `income_orders`, `ad_reports` menolak kalau bulan data (uang cair / periode iklan) > 2 (`trial_months_used`, `trial_month_limit()`); tabel `trial_simulations` + RPC `use_trial_simulation` (security definer, cek anggota) untuk 10 produk simulasi/hari (`trial_simulation_limit()`). Ekspor/hapus admin ikut. Butuh 20261026; boleh sebelum/sesudah deploy |
| **`20261026000000_platform_admin.sql`** | Halaman Pengelola: tabel `platform_admins`, `stores.trial` & `stores.created_at`, `is_platform_admin()`, `platform_create_trial()` (tulis langsung ke `auth.users` + `auth.identities`, lalu toko + pemilik), `platform_list_customers()`, `admin_set_platform_admin()` (SQL Editor). Boleh sebelum/sesudah deploy (tanpa SQL ini ikon tidak muncul) |

Sumber data per bulan per toko:
- **Export pesanan** (.xlsx, status **Semua**, rentang lebar) → `order_items`.
- **Laporan penghasilan**, salah satu:
  - **Excel "Sudah Dilepas"** (Keuangan → Penghasilan Saya → Sudah Dilepas → Export), **disarankan**:
    sheet `Penghasilan` (baris `Order` + `Sku`), `Summary`, `Adjustment`. Disimpan sebagai uang cair
    per hari di `income` (dijumlah dari baris Order, sama persis dengan PDF; dicek pada data Juli 2026)
    + rincian per pesanan & produk di `income_orders` + penyesuaian dengan nomor pesanan.
  - **PDF bulanan** ("Catatan Transaksi Penghasilan"): hanya uang cair per hari + penyesuaian. Masih
    diterima (bulan lama).
  - Keduanya disimpan lewat `save_income_report` dalam satu transaksi. **Penyesuaian di periode
    laporan diganti, bukan ditambah**: PDF dan Excel mencatat penyesuaian yang sama dengan tanggal
    berbeda (mis. 30 vs 31 Juli), jadi upload keduanya akan dobel kalau ditambah. Laporan yang disimpan
    terakhir menjadi acuan periode itu.
- **Data iklan** (.csv: Data Keseluruhan, Rincian Iklan Produk Otomatis, Semua Data Grup Iklan) →
  `ad_reports` / `ad_rows`. 1 bulan penuh otomatis mengisi Biaya → Iklan Shopee.
- **HPP** manual per produk/variasi; **Biaya** (Meta Ads, packaging, lain-lain) manual.

Basis bulan: uang masuk dihitung di **bulan cair**, modal di **bulan pesanan selesai** (WIB). Di akhir
bulan bisa bergeser 1–2 hari; sengaja belum diubah (keputusan pemilik, mengubah angka lama).

Pencocokan per pesanan (`order_item_income`): uang satu pesanan (`income_orders`) dibagi ke item
Selesai pesanan itu sesuai subtotal × qty bersih ÷ qty. Pesanan 1 produk = persis; banyak produk bisa
selisih < Rp1 karena pembulatan. **ID Produk** di Excel penghasilan = **Kode Produk** di CSV iklan.

## 6. Rumus & aturan bisnis penting

Konstanta (`src/lib/adsMath.ts`, sebagian bisa diubah per toko lewat `store_settings`):
`ADS_TARGET_PROFIT = 5%`, `PRICE_TARGET_MARGIN = 20%`, `DEFAULT_FEE_RATE = 15%`,
`MIN_SALES_FOR_VERDICT = 3`, `HERO_FACTOR = 1,2`, `MAX_TARGET_ROAS = 50`, `XTRA_FEE_RATE = 4%`,
`MIN_LINES_FOR_ACTUAL_FEE = 3`. Rekap: `THIN_MARGIN = 10%` (`recapMath.ts`), `MAX_SHIFT_DAYS = 2`.

**Status bulan** "Angka final" kalau: laporan penghasilan ada, semua uang cair ketemu pesanannya
(geser ≤ 2 hari dianggap cocok), semua barang punya HPP, biaya sudah disimpan (boleh Rp0). Dengan
Excel "Sudah Dilepas", daftar cek menyebut **nomor pesanan** yang cair tapi tidak ada / belum Selesai
di export pesanan (`income_order_match`).

**Rekap**
- Bab 1: kalimat + angka besar + kotak **"Kenapa untungnya segini?"** (`recapInsights`, maks. 3, urutan:
  iklan ≥ 10% omzet, produk rugi/tipis, potongan Shopee, modal ≥ 70% omzet). Tanpa rincian omzet,
  diganti batang "Dari setiap Rp100 yang masuk". Margin = untung ÷ omzet (atau ÷ uang masuk tanpa rincian).
- Bab 2: dari **omzet** → refund → voucher → ongkir (kalau ≠ 0) → potongan Shopee per jenis →
  penyesuaian → uang masuk → modal → biaya → untung, + batang "dari omzet, uangnya ke mana saja".
  Excel: omzet = harga produk, admin & proses terpisah. PDF: omzet = subtotal setelah refund, admin +
  proses digabung. Kalau rincian tidak pas sampai rupiah dengan uang cair → tampilan lama.
- Tab Semua pesanan: untung pesanan yang dibuat bulan itu; uang asli per pesanan kalau ada, sisanya
  **perkiraan** (uang cair per hari dibagi sesuai nilai penjualan).
- Tab Per produk: uang masuk & untung asli (sebelum iklan), label **RUGI** (< 0) / **TIPIS** (< 10% dari
  uang masuk), urutan Terlaris / Paling untung / Rugi dulu.

**Iklan per produk**
- ROAS nyata = omzet iklan tanpa pesanan batal & retur ÷ biaya iklan.
- Potongan Shopee per produk: **asli** dari Excel "Sudah Dilepas" per Kode Produk (≥ 3 pesanan, bulan
  iklan atau + 3 bulan sebelumnya, tanpa pesanan refund); kalau tidak ada → rata-rata toko digeser
  sesuai kategori admin; kalau tidak ada juga → rata-rata toko; tanpa laporan → 15%.
- Target ROAS (untung 5%) = 1 ÷ (margin − 5%); untuk Shopee dinaikkan dengan porsi batal + retur.
- Label: Takedown, ROAS terlalu kecil, Aman, Hero (ROAS nyata ≥ target × 1,2), Data belum cukup, HPP kosong.
- **Cek cepat**: CSV beberapa hari, tidak disimpan, boleh HPP sementara.

**Simulasi Harga** — potongan per komponen: admin % × harga + XTRA 4% × harga + biaya proses tetap per
order (bawaan Rp1.250) + packaging. Saran harga dari modal (`priceLadder`), Grup iklan
(`simulateAdGroup`, tidak disimpan).

## 7. Halaman

| Halaman | Isi |
|---|---|
| Rekap | 4 bab: Untung + diagnosa, Dari omzet sampai untung, Iklan bulan itu, Pesanan & produk (tab). Bisa beberapa bulan. |
| Iklan | Ringkasan untung/rugi iklan, kartu per produk dengan label & sumber potongan, gabungan beberapa bulan, Cek cepat. |
| Simulasi Harga | Satu produk (termasuk saran harga dari modal, kategori admin) dan Grup iklan. |
| Upload | 1. Export pesanan (.xlsx) · 2. Laporan penghasilan (.xlsx "Sudah Dilepas" atau .pdf) · 3. Data iklan (.csv). Preview, satu tombol simpan. File salah kotak diberi pesan jelas. |
| HPP | Isi HPP per produk/variasi; filter yang belum diisi. |
| Biaya | Iklan Shopee, Meta Ads, packaging, lain-lain per bulan. |
| Akun | Ganti password, pengaturan hitungan per toko, data saya. |
| Pelanggan / Buat akun | Hanya pengelola (`#/pelanggan` = halaman awal pengelola, `#/pengelola` = Buat akun). Pelanggan: semua toko dikelompokkan Uji coba / Berlangganan / Berakhir, email pemilik, sisa hari, login terakhir; tanpa isi toko. Buat akun: uji coba 7 hari atau langsung berlangganan (1 bulan / 1 tahun), nama toko boleh kosong (diisi pemilik), teks siap kirim WhatsApp. Pengelola tanpa toko hanya melihat 2 menu ini. |

## 8. Desain

Detail di [DESIGN.md](DESIGN.md) (kulit "Dapur Terang", sama dengan landing HitungCuan):
- Latar krem hangat `#fffbf6`, lembar putih untuk rincian, aksen biru `#2b3a9e`, untung hijau
  `#146c43`, rugi merah `#c4361e`, kuning `#f5d547` untuk stiker/peringatan.
- Huruf: **Parkinsans** (judul & angka besar), **Plus Jakarta Sans** (lainnya, angka tabular).
- Setiap halaman **menjawab dulu dalam satu kalimat**, lalu rinciannya. Satu angka cukup ditampilkan
  sekali; jangan mengulang angka yang sama di banyak kotak (pelajaran dari dashboard kompetitor).
- Gerak hanya untuk perubahan keadaan; mati saat `prefers-reduced-motion`.
- Tidak boleh scroll ke samping dari lebar 360px; tombol minimal 44px.

## 9. Cara kerja pengembangan

```bash
npm install
cp .env.example .env.local   # isi URL & anon key Supabase
npm run dev                  # http://localhost:5173
npm test
npm run build
```

- Kalau Shopee mengganti format file: ubah `src/lib/shopeeColumns.ts`, lalu `npm test`.
- Fitur baru: logika di `src/lib/*` + test di `tests/`, tampilan di `src/pages/*`, lalu perbarui
  PANDUAN.md (cara pakai) dan README/CONTEXT kalau ada SQL atau setup baru.
- SQL baru: uji di Postgres lokal kalau bisa (tiruan `auth.uid()`, role `anon`/`authenticated`), lalu
  jalankan `supabase/uji-pemisahan-toko.sql` (semua LULUS).
- Cek tampilan di laptop (1440px) dan HP (390px).

## 10. Riwayat singkat

| PR | Isi |
|---|---|
| #1–#13 | Upload & parser, HPP, Biaya, Rekap + status bulan, iklan per produk, Simulasi Harga, PANDUAN |
| #14–#17 | Redesain nota kasir → "Cerita Bulan Ini", animasi, Grup iklan, Saran harga dari modal |
| #19 | Redesain "Dapur Terang" (kulit landing HitungCuan) di semua halaman |
| #20 | Header keamanan (`dist/_headers`) |
| #21 | Uji pemisahan toko tetap jalan walau ada migration terlewat |
| #22 | Iklan: retur ikut dikurangi dari ROAS nyata |
| #23–#24 | Iklan: Cek cepat beberapa hari, HPP sementara |
| #25 | Penghasilan Excel "Sudah Dilepas" (per pesanan), untung per produk & potongan iklan asli, nomor pesanan di status bulan, Rekap: diagnosa Bab 1, Bab 2 dari omzet, urutan produk untung/rugi. Butuh 3 SQL baru (20261020–22). Plus `admin_reset_password` (SQL 20261023) untuk lupa password. |

| (26 Okt) | Halaman Pengelola: buat akun uji coba dari aplikasi, daftar toko + login terakhir. SQL 20261026. |
| (27 Okt) | Batas uji coba: data 2 bulan (laporan penghasilan & iklan; export pesanan bebas), Simulasi 10 produk/hari (per produk, Satu & Grup berbagi jatah). SQL 20261027. |
| (28 Okt) | Batas uji coba diubah pemilik: data 1 bulan, Simulasi 50 produk selama uji coba. SQL 20261028. Cek cepat iklan dimatikan untuk uji coba (khusus berlangganan; hanya di aplikasi, tanpa SQL). |
| (29 Okt) | Nama toko boleh dikosongkan di Pengelola: pemilik mengisinya sendiri saat login pertama (sekali). SQL 20261029. |
| (30 Okt) | Pengelola: halaman awal = Pelanggan (uji coba / berlangganan / berakhir); Buat akun = uji coba atau langsung berlangganan. Pengelola tanpa toko hanya melihat 2 menu itu. SQL 20261030. |
| (31 Okt) | Pelanggan: tombol **Jadikan berlangganan** di toko uji coba (1 bulan / 1 tahun / tanggal, mulai hari ini) dan **Perpanjang** di toko berlangganan (lanjut dari tanggal berakhir kalau masih aktif, `extendedEnd`). SQL 20261031 dipakai keduanya. `Modal` kini lewat portal ke body (lapisan gelap menutup seluruh layar). |
| (1 Nov) | Pelanggan: tombol **Reset password** (password acak + teks WhatsApp; akun pengelola ditolak). SQL 20261101. |
| (2 Nov) | Pelanggan: pemakaian simulasi tiap toko uji coba + tombol **Tambah jatah simulasi** (per toko). SQL 20261102. |
| (3 Nov) | Uji coba diubah pemilik: **7 hari** (bawaan form, `DEFAULT_TRIAL_DAYS`), data tetap 1 bulan, Simulasi **10 produk**. SQL 20261103. |

## 11. Keputusan & ide yang belum dikerjakan

- **Basis bulan modal vs uang cair** (lihat bagian 5): bisa diselaraskan dengan data per pesanan,
  tapi mengubah untung bulan lama. Tunggu keputusan pemilik.
- **Upload pesanan "Selesai saja"** (seperti kompetitor) belum diterima sebagai mode resmi; aplikasi
  sengaja memakai status Semua untuk melacak batal/dikirim/retur.
- Sengaja **tidak** diambil dari kompetitor: skor kesehatan toko, "potensi +Rp" kalau iklan dikurangi
  (menganggap penjualan tetap), tabel ongkir per produk (ongkir yang ditanggung toko biasanya Rp0).
- Batas diagnosa (iklan 10%, modal 70%, tipis 10%) adalah pilihan awal; bisa dijadikan pengaturan toko.
- Menyimpan grup iklan; membandingkan ROAS nyata grup dengan target grup.
- Halaman Pengelola: mengubah nama toko dan reset password akun pengelola masih lewat SQL Editor. Uji coba →
  berlangganan, perpanjang (31 Okt), dan reset password pelanggan (1 Nov) sudah lewat tombol. `platform_create_trial` menulis langsung ke tabel internal
  Supabase (`auth.users`); kalau format tabel itu berubah, uji kontrol di `uji-pemisahan-toko.sql`
  menunjukkan CEK. Alternatifnya Edge Function dengan `auth.admin.createUser`.
