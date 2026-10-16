# CONTEXT — Profit Shopee

Ringkasan proyek untuk siapa pun yang melanjutkan pengembangan (developer atau asisten AI seperti
Claude/ChatGPT). Baca ini dulu sebelum mengubah kode. Untuk **pemakai aplikasi**, panduannya ada di
[PANDUAN.md](PANDUAN.md); untuk **setup** (Supabase, akun, deploy) ada di [README.md](README.md).

---

## 1. Aplikasi ini apa

Web app internal untuk menghitung **untung bersih per bulan** dua toko Shopee kosmetik milik satu
keluarga: **Harel Beauty** dan **Oraiste Beauty House**. Dipakai 3 orang (pemilik, cici, adik) yang
**bukan orang teknis**, terutama di **laptop** (HP/iPad juga harus jalan).

Pertanyaan yang dijawab aplikasi:
1. Bulan ini untung berapa? (Rekap)
2. Iklan mana yang dimatikan, dipertahankan, atau dinaikkan ROAS-nya? (Iklan)
3. Sebelum jualan / ganti harga: jual berapa, target ROAS berapa? (Simulasi Harga)

```
Untung bersih = Penghasilan dilepas Shopee − Modal (qty terjual × HPP) − Biaya
```

## 2. Aturan wajib (jangan dilanggar)

- **Bahasa Indonesia** untuk semua teks di aplikasi dan dokumen pemakai. Bahasa sederhana, tanpa
  istilah teknis yang tidak perlu.
- **Privasi pembeli**: nama, alamat, no. HP, username, catatan pembeli, dan no. resi **tidak
  pernah dibaca maupun disimpan**. Daftarnya di `BUYER_PRIVATE_COLUMNS`
  (`src/lib/shopeeColumns.ts`) dan ada test yang menjaganya.
- **File Shopee asli** hanya boleh ada di `sample-data/` (di-gitignore). Jangan pernah di-commit,
  disalin ke folder lain, atau isi kolom pembelinya ditampilkan. Screenshot review di
  `.impeccable/review/` juga di-gitignore.
- **Auth tertutup**: pendaftaran publik dimatikan; akun dibuat manual di Supabase. Semua tabel
  dilindungi RLS (hanya user login).
- **Perubahan database** hanya lewat file SQL **baru** di `supabase/migrations/` (aman dijalankan
  ulang, tidak menghapus data). Pemilik menjalankannya manual di SQL Editor Supabase, jadi setiap
  fitur yang butuh SQL **harus disebutkan jelas** ke pemilik.
- **Upload ulang file yang sama harus aman** (upsert, tidak dobel).
- **HPP dikunci saat upload** (`hpp_snapshot`); mengubah HPP tidak mengubah bulan yang sudah
  tersimpan kecuali lewat tombol **Hitung ulang HPP**.
- Setiap perubahan: `npm test` dan `npm run build` harus lulus.

## 3. Stack & deploy

- React 19 + Vite + TypeScript + Tailwind CSS v4 (token di `@theme`, `src/index.css`).
- Supabase (Postgres + Auth + RLS). Kunci yang dipakai aplikasi: `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY` (anon/publishable, aman di browser). **Jangan** pakai service_role.
- File dibaca **di browser**: SheetJS (`xlsx`) untuk export pesanan, pdf.js untuk laporan
  penghasilan, parser CSV sendiri untuk data iklan. File asli tidak pernah di-upload ke server.
- Vitest untuk test. Tidak ada library animasi/chart/UI tambahan.
- **Deploy saat ini: Cloudflare Workers Builds** (static assets).
  - `main` → website utama (production).
  - Branch lain → *Preview* lewat `npx wrangler preview`, yang butuh `wrangler.jsonc` dengan blok
    `"previews": {}` (sudah ada).
  - Env var `VITE_SUPABASE_*` diatur di dashboard Cloudflare (pastikan berlaku juga untuk preview).
  - README masih menjelaskan Vercel; aplikasi bisa di-host di keduanya karena hanya file statis.
- Navigasi pakai hash (`#/rekap`, `#/iklan?…`), lihat `src/lib/router.ts`. Halaman default: Rekap.

## 4. Struktur kode

