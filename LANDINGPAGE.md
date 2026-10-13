# Landing Page HitungCuan — Bahan Pembuatan

Dokumen kerja untuk membuat landing page **HitungCuan** (versi berlangganan dari Profit Shopee,
di branch `multi-tenant`). Isinya: tujuan dan cara ukur, apa yang boleh diklaim, susunan halaman
per bagian (teks, animasi, interaksi), spesifikasi tiga interaksi utama, pelacakan, dan daftar
keputusan yang masih harus kamu isi.

Label keyakinan di dokumen ini: **[Pasti]** = ada di repo/kode, **[Kemungkinan besar]** = dugaan
kuat dari pengalaman umum, **[Tebakan]** = belum ada dasar, harus diuji.

---

## 0. Baca dulu: lima hal yang menentukan 10% tercapai atau tidak

1. **"CTR 10%" belum punya arti sampai kita sepakati rumusnya.** CTR biasanya = klik ÷ tayang
   (iklan). Untuk landing page, angka yang dimaksud hampir pasti **CTA click rate = pengunjung unik
   yang menekan tombol WhatsApp ÷ pengunjung unik**. Dokumen ini memakai definisi itu. Kalau yang
   kamu maksud CTR iklan (Meta/TikTok) sebelum orang sampai ke landing page, 10% di sana tidak
   realistis **[Kemungkinan besar]** (iklan berbayar umumnya satu digit rendah) dan itu bukan
   urusan halaman ini.
2. **10% klik CTA itu mungkin kalau trafiknya hangat, berat kalau dingin.** Trafik hangat =
   komunitas seller Shopee, grup WhatsApp/Telegram, bio TikTok/IG yang sudah kenal, rekomendasi
   teman. Trafik dingin dari iklan umumnya jauh di bawah itu **[Kemungkinan besar]**. Target per
   sumber ada di bagian 9. Jangan menilai halaman dari campuran semua sumber.
3. **Klik WhatsApp bukan pelanggan.** Produk ini onboarding-nya **manual**: tidak ada daftar
   sendiri, tidak ada pembayaran otomatis; admin membuat akun lewat SQL **[Pasti]**
   (README bagian 8). Jadi 10% klik bisa saja menghasilkan 0 pelanggan kalau balasan chat lambat
   atau harga tidak jelas. Ukur juga: klik → chat benar-benar masuk → bayar.
4. **Belum ada harga, uji coba, testimonial, atau angka hasil.** `PRODUCT.md`: "No testimonials,
   metrics or external claims exist; none should be invented." Landing page tanpa harga dan tanpa
   bukti sosial biasanya kehilangan klik dari orang yang butuh kepastian. Bukti kita yang jujur
   adalah **demo interaktif** (bagian 5) dan cerita **dibuat dan dipakai sendiri untuk 2 toko**.
   Harga dan uji coba harus kamu putuskan (bagian 3).
5. **Pengunjung kemungkinan besar datang dari HP, tapi produknya paling nyaman di laptop**
   (upload Excel/PDF/CSV dari Seller Centre). Landing page harus jujur soal ini, atau pengunjung
   klik, chat, lalu tidak pernah upload bulan pertama.

---

## 1. Tujuan dan satu janji

- **Tujuan halaman:** seller Shopee menekan tombol WhatsApp dan mengirim pesan yang sudah terisi.
- **Satu janji (di atas lipatan):** *"Upload 3 file dari Shopee, dapat satu jawaban: toko kamu
  untung atau rugi bulan ini, dan iklan mana yang harus dimatikan."*
- **Satu aksi:** chat WhatsApp. Tidak ada form, tidak ada daftar, tidak ada menu navigasi panjang.
  Semua tombol menuju aksi yang sama.

### Siapa yang dituju

Seller Shopee yang sudah beriklan di Shopee Ads dan menghitung untung dengan spreadsheet atau
perasaan. Contoh nyata: pemilik toko kecil-menengah yang mengelola 1–3 toko sendiri atau bersama
keluarga **[Kemungkinan besar]** (itu pemakai aslinya, lihat `PRODUCT.md`). Mereka tidak teknis,
berbahasa Indonesia sehari-hari, dan sudah akrab dengan istilah ROAS tapi tidak yakin
membacanya.

### Pembeda yang bisa dibuktikan dari produk **[Pasti]**

