# Konteks Landing Page — Profit Shopee

Bahan untuk membuat landing page (ditulis dari PRODUCT.md, DESIGN.md, PANDUAN.md, README.md dan
kode aplikasi). Setiap klaim diberi label: **[Certain]** = ada di kode/dokumen, **[Likely]** =
kesimpulan kuat, **[Guessing]** = usulan saya, belum ada bukti.

---

## 0. Keputusan yang harus diambil dulu (baca ini sebelum menulis satu baris pun)

1. **[Certain] Produk ini internal dan tertutup.** Tiga akun manual, tanpa pendaftaran publik
   (PRODUCT.md, README §2). Tidak ada halaman harga, tidak ada onboarding mandiri, tidak ada
   dukungan pelanggan. Landing page yang menjanjikan "Daftar gratis" akan bohong.
2. **[Certain] Tidak ada bukti sosial.** PRODUCT.md: "No testimonials, metrics or external claims
   exist; none should be invented." Tidak ada testimoni, jumlah pengguna, atau klaim "hemat X
   jam". Semua itu harus dikosongkan atau dibuat dari data nyata nanti.
3. **[Certain] Tidak ada logo dan warna brand yang mengikat** (PRODUCT.md "Brand Commitments").
   Yang ada hanya sistem desain "Cerita Bulan Ini" di aplikasi.

Jadi pilih **satu** dari tiga arah. Rekomendasi saya ada di nomor A.

| | Arah | Cocok kalau | Konsekuensi |
|---|---|---|---|
| **A** | **Pintu depan untuk 3 orang keluarga** (pengganti/pelengkap halaman Login) | Tujuannya rapi, jelas, bisa dibuka dari HP | Cukup 1 layar, tanpa CTA daftar. Risiko kecil. |
| **B** | **Halaman perkenalan untuk penjual Shopee lain** (waitlist / minta demo) | Kamu mau menjajaki jadi produk | Butuh keputusan hukum + produk di bawah. Lihat §9. |
| **C** | **Portofolio / studi kasus** | Kamu mau menunjukkan karya | Pakai data dummy saja; jangan tampilkan angka toko asli. |

> **[Likely]** Kalau kamu belum bisa menjawab "siapa yang akan mengklik tombolnya dan apa yang
> terjadi setelah itu", landing page-nya belum waktunya dibuat. Konten di bawah ditulis supaya
> bisa dipakai untuk A, B, atau C; bagian yang hanya relevan untuk B/C ditandai.

---

## 1. Satu kalimat

**[Certain]** Aplikasi web yang mengubah file export Shopee (pesanan Excel, laporan penghasilan
PDF, data iklan CSV) menjadi tiga jawaban: *untung bersih bulan ini berapa, iklan mana yang rugi,
dan harga berapa yang layak.*

Rumus inti (ada di README dan PANDUAN):

```
Untung bersih = Uang masuk dari Shopee − Modal barang terjual (qty × HPP) − Biaya
```

## 2. Masalah yang diselesaikan

**[Certain]** (dari PRODUCT.md "Users", "Product Purpose")

- Dashboard Shopee menampilkan omzet, bukan untung. Potongan admin, Gratis Ongkir XTRA, biaya
  proses, voucher, refund, dan modal barang tidak otomatis jadi satu angka akhir.
- ROAS di laporan iklan Shopee ikut menghitung **pesanan yang kemudian batal**, jadi terlihat
  lebih bagus dari kenyataan. Produk dengan untung tipis butuh ROAS sangat tinggi hanya untuk
  balik modal, dan itu tidak terlihat di Shopee.
- Penghitungan manual di spreadsheet tiap bulan: lambat, rawan salah, dan tidak ada yang yakin
  angkanya final.

**[Likely]** Kalimat ini cocok jadi inti headline: *"Omzet bukan untung."* Itu yang membedakan,
dan itu sudah benar secara isi aplikasi.

## 3. Siapa pemakainya

- **[Certain]** Tiga orang satu keluarga: pemilik, cici, adik. Dua toko: **Harel Beauty** dan
  **Oraiste Beauty House**. Bukan orang teknis. Terutama laptop/PC; iPad dan HP sekunder.
- **[Guessing]** Untuk arah B, target yang logis adalah penjual Shopee kecil-menengah di
  Indonesia dengan modal/HPP per produk dan beriklan di Shopee Ads. Belum ada riset yang
  memastikan ini.

## 4. Fitur yang boleh diklaim (semuanya ada di kode)