```
supabase/migrations/      Skema, RLS, fungsi upsert, view rekap (urut nama file)
src/lib/shopeeColumns.ts  SATU-SATUNYA tempat nama kolom Excel/label PDF/kolom CSV Shopee
src/lib/parsers/          orders.ts (xlsx), income*.ts + pdfText.ts (pdf), ads.ts (csv), common.ts
src/lib/api.ts            Semua query Supabase
src/lib/monthStatus.ts    Status bulan "Angka final / Belum lengkap" (+ uang cair geser 1–2 hari)
src/lib/recapMath.ts      Perkiraan untung dari pesanan & alur "kenapa X barang, bukan Y"
src/lib/adsMath.ts        Iklan per produk, simulasi harga, grup iklan, saran harga dari modal
src/lib/format.ts         Format Rupiah/angka/bulan (formatRupiahShort = "Rp2,78 juta", dibulatkan ke bawah)
src/pages/                Login, Upload, HPP, Biaya (ExpensesPage), Rekap, Iklan, Simulasi Harga
src/pages/AdGroupSim.tsx  Tab "Grup iklan" di Simulasi; simShared.tsx = helper bersama Simulasi
src/components/           ui.tsx (Button, Card, Alert, Stamp, …), pickers.tsx, icons.tsx, motion.tsx
src/index.css             Token warna/huruf, kelas animasi, aturan reduced-motion
tests/                    Test Vitest; fixture DUMMY di tests/fixtures (npm run fixtures)
PRODUCT.md / DESIGN.md    Fakta produk & sistem desain (dipakai skill desain Impeccable)
.impeccable/              Sidecar desain (design.json, surface brief)
```

Fungsi hitungan dibuat **murni** (tanpa Supabase) di `src/lib/*` supaya bisa dites; halaman hanya
memuat data dan menampilkan.

## 5. Data & database

Migrasi (jalankan berurutan; semua sudah dijalankan di production per Oktober 2026):

| File | Isi |
|---|---|
| `20260930000000_init.sql` | Tabel toko, produk, order_items, income, expenses; RLS; view rekap |
| `20261004000000_income_adjustments.sql` | Biaya penyesuaian dari laporan penghasilan |
| `20261005000000_all_order_statuses.sql` | Semua status pesanan (selesai/proses/batal) + "Pesanan masuk" |
| `20261006000000_ads.sql` | Laporan & baris data iklan (halaman Iklan) |
| `20261007000000_product_fee_settings.sql` | Kolom `admin_pct` & `xtra` per produk (Simulasi) |

Sumber data per bulan per toko:
- **Export pesanan** (.xlsx, status Semua) → `order_items` (qty, subtotal, status, waktu dibuat &
  selesai, SKU, `hpp_snapshot`).
- **Laporan penghasilan** (.pdf) → `income` per tanggal dana dilepas + penyesuaian.
- **Data iklan** (.csv: Data Keseluruhan, Rincian Iklan Produk Otomatis, Semua Data Grup Iklan) →
  `ad_reports` / `ad_rows`. Data 1 bulan penuh otomatis mengisi Biaya → Iklan Shopee.
- **HPP** diisi manual per produk/variasi; **Biaya** (Meta Ads, packaging, lain-lain) manual.

Modal dihitung dari item **Selesai** yang selesai di bulan itu (dana cair di hari pesanan selesai).
Qty retur tidak dihitung.

## 6. Rumus & aturan bisnis penting

Konstanta di `src/lib/adsMath.ts`:
`ADS_TARGET_PROFIT = 5%` (untung setelah iklan), `PRICE_TARGET_MARGIN = 20%`,
`DEFAULT_FEE_RATE = 15%` (kalau laporan penghasilan belum ada), `MIN_SALES_FOR_VERDICT = 3`,
`HERO_FACTOR = 1,2`, `MAX_TARGET_ROAS = 50`, `XTRA_FEE_RATE = 4%`.

**Status bulan (Rekap)** — "Angka final" kalau: PDF penghasilan bulan itu ada, semua uang cair
ketemu pesanannya (selisih yang tanggalnya geser ≤ 2 hari dianggap cocok), semua barang punya HPP,
dan biaya sudah disimpan (boleh Rp0).

**Iklan per produk**
- ROAS nyata = omzet iklan tanpa pesanan batal ÷ biaya iklan.
- ROAS balik modal = harga ÷ untung per barang (sebelum iklan, setelah potongan Shopee rata-rata).
- Target ROAS (untung 5%) = 1 ÷ (margin − 5%); target untuk Shopee dinaikkan dengan porsi batal.
- Label: **Takedown** (iklan rugi / habis tanpa penjualan), **ROAS terlalu kecil**, **Aman**,
  **Hero** (ROAS nyata ≥ target × 1,2), **Data belum cukup** (< 3 terjual), **HPP kosong**.

**Simulasi Harga (satu produk)** — potongan dihitung per komponen:
admin % × harga + XTRA 4% × harga + biaya proses tetap per order (bawaan Rp1.250) + packaging.
- Untung per order = harga − potongan − HPP − packaging.
- Balik modal ROAS = harga ÷ untung; target ROAS = 1 ÷ (margin − 5%), dibulatkan ke atas 2 desimal.
- Harga saran = biaya tetap ÷ (1 − admin% − XTRA% − porsi), dibulatkan ke atas ke Rp1.000.
- **Saran harga dari modal** (`priceLadder`): kalau harga jual kosong → harga balik modal di ROAS
  realistis, harga **disarankan** (untung 5% setelah iklan di ROAS realistis), harga untung 20%,
  lalu +10/20/50%. Contoh modal Rp5.000 → jual Rp10.000, target ROAS 4,94.