| Pembeda | Bukti di produk |
|---|---|
| Untung dihitung per **tanggal uang cair**, bukan tanggal pesanan | PANDUAN bagian 1 |
| Modal (HPP) **dikunci saat upload**, jadi bulan lalu tidak berubah | PANDUAN bagian 5 |
| ROAS dihitung **tanpa pesanan batal** ("ROAS nyata") | PANDUAN bagian 8 |
| Verdict per produk: Hero / Aman / ROAS terlalu kecil / Takedown | PANDUAN bagian 8 |
| Status **Angka final** vs **Belum lengkap** (apa yang kurang disebut jelas) | PANDUAN bagian 7 |
| Simulasi harga sebelum jualan: harga minimum, target ROAS yang diisi di Shopee | PANDUAN bagian 9 |
| Data pembeli (nama, alamat, HP, resi) tidak pernah dibaca atau disimpan | README bagian 6 |

Belum diriset: aplikasi sejenis di pasaran. **[Tebakan]** bahwa pembeda di atas cukup unik. Cek
2–3 pesaing sebelum menulis kalimat "satu-satunya".

---

## 2. Yang boleh dan tidak boleh ditulis

**Boleh (ada dasarnya):**
- "Dibuat dan dipakai sendiri untuk dua toko Shopee beauty."
- "Angka untung dihitung dari file Shopee asli kamu, bukan perkiraan."
- "Nama, alamat, dan nomor HP pembeli tidak pernah dibaca atau disimpan."
- "File dibaca di browser kamu. File aslinya tidak dikirim ke server."
- "Upload file yang sama dua kali aman, tidak ada data ganda."

**Hati-hati kata-katanya:**
- Jangan tulis "data tidak disimpan". Yang benar: **data pembeli** tidak disimpan; nomor pesanan,
  produk, qty, status, dan angka penghasilan **disimpan** di database (README bagian 6).
- Jangan tulis "gratis" atau "murah" sebelum harga diputuskan.
- Jangan tulis "ribuan seller", "naikkan untung 30%", atau angka hasil apa pun. Tidak ada datanya.
- Jangan pakai logo atau warna Shopee. Wajib ada: **"HitungCuan bukan produk resmi Shopee."**
- Jangan tulis "5 menit" atau "otomatis dalam sekejap" sebelum diukur. Uji dulu berapa lama
  pelanggan baru dari nol sampai Rekap pertama, lalu tulis angka itu.
- Untuk angka contoh di demo, selalu beri label **"Contoh"** dan pakai angka rekaan. Angka asli
  tokomu hanya boleh tampil kalau kamu sendiri mengizinkan.

---

## 3. Keputusan yang harus kamu isi sebelum halaman dibuat

Tanpa ini, halaman jadi di atas kertas saja. Isi di sini, lalu salin ke teks halaman.

| # | Keputusan | Isi | Dampak ke klik |
|---|---|---|---|
| 1 | Harga per toko per bulan | `[ISI]` | Tinggi. Halaman tanpa harga memaksa orang bertanya dulu. |
| 2 | Uji coba / garansi? (mis. 1 bulan data pertama gratis) | `[ISI]` | Tinggi. Menurunkan rasa risiko klik. |
| 3 | Nomor WhatsApp admin (format `62…`) | `[ISI]` | Wajib. Sama dengan `VITE_SUPPORT_WA`. |
| 4 | Janji waktu balas dan waktu akun jadi | `[ISI jam kerja + SLA]` | Tinggi. Tulis hanya yang bisa ditepati. |
| 5 | Domain halaman | `studioharel.id`? (app tetap di `app.studioharel.id`) | Sedang |
| 6 | Foto/nama pembuat untuk bagian "siapa di balik ini" | `[ISI]` | Sedang. Wajah dan nama menaikkan kepercayaan. |
| 7 | Boleh pakai angka asli tokomu di demo? | `[ya/tidak]` | Kalau tidak, pakai angka contoh. |
| 8 | Hanya Shopee, atau juga marketplace lain? | Saat ini **hanya Shopee** | Tulis jelas di FAQ. |

---

## 4. Susunan halaman (urutan dari atas ke bawah)

Tiap bagian: **tujuan**, **teks**, **animasi**, **interaksi**. Gaya visual mengikuti `DESIGN.md`
(bagian 7) supaya halaman dan aplikasi terasa satu keluarga.

### 4.1 Bar atas (menempel)

- Kiri: nama **HitungCuan** (huruf display, lime). Kanan: tombol pil **"Chat WhatsApp"**.
- Tidak ada menu lain. Di HP: bar bawah menempel berisi satu tombol CTA, muncul setelah scroll
  melewati hero.