| Fitur | Apa yang dilakukan | Sumber |
|---|---|---|
| **Rekap** | Untung bersih per bulan, diceritakan dalam 4 bab: Untung, Dari mana angkanya, Iklan, Pesanan & produk. Ada status **Angka final** / **Belum lengkap** yang memberi tahu data apa yang masih kurang. | PANDUAN §7 |
| **Iklan** | Per produk: ROAS nyata (pesanan batal sudah dikurangi), ROAS balik modal, saran target ROAS agar untung 5% setelah iklan, dan label Hero / Aman / ROAS terlalu kecil / Takedown / Data belum cukup / HPP belum diisi. Bisa gabung beberapa bulan. | PANDUAN §8 |
| **Simulasi Harga** | Sebelum jualan atau ganti harga: untung per order, harga minimum balik modal, harga yang disarankan, target ROAS. Isi HPP saja, harga dicarikan. Ada mode **Grup iklan** (beberapa produk, satu target ROAS). | PANDUAN §9 |
| **Upload / HPP / Biaya** | Rutinitas bulanan: upload file Shopee, isi modal per produk, isi biaya (Meta Ads, packaging, lain-lain). | PANDUAN §4–6 |
| **Dua toko, satu login** | Toko dipilih sekali di header, berlaku di semua halaman. | PRODUCT.md |

### Keunggulan yang spesifik (bukan generik)

Semuanya **[Certain]**, dari PRODUCT.md "Positioning" dan PANDUAN §1, §5, §8:

1. **Bulan dihitung dari tanggal uang cair**, bukan tanggal pesanan dibuat.
2. **HPP dikunci saat upload.** HPP naik bulan ini, untung bulan lalu tidak ikut berubah.
3. **Pesanan batal dikurangi dari angka iklan Shopee**, jadi ROAS yang tampil adalah ROAS nyata.
4. **Potongan Shopee dihitung per komponen** (admin %, XTRA, biaya proses tetap), bukan rata-rata.
5. **Aman diulang.** Upload file yang sama dua kali tidak membuat data dobel.
6. **Setiap angka punya asal-usul.** Ada bagian "Dari mana angkanya" dan status final/estimasi.
7. **Menolak, bukan diam-diam salah.** Kalau format file Shopee berubah, aplikasi menolak dengan
   pesan jelas (README §7).

## 5. Privasi (poin jual yang kuat dan benar)

**[Certain]** (README §6, `src/lib/shopeeColumns.ts`, ada test-nya)

- Nama pembeli, alamat, no. HP, username, catatan, dan no. resi **tidak pernah dibaca maupun
  disimpan**.
- File dibaca **di browser**; file aslinya tidak diunggah ke server.
- Yang disimpan hanya yang perlu untuk hitungan: no. pesanan, produk, variasi, SKU, qty, status,
  waktu selesai, subtotal, angka penghasilan per tanggal.
- Akses hanya untuk user yang login (Supabase RLS), pendaftaran publik mati.

**Peringatan [Certain]:** jangan menulis "data tidak pernah meninggalkan perangkat". Itu salah.
File mentah tidak diunggah, tetapi hasil olahan **disimpan di database Supabase**. Tulis persis
seperti daftar di atas.

## 6. Cara kerja (3 langkah untuk landing page)

**[Certain]** Disarikan dari PANDUAN §2 dan §3.

1. **Download dari Shopee Seller Centre**: export pesanan (.xlsx, status "Semua"), laporan
   penghasilan (.pdf), data iklan (.csv).
2. **Upload ke Profit Shopee**: pilih file, cek preview, simpan. Isi HPP yang masih merah, isi
   biaya.
3. **Baca ceritanya**: "Agustus 2026, Harel Beauty untung **Rp2,78 juta**." Lalu lihat iklan mana
   yang sebaiknya dimatikan.

## 7. Suara dan bahasa

**[Certain]** (PRODUCT.md, DESIGN.md)

- Seluruh teks **Bahasa Indonesia sehari-hari**. Tidak ada istilah teknis tanpa penjelasan.
- Format uang: `Rp1.250.000`; ringkas: `Rp2,78 juta` (dibulatkan ke bawah, angka pasti
  menyusul).
- **Jawaban dulu, hitungan kemudian.** Prinsip aplikasi: kalimat jawaban besar di atas, rincian
  di bawah. Landing page sebaiknya meniru: headline = jawaban, bukan slogan.
- Istilah baku (PANDUAN §11): HPP, uang cair, ROAS nyata, Balik modal, Takedown, Hero, Angka final.

Contoh copy yang sudah ada di aplikasi (boleh dipakai ulang):