**Grup iklan** (`simulateAdGroup`, satu target ROAS untuk beberapa produk, **tidak disimpan**):
- Target **sesuai porsi** = margin gabungan tertimbang jumlah terjual → 1 ÷ (margin − 5%).
- Target **aman** = target tertinggi di antara produk (semua produk tetap untung 5%).
- Disarankan target aman kalau ada produk yang porsinya belum diketahui (produk baru) atau porsi
  nol semua; selain itu target sesuai porsi. Ditunjukkan produk yang menentukan target aman dan
  produk yang rugi di ROAS grup.

## 7. Halaman

| Halaman | Isi |
|---|---|
| Rekap | Cerita 4 bab: Untung (kalimat + angka besar + batang "Dari setiap Rp100"), Dari mana angkanya, Iklan bulan itu, Pesanan & produk (tab). Bisa beberapa bulan. |
| Iklan | Upload CSV, ringkasan "iklan untung/rugi", kartu per produk dengan label, gabungan beberapa bulan. |
| Simulasi Harga | Tab **Satu produk** (termasuk saran harga dari modal) dan **Grup iklan**. Hanya % admin & XTRA per produk yang bisa disimpan. |
| Upload | Export pesanan (.xlsx) + laporan penghasilan (.pdf), preview, simpan. |
| HPP | Isi HPP per produk/variasi; filter yang belum diisi. |
| Biaya | Iklan Shopee, Meta Ads, packaging, lain-lain per bulan. |

## 8. Desain ("Cerita Bulan Ini")

Detail di [DESIGN.md](DESIGN.md). Intinya:
- Setiap halaman **menjawab dulu dalam satu kalimat** di atas bidang biru tinta (`#2b2fa6`), lalu
  rinciannya di lembar putih. Angka jawaban berwarna limau (`#d7f45a`); rugi di atas biru pakai
  `coral-soft #ff9b85`.
- Teks di atas bidang biru dibungkus kelas `on-field` (warna & cincin fokus limau). Jangan pakai
  warna ink di atas bidang biru.
- Huruf: Bricolage Grotesque (kalimat & angka besar), Public Sans (lainnya, angka tabular).
- Vonis = stiker (`Stamp`). Gerak hanya untuk perubahan keadaan, semuanya mati saat
  `prefers-reduced-motion`. Konfeti hanya saat upload tersimpan & pertama kali "Angka final".
- Tidak boleh scroll ke samping dari lebar 360px; tombol/kolom minimal 44px.
- Desain dikerjakan dengan skill Impeccable / Uizze; detektornya harus 0 temuan.

## 9. Cara kerja pengembangan

```bash
npm install
cp .env.example .env.local   # isi URL & anon key Supabase
npm run dev                  # http://localhost:5173
npm test                     # semua test (file asli di sample-data/ ikut dites kalau ada)
npm run build
```

- Kalau Shopee mengganti format file: ubah `src/lib/shopeeColumns.ts` saja, lalu `npm test`.
- Fitur baru: logika di `src/lib/*` + test di `tests/`, tampilan di `src/pages/*`, lalu perbarui
  **PANDUAN.md** (cara pakai) dan README/CONTEXT kalau ada SQL atau setup baru.
- Cek tampilan di laptop (1440px) dan HP (390px); pastikan tidak ada scroll ke samping.

## 10. Riwayat singkat

| PR | Isi |
|---|---|
| #1–#13 | Upload & parser, HPP, Biaya, Rekap + status bulan, iklan per produk & gabungan, Simulasi Harga + pilih produk & simpan % admin/XTRA, PANDUAN |
| #14 | Redesain "Nota kasir" (tahap 1 + 2) |
| #15 | Untung bersih di atas, menu bawah di HP |
| #16 | Animasi (cap, nota tercetak, konfeti) |
| #17 | Redesain **"Cerita Bulan Ini"** (dipilih dari 3 preview), `wrangler.jsonc` untuk deploy branch, **Grup iklan**, **Saran harga dari modal** |

## 11. Ide yang belum dikerjakan

- Menyimpan grup iklan (butuh tabel + SQL baru; pemilik memilih "tidak disimpan" dulu).
- Membandingkan ROAS nyata grup dari data iklan dengan target grup.
- Memperbarui bagian deploy di README dari Vercel ke Cloudflare.