### 4.2 Hero

**Tujuan:** dalam 5 detik orang paham ini untuk apa dan apa yang didapat.

- **Kicker (lime):** `Untuk seller Shopee yang pasang iklan`
- **Judul (pilih satu, uji A/B jika trafik cukup, lihat bagian 9):**
  - A. `Berapa untung tokomu bulan ini? Jawabannya muncul setelah 3 file.`
  - B. `Iklan Shopee-mu untung atau rugi? Cek per produk.`
  - C. `Shopee bilang ROAS bagus. Rekeningmu bilang apa?`
  - Rekomendasi awal: **A di atas lipatan, B/C sebagai uji pertama**. A paling dekat dengan janji
    produk **[Kemungkinan besar]**; B/C lebih tajam tapi mempersempit ke pemasang iklan.
- **Sub:** `Upload export pesanan, laporan penghasilan, dan data iklan dari Seller Centre. Dapat
  untung bersih bulanan, iklan yang harus dimatikan, dan harga minimum yang aman. Bahasa
  Indonesia biasa, tanpa spreadsheet.`
- **CTA utama:** `Chat WhatsApp, tanya cara mulai` · **CTA kedua (teks):** `Coba hitung iklanmu dulu
  (30 detik) ↓` (menggulir ke simulator; ganti panah dengan ikon garis, jangan unicode).
- **Mikro-garis bawah CTA:** `Data pembeli tidak pernah dibaca · Bukan produk resmi Shopee`
- **Sisi kanan (desktop) / di bawah teks (HP): "kartu cerita contoh"**, tiruan Rekap Bab 1 dengan
  angka rekaan berlabel **Contoh**:
  - kalimat: `Agustus 2026, toko kamu untung` + angka besar lime `Rp3,42 juta`
  - stiker miring `ANGKA FINAL`
  - batang `Dari setiap Rp100 yang masuk`: modal / biaya / untung
- **Animasi saat dimuat (sekali):**
  1. kata judul naik satu-satu, jeda 55 ms, tiap kata 520 ms (`WordsRise`, sama dengan app)
  2. angka `Rp3,42 juta` menghitung naik 0 → nilai, 700 ms ease-out
  3. stiker `ANGKA FINAL` muncul: skala 30% → 114% → 100% dengan putaran kecil, 460 ms
  4. batang tumbuh dari bawah/kiri, segmen berjeda 140 ms
  5. confetti kertas **sekali** dari stiker (lihat bagian 6, hanya sekali per kunjungan)
- Semua animasi mati di `prefers-reduced-motion`: teks utuh, angka langsung nilai akhir.

### 4.3 Masalah (tiga kalimat, bukan kotak metrik)

**Tujuan:** pengunjung berkata "ini aku". Tiga baris besar, satu per layar HP, masuk saat digulir:

1. `ROAS di Shopee kelihatan bagus, tapi saldo tidak bertambah.`
   Sub: Shopee menghitung juga pesanan yang kemudian batal, dan ROAS "bagus" tergantung untung per
   barang. **[Pasti]** (PANDUAN FAQ)
2. `Penghasilan di Seller Centre belum mengurangi modal, iklan, dan packaging-mu.`
3. `Tiap awal bulan, sore habis untuk spreadsheet.`

Animasi: tiap baris naik saat masuk layar (`IntersectionObserver`, sekali, translateY 16px→0,
opacity 0→1, 450 ms). Jangan loop.

### 4.4 Simulator "Iklan kamu rugi atau untung?" (inti halaman)

Spesifikasi lengkap di bagian 5.1. Ini bagian yang paling mungkin menaikkan klik karena orang
menghitung produknya sendiri dan hasilnya langsung memberi alasan menghubungi.

### 4.5 Cara kerja: "3 file → 1 jawaban"

Spesifikasi di bagian 5.2. Tiga langkah, tanpa jargon:

1. `Download 3 file dari Seller Centre` (pesanan .xlsx, penghasilan .pdf, iklan .csv)
2. `Upload ke HitungCuan` (file dibaca di browser, data pembeli diabaikan)
3. `Baca ceritanya`: untung/rugi, iklan yang harus dimatikan, harga aman

Catatan jujur, satu baris: `Paling nyaman dipakai di laptop karena file diunduh dari Seller
Centre.` (jawaban untuk poin 5 di bagian 0)

### 4.6 Yang kamu dapat (tiga baris selang-seling, bukan grid)

