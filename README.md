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

---

## Daftar isi

1. [Setup Supabase](#1-setup-supabase)
2. [Membuat akun pengguna](#2-membuat-akun-pengguna)
3. [Deploy ke Vercel](#3-deploy-ke-vercel)
4. [Cara pakai setiap bulan](#4-cara-pakai-setiap-bulan)
5. [Menjalankan di komputer sendiri](#5-menjalankan-di-komputer-sendiri-developer)
6. [Privasi data](#6-privasi-data)
7. [Kalau Shopee mengganti format file](#7-kalau-shopee-mengganti-format-file)

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

   Kalau muncul tulisan *NOTICE … skipping*, itu normal (artinya bagian itu sudah ada).
4. **Matikan pendaftaran publik** (wajib):
   **Authentication → Sign In / Providers** → matikan **Allow new users to sign up** → **Save**.
   Pastikan provider **Email** tetap aktif.
   (Nama menu bisa sedikit berbeda antar versi dashboard; cari pengaturan "sign up" di bagian
   Authentication.)
5. Ambil kunci untuk aplikasi: **Project Settings → API** (atau **API Keys**):
   - **Project URL** → nanti diisi ke `VITE_SUPABASE_URL`
   - **anon / publishable key** → nanti diisi ke `VITE_SUPABASE_ANON_KEY`

> ⚠️ Jangan pernah memakai **service_role / secret key** di aplikasi atau di Vercel.
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

## 2. Membuat akun pengguna

Karena pendaftaran publik dimatikan, akun dibuat manual oleh pemilik:

1. **Authentication → Users → Add user → Create new user**.
2. Isi email dan password, centang **Auto Confirm User**, lalu **Create user**.
3. Ulangi untuk 3 orang (Anda, cici, adik). Semua akun bisa mengakses kedua toko.

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

Lakukan di awal bulan untuk menghitung bulan sebelumnya (contoh: awal September untuk Agustus).

1. **Download dari Shopee Seller Centre** (per toko):
   - **Export pesanan**: Pesanan Saya → Export (.xlsx), status **Semua**. Ambil rentang yang agak
     lebar, misalnya **dari pertengahan bulan sebelumnya sampai akhir bulan ini**, karena dana yang
     cair di awal bulan sering berasal dari pesanan bulan sebelumnya. Data yang sama tidak akan
     dobel, dan pesanan yang tadinya "dikirim" otomatis berubah jadi selesai saat di-upload lagi.
   - **Laporan penghasilan**: Keuangan → Penghasilan Saya → laporan bulanan (.pdf).
   - **Data iklan**: Iklan Saya → Download Data, periode **1 bulan penuh** (tanggal 1 – akhir
     bulan). Download *Data Keseluruhan*, *Rincian Data Iklan Produk Otomatis*, dan (kalau memakai
     grup iklan) *Semua Data Grup Iklan* — semuanya .csv dengan periode yang sama.
Toko dipilih di **menu kanan atas** dan berlaku untuk semua halaman.

2. **Upload**: cek nama toko di kotak oranye → pilih file Excel dan/atau PDF → cek preview →
   **Simpan ke …**.
3. **HPP**: isi HPP untuk produk yang masih merah (produk baru otomatis masuk dari upload).
   HPP diisi **per 1 unit yang dijual di Shopee** — untuk paket grosir, isi HPP per paket.
   Kalau HPP diisi *setelah* upload, buka **Rekap** dan tekan **Hitung ulang HPP** untuk bulan itu.
4. **Iklan**: pilih semua file .csv iklan sekaligus → **Simpan ke …**. Biaya Iklan Shopee bulan itu
   terisi otomatis dari *Data Keseluruhan*. Untuk cek mingguan, upload data iklan 7 hari — periode
   yang bukan 1 bulan penuh hanya untuk analisis dan **tidak** mengubah Biaya.
   - Upload export pesanan untuk periode yang sama dulu: laporan iklan Shopee ikut menghitung
     pesanan yang kemudian **batal**, dan aplikasi menguranginya dari data pesanan (**ROAS nyata**).
   - **Saran target ROAS di Shopee** = angka untuk diisi di pengaturan iklan supaya masih untung 5%
     dari harga jual setelah iklan. Potongan Shopee diambil dari laporan penghasilan (kalau belum
     ada, dipakai 15%). Target 5% dan 20% bisa diubah di `src/lib/adsMath.ts`.
5. **Biaya**: isi Meta Ads, packaging, lain-lain (iklan Shopee sudah terisi dari langkah 4). Kalau
   tidak ada biaya, simpan Rp0.
6. **Rekap**: pilih bulan (atau "Lihat beberapa bulan").
   - **Kotak untung bersih** dibaca seperti nota: uang masuk dari Shopee − modal barang terjual −
     biaya = **untung bersih**. Ini dari barang yang *sudah sampai & uangnya cair* di bulan itu.
     Tombol **ⓘ Kenapa …?** menjelaskan kenapa jumlah barang terjual beda dengan barang dipesan.
   - Tab **Semua pesanan**: semua pesanan yang *dibuat* di bulan itu (selesai, masih dikirim,
     batal), plus **perkiraan untung** dari pesanan yang selesai. Perkiraan, karena Shopee hanya
     mencatat uang cair per hari, bukan per pesanan.
   - Tab **Per produk**: barang terjual dan modal per produk, plus daftar barang retur.
   - Tab **Per bulan** (kalau melihat beberapa bulan).

   Kalau statusnya **✅ Angka final**, untung bersih adalah angka
   pasti. Kalau **⚠️ Belum lengkap**, ikuti daftar yang ditampilkan (mis. upload export pesanan
   bulan sebelumnya, isi HPP, isi biaya).

Aturan penting:
- **Upload file yang sama berkali-kali aman** — tidak ada data dobel.
- **HPP dikunci saat upload.** Mengubah HPP tidak mengubah profit bulan yang sudah tersimpan,
  kecuali lewat tombol **Hitung ulang HPP**.

## 5. Menjalankan di komputer sendiri (developer)

Butuh Node.js 22 atau lebih baru.

```bash
npm install
cp .env.example .env.local   # lalu isi URL dan anon key Supabase
npm run dev                  # buka http://localhost:5173
npm test                     # test parser, format, status bulan
npm run build                # build production ke dist/
```

- Fixture test (data **dummy**) ada di `tests/fixtures/`, dibuat ulang dengan `npm run fixtures`.
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
src/lib/monthStatus.ts Logika status "Angka final / Belum lengkap"
src/lib/adsMath.ts     Analisis iklan: ROAS nyata, balik modal, saran ROAS, label
src/pages/             Halaman Login, Upload, HPP, Biaya, Rekap, Iklan
tests/                 Test Vitest + fixture dummy
scripts/make-fixtures.mjs  Pembuat fixture dummy
```
