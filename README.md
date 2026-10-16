# Kalkulator Profit Bersih Shopee

Web app internal untuk menghitung **profit bersih per bulan** toko Shopee (Harel Beauty dan
Oraiste Beauty House) dari file export Shopee.

```
Profit bersih = Penghasilan dilepas − Modal (qty × HPP) − Biaya
```

- **Penghasilan** diambil dari PDF laporan penghasilan bulanan Shopee, per tanggal dana dilepas,
  ditambah **biaya penyesuaian** di laporan yang sama (mis. kompensasi barang hilang/retur).
- **Modal** dihitung dari export pesanan: item berstatus *Selesai* yang selesai di bulan itu
  (di Shopee, dana dilepas di hari yang sama dengan pesanan selesai). Qty retur tidak dihitung.
- **Biaya** (iklan Shopee, Meta Ads, packaging, lain-lain) diisi manual. Biaya iklan Shopee terisi
  otomatis kalau data iklan 1 bulan penuh di-upload di halaman **Iklan**.
- **Iklan**: upload data iklan Shopee (.csv) → per produk: ROAS nyata, ROAS balik modal, saran target
  ROAS (untung 5% setelah iklan), dan label Hero / Aman / ROAS terlalu kecil / Takedown.

Stack: React + Vite + Tailwind CSS, Supabase (Postgres + Auth + RLS), SheetJS dan pdf.js untuk
membaca file di browser, Vitest untuk test.

> 📖 **Pemakai aplikasi** (pemilik, cici, adik): baca **[PANDUAN.md](PANDUAN.md)** — cara pakai
> tiap halaman, cara membaca Rekap dan Iklan, dan pertanyaan yang sering muncul.
> README ini untuk setup (Supabase, akun, Vercel) dan pengembangan.

---

## Daftar isi