Setiap baris: judul kalimat, satu paragraf pendek, mock tampilan kecil yang beranimasi saat masuk.

| Halaman | Judul di landing | Mock |
|---|---|---|
| Rekap | `Untung bersih bulan ini, dengan hitungannya.` | nota yang "tercetak" baris demi baris: Uang masuk − Modal − Biaya = Untung bersih |
| Iklan | `Mana iklan yang harus dimatikan.` | tiga kartu produk dengan stiker Hero / Takedown / ROAS terlalu kecil yang "tersetempel" berjeda 60 ms |
| Simulasi Harga | `Harga berapa supaya iklan tidak rugi.` | kartu "Pilih harga jual" dengan tombol Pakai |

### 4.7 Kenapa angkanya bisa dipercaya

Empat aturan dalam bahasa biasa **[Pasti]**, masing-masing satu kalimat:

- `Bulan dihitung dari tanggal uang cair, bukan tanggal pesanan dibuat.`
- `Modal dikunci saat upload. HPP naik bulan ini, untung bulan lalu tidak ikut berubah.`
- `Pesanan batal dikurangkan dari angka iklan Shopee, jadi ROAS yang kamu lihat ROAS nyata.`
- `Kalau data belum lengkap, aplikasi bilang apa yang kurang. Baru "Angka final" kalau semua pas.`

Di bawahnya blok privasi: `Nama, alamat, nomor HP, username, dan nomor resi pembeli tidak pernah
dibaca atau disimpan.`

### 4.8 Siapa di balik ini

