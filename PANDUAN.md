# Panduan Pemakaian — Profit Shopee

Panduan untuk pemakai aplikasi (pemilik, cici, adik). Tidak perlu paham teknis.
Untuk setup database dan deploy, lihat [README.md](README.md).

---

## Daftar isi

1. [Aplikasi ini untuk apa?](#1-aplikasi-ini-untuk-apa)
2. [Rutinitas tiap awal bulan (ringkas)](#2-rutinitas-tiap-awal-bulan-ringkas)
3. [File apa saja yang perlu di-download dari Shopee](#3-file-apa-saja-yang-perlu-di-download-dari-shopee)
4. [Halaman Upload](#4-halaman-upload)
5. [Halaman HPP](#5-halaman-hpp)
6. [Halaman Biaya](#6-halaman-biaya)
7. [Halaman Rekap](#7-halaman-rekap)
8. [Halaman Iklan](#8-halaman-iklan)
9. [Halaman Simulasi Harga](#9-halaman-simulasi-harga)
10. [Pertanyaan yang sering muncul](#10-pertanyaan-yang-sering-muncul)
11. [Kamus istilah](#11-kamus-istilah)

---

## 1. Aplikasi ini untuk apa?

Menghitung **untung bersih per bulan** untuk toko Shopee **Harel Beauty** dan **Oraiste Beauty
House**, dan menilai **iklan Shopee** per produk.

```
Untung bersih = Uang masuk dari Shopee − Modal barang terjual − Biaya
```

| Bagian | Diambil dari |
|---|---|
| **Uang masuk** | PDF laporan penghasilan Shopee (uang yang sudah cair ke saldo) |
| **Modal** | Export pesanan Shopee × HPP yang diisi di halaman HPP |
| **Biaya** | Diisi di halaman Biaya (iklan Shopee bisa terisi otomatis) |

Hal penting yang perlu diingat:

- **Bulan dihitung dari tanggal uang cair**, bukan tanggal pesanan dibuat. Di Shopee, uang cair di
  hari yang sama dengan pesanan selesai.
- **Modal hanya dari barang yang selesai** di bulan itu. Barang batal dan barang retur tidak
  dihitung.
- **Toko dipilih di pilihan Toko pada menu** (di bar paling atas, di laptop maupun HP/iPad) dan
  berlaku untuk semua halaman. Selalu cek nama toko sebelum upload.
- **Menu dibagi dua:** *Lihat hasil* (Rekap, Iklan, Simulasi Harga) dan *Input bulanan* (Upload, HPP,
  Biaya). Di laptop menunya ada di **bar atas**; di HP/iPad keenam menu ada di **bawah layar**.
  Aplikasi langsung terbuka di **Rekap**, dan angka **untung bersih** tampil paling atas.

---

## 2. Rutinitas tiap awal bulan (ringkas)

Lakukan di awal bulan untuk bulan sebelumnya (contoh: awal September untuk Agustus). Ulangi untuk
**tiap toko**.

1. **Download** 3 jenis file dari Shopee Seller Centre ([lihat bagian 3](#3-file-apa-saja-yang-perlu-di-download-dari-shopee)).
2. **Upload** → upload export pesanan (Excel) dan laporan penghasilan (PDF).
3. **HPP** → isi HPP produk yang masih merah.
4. **Iklan** → upload file data iklan (.csv). Biaya iklan Shopee terisi otomatis.
5. **Biaya** → isi Meta Ads, packaging, lain-lain. Kalau tidak ada, simpan Rp0.
6. **Rekap** → cek statusnya **Angka final**. Kalau masih **Belum lengkap**, ikuti daftar
   yang muncul.

> Upload file yang sama dua kali **aman**. Data tidak akan dobel.

---

## 3. File apa saja yang perlu di-download dari Shopee

### a. Export pesanan (Excel .xlsx)

**Pesanan Saya → Export**, status **Semua**.

- Ambil rentang agak lebar: **dari pertengahan bulan sebelumnya sampai akhir bulan ini**. Uang yang
  cair di awal bulan sering berasal dari pesanan akhir bulan sebelumnya.
- Status **Semua** (bukan hanya Selesai), supaya aplikasi juga tahu pesanan yang batal atau masih
  dikirim. Ini dipakai di tab "Semua pesanan" dan untuk menghitung ROAS nyata di halaman Iklan.

### b. Laporan penghasilan (PDF)

**Keuangan → Penghasilan Saya → laporan bulanan** (.pdf, "Catatan Transaksi Penghasilan").

### c. Data iklan (CSV)

**Iklan Saya → Download Data**.

- Pilih periode **1 bulan penuh** (tanggal 1 sampai akhir bulan).
- Download file-file ini dengan **periode yang sama**:

| File | Wajib? | Gunanya |
|---|---|---|
| **Data Keseluruhan** | Ya | Total semua iklan → mengisi Biaya Iklan Shopee |
| **Rincian Data Iklan Produk Otomatis** | Ya, kalau pakai Iklan Produk Otomatis | Biaya per produk |
| **Semua Data Grup Iklan** | Kalau pakai grup iklan | Biaya per produk di dalam grup |

> **Mau beberapa bulan? Download per bulan.** File dengan periode 2–3 bulan sekaligus hanya
> berisi **total**, tanpa rincian per bulan, jadi tidak bisa dipecah. Lebih baik download per bulan
> (cukup ganti tanggal lalu download lagi), lalu upload semuanya sekaligus.

---

## 4. Halaman Upload

1. Cek kotak **"Upload ke toko: …"**. Kalau salah, ganti toko di pilihan Toko pada menu.
2. **Kotak 1:** pilih file Excel export pesanan.
3. **Kotak 2:** pilih file PDF laporan penghasilan.
4. Cek **preview**: jumlah pesanan per status, jumlah hari uang cair, total penghasilan, dan biaya
   penyesuaian kalau ada.
5. Tekan **Simpan ke …**.

Setelah disimpan muncul ringkasan:
- berapa data baru, diperbarui, atau sama seperti sebelumnya;
- **daftar produk yang belum punya HPP**, dengan tombol ke halaman HPP.

Kalau salah memilih file (misalnya PDF di kotak Excel), aplikasi akan memberi tahu dengan jelas.

---

## 5. Halaman HPP

HPP = harga modal per barang.

- Produk baru **otomatis masuk** dari upload export pesanan.
- Produk yang HPP-nya kosong berwarna **merah**. Isi langsung di kolomnya, lalu angkanya
  tersimpan. Centang **Hanya yang belum ada HPP** untuk menampilkan yang kosong saja.
- **Isi per 1 unit yang dijual di Shopee.** Untuk paket grosir (contoh: "Bedak 6PCS"), isi HPP
  **untuk 1 paket**, bukan per pcs.

### HPP dikunci saat upload

Modal tiap pesanan memakai HPP **pada saat pesanan itu di-upload sebagai selesai**. Jadi kalau HPP
naik bulan ini, profit bulan-bulan lalu **tidak ikut berubah**.

Kalau HPP baru diisi **setelah** upload (atau ada yang salah isi), buka **Rekap** → bulan itu →
**Hitung ulang HPP**:
- **Isi yang HPP-nya kosong saja (disarankan)**: hanya mengisi barang yang HPP-nya belum ada.
- **Semua barang pakai HPP saat ini**: semua barang bulan itu memakai HPP terbaru (untung bulan itu
  bisa berubah).

---

## 6. Halaman Biaya

Biaya di luar laporan penghasilan Shopee, per toko per bulan:

| Kategori | Keterangan |
|---|---|
| **Iklan Shopee** | Terisi **otomatis** dari halaman Iklan (file Data Keseluruhan 1 bulan penuh). Boleh diubah manual, tapi akan tertimpa lagi kalau data iklan bulan itu di-upload ulang. |
| **Meta Ads** | Iklan Facebook/Instagram |
| **Packaging** | Bubble wrap, lakban, kardus, dll. |
| **Lain-lain** | Biaya lain |

- Pilih bulan, isi angka, lalu tekan **Simpan biaya**.
- Kalau memang tidak ada biaya, **tetap simpan Rp0**. Rekap baru dianggap lengkap kalau biaya
  sudah pernah disimpan.

---

## 7. Halaman Rekap

Pilih bulan di atas. Untuk melihat beberapa bulan, pilih **"Lihat beberapa bulan"**.

Rekap dibaca seperti cerita, dari atas ke bawah:

| Bab | Isi |
|---|---|
| **Bab 1 · Untung** | Kalimat besar, mis. "Agustus 2026, Harel Beauty untung **Rp2,78 juta**", lalu angka tepatnya (Rp2.785.162), status bulan, dan batang **"Dari setiap Rp100 yang masuk"** (berapa untuk modal, biaya, dan berapa yang jadi untung). Kalau rugi, kalimatnya bilang "rugi". |
| **Bab 2 · Dari mana angkanya** | Hitungannya (lihat di bawah). |
| **Bab 3 · Iklan** | Ringkasan iklan bulan yang sama (untung/rugi setelah iklan, iklan yang sebaiknya dimatikan). Hanya muncul kalau melihat satu bulan; kalau belum ada data iklan 1 bulan penuh, ada ajakan untuk upload. |
| **Bab 4 · Pesanan & produk** | Tab-tab rincian (lihat di bawah). |

> Angka besar di Bab 1 dibulatkan ke bawah supaya mudah dibaca ("Rp2,78 juta"). Angka pastinya
> selalu ada di kalimat "Tepatnya …" dan di Bab 2.

### Dari mana angkanya (Bab 2)

Dibaca dari atas ke bawah:

```
  Uang masuk dari Shopee      Rp…   (uang yang cair bulan ini, refund sudah dipotong)
− Modal barang terjual        Rp…   (barang selesai × HPP)
− Biaya                       Rp…   (iklan, packaging, dll.)
= UNTUNG BERSIH               Rp…
```

- **Barang terjual** = jumlah pcs/unit yang selesai dan uangnya cair bulan itu.
- Tombol **ⓘ Kenapa X, bukan Y?** menjelaskan kenapa jumlah barang terjual beda dengan barang yang
  dipesan bulan itu (ada yang batal, masih dikirim, retur, atau selesai bulan berikutnya).

### Status bulan

| Status | Artinya |
|---|---|
| **Angka final** | Semua data lengkap. Untung bersih adalah angka pasti. |
| **Belum lengkap · N hal** | Klik untuk melihat apa yang kurang. |

Yang dicek:
1. Laporan penghasilan (PDF) bulan itu sudah di-upload.
2. Semua uang yang cair sudah ketemu pesanannya. Kalau belum, biasanya export pesanan bulan
   sebelumnya belum di-upload.
3. Semua barang sudah punya HPP.
4. Biaya sudah disimpan (boleh Rp0).

> Kadang muncul catatan **"Rp… cair 1–2 hari setelah tanggal pesanan selesai"**. Itu normal:
> pesanan selesai malam hari, Shopee mencairkan uangnya besok. Datanya sudah cocok dan tidak
> menghalangi status final.

### Tab-tab di Bab 4

| Tab | Isi |
|---|---|
| **Semua pesanan** | Semua pesanan yang **dibuat** di bulan itu (selesai, masih dikirim, batal) dan **perkiraan untung** dari pesanan yang sudah selesai. Disebut perkiraan karena Shopee mencatat uang cair per hari, bukan per pesanan. |
| **Per produk** | Barang terjual dan modal per produk, plus daftar barang retur. |
| **Per bulan** | Muncul kalau melihat beberapa bulan sekaligus. |

---

## 8. Halaman Iklan

Menilai iklan Shopee **per produk**: mana yang perlu dimatikan, mana yang bagus, dan berapa target
ROAS yang sebaiknya diisi di Shopee.

### Cara upload

1. Pilih toko di pilihan Toko pada menu.
2. Tekan **Pilih file**, lalu pilih **semua file .csv iklan sekaligus**. Boleh dari beberapa bulan;
   aplikasi mengelompokkannya per periode sendiri.
3. Cek preview tiap periode:
   - **1 bulan penuh + Data Keseluruhan** → "Biaya Iklan Shopee [bulan] diisi otomatis: Rp…"
   - **7 hari / bukan 1 bulan penuh** → hanya untuk analisis, Biaya tidak diubah.
   - **File berisi beberapa bulan sekaligus** → hanya analisis gabungan; Biaya tidak diisi karena
     tidak bisa dipecah per bulan.
4. Tekan **Simpan**.

> Supaya hasilnya akurat, **upload export pesanan untuk periode yang sama dulu** (halaman
> Upload). Laporan iklan Shopee ikut menghitung pesanan yang kemudian **batal**; aplikasi
> menguranginya memakai data pesanan.

Kalau file iklan dari toko yang sebelumnya disimpan ke toko lain, akan muncul peringatan
**"Cek toko dulu"**.

### Melihat hasil

Pilih **Periode iklan**:
- satu periode (misalnya "1–31 Jul 2026 (1 bulan)"), atau
- **Gabungkan beberapa bulan…** → pilih bulan dari/sampai.

**Kenapa digabung?** Supaya penilaian lebih valid. Contoh: produk A di Juli baru diiklankan 1 hari
(belum ada penjualan), di Agustus sudah full. Kalau dilihat Juli saja, produk A "Data belum cukup".
Kalau digabung, produk A dinilai dari data Juli + Agustus.
- Di tampilan gabungan ada tabel **Per bulan** (biaya, omzet, ROAS, untung tiap bulan).
- Tiap kartu produk punya baris **Per bulan**, jadi kelihatan produk mana yang baru jalan sebentar.
- Yang ikut digabung hanya data iklan **1 bulan penuh** (data mingguan tidak ikut, supaya tidak
  dobel).

### Ringkasan iklan (paling atas)

Paling atas ada kalimat jawaban, mis. **"Juli 2026, iklan rugi Rp283 ribu"** dan berapa iklan yang
sebaiknya dimatikan. Di bawahnya rinciannya:

```
Biaya iklan                                   Rp…
Omzet dari iklan (versi Shopee)               Rp…
Omzet dari iklan tanpa pesanan batal          Rp…   (ROAS nyata …)
Untung produk yang diiklankan (sebelum iklan) Rp…
Untung setelah iklan                          Rp…
```

**Untung setelah iklan** minus artinya iklan bulan itu lebih mahal daripada untung yang dihasilkan
produk-produk yang diiklankan.

### Kartu per produk

Tiap produk punya kartu berisi:

| Baris | Artinya |
|---|---|
| **Biaya iklan** | Total biaya iklan produk ini (semua jenis iklan dijumlahkan) |
| **Terjual** | Terjual dari iklan, **sudah dikurangi pesanan batal** ("Shopee: …" = angka versi Shopee) |
| **ROAS nyata** | Omzet tanpa pesanan batal ÷ biaya iklan |
| **Balik modal butuh ROAS** | Di bawah angka ini, iklan produk ini **rugi** |
| **Saran target ROAS di Shopee** | Angka untuk diisi di pengaturan iklan (GMV Max ROAS) supaya masih **untung 5%** setelah iklan. Sudah termasuk cadangan pesanan batal. |
| **Untung setelah iklan** | Untung produk ini dikurangi biaya iklannya |
| **Untung per barang (sebelum iklan)** | Harga jual − potongan Shopee − HPP |
| **Untung harga di bawah 20%** | Harga sekarang belum memberi untung 20%; ditampilkan harga yang dibutuhkan |
| **Saran** | Kalimat singkat apa yang sebaiknya dilakukan |

### Arti label

| Label | Artinya | Yang sebaiknya dilakukan |
|---|---|---|
| **Hero** | ROAS nyata jauh di atas saran (≥ 1,2× saran) dan sudah terjual minimal 3 | Pertahankan, budget boleh dinaikkan |
| **Aman** | ROAS nyata sudah sesuai target | Pertahankan |
| **ROAS terlalu kecil** | Sudah di atas balik modal, tapi untungnya belum sampai 5% | Naikkan target ROAS di Shopee ke angka saran, atau naikkan harga |
| **Takedown** | Iklan rugi: ROAS di bawah balik modal, atau biaya sudah habis tanpa penjualan, atau harga jual sudah rugi | Matikan iklan, atau naikkan harga |
| **Data belum cukup** | Terjual kurang dari 3, atau biaya masih kecil tanpa penjualan | Tunggu dulu |
| **HPP belum diisi** | Untung belum bisa dihitung | Isi HPP produk ini |

Produk yang **belum ada penjualan** dan biayanya masih kecil dikumpulkan di bagian bawah
("N produk lain belum ada penjualan").

Kalau tertulis **"tidak mungkin"** di saran target ROAS, artinya untung per barang terlalu tipis.
Iklan tidak akan bisa memberi untung 5% (atau ROAS yang dibutuhkan di atas 50). Solusinya
**naikkan harga**; harga yang dibutuhkan ditampilkan di kartu.

### Dari mana angka-angkanya?

- **Potongan Shopee** diambil dari laporan penghasilan periode itu (admin, gratis ongkir XTRA,
  biaya proses, voucher). Kalau belum ada, dipakai 3 bulan sebelumnya; kalau tidak ada juga,
  dipakai 15%.
- **Harga jual** diambil dari export pesanan (rata-rata harga yang benar-benar terjual).
- **HPP** dari halaman HPP (rata-rata variasi, ditimbang sesuai jumlah terjual).
- **Target untung 5%** setelah iklan dan **target harga 20%** bisa diubah oleh pengelola aplikasi
  (`src/lib/adsMath.ts`).

---

## 9. Halaman Simulasi Harga

Dipakai **sebelum jualan produk baru atau sebelum ganti harga**. Isi beberapa angka (atau pilih
produk yang sudah pernah di-upload), hasilnya langsung keluar. Angka simulasi **tidak disimpan**;
kalau halaman ditutup, isinya hilang. Yang bisa disimpan hanya **% admin dan XTRA per produk**
(lihat di bawah).

Bedanya dengan halaman Iklan: halaman Iklan menilai yang **sudah terjadi** (dari data upload),
sedangkan Simulasi Harga menghitung **sebelum** terjadi. Potongan Shopee dihitung **per komponen**
(admin %, Gratis Ongkir XTRA %, dan biaya proses yang tetap per order), jadi lebih tepat untuk
memutuskan harga satu produk daripada rata-rata potongan di halaman Iklan.

### Cara pakai

1. Buka menu **Simulasi** (judul halamannya "Simulasi Harga"). Nama toko di judul mengikuti pilihan Toko pada menu.
2. **Pilih produk (opsional)**: ketik nama produk, lalu pilih variasinya. Lihat
   [Memakai produk yang sudah di-upload](#memakai-produk-yang-sudah-di-upload). Untuk produk baru
   yang belum pernah dijual, lewati saja.
3. Isi atau ubah kolom-kolomnya. Angka diperbarui setelah kolom ditinggalkan atau tombol Enter
   ditekan.

| Kolom | Isi | Bawaan |
|---|---|---|
| **HPP per unit jual** | Modal per 1 unit yang dijual di Shopee. Paket/bundling: HPP per paket. | – |
| **Harga jual** | Harga jual per unit/paket | – |
| **Biaya admin** | Persen biaya admin kategori produk itu (boleh pakai koma, mis. 8,25) | 8,25% |
| **Ikut Gratis Ongkir XTRA** | Centang kalau produk ikut program ini (potongan 4%) | dicentang |
| **Biaya proses pesanan** | Biaya tetap per order dari Shopee | Rp1.250 |
| **Packaging per order** | Bubble wrap, lakban, kardus, dll. per order | Rp0 |
| **ROAS realistis** | ROAS yang biasa didapat di iklan (lihat halaman Iklan) | 5,5 |
| **ROAS aktual** (opsional) | ROAS nyata iklan produk ini, kalau iklannya sudah jalan | kosong |

### Memakai produk yang sudah di-upload

Setelah produk dipilih, kolom-kolom ini terisi otomatis. Di bawah kolomnya tertulis asal angkanya
(↳ …):

| Kolom | Diambil dari |
|---|---|
| **HPP** | Halaman HPP. Kalau masih kosong, muncul peringatan dan tombol **Isi HPP**. |
| **Harga jual** | Harga per barang di **pesanan terakhir** variasi itu (pesanan batal tidak dihitung), beserta tanggalnya |
| **ROAS aktual** | **ROAS nyata** produk itu di data iklan **terbaru** (halaman Iklan). Kosong kalau produknya tidak diiklankan di periode itu. |
| **Biaya admin & XTRA** | Nilai yang pernah disimpan untuk produk ini; kalau belum pernah, nilai bawaan (8,25% dan ikut XTRA) |

Semua angka tetap **bisa diubah**. Contoh: ubah harga jual untuk melihat efeknya kalau harga
dinaikkan. Mengubah angka di sini tidak mengubah data di halaman lain.

**% admin dan XTRA tidak ada di file export Shopee**, jadi diisi sendiri. Isi sekali yang benar,
lalu tekan **Simpan % admin & XTRA untuk produk ini**. Nilainya tersimpan untuk **semua variasi**
produk itu dan dipakai lagi di semua perangkat dan semua akun.

Tekan **Ganti / isi manual** untuk memilih produk lain atau mengisi semuanya sendiri.

### Rincian per order (nota)

```
  Harga jual                    Rp…
− Biaya admin                   Rp…   (admin % × harga jual)
− Biaya proses pesanan          Rp…   (tetap per order)
− Gratis Ongkir XTRA            Rp…   (4% × harga jual, kalau ikut)
− Packaging                     Rp…
= Penghasilan                   Rp…   (uang cair per order, setelah packaging)
− HPP                           Rp…
= UNTUNG PER ORDER              Rp…   (dan % dari harga jual, sebelum iklan)
```

Kalau untungnya minus, muncul tulisan **"Harga ini sudah rugi tanpa iklan"**. Artinya harga jual
harus dinaikkan dulu, belum usah memikirkan iklan.

### Hasil

| Angka | Artinya |
|---|---|
| **Balik modal butuh ROAS** | ROAS minimum supaya iklan tidak rugi (harga jual ÷ untung per order). Di bawah angka ini, setiap order dari iklan rugi. |
| **Saran target ROAS di Shopee** | Angka untuk diisi di pengaturan iklan supaya masih **untung 5%** dari harga jual setelah iklan. Rumusnya sama dengan halaman Iklan, tapi **tanpa cadangan pesanan batal** (simulasi tidak punya data batal), jadi sebaiknya diisi sedikit lebih tinggi. |
| **Harga minimum balik modal di ROAS …** | Harga jual terendah supaya iklan dengan **ROAS realistis** tidak rugi. Kalau harga sekarang di bawah ini, iklan hampir pasti rugi. |
| **Harga untuk untung 5% setelah iklan** | Harga jual supaya, dengan ROAS realistis, masih untung 5% setelah biaya iklan. |
| **Harga untuk untung 20%** | Harga jual supaya untung 20% (sebelum iklan). |

- Semua saran harga **dibulatkan ke atas ke Rp1.000**; angka persisnya tertulis kecil di bawahnya.
- Kalau tertulis **"tidak mungkin, untung per barang terlalu tipis"**: potongan Shopee dan biaya
  iklan sudah terlalu besar dibanding harga, jadi berapa pun harganya target itu tidak tercapai
  dengan ROAS tersebut (atau ROAS yang dibutuhkan di atas 50).

### Kalau ROAS aktual diisi

Muncul kotak **"Iklan untung"** (hijau) atau **"Iklan rugi"** (merah) dengan rupiahnya per order:

- **Biaya iklan per order** = harga jual ÷ ROAS aktual
- **Untung setelah iklan** = untung per order − biaya iklan per order

Contoh: HPP Rp46.668, harga Rp65.000, admin 8,25%, ikut XTRA, ROAS aktual 6,94:
- untung per order ±Rp9.120;
- biaya iklan per order ±Rp9.366;
- jadi **iklan rugi ±Rp246 per order**. Balik modal butuh ROAS 7,13, sedangkan ROAS aktual baru 6,94.

---

## 10. Pertanyaan yang sering muncul

**Upload file yang sama dua kali, apakah dobel?**
Tidak. Pesanan, penghasilan, dan data iklan dikenali dan diperbarui, tidak ditambah lagi.

**Kenapa "Barang terjual" di Rekap lebih sedikit dari jumlah barang yang dipesan bulan itu?**
Rekap hanya menghitung barang yang **selesai dan uangnya cair** di bulan itu. Barang yang batal,
masih dikirim, retur, atau baru selesai bulan depan tidak ikut. Klik **ⓘ Kenapa …?** untuk
rinciannya. Semua pesanan yang dibuat bulan itu bisa dilihat di tab **Semua pesanan**.

**Paket grosir (mis. 6PCS) dihitung berapa?**
Shopee menghitung 1 paket = 1 barang. Jadi HPP diisi **per paket**, dan "Barang terjual" menghitung
paketnya, bukan pcs di dalamnya.

**Status "Ada uang cair dari pesanan yang belum di-upload", padahal sudah upload?**
Biasanya pesanan bulan sebelumnya belum di-upload, karena uang awal bulan sering dari pesanan akhir
bulan lalu. Upload export pesanan dengan rentang yang lebih lebar. Kalau uangnya hanya cair 1–2 hari
setelah pesanan selesai, aplikasi sudah mengenalinya otomatis dan tidak dianggap kurang.

**Ada "refund sudah dipotong" di nota.**
Itu pengembalian dana ke pembeli yang dipotong Shopee dari uang cair. Sudah ikut dihitung; tidak
menghalangi status final.

**Ada "penyesuaian" di nota.**
Biaya penyesuaian dari laporan penghasilan (mis. kompensasi barang hilang). Sudah ikut dihitung
sebagai uang masuk.

**Bisa upload data iklan Juli–September dalam 1 file lalu dipecah per bulan?**
Tidak bisa. File Shopee untuk periode panjang hanya berisi total, tanpa rincian per bulan. File
seperti itu tetap bisa di-upload untuk analisis gabungan, tapi Biaya per bulan tidak terisi.
Disarankan download per bulan lalu upload semuanya sekaligus.

**ROAS di laporan Shopee bagus, kenapa di aplikasi labelnya Takedown?**
Dua alasan:
1. Shopee ikut menghitung pesanan yang batal, jadi ROAS versi Shopee lebih tinggi dari kenyataan.
2. ROAS "bagus" tergantung untung per barang. Produk dengan untung tipis butuh ROAS sangat tinggi
   supaya tidak rugi. Lihat baris **Balik modal butuh ROAS** di kartu produk.

**Salah upload ke toko lain?**
Hubungi pengelola aplikasi untuk menghapus datanya. Untuk mencegahnya, selalu cek nama toko di
menu sebelum upload. Halaman Iklan juga memberi peringatan kalau tokonya terlihat beda.

**Apakah data pembeli tersimpan?**
Tidak. Nama, alamat, no. HP, username, catatan, dan no. resi pembeli **tidak pernah dibaca maupun
disimpan**. File dibaca langsung di browser.

---

## 11. Kamus istilah

| Istilah | Artinya |
|---|---|
| **HPP** | Harga pokok / modal per barang |
| **Uang cair / dana dilepas** | Uang pesanan yang sudah masuk ke saldo penjual |
| **Potongan Shopee** | Biaya admin, biaya proses pesanan, Gratis Ongkir XTRA, voucher, dll. |
| **Omzet** | Total harga jual barang |
| **ROAS** | Omzet ÷ biaya iklan. ROAS 10 = biaya iklan Rp1.000 menghasilkan omzet Rp10.000 |
| **ROAS nyata** | ROAS setelah pesanan batal dikurangi |
| **Balik modal (BEP)** | Titik di mana iklan tidak untung dan tidak rugi |
| **Takedown** | Matikan iklan produk itu |
| **Hero** | Produk yang iklannya paling menghasilkan |
| **Angka final** | Semua data bulan itu lengkap; untung bersih adalah angka pasti |