1. [Setup Supabase](#1-setup-supabase)
2. [Membuat akun pengguna](#2-membuat-akun-pengguna)
3. [Deploy ke Vercel](#3-deploy-ke-vercel)
4. [Cara pakai setiap bulan](#4-cara-pakai-setiap-bulan)
5. [Menjalankan di komputer sendiri](#5-menjalankan-di-komputer-sendiri-developer)
6. [Privasi data](#6-privasi-data)
7. [Kalau Shopee mengganti format file](#7-kalau-shopee-mengganti-format-file)
8. [Mode HitungCuan (banyak pelanggan)](#8-mode-hitungcuan-banyak-pelanggan)

---

## 1. Setup Supabase

1. Buka <https://supabase.com>, login, lalu **New project**.
   - Region: pilih **Southeast Asia (Singapore)** supaya cepat dari Indonesia.
   - Simpan *database password* di tempat aman (tidak dipakai aplikasi, tapi perlu untuk admin).
2. Setelah project jadi, buka **SQL Editor** → **New query**.
3. Jalankan file SQL di folder [`supabase/migrations/`](supabase/migrations/) **satu per satu,
   berurutan** (urut nama file). Untuk tiap file: buka di GitHub, salin **seluruh** isinya, tempel
   di SQL Editor (query baru), lalu klik **Run**. Harus muncul "Success".

   | Urutan | File | Isi |
   |---|---|---|
   | 1 | `20260930000000_init.sql` | Semua tabel, aturan keamanan (RLS), dua toko |
   | 2 | `20261004000000_income_adjustments.sql` | Biaya penyesuaian dari laporan penghasilan |
   | 3 | `20261005000000_all_order_statuses.sql` | Semua status pesanan + tabel "Pesanan masuk" |
   | 4 | `20261006000000_ads.sql` | Data iklan (halaman Iklan) |
   | 5 | `20261007000000_product_fee_settings.sql` | % admin & XTRA per produk (halaman Simulasi Harga) |

   Kalau muncul tulisan *NOTICE … skipping*, itu normal (artinya bagian itu sudah ada).
4. **Matikan pendaftaran publik** (wajib):
   **Authentication → Sign In / Providers** → matikan **Allow new users to sign up** → **Save**.
   Pastikan provider **Email** tetap aktif.
   (Nama menu bisa sedikit berbeda antar versi dashboard; cari pengaturan "sign up" di bagian
   Authentication.)
5. Ambil kunci untuk aplikasi: **Project Settings → API** (atau **API Keys**):
   - **Project URL** → nanti diisi ke `VITE_SUPABASE_URL`
   - **anon / publishable key** → nanti diisi ke `VITE_SUPABASE_ANON_KEY`

> Jangan pernah memakai **service_role / secret key** di aplikasi atau di Vercel.
> Kunci anon/publishable aman terlihat di browser karena semua data dilindungi login + RLS.

### Memperbarui database yang sudah berjalan

Kalau nanti ada file SQL baru di `supabase/migrations/`, jalankan **hanya file yang baru** dengan
cara yang sama (SQL Editor → tempel → Run). File-file ini aman dijalankan ulang dan tidak
menghapus data.

> Sudah setup sebelum 4 Oktober 2026? Jalankan sekali file
> `20261004000000_income_adjustments.sql`. Setelah itu upload ulang PDF penghasilan yang punya
> "Biaya Penyesuaian" (mis. Juli) supaya penyesuaiannya ikut tersimpan. Data tidak akan dobel.

> Sudah setup sebelum 5 Oktober 2026? Jalankan sekali file
> `20261005000000_all_order_statuses.sql`. Setelah itu upload ulang export pesanan
> (status **Semua**) supaya tabel "Pesanan masuk" di Rekap terisi. Angka profit tidak berubah.

> Sudah setup sebelum 6 Oktober 2026? Jalankan sekali file `20261006000000_ads.sql` supaya
> halaman **Iklan** bisa dipakai.

> Sudah setup sebelum 16 Oktober 2026? Jalankan sekali file `20261016000000_operations.sql` (aman
> diulang, tidak mengubah data): tabel `client_errors` + ringkasan `client_error_summary` untuk
> memantau error pelanggan, dan fungsi admin `admin_export_store`, `admin_delete_store`,
> `admin_list_orphan_users`. Cara memakainya ada di [OPERASI.md](OPERASI.md). Tanpa file ini, aplikasi
> tetap jalan; laporan error hanya tidak tersimpan.

> Sudah setup sebelum 15 Oktober 2026? Jalankan sekali file `20261015000000_store_settings.sql`
> (aman diulang, tidak mengubah data) supaya target untung dan pengaturan retur per toko bisa
> dipakai (halaman Akun → Pengaturan hitungan). Tanpa pengaturan yang disimpan, semua angka sama
> seperti sebelumnya (5% setelah iklan, 20% harga jual, retur kembali ke stok). File ini juga
> mengganti dua view Rekap (`monthly_recap`, `product_monthly_recap`) agar modal bisa menghitung
> barang retur yang tidak bisa dijual lagi, dan menambah kolom `returned_loss` di akhir
> `monthly_recap`. Tanpa file ini, aplikasi tetap jalan dengan nilai bawaan.

> Sudah setup sebelum 14 Oktober 2026? Jalankan sekali file `20261014000000_fee_categories.sql`
> (aman diulang, tidak mengubah data; butuh PostgreSQL 15+, standar di Supabase) supaya
> "Kategori biaya admin" di Simulasi Harga bisa dipakai. Tanpa file itu, aplikasi tetap jalan:
> % admin per produk diisi manual seperti sebelumnya, tanpa daftar kategori.

> Sudah setup sebelum 12 Oktober 2026? Lihat [bagian 8](#8-mode-hitungcuan-banyak-pelanggan):
> file `20261012000000_multi_tenant.sql` membatasi tiap user ke toko miliknya. Di project keluarga
> cukup jalankan file itu sekali (cadangkan database dulu); ketiga akun yang ada tetap bisa
> masuk karena migration memasukkan semua user yang sudah ada sebagai anggota kedua toko.
> **Aplikasi versi ini mengambil kolom `stores.active_until`, jadi file itu wajib dijalankan
> sebelum versi ini di-deploy ke project keluarga.**

> Sudah setup sebelum 7 Oktober 2026? Jalankan sekali file
> `20261007000000_product_fee_settings.sql` supaya % admin & XTRA bisa disimpan per produk di
> halaman **Simulasi Harga**. Tanpa file ini, simulasi tetap jalan, hanya tombol simpan yang gagal.

## 2. Membuat akun pengguna

Karena pendaftaran publik dimatikan, akun dibuat manual oleh pemilik:

1. **Authentication → Users → Add user → Create new user**.
2. Isi email dan password, centang **Auto Confirm User**, lalu **Create user**.
3. Ulangi untuk 3 orang (Anda, cici, adik). Semua akun bisa mengakses kedua toko.
4. **Setelah migration `20261012000000_multi_tenant.sql` dijalankan**, akses ke toko ditentukan
   tabel `store_members`: akun yang sudah ada dimasukkan otomatis oleh migration itu, tapi akun
   yang dibuat **sesudahnya** harus ditambahkan sendiri (SQL Editor):

   ```sql
   insert into public.store_members (store_id, user_id)
   select s.id, u.id from public.stores s, auth.users u
   where u.email = 'email.baru@contoh.com'
   on conflict do nothing;
   ```

Lupa password: buka user di menu yang sama → reset / ganti password, lalu beri tahu orangnya.
Menghapus akses: hapus user tersebut.

## 3. Deploy ke Vercel

1. Buka <https://vercel.com> → login dengan GitHub → **Add New… → Project**.
2. Pilih repo **shopee-profit-calc** → **Import**. Framework **Vite** terdeteksi otomatis
   (Build command `npm run build`, Output `dist` — tidak perlu diubah).
3. Buka **Environment Variables**, tambahkan (centang Production **dan** Preview):

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | Project URL dari langkah 1.5 |
   | `VITE_SUPABASE_ANON_KEY` | anon / publishable key dari langkah 1.5 |

4. Klik **Deploy**. Setelah selesai, buka link yang diberikan dan login dengan akun dari langkah 2.

Setelah itu setiap `git push`:
- ke branch `main` → otomatis deploy ke link utama (production);
- ke branch lain → otomatis dapat **link preview** sendiri untuk dites dulu.

Kalau env var diubah, lakukan **Redeploy** supaya nilainya terpakai.

> Catatan: paket gratis Vercel (Hobby) resminya untuk pemakaian non-komersial. Cek syaratnya;
> aplikasi ini juga bisa di-host di layanan static hosting lain (Cloudflare Pages, Netlify, dll.)
> dengan env var yang sama.

## 4. Cara pakai setiap bulan

Panduan lengkap ada di **[PANDUAN.md](PANDUAN.md)**. Ringkasnya, di awal bulan untuk bulan
sebelumnya, per toko (toko dipilih di pilihan Toko pada menu):

1. **Download dari Shopee Seller Centre**:
   - **Export pesanan** (.xlsx): Pesanan Saya → Export, status **Semua**, rentang dari pertengahan
     bulan sebelumnya sampai akhir bulan ini.
   - **Laporan penghasilan** (.pdf): Keuangan → Penghasilan Saya → laporan bulanan.
   - **Data iklan** (.csv): Iklan Saya → Download Data, periode **1 bulan penuh**: *Data
     Keseluruhan*, *Rincian Data Iklan Produk Otomatis*, dan *Semua Data Grup Iklan* (kalau
     memakai grup iklan). Untuk beberapa bulan, download per bulan; file periode panjang tidak bisa
     dipecah per bulan.
2. **Upload**: file Excel dan PDF → cek preview → **Simpan ke …**.
3. **HPP**: isi HPP produk yang masih merah (per 1 unit yang dijual di Shopee; paket grosir = per
   paket). HPP diisi setelah upload → **Rekap → Hitung ulang HPP**.
4. **Iklan**: pilih semua file .csv sekaligus → **Simpan**. Data 1 bulan penuh mengisi Biaya Iklan
   Shopee otomatis. Pilih **Gabungkan beberapa bulan…** untuk analisis beberapa bulan sekaligus.
5. **Biaya**: isi Meta Ads, packaging, lain-lain (Rp0 kalau tidak ada).
6. **Rekap**: cek status **Angka final**; kalau **Belum lengkap**, ikuti daftar yang muncul.

Aturan penting:
- **Upload file yang sama berkali-kali aman** — tidak ada data dobel.
- **HPP dikunci saat upload.** Mengubah HPP tidak mengubah profit bulan yang sudah tersimpan,
  kecuali lewat tombol **Hitung ulang HPP**.
- Target analisis iklan (untung 5% setelah iklan, harga 20%) ada di `src/lib/adsMath.ts`.

## 5. Menjalankan di komputer sendiri (developer)

Butuh Node.js 22 atau lebih baru.

```bash
npm install
cp .env.example .env.local   # lalu isi URL dan anon key Supabase
npm run dev                  # buka http://localhost:5173
npm test                     # test parser, format, status bulan, analisis iklan
npm run build                # build production ke dist/
```

- Fixture test (data **dummy**) ada di `tests/fixtures/`, dibuat ulang dengan `npm run fixtures`.
- Data sample toko testing (palsu, 2 bulan: pesanan, penghasilan, iklan, SQL isi HPP):
  `npm run sample -- "Nama Toko"` → folder `sample-store/` (di-gitignore). Urutan upload dan hasil
  yang seharusnya muncul ada di `sample-store/BACA-DULU.txt`.
- Untuk menguji dengan file Shopee asli, taruh file di folder `sample-data/` (sudah di-gitignore,
  **jangan pernah di-commit**). `tests/sampleData.local.test.ts` otomatis berjalan kalau folder itu
  ada, dan dilewati kalau tidak ada.
- Perubahan database dilakukan lewat file SQL baru di `supabase/migrations/`, lalu dijalankan di
  SQL Editor Supabase.

### SheetJS

SheetJS saat ini memakai `xlsx@0.18.5` dari npm. Versi resmi terbaru hanya tersedia dari CDN
SheetJS; untuk pindah ke versi resmi jalankan:

```bash
npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
npm test
```

## 6. Privasi data

- **Database hanya menyimpan data yang dibutuhkan untuk perhitungan**: no. pesanan, produk,
  variasi, SKU, qty, status, waktu selesai, subtotal, dan angka penghasilan per tanggal.
- **Nama pembeli, alamat, no. HP, username, catatan pembeli, dan no. resi tidak pernah dibaca
  maupun disimpan.** Kolom-kolom itu tercatat di `BUYER_PRIVATE_COLUMNS`
  (`src/lib/shopeeColumns.ts`), dan ada test yang memastikan isinya tidak ikut ke hasil parsing.
- File export dibaca **di browser**; file aslinya tidak pernah di-upload ke server.
- File Shopee asli hanya boleh ada di `sample-data/` (di-gitignore). File Excel/CSV di tempat lain
  juga diabaikan git, kecuali fixture dummy di `tests/fixtures/`.
- Hanya user yang login yang bisa membaca/menulis data (RLS Supabase). Pendaftaran publik mati.

## 7. Kalau Shopee mengganti format file

Semua nama kolom Excel dan label PDF ada di satu file: **`src/lib/shopeeColumns.ts`**.

- Kolom ganti nama → tambahkan nama baru ke daftar alias kolom tersebut (nama lama boleh tetap).
- Status pesanan selesai ganti nama → ubah `COMPLETED_STATUSES`.
- File iklan (.csv): nama kolom dan jenis file ada di `ADS_CSV`.
- Ada kolom biaya baru di tabel harian PDF → tambahkan labelnya ke `INCOME_PDF.feeColumns`
  (kolom yang belum dikenal tetap aman: total penghasilan tetap benar, hanya rinciannya digabung).

Kalau format berubah, aplikasi akan menolak file dengan pesan yang jelas (bukan diam-diam salah
hitung). Setelah memperbaiki, jalankan `npm test`.

---

## Struktur proyek

```
supabase/migrations/   Skema database, RLS, fungsi upload, view rekap
src/lib/shopeeColumns.ts  Pemetaan kolom Shopee (satu-satunya tempat yang perlu diubah)
src/lib/parsers/       Parser export pesanan (.xlsx), laporan penghasilan (.pdf), data iklan (.csv)
src/lib/monthStatus.ts Logika status "Angka final / Belum lengkap" (termasuk uang cair geser 1–2 hari)
src/lib/adsMath.ts     Analisis iklan: ROAS nyata, balik modal, saran ROAS, label
src/pages/             Halaman Login, Upload, HPP, Biaya, Rekap, Iklan, Simulasi Harga
src/index.css          Token warna, huruf, gerak, dan gaya dasar (palet "Dapur Terang" landing HitungCuan)
src/components/        Komponen dasar (tombol, lembar, cap stempel, ikon garis)
public/fonts/          Huruf Parkinsans & Plus Jakarta Sans (lisensi OFL, disimpan sendiri)
public/logo/           Logo HitungCuan dari landing (dipakai kalau VITE_APP_NAME=HitungCuan)
PRODUCT.md / DESIGN.md Fakta produk & sistem desain (dipakai skill desain Impeccable)
tests/                 Test Vitest + fixture dummy
scripts/make-fixtures.mjs  Pembuat fixture dummy
```

---

## 8. Mode HitungCuan (banyak pelanggan)

Kode yang sama dipakai untuk dua deploy yang terpisah total:

| | Keluarga | HitungCuan |
|---|---|---|
| Website | yang sekarang | `app.studioharel.id` |
| Project Supabase | yang lama | **project baru** (jangan digabung) |
| Nama di layar | Profit Shopee (default) | HitungCuan (`VITE_APP_NAME`) |
| Yang login | 3 akun keluarga | pelanggan yang berlangganan |

Di dalam HitungCuan semua pelanggan berbagi satu database. Yang memisahkan mereka adalah RLS:
tiap user hanya bisa membaca/menulis toko yang tercatat di `store_members` miliknya, dan hanya
selama `stores.active_until` belum lewat (dihitung menurut WIB). Layar "Langganan habis" di
aplikasi hanya tampilan; penolakan sebenarnya terjadi di database.

**Langganan habis = mode baca saja.** Pelanggan yang langganannya habis masih bisa melihat Rekap
(pelanggan melihat banner "Langganan habis"), tapi upload, HPP, biaya, iklan, dan simulasi
ditolak database. Mulai 7 hari sebelum habis, semua halaman menampilkan banner pengingat. Mode baca
saja ini diatur file `20261013000000_read_only_when_expired.sql`; **tanpa file itu, pelanggan yang
habis melihat Rekap kosong ("Belum ada data"), bukan datanya.** Jalankan file itu di project yang
sudah memakai `20261012000000_multi_tenant.sql` (aman diulang, tidak mengubah data).

Kalau pelanggan melihat pesan "Ada gangguan di sistem kami", penyebab teknisnya (mis. migration
yang belum dijalankan) ditulis ke console browser (F12 → Console), tidak ke layar pelanggan.

Model ini manual: tidak ada pendaftaran sendiri dan tidak ada pembayaran otomatis. Admin
membuat akun, menjalankan satu fungsi SQL, dan memperpanjang lewat SQL.

### a) Buat project Supabase baru dan jalankan SEMUA migration

1. Buat project Supabase **baru** (paket **Pro** sebelum pelanggan pertama membayar: free
   di-pause kalau lama tidak dipakai dan tidak punya backup yang bisa diandalkan; untuk uji coba
   free cukup, pakai data dummy saja). Upgrade ke Pro bisa dilakukan di project yang sama.
2. SQL Editor → jalankan **semua** file di `supabase/migrations/` **berurutan** (urut nama file),
   satu per satu, dari `20260930000000_init.sql` sampai `20261016000000_operations.sql`.
3. Jalankan migration **sebelum membuat user apa pun**. Seed transisi di migration terakhir
   hanya berjalan kalau `store_members` masih kosong, jadi di project baru tidak berpengaruh.

### b) Hapus 2 toko bawaan

`init.sql` membuat toko "Harel Beauty" dan "Oraiste Beauty House". Di HitungCuan keduanya tidak
boleh ada. Hapus segera setelah migration, sebelum ada pelanggan:

```sql
delete from public.stores where name in ('Harel Beauty', 'Oraiste Beauty House');
```

### c) Matikan signup publik

Authentication → Sign In / Providers (atau Settings) → matikan **Allow new users to sign up**.
Tanpa baris di `store_members` orang asing hanya melihat data kosong, tapi tetap matikan.

### d) Menambah pelanggan

1. Authentication → Users → **Add user → Create new user**: isi email dan password, centang
   **Auto Confirm User**.
2. SQL Editor (jalankan sebagai admin; fungsi ini tidak bisa dipanggil dari aplikasi):

   ```sql
   select public.admin_add_customer('pelanggan@email.com', 'Nama Toko', '2026-12-31');
   ```

   Hasilnya `store_id` toko baru. Tanggal terakhir langganan boleh `null` (tanpa batas).
   Email yang belum dibuat di langkah 1 menghasilkan error yang jelas. Nama toko boleh sama
   dengan toko pelanggan lain. Pelanggan dengan beberapa toko: jalankan fungsinya lagi dengan
   email yang sama dan nama toko lain.
3. Beri tahu pelanggan email, password sementara, dan alamat `app.studioharel.id`.

   Selama pelanggan belum mengganti password itu, **banner kuning menempel di atas semua halaman**
   ("Kamu masih memakai password dari admin") dengan tombol ke halaman **Akun** (ikon orang di
   header). Setelah pelanggan menyimpan password baru, banner hilang untuk selamanya. Tidak ada
   yang perlu diatur admin. Pelanggan lama (atau akun keluarga) yang tidak perlu diingatkan:

   ```sql
   update auth.users
   set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"password_changed": true}'
   where email = 'pelanggan@email.com';
   ```

   Banner hanya pengingat, bukan pengaman: penandanya disimpan di data akun yang bisa diubah
   pelanggan sendiri. Kalau Supabase meminta login ulang saat ganti password (pengaturan
   "Secure password change"), aplikasi menyuruh pelanggan keluar lalu masuk lagi.

Lihat semua pelanggan:

```sql
select s.id, s.name, s.active_until, u.email
from public.stores s
join public.store_members m on m.store_id = s.id
join auth.users u on u.id = m.user_id
order by s.id;
```

### e) Memperpanjang atau menghentikan langganan

```sql
-- perpanjang (aktif sampai akhir tanggal ini, WIB)
update public.stores set active_until = '2027-01-31' where id = 5;

-- hentikan sekarang (data tetap tersimpan; pelanggan melihat layar "langganan habis")
update public.stores set active_until = (now() at time zone 'Asia/Jakarta')::date - 1 where id = 5;
```

Reset password: Authentication → Users → pilih user → ubah password (pelanggan menghubungi lewat
tautan "Lupa password?" di halaman login, yang membuka WhatsApp).

### f) Env var Cloudflare Pages / Vercel untuk app.studioharel.id

Buat project hosting **kedua** dari repo yang sama (build `npm run build`, output `dist`), lalu
isi variabel berikut (Production dan Preview):

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | Project URL project **HitungCuan** |
| `VITE_SUPABASE_ANON_KEY` | anon / publishable key project **HitungCuan** |
| `VITE_APP_NAME` | `HitungCuan` |
| `VITE_SUPPORT_WA` | nomor WhatsApp admin, format `62…` (mis. `6281234567890`) |

- Cloudflare Pages: Workers & Pages → Create → Pages → hubungkan repo → Settings → Variables and
  Secrets. Tambahkan domain `app.studioharel.id` di Custom domains.
- Vercel: Settings → Environment Variables. Domain di Settings → Domains.
- Nilai `VITE_…` ditanam saat build; setelah mengubahnya lakukan **Redeploy**.
- `VITE_APP_NAME` dan `VITE_SUPPORT_WA` tidak wajib; tanpa keduanya aplikasi memakai nama
  "Profit Shopee" dan teks "hubungi pengelola" tanpa tautan WhatsApp (deploy keluarga).
- **Jangan pernah** mengisi `service_role` / secret key di variabel apa pun.

### Cloudflare Workers Builds: deploy HitungCuan dari branch `multi-tenant`

Selama `multi-tenant` belum digabung ke `main`, deploy HitungCuan membangun branch itu:

- Settings → Builds → **Production branch** = `multi-tenant`. Mengubah pengaturan ini **tidak**
  memicu build; build baru berjalan hanya setelah ada push ke branch tersebut.
- Build command `npm run build`. Deploy command `npx wrangler deploy --name <nama-worker-hitungcuan>`.
  `name` di `wrangler.jsonc` adalah nama Worker **keluarga**; jangan diubah dan jangan menerima PR
  otomatis Cloudflare yang menggantinya, karena file itu dipakai kedua deploy.
- Variabel `VITE_…` diisi di **Build → Variables and secrets** (terbaca saat build), bukan di
  Variables runtime.
- Setiap push ke `multi-tenant` langsung live di HitungCuan. Eksperimen dilakukan di branch lain
  (mis. `dev`) dan hanya yang sudah terbukti dimasukkan ke `multi-tenant`.
- Perbaikan di `main` (mis. parser Shopee) dibawa ke HitungCuan dengan `git merge main` di branch
  `multi-tenant`.

### Header keamanan (`dist/_headers`)

`npm run build` menulis `dist/_headers`, yang dibaca Cloudflare (Workers maupun Pages) untuk setiap
respons. Isinya dibuat di `vite.config.ts` (`headersFile`):

- **Content-Security-Policy**: browser hanya menjalankan skrip dari domain aplikasi sendiri (tanpa
  `eval`, tanpa skrip luar), dan hanya boleh mengirim data ke origin `VITE_SUPABASE_URL` build ini.
  Kalau suatu saat ada celah yang menyisipkan skrip, skrip itu tidak bisa mengirim data pelanggan ke
  server lain.
- **frame-ancestors 'none' / X-Frame-Options DENY**: aplikasi tidak bisa dipasang di dalam iframe situs
  lain (mencegah halaman palsu yang menipu pelanggan menekan tombol).
- `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` (kamera, mikrofon, lokasi,
  pembayaran dimatikan), `Cross-Origin-Opener-Policy`, dan HSTS 1 tahun (tanpa subdomain lain).
- File ber-hash di `/assets/*` disimpan browser selamanya; `index.html` tetap selalu dicek ulang,
  jadi deploy baru langsung terpakai.

Yang perlu diingat:

- **Mengganti project Supabase = build ulang.** CSP mengunci origin dari `VITE_SUPABASE_URL` saat
  build. Variabel ini memang sudah harus diisi di Build variables; kalau kosong, CSP memakai
  `*.supabase.co` (domain kustom Supabase akan diblokir).
- **Menambah layanan luar** (analytics, font CDN, gambar dari domain lain, Sentry) akan **diblokir**
  sampai domainnya ditambahkan di `headersFile`. Gejalanya: error "Refused to connect/load … Content
  Security Policy" di console browser.
- Vercel tidak membaca `_headers`. Deploy di Vercel tetap jalan, hanya tanpa header ini.

Cek setelah deploy (dari komputermu, bukan dari aplikasi):

```bash
curl -sI https://app.studioharel.id/ | grep -i 'content-security-policy\|x-frame-options\|strict-transport'
```

Ketiga baris harus muncul, dan `connect-src` harus berisi URL project Supabase HitungCuan (bukan
`*.supabase.co`). Lalu buka aplikasi, login, buka Rekap, dan upload satu PDF penghasilan: console
browser (F12) tidak boleh menampilkan error "Content Security Policy".

### Project keluarga

Cukup jalankan `20261012000000_multi_tenant.sql` sekali di project lama (cadangkan database
dulu: Supabase → Database → Backups, atau `pg_dump`). Ketiga akun yang sudah ada otomatis
dimasukkan sebagai anggota kedua toko oleh seed transisi, jadi tidak ada yang kehilangan
akses. `active_until` kedua toko dibiarkan kosong (tanpa batas). Akun yang dibuat sesudahnya
perlu ditambahkan manual (lihat bagian 2). Menjalankan migration yang sama sekali lagi
aman: seed tidak menambah apa pun.

### Sebelum pelanggan pertama

- [ ] Project HitungCuan sudah di paket Pro (backup aktif).
- [ ] **Semua migration** sudah dijalankan berurutan sampai `20261016000000_operations.sql`
      (cek: tabel `store_settings`, `fee_categories`, dan `client_errors` ada).
- [ ] **Pemantau error:** buka aplikasi, sengaja picu satu error (mis. buka halaman dengan akun yang
      belum punya migration), lalu pastikan `select * from public.client_error_summary;` menampilkannya.
      Pasang pengingat harian untuk mengecek ringkasan ini ([OPERASI.md](OPERASI.md) bagian 1).
- [ ] **Prosedur ekspor dan hapus data** sudah kamu latih di toko uji
      ([OPERASI.md](OPERASI.md) bagian 3 dan 4), termasuk cara memverifikasi peminta.
- [ ] **`VITE_SUPPORT_WA` terisi** di variabel hosting (format `62…`), lalu deploy ulang. Tanpa itu
      tombol hijau **Bantuan** (pojok kanan bawah, juga di halaman login) tidak tampil, dan
      "Lupa password?", "Perpanjang lewat WhatsApp", "Laporkan file ini", serta "Minta salinan data" /
      "Minta hapus data & akun" disembunyikan (pelanggan tidak punya jalur kontak). Cek:
      buka halaman login, klik "Lupa password?", harus membuka WhatsApp ke nomormu. Build produksi
      juga menulis peringatan di console browser kalau variabel ini kosong.
- [ ] **Uji pemisahan data antar-toko lulus** (`npm run check:tenants`, lihat bagian di bawah).
      Ulangi setiap kali ada migration baru.
- [ ] Toko dengan `active_until` kemarin menampilkan Rekap baca-saja dengan banner "Langganan habis";
      upload dan perubahan data ditolak.
- [ ] **File asli calon pelanggan sudah diuji** (lihat bagian di bawah).
- [ ] Signup publik mati, dan tidak ada `service_role` key di variabel hosting atau di git.
- [ ] **Header keamanan aktif** di domain produksi (perintah `curl` di bagian "Header keamanan").
- [ ] Sudah berlatih `admin_add_customer` dan memperpanjang lewat SQL.

### Uji pemisahan data antar-toko

Semua pelanggan memakai satu database. Yang memisahkan data toko A dari toko B hanyalah aturan
RLS di database. Membaca SQL migration tidak membuktikan aturan itu benar-benar aktif di project
yang sedang jalan (misalnya kalau satu migration terlewat, atau ada view yang dibuat ulang tanpa
`security_invoker`). Skrip `scripts/check-tenant-isolation.mjs` mengujinya langsung: login sebagai
akun A lalu mencoba membobol toko B.

1. Buat **dua akun tes** dengan cara yang sama seperti pelanggan (bagian d), mis.
   `tes-a@domainmu.id` → "Toko Tes A" dan `tes-b@domainmu.id` → "Toko Tes B". Jangan pakai akun
   pelanggan sungguhan, dan jangan jadikan kedua akun anggota toko yang sama.
2. Isi toko B dengan data supaya ada yang bisa "dicuri": `npm run sample -- "Toko Tes B"`, login
   sebagai akun B, lalu upload isi folder `sample-store/` (urutannya ada di `BACA-DULU.txt`). Toko
   yang kosong tetap diuji, tapi cek baca per tabel jadi DILEWATI.
3. Isi `.env.local` (atau variabel shell) lalu jalankan:

   ```bash
   # .env.local sudah berisi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY project HitungCuan
   TEST_A_EMAIL=tes-a@domainmu.id TEST_A_PASSWORD=... \
   TEST_B_EMAIL=tes-b@domainmu.id TEST_B_PASSWORD=... \
   npm run check:tenants
   ```

   Butuh Node 22.9 atau lebih baru. Hanya anon key yang dipakai, sama seperti di browser
   pelanggan; jangan pernah isi `service_role` key di sini.

Yang dicoba sebagai akun A: membaca semua tabel dan view toko B, mengubah dan menghapus satu baris
penanda di toko B, menulis biaya, kategori, penghasilan, dan pesanan ke toko B (langsung maupun
lewat fungsi upload), menambahkan dirinya sebagai anggota toko B, memperpanjang langganannya sendiri,
membaca laporan error, dan memanggil fungsi `admin_*`. Juga membaca tanpa login sama sekali.

Cara membaca hasilnya:

| Status | Artinya | Yang dilakukan |
|---|---|---|
| **LULUS** | Percobaan ditolak atau hasilnya kosong | Tidak ada |
| **GAGAL** | Percobaan berhasil: ada celah | Jangan terima pelanggan dulu. Cek migration yang terlewat untuk tabel itu |
| **CEK** | Ditolak dengan error lain, jadi belum terbukti aman | Baca pesannya. Biasanya koneksi, atau migration belum dijalankan |
| **DILEWATI** | Tidak ada data toko B untuk dicoba | Isi toko B (langkah 2) lalu ulangi |

Kode keluar 0 hanya kalau tidak ada GAGAL dan CEK. Skrip menulis satu baris biaya bulan
**Januari 1999** di toko B (lewat akun B sendiri) sebagai penanda, lalu menghapusnya di akhir. Setiap
tulisan percobaan yang ternyata tembus juga dihapus, dan `active_until` toko A dikembalikan kalau
sempat berubah. Fungsi admin hanya dipanggil dengan argumen yang tidak bisa merusak (hapus toko
dalam mode hitung saja, dengan nama toko yang sengaja salah). Kalau skrip terputus di tengah jalan,
hapus sisa penanda lewat SQL Editor (ganti angka dengan `store_id` kedua toko tes):

```sql
delete from public.expenses where store_id in (11, 12) and month = '1999-01-01';
delete from public.income where store_id in (11, 12) and released_date = '1999-01-01';
delete from public.order_items where store_id in (11, 12) and order_no = 'uji-pemisahan-toko';
delete from public.products where store_id in (11, 12) and sku = 'uji-pemisahan-toko';
delete from public.fee_categories where store_id in (11, 12) and name = 'uji-pemisahan-toko';
```

### Menguji file asli calon pelanggan

Parser dibangun dari file satu keluarga. Format export bisa berbeda untuk penjual lain (Shopee
Mall/Star, kategori lain, bahasa akun, versi file Shopee). Ini risiko terbesar sebelum jualan luas,
dan hanya bisa ditutup dengan file asli. **Uji 3–5 calon pelanggan dari jenis toko yang berbeda**
(satu toko Star atau Mall, satu toko kecil, satu yang memakai iklan banyak).

Cara paling aman: **jangan minta file dikirim ke kamu.** Export pesanan memuat nama dan alamat
pembeli. Duduk bersama calon pelanggan (atau lewat layar bersama), buat toko uji untuk mereka
(`admin_add_customer`), dan biarkan mereka upload sendiri. Aplikasi hanya membaca kolom yang
dibutuhkan dan tidak menyimpan data pembeli.

Untuk tiap toko, cek dan catat:

| # | Cek | Lulus kalau |
|---|---|---|
| 1 | Upload export pesanan (.xlsx, status Semua) | Tidak ada error; jumlah pesanan/barang di pratinjau sama dengan di Seller Centre |
| 2 | Upload laporan penghasilan (PDF) | Tidak ada error; total penghasilan di pratinjau sama dengan total di PDF |
| 3 | Rekap bulan itu | Uang masuk sama dengan total PDF; tidak ada peringatan "uang cair yang pesanannya belum di-upload" selain yang memang wajar (pesanan bulan sebelumnya) |
| 4 | Upload CSV iklan (ketiga jenis) | Total biaya sama dengan di Seller Centre; produk iklan cocok dengan produk di pesanan |
| 5 | Nama toko di PDF vs nama toko di akun | Peringatan "Nama toko berbeda" hanya muncul kalau memang beda toko |
| 6 | Potongan Shopee di Iklan (dari laporan penghasilan) | Wajar (sekitar 10–25%), bukan 15% bawaan |

Kalau ada file yang gagal dibaca, aplikasi menampilkan tombol **Laporkan file ini ke pengelola lewat
WhatsApp** (hanya nama file dan pesan error yang dikirim, isi file tidak). Catat: jenis file, pesan
error di bagian "Detail teknis", jenis akun toko (Star/Mall/biasa), dan versi Seller Centre
(tanggal export). Dengan itu parser bisa diperbaiki tanpa melihat data pembeli; fixture dummy
bisa dibuat dengan `scripts/make-fixtures.mjs` untuk mereproduksi bentuk file yang bermasalah.