Tiga kalimat dan foto/nama (keputusan #6): `Dibuat untuk dua toko Shopee beauty kami sendiri
(Harel Beauty dan Oraiste Beauty House), karena spreadsheet tidak pernah cocok dengan saldo.
Sekarang dibuka untuk seller lain.` Tautkan ke dua toko itu hanya jika kamu mau. Ini satu-satunya
bukti sosial yang kita punya dan benar adanya.

### 4.9 Harga dan cara mulai

Isi dari keputusan #1, #2, #4. Tiga langkah: **chat WhatsApp → akun dibuatkan → upload bulan
pertama.** Tulis jujur bahwa akun dibuat manual, plus janji waktunya (`[ISI]`). Satu harga, satu
paket; jangan membuat tabel paket kalau paketnya belum ada.

### 4.10 FAQ (akordeon)

Jawaban pendek, pakai kata-kata di PANDUAN. Pertanyaan yang pasti muncul:

1. `Apakah data pembeli saya aman?` → lihat bagian 2 (data pembeli tidak dibaca/disimpan; file dibaca di browser).
2. `Saya tidak paham spreadsheet / istilah ROAS. Apakah bisa?` → tiap angka ada penjelasan pendek di sebelahnya, ada kamus istilah.
3. `Apakah harus punya laptop?` → bisa dari HP/iPad untuk melihat hasil, upload paling nyaman di laptop.
4. `Bagaimana kalau tokonya lebih dari satu?` → toko dipilih sekali di bar atas dan berlaku untuk semua halaman.
5. `Kalau Shopee mengganti format file?` → aplikasi menolak file dengan pesan jelas, bukan diam-diam salah hitung; format diperbarui pengelola. **[Pasti]** (README bagian 7)
6. `Bisa untuk Tokopedia / TikTok Shop?` → Saat ini hanya Shopee.
7. `Berhenti berlangganan?` → `[ISI]`. Data tetap tersimpan, layar "Langganan habis" tampil. **[Pasti]**
8. `Salah upload ke toko lain?` → cukup satu kalimat, kontak admin untuk dihapus.

### 4.11 CTA penutup

Blok lime penuh: `Mulai dari satu bulan data.` + tombol CTA besar + janji balasan (keputusan #4).
Ulangi mikro-garis privasi dan disclaimer Shopee.

### 4.12 Footer

Nama, kontak WhatsApp, tautan masuk (`app.studioharel.id`, untuk yang sudah berlangganan), kalimat
**"HitungCuan bukan produk resmi Shopee"**, kebijakan privasi singkat (apa yang disimpan, apa yang
tidak).

---

## 5. Spesifikasi interaksi

### 5.1 Simulator "Iklan kamu rugi atau untung?"

Memakai **rumus asli aplikasi** (`src/lib/adsMath.ts`, PANDUAN bagian 9). Semua dihitung di
browser, tanpa server, tanpa menyimpan apa pun.

**Input (3 saja):**

| Input | Bawaan | Catatan |
|---|---|---|
| Modal per unit (HPP) | Rp30.000 | tombol cepat ±1.000, boleh ketik |
| Harga jual | Rp45.000 | |
| ROAS di laporan Shopee | 6,0 | slider 1–15, boleh ketik |

Tetap (ditampilkan di tautan "lihat hitungannya", bisa dibuka): admin 8,25%, Gratis Ongkir XTRA
4%, biaya proses Rp1.250, packaging Rp0. Ini bawaan aplikasi **[Pasti]**.

**Rumus (jangan diubah tanpa mengubah aplikasi):**

```js
function hitung({ hpp, harga, roas }) {
  const ADMIN = 0.0825, XTRA = 0.04, PROSES = 1250, TARGET = 0.05;
  const penghasilan = harga - ADMIN * harga - XTRA * harga - PROSES;
  const untung = penghasilan - hpp;                 // per order, sebelum iklan
  const margin = untung / harga;
  const balikModal = untung > 0 ? harga / untung : null;            // ROAS balik modal
  const target = margin > TARGET ? 1 / (margin - TARGET) : null;    // ROAS untuk untung 5%
  const biayaIklan = harga / roas;                  // per order
  const setelahIklan = untung - biayaIklan;         // per order
  return { untung, balikModal, target, biayaIklan, setelahIklan };
}
```

Pembulatan: tampilkan rupiah bulat, ROAS 2 desimal dengan koma (`7,52`). Kalau `target` null
atau > 50, tulis `tidak mungkin, untung per barang terlalu tipis` (sama dengan aplikasi).

**Hasil (kalimat dulu, angka sesudahnya, ikuti prinsip "jawaban dulu"):**

- Kalimat besar yang berubah live: `Iklan ini rugi Rp762 per order.` / `Iklan ini untung tipis
  Rp738 per order.` / `Iklan ini aman: untung Rp… per order.`
- Stiker verdict (pop saat verdict berganti, bukan tiap ketikan):
  - ROAS < balik modal → **TAKEDOWN** (koral, putih)
  - balik modal ≤ ROAS < target → **ROAS TERLALU KECIL** (kuning, cokelat)
  - ROAS ≥ target → **AMAN** (lime, biru tua)
- Tiga baris di bawahnya: `Untung per order sebelum iklan`, `Iklan baru balik modal di ROAS 5,46`,
  `Isi target ROAS 7,52 di Shopee`.
- Penghitung angka animasi 250 ms saat nilai berubah (bukan loop).

**Angka bawaan dijamin dramatis tapi benar** (sudah diverifikasi dengan rumus):

| Skenario | HPP | Harga | ROAS | Hasil |
|---|---|---|---|---|
| Tombol cepat "ROAS kelihatan bagus" | 30.000 | 45.000 | 6,0 | untung 8.238/order, balik modal ROAS 5,46, target 7,52 → **ROAS terlalu kecil**, untung iklan tipis Rp738/order |
| "Iklan yang bocor" | 30.000 | 45.000 | 5,0 | **TAKEDOWN**, rugi Rp762/order |
| "Harga dinaikkan" | 30.000 | 59.000 | 6,0 | untung 20.523/order, balik modal 2,87, target 3,36 → **AMAN** |

Tombol cepat ini membuat orang paham dalam 10 detik tanpa mengetik apa pun.

**CTA kontekstual (di bawah hasil):** tombol `Cek semua produk tokomu` yang membuka WhatsApp dengan
pesan terisi dari angka yang diketik pengunjung:

> Halo, saya coba simulasi di HitungCuan: modal Rp30.000, harga Rp45.000, ROAS Shopee 6,0 →
> hasilnya "ROAS terlalu kecil". Saya mau coba HitungCuan untuk toko saya.

Ini membuat chat masuk sudah hangat dan memberi tahu admin masalah calon pelanggan. Angka hanya
terkirim bila pengunjung sendiri menekan tombol dan mengirim pesannya di WhatsApp.

### 5.2 Animasi "3 file → 1 jawaban" (berskrip, bukan upload sungguhan)

Dimulai sekali saat bagian masuk layar (`IntersectionObserver`, ambang 40%); tombol kecil
`Putar ulang` untuk yang ingin melihat lagi. Label **Contoh** selalu tampak.

1. Tiga chip file masuk dari kiri berjeda 120 ms: `pesanan.xlsx`, `penghasilan.pdf`, `iklan.csv`.
2. Chip meluncur ke kotak "Upload ke toko: Toko Contoh"; muncul bilah proses 600 ms.
3. Tulisan `Data pembeli diabaikan` berkedip hijau sekali (menegaskan privasi).
4. Kalimat jawaban naik kata demi kata: `Agustus 2026, Toko Contoh untung Rp3,42 juta.`; angka
   menghitung naik; stiker `ANGKA FINAL` pop.
5. Dua baris berikutnya muncul: `4 iklan sebaiknya dimatikan` (stiker TAKEDOWN) dan `1 produk Hero`.

**Interaktif:** menekan salah satu dari tiga chip membuka kartu kecil `Di mana dapatnya?` dengan
jalur menu Seller Centre dari PANDUAN bagian 3 (mis. `Pesanan Saya → Export → status Semua`).
Ini menghilangkan keraguan "ribet atau tidak" dan sekaligus edukasi.

### 5.3 Batang "Dari setiap Rp100 yang masuk"

Tiga segmen (modal / biaya / untung) tumbuh dari kiri saat masuk layar. Sentuh/hover segmen untuk
membaca satu kalimat artinya. Tombol dua posisi `Bulan untung` / `Bulan rugi`: bulan rugi
mengganti batang dengan kalimat `Bulan ini rugi, jadi bagiannya tidak lagi jumlah 100` (aplikasi
menyembunyikan batang dalam kasus ini **[Pasti]**, DESIGN.md).

### 5.4 Elemen interaktif kecil

- FAQ akordeon, satu terbuka sekali.
- Tombol CTA: tekan menyusut 97%, fokus lime di atas latar biru.
- Tautan "lihat hitungannya" di simulator membuka nota yang "tercetak" per baris (150 ms/baris).

---

## 6. Aturan animasi

Mengikuti bagian Motion di `DESIGN.md`, supaya halaman tidak terasa heboh:

- Animasi menandai **jawaban datang** atau **keadaan berubah**. Tidak ada dekorasi bergerak terus.
- **Tidak ada loop.** Confetti **sekali** per kunjungan (pertama kali stiker `ANGKA FINAL` muncul).
- Hanya `transform` dan `opacity` yang dianimasikan (hindari `width/height/top` agar mulus di HP
  kelas bawah).
- Total animasi pembuka hero ≤ 1,6 detik. CTA harus bisa ditekan dari detik pertama, jangan
  menunggu animasi selesai.
- `prefers-reduced-motion`: semua mati, angka langsung nilai akhir, tanpa confetti.
- Jangan ada auto-play suara atau video. Jangan ada pop-up penghalang.

---

## 7. Visual (selaras dengan aplikasi)

Warna dan huruf dari `DESIGN.md`. Aset huruf sudah ada di `public/fonts/` (Bricolage Grotesque,
Public Sans, lisensi OFL), jangan memuat dari CDN.

| Peran | Nilai |
|---|---|
| Latar utama | `#2b2fa6` (field), bar bawah/teks pada lime `#1d2079` |
| Jawaban/angka kunci, kicker, CTA penutup | lime `#d7f45a` |
| Teks di latar biru | `#f6f4ff`, redup `#c3c5f2` |
| Rugi di latar biru | `#ff9b85`; kartu iklan/verdict rugi `#c4361e` |
| Lembar putih (simulator, nota) | `#ffffff`, teks `#16173d` |
| Tombol utama | pil, `#3a3fb8` di lembar putih; **CTA di atas latar biru: lime dengan teks `#1d2079`** |
| Huruf judul/angka | Bricolage Grotesque 700–800, angka `font-feature-settings: "tnum"` |
| Huruf isi | Public Sans 400/600 |

Aturan yang tetap berlaku di landing: tidak ada emoji atau glyph unicode sebagai ikon (pakai ikon
garis), tidak ada grid kotak metrik, tidak ada lembar di dalam lembar, tombol minimal 44 px,
teks di latar biru memakai warna "on-field", kontras minimal sama dengan aplikasi.

Belum ada logo atau warna merek yang mengikat (`PRODUCT.md`). Kalau mau logo, buat sederhana:
teks `HitungCuan` dengan tanda kecil, jangan meniru logo Shopee.

---

## 8. Teknis

- **Pisahkan dari aplikasi.** Aplikasi adalah SPA yang login (`app.studioharel.id`). Landing
  sebaiknya berupa **satu halaman statis** (HTML + CSS + JS biasa) di `studioharel.id`, supaya
  cepat, mudah dibaca mesin pencari, dan tidak ikut membuka bundel aplikasi. **[Kemungkinan
  besar]** ini pilihan terbaik; alternatif: rute baru di SPA, tapi lebih lambat dan sulit
  diindeks.
- **Tanpa dependensi baru.** `PRODUCT.md`: tidak ada dependensi runtime baru tanpa persetujuan
  pemilik. Landing cukup JS murni (`IntersectionObserver`, `requestAnimationFrame`, `<details>`).
- **Anggaran performa:** HTML+CSS+JS ≤ 100 KB tanpa huruf; huruf woff2 subset latin, `font-display:
  swap`, preload dua huruf di atas lipatan; tidak ada gambar besar (mock dibuat dari HTML/CSS/SVG).
  Target LCP < 2,5 dtk di 4G **[Tebakan]** sebagai batas aman untuk trafik HP Indonesia.
- **Mobile dulu:** desain 360–390 px; tidak ada gulir horizontal dari 360 px; bar CTA bawah
  menyisakan ruang safe-area.
- **Tautan WhatsApp:** `https://wa.me/62…?text=<pesan>` (pola yang sama dengan `supportUrl()` di
  `src/lib/brand.ts`). Buka di tab baru, `rel="noopener noreferrer"`.
- **SEO/berbagi:** `<title>` + deskripsi memuat "hitung untung bersih toko Shopee", "iklan Shopee
  rugi", "ROAS balik modal"; gambar OG 1200×630 (kalimat jawaban + stiker); `lang="id"`.
- **Aksesibilitas:** semua animasi punya padanan statis; simulator bisa dipakai dengan keyboard;
  stiker verdict selalu ada teksnya, tidak hanya warna.
- **Hosting:** repo ini sudah memakai Cloudflare Workers/Pages. Landing bisa jadi proyek Pages
  kedua dengan domain `studioharel.id`.

---

## 9. Pelacakan dan cara mencapai 10%

### 9.1 Yang diukur

| Metrik | Rumus | Catatan |
|---|---|---|
| **CTA click rate** (yang dimaksud "10%") | pengunjung unik yang menekan tombol WA ÷ pengunjung unik | metrik utama |
| Simulator dipakai | pengunjung yang mengubah ≥ 1 input ÷ pengunjung | menunjukkan apakah interaksi menarik |
| Klik CTA setelah simulator | klik tombol kontekstual ÷ pengguna simulator | kalau tinggi, simulator = mesin klik |
| Chat benar-benar masuk | pesan WA masuk ÷ klik CTA | harus dicek manual di WhatsApp admin; klik ≠ kirim |
| Pelanggan | bayar ÷ chat masuk | ukuran sebenarnya dari keberhasilan |
| Kedalaman gulir | 25 / 50 / 75 / 100% | untuk tahu di mana orang pergi |

### 9.2 Alat

Belum ada analitik di repo. Pilihan tanpa cookie yang ringan: **Cloudflare Web Analytics** (gratis,
cocok karena sudah di Cloudflare) untuk trafik, ditambah satu peristiwa kustom `cta_click` dengan
properti `lokasi` (`hero`, `bar_atas`, `simulator`, `harga`, `penutup`, `bar_bawah`). Parameter
`?utm_source=…&utm_medium=…&utm_campaign=…` di setiap tautan yang kamu sebar, supaya CTR bisa
dilihat **per sumber**.

### 9.3 Target per sumber (perkiraan awal)

| Sumber | Target CTA click rate | Keyakinan |
|---|---|---|
| Rujukan langsung / grup seller yang kamu kenal | 15–30% | **[Tebakan]** |
| Bio TikTok/IG dengan konten yang sudah membahas ROAS | 8–15% | **[Tebakan]** |
| Iklan berbayar (dingin) | 2–6% | **[Kemungkinan besar]** |

Artinya: **10% keseluruhan hanya masuk akal kalau sebagian besar trafik hangat.** Kalau semua
trafik dari iklan dingin, targetkan dulu 3–5% dan naikkan lewat perbaikan, jangan anggap gagal.

### 9.4 Urutan perbaikan (paling berdampak dulu)

1. Isi **harga dan uji coba** (keputusan #1, #2), lalu cek apakah klik naik.
2. **Simulator di atas lipatan atau tepat setelah hero**, bukan di tengah halaman.
3. Judul hero (A/B/C di 4.2).
4. Teks tombol: `Chat WhatsApp, tanya cara mulai` vs `Cek iklan tokomu` vs `Coba 1 bulan`.
5. Kecepatan balas WhatsApp (bukan halaman, tapi menentukan chat → pelanggan).

### 9.5 Jujur soal uji A/B

Untuk mendeteksi kenaikan dari 10% ke 12% dengan keyakinan wajar butuh sekitar **3.600 pengunjung
per varian** (perkiraan: `n ≈ 16 × p(1−p) ÷ selisih²` = 16 × 0,09 ÷ 0,0004) **[Kemungkinan besar]**.
Kalau trafikmu ratusan per bulan, A/B tidak akan memberi jawaban. Ganti satu hal, tunggu 2 minggu,
bandingkan dengan periode sebelumnya, catat. Perbedaan kecil dengan sampel kecil hanya kebetulan.

---

## 10. Bank teks (siap pakai)

**Judul alternatif:**
- `Berapa untung tokomu bulan ini?`
- `Iklan Shopee-mu untung atau rugi? Cek per produk.`
- `Shopee bilang ROAS bagus. Rekeningmu bilang apa?`
- `Dari 3 file Shopee jadi satu jawaban: untung atau rugi.`

**Teks tombol:** `Chat WhatsApp, tanya cara mulai` · `Cek iklan tokomu lewat WhatsApp` ·
`Mulai dari satu bulan data`

**Pesan WhatsApp bawaan (tombol umum):**
> Halo, saya seller Shopee dan tertarik mencoba HitungCuan untuk toko saya. Bisa dijelaskan cara
> mulai dan harganya?

**Pesan dari simulator:** lihat bagian 5.1.

**Mikro-teks kepercayaan (di bawah tombol):**
`Data pembeli tidak pernah dibaca · Upload yang sama dua kali aman · Bukan produk resmi Shopee`

**Penjelasan satu kalimat tiap istilah** (dari kamus PANDUAN):
- HPP = harga modal per barang.
- ROAS = omzet ÷ biaya iklan. ROAS 10 = iklan Rp1.000 menghasilkan omzet Rp10.000.
- Takedown = matikan iklan produk itu.
- Hero = produk dengan iklan paling menghasilkan.
- Balik modal = titik iklan tidak untung dan tidak rugi.

---

## 11. Daftar cek sebelum tayang

- [ ] Keputusan #1–#6 di bagian 3 terisi, dan semua angka/janji bisa ditepati.
- [ ] Semua angka demo berlabel **Contoh**, dan hasil simulator sudah dicocokkan dengan halaman
      Simulasi di aplikasi untuk minimal 3 pasang input.
- [ ] Tidak ada klaim yang tidak punya bukti (bagian 2), tidak ada testimonial karangan.
- [ ] Disclaimer "bukan produk resmi Shopee" ada di hero (mikro-teks) dan footer.
- [ ] Semua tombol CTA terhubung dan ber-UTM; tombol WA dites dari HP Android dan iPhone.
- [ ] `prefers-reduced-motion` dites; tidak ada animasi yang menghalangi tombol.
- [ ] Dites di 360, 390, 820, 1440 px; tidak ada gulir horizontal.
- [ ] LCP dan ukuran halaman dicek (bagian 8).
- [ ] Balasan WhatsApp sudah punya jawaban siap (harga, cara mulai, file apa saja yang perlu
      didownload) dan ada orang yang menjaga di jam yang dijanjikan.
- [ ] Analitik jalan: kirim 20 klik uji, cek masuk dengan `lokasi` yang benar.

---

## 12. Ringkasan satu paragraf untuk yang membangun

Satu halaman statis berlatar biru tinta, huruf Bricolage Grotesque, angka lime. Hero menjawab "berapa
untung tokomu" dengan kalimat yang naik kata-per-kata dan angka yang menghitung naik. Tepat
sesudahnya, simulator tiga kolom menghitung rugi/untung iklan memakai rumus asli aplikasi, dengan
tombol cepat dan stiker verdict, dan tombol WhatsApp yang membawa angka pengunjung. Lalu animasi
"3 file → 1 jawaban", tiga halaman produk, empat aturan kepercayaan, kisah pembuat, harga, FAQ, dan CTA
penutup. Semua tombol menuju satu aksi: chat WhatsApp. Satu ukuran keberhasilan: persen pengunjung
unik yang menekan tombol, dibaca per sumber trafik, dan dilanjutkan sampai jadi pelanggan.