- Login: *"Berapa untung toko bulan ini?"* / *"Masuk dulu, ceritanya langsung muncul."*
- Rekap: *"Agustus 2026, Harel Beauty untung Rp2,78 juta."*
- Iklan: *"Juli 2026, iklan rugi Rp283 ribu."*
- Simulasi: *"Dijual Rp198.200, untung Rp9.671 per order."* /
  *"Modal Rp5.000: jual minimal Rp10.000, isi target ROAS 4,94."*

**Usulan headline [Guessing]**, untuk diuji, bukan fakta:

- "Omzet bukan untung. Ini untung bersih toko Shopee kamu bulan ini."
- "Iklan ramai, tapi untung nggak? Cek iklan mana yang sebenarnya rugi."

## 8. Sistem visual (kalau mau konsisten dengan aplikasi)

**[Certain]** dari DESIGN.md. Nama sistemnya **"Cerita Bulan Ini"**.

- **Satu bidang warna penuh**: biru tinta `#2b2fa6` sebagai latar seluruh halaman. Warna
  berkomitmen di skala halaman, bukan bintik-bintik aksen.
- **Lime `#d7f45a`** hanya untuk angka jawaban, kicker, penanda, dan stiker positif.
- **Coral `#c4361e`** untuk iklan/rugi (di atas biru pakai coral-soft `#ff9b85`).
- **Lembar putih** `#ffffff` radius 24px untuk konten kerja; teks ink `#16173d` hanya di atas
  putih, teks `#f6f4ff` hanya di atas biru. Jangan ditukar.
- **Huruf**: Bricolage Grotesque (judul, kalimat jawaban, angka besar) dan Public Sans (isi).
  Keduanya sudah ada di `public/fonts/` (lisensi OFL), jadi boleh dipakai ulang tanpa CDN.
- **Bentuk**: tombol dan stiker pil (9999px), input 12px, tinggi target minimal 44px.
- **Gerak**: kalimat jawaban muncul kata demi kata (55ms), angka menghitung naik, stiker "ditempel"
  miring −3°, confetti kertas hanya untuk hasil nyata. Semua mati di `prefers-reduced-motion`.

**Larangan dari DESIGN.md [Certain]:** jangan grid kartu metrik, jangan emoji/glyph unicode
sebagai ikon (pakai `src/components/icons.tsx`), jangan lembar di dalam lembar, jangan strip
warna samping, jangan animasi berulang.

**[Likely]** Tantangan nyata: DESIGN.md ditulis untuk alat kerja, bukan halaman pemasaran. Hero
bergaya "kalimat besar + angka lime besar" bisa langsung dipakai. Bagian fitur butuh disain
tambahan yang belum ada di sistem; jangan memaksa kartu metrik.

**Aset yang ada:** `public/favicon.svg`, dua font. **Tidak ada:** logo, foto, screenshot, OG image.
Screenshot harus dibuat dari data **dummy** (`tests/fixtures/`), bukan data toko asli.

## 9. Hanya untuk arah B (membuka untuk umum): hal yang belum ada

Semuanya **[Certain]** sebagai fakta "belum ada" kecuali dicatat lain.

- **Pendaftaran & akun**: tidak ada. Akun dibuat manual di Supabase.
- **Multi-tenant**: skema database dibuat untuk dua toko tetap (`init.sql` menanam dua toko).
  **[Likely]** Menerima pengguna lain butuh perubahan skema dan RLS, bukan sekadar landing page.
- **Harga & penagihan**: tidak ada.
- **Syarat & kebijakan privasi**: tidak ada. README bahkan mencatat paket gratis Vercel resminya
  non-komersial.
- **Ketergantungan format Shopee**: kolom/label export dipetakan di `shopeeColumns.ts`; kalau
  Shopee mengubah format, parser perlu diperbarui. Ini risiko dukungan untuk produk publik.
- **Asumsi bawaan**: potongan 15% jika data tidak ada, admin 8,25%, XTRA 4%, proses Rp1.250,
  target untung 5% setelah iklan, target 20% sebelum iklan. Itu pilihan untuk dua toko kosmetik
  ini; **[Guessing]** belum tentu cocok untuk kategori lain.
- **Hosting**: README menyebut Vercel, tetapi commit terbaru menambah `wrangler.jsonc`
  (Cloudflare). **[Likely]** hosting sedang/akan pindah ke Cloudflare. Konfirmasi dulu sebelum
  menulis di halaman mana pun.
- **Disclaimer**: ini bukan produk resmi Shopee. Hindari memakai logo/nama Shopee dengan cara
  yang tampak seperti afiliasi.

## 10. Yang tidak boleh ditulis di landing page

- Testimoni, "dipercaya N penjual", "hemat N jam", persentase peningkatan untung. **Tidak ada
  datanya.**
- Angka asli toko (data Juli–September 2026 ada di `sample-data/` yang di-gitignore dan tidak
  boleh ditampilkan).
- "Terintegrasi dengan Shopee" / "otomatis sinkron". **[Certain]** salah: tidak ada API Shopee;
  pengguna mengunduh dan mengunggah file sendiri.
- "Real-time". Datanya per bulan dari file; hanya Simulasi Harga yang menghitung langsung saat
  mengetik.
- "AI". Tidak ada komponen AI; semuanya rumus deterministik yang diuji (`src/lib/`, Vitest).

Kejujuran soal "unggah manual" bisa jadi nilai jual (**[Likely]**): *"Tanpa akses akun Shopee-mu.
Kamu cukup unggah file yang kamu unduh sendiri."*

## 11. Struktur halaman yang disarankan [Guessing]

Untuk arah A (satu layar, cocok dengan prinsip "jawaban dulu"):

1. **Hero**: headline jawaban + 1 kalimat pendukung + tombol **Masuk**.
2. **Tiga jawaban**: Untung bulan ini · Iklan mana yang rugi · Harga berapa. Satu baris per
   jawaban, bukan grid kartu.
3. **Cara kerja**: 3 langkah (§6).
4. **Privasi**: 4 butir (§5).
5. **Footer**: nama aplikasi, "Hubungi pengelola aplikasi" untuk akses.

Tambahan untuk arah B: contoh nyata (dummy) tiap fitur, FAQ (ambil dari PANDUAN §10),
perbandingan "Shopee menampilkan vs Profit Shopee menghitung", formulir waitlist, dan §9 harus
selesai.

## 12. FAQ siap pakai (boleh disalin)

**[Certain]** Diadaptasi dari PANDUAN §10.

- *Apakah upload dua kali membuat data dobel?* Tidak. Data dikenali dan diperbarui.
- *Apakah data pembeli disimpan?* Tidak. Nama, alamat, no. HP, username, catatan, dan no. resi
  tidak pernah dibaca maupun disimpan.
- *Kenapa iklan dengan ROAS bagus di Shopee diberi label Takedown?* Shopee menghitung pesanan yang
  batal, dan produk dengan untung tipis butuh ROAS sangat tinggi supaya tidak rugi.
- *Bagaimana paket grosir (mis. 6PCS)?* Satu paket dihitung satu barang; HPP diisi per paket.
- *Bagaimana kalau HPP naik?* Untung bulan yang sudah tersimpan tidak berubah, kecuali kamu
  menekan **Hitung ulang HPP**.

## 13. Info teknis (untuk developer landing page)

- **[Certain]** Aplikasi: React 19 + Vite + Tailwind CSS v4, Supabase (Postgres, Auth, RLS),
  SheetJS dan pdf.js di browser, Vitest. Build statis ke `dist/`, SPA fallback di
  `wrangler.jsonc`.
- **[Certain]** `index.html`: `lang="id"`, title "Profit Shopee", `theme-color` `#141b25`.
  **[Likely]** `theme-color` itu sisa sistem lama ("nota kasir") dan tidak cocok dengan biru
  `#2b2fa6` sekarang.
- **[Certain]** Aturan proyek: tidak menambah dependency runtime tanpa persetujuan pemilik.
  Landing page sebaiknya HTML/CSS statis atau halaman di dalam aplikasi yang sama dengan
  token CSS dari `src/index.css`.
- **[Certain]** Responsif: tanpa scroll horizontal dari 360px; target sentuh 44px.
- **[Guessing]** Kalau landing page dipisah dari aplikasi, pakai domain/subdomain terpisah supaya
  halaman publik tidak bercampur dengan aplikasi yang tertutup.

## 14. Pertanyaan yang jawabannya menentukan isi halaman

1. Arah A, B, atau C?
2. Kalau B: siapa yang boleh mendaftar, dan gratis atau berbayar?
3. Nama produk final: "Profit Shopee" (header) atau ada nama baru? Domain apa?
4. Hosting final: Vercel atau Cloudflare?
5. Boleh menampilkan nama "Harel Beauty" / "Oraiste Beauty House" di halaman publik, atau diganti
   toko contoh?
6. Siapa yang menyiapkan screenshot dummy dan logo?
