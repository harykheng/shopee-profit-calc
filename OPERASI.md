# Operasi harian (untuk pengelola)

Panduan ini untuk kamu sebagai pengelola HitungCuan: memantau error, mengekspor data, menghapus data,
dan menghentikan pelanggan. Membuat akun uji coba lewat halaman **Pengelola** di aplikasi (bagian 2);
sisanya di **Supabase → SQL Editor** (role `postgres`). Fungsi `admin_*` di bawah **tidak bisa dipanggil
dari aplikasi**, dan fungsi halaman Pengelola menolak semua akun selain pengelola; keduanya sudah diuji.

Prasyarat: semua migration sudah dijalankan sampai `20261016000000_operations.sql`.

---

## 1. Memantau error (tiap pagi, 2 menit)

Aplikasi melaporkan error dari browser pelanggan ke tabel `client_errors` di project Supabase-mu
sendiri. Tidak ada layanan pihak ketiga, jadi tidak ada data pelanggan yang keluar.

**Tidak ada peringatan otomatis.** Kamu harus melihatnya sendiri. Pasang pengingat harian di
kalender.

```sql
-- Error 24 jam terakhir, dikelompokkan, yang terbaru di atas
select * from public.client_error_summary
where terakhir > now() - interval '1 day';
```

Kolom: `kejadian` (berapa kali), `user_berbeda` dan `toko_berbeda` (seberapa luas), `halaman_terakhir`,
`versi_terakhir` (7 huruf pertama commit yang sedang live).

| `kind` | Artinya | Biasanya |
|---|---|---|
| `render` | Satu halaman gagal tampil; pelanggan melihat "Halaman ini mengalami gangguan" | **Bug aplikasi. Prioritas tertinggi.** |
| `uncaught` / `unhandledrejection` | Error di kode yang tidak tertangani | Bug aplikasi |
| `handled` | Error dari server yang tampil ke pelanggan | Sering: migration belum dijalankan (`does not exist`), atau akses (`permission denied`) |
| `parse` | File Shopee gagal dibaca | **Format file yang belum didukung.** Ini bahan utama menguji file asli pelanggan |

Siapa yang terkena:

```sql
select e.created_at, u.email, s.name as toko, e.kind, e.message, e.route, e.app_version
from public.client_errors e
left join auth.users u on u.id = e.user_id
left join public.stores s on s.id = e.store_id
where e.fingerprint = 'ISI_FINGERPRINT_DARI_RINGKASAN'
order by e.created_at desc
limit 20;
```

Yang tidak dilaporkan (memang disengaja): koneksi pelanggan putus, salah password, sesi habis, dan
noise bawaan browser. Satu error yang sama hanya dilaporkan sekali per sesi browser, maksimal 10 per
sesi, dan maksimal 30 per 10 menit per akun (di database).

**Batasan:** error di halaman login (sebelum masuk) tidak tercatat, dan kalau pelanggan sedang offline
tidak ada yang terkirim. Jangan menyimpulkan "tidak ada error" hanya karena ringkasan kosong; kalau
pelanggan melapor lewat WhatsApp, itu tetap benar.

Bersih-bersih sebulan sekali (hapus laporan lebih dari 90 hari):

```sql
select public.admin_purge_client_errors(90);
```

---

## 2. Menambah, memperpanjang, menghentikan pelanggan

**Akun uji coba baru: halaman Pengelola** (ikon kunci di kanan atas aplikasi, hanya terlihat oleh akun
pengelola). Isi:

- **Email** calon pelanggan. Email yang sudah terdaftar ditolak (mis. orang yang dulu pernah uji coba);
  perpanjang tokonya lewat SQL di bawah.
- **Password**: sudah terisi acak (10 huruf & angka yang tidak mirip, mudah diketik). **Buat acak**
  untuk yang lain, atau ketik sendiri (minimal 8 karakter).
- **Nama toko**: boleh dikosongkan. Saat pertama login, pemilik akun diminta mengisi nama tokonya di Shopee
  (jendela yang tidak bisa dilewati, hanya bisa diisi sekali). Sampai itu, di daftar tertulis "Toko " +
  bagian depan email. Butuh migration `20261029000000_store_name_by_customer.sql`; tanpa itu nama dari
  email dipakai seterusnya seperti dulu. Pelanggan salah ketik nama:
  `update public.stores set name = 'Nama Benar' where id = 5;`
- **Bisa dipakai sampai**: bawaan **30 hari** (hari ini ikut dihitung, jadi dibuat 1 November → aktif
  sampai akhir 30 November WIB). Setelah itu toko otomatis jadi baca saja.

Tekan **Buat akun uji coba**. Akun langsung aktif (tanpa verifikasi email), toko ditandai **Uji coba**,
lalu muncul teks siap kirim: alamat login, email, password, dan tanggal berakhir. **Salin teks** atau
**Kirim lewat WhatsApp** (memilih kontak di WhatsApp). Password hanya tampil saat itu; setelah halaman
ditutup tidak bisa dilihat lagi (pakai `admin_reset_password` di bawah kalau hilang). Pelanggan melihat
banner kuning "ganti password" sampai ia menggantinya sendiri.

Di bawahnya, **Semua toko** menampilkan per toko: email pemilik, status (Aktif sisa X hari / Baca saja),
dan **login terakhir**. Isi toko (pesanan, untung, HPP) tidak terlihat di sini. Pakai untuk follow up:
di hari ke-3, tanya lewat WhatsApp peserta yang masih "Belum pernah login" atau belum upload data bulan
lalu. Status jadi kuning saat sisa ≤ 3 hari.

Halaman Pengelola butuh migration `20261026000000_platform_admin.sql`. Menjadikan / mencabut pengelola:

```sql
select public.admin_set_platform_admin('email-kamu@contoh.com');          -- jadikan pengelola
select public.admin_set_platform_admin('email-kamu@contoh.com', false);   -- cabut
```

Jadikan pengelola **hanya akunmu sendiri**: pengelola bisa membuat akun dan melihat email semua pelanggan.

**Lewat SQL Editor** (perpanjang, hentikan, toko kedua untuk akun yang sudah ada). Lihat README bagian 8
(d) dan (e). Singkatnya:

```sql
select public.admin_add_customer('pelanggan@email.com', 'Nama Toko', '2026-12-31');            -- toko untuk akun yang sudah ada
update public.stores set active_until = '2027-01-31' where id = 5;                              -- perpanjang
update public.stores set active_until = '2027-01-31', trial = false where id = 5;               -- uji coba jadi berlangganan
update public.stores set active_until = (now() at time zone 'Asia/Jakarta')::date - 1 where id = 5; -- hentikan
```

`id` toko terlihat di hasil `select id, name, active_until, trial from public.stores order by id;`.
Penanda **Uji coba** tidak hilang sendiri; ubah `trial = false` saat pelanggan mulai membayar supaya
daftar Uji coba di halaman Pengelola hanya berisi yang masih mencoba, **dan supaya batas uji coba
lepas**. Selama `trial = true` (migration `20261027000000_trial_limits.sql` + angka di
`20261028000000_trial_limits_total.sql`):
- laporan penghasilan + data iklan hanya bisa disimpan untuk **1 bulan** (bulan uang cair / periode iklan;
  export pesanan tidak dibatasi; upload ulang bulan yang sama selalu boleh);
- Simulasi Harga maksimal **50 produk selama uji coba** (produk yang sama dihitung sekali);
- **Cek cepat** di halaman Iklan tidak tersedia (khusus pelanggan berlangganan; dikunci di aplikasi saja,
  karena Cek cepat tidak menyimpan apa pun ke database).

**Pelanggan uji coba salah bulan** (mis. upload bulan berjalan yang belum selesai): hapus laporan
penghasilan & iklan bulan itu, lalu minta dia upload bulan yang benar. Export pesanan tidak perlu dihapus.

```sql
-- ganti 5 dengan id toko, '2026-10-01' dengan bulan yang salah
delete from public.income             where store_id = 5 and date_trunc('month', released_date) = '2026-10-01';
delete from public.income_adjustments where store_id = 5 and date_trunc('month', released_date) = '2026-10-01';
delete from public.income_orders      where store_id = 5 and date_trunc('month', released_date) = '2026-10-01';
delete from public.ad_reports         where store_id = 5 and '2026-10-01' in (date_trunc('month', period_start), date_trunc('month', period_end));
select public.trial_months_used(5);   -- harus kosong
```

Lupa mengubah `trial = false` = pelanggan yang sudah bayar tetap kena batas ini. Kalau pelanggan
mengeluh "laporan bulan lain ditolak", cek dulu kolom `trial` tokonya. Angka batasnya ada di fungsi
`trial_month_limit()` dan `trial_simulation_limit()`; mengubahnya cukup `create or replace` fungsi itu.

Setelah dihentikan, pelanggan masih bisa **melihat** Rekap (baca saja) tapi tidak bisa mengubah data.

**Lupa password** (pelanggan menekan "Lupa password?" di halaman login → WhatsApp ke kamu):

```sql
select public.admin_reset_password('pelanggan@email.com', 'PasswordBaru123');
```

Satu perintah ini mengganti password, memunculkan lagi banner "ganti password" untuk pelanggan itu,
dan mengeluarkannya dari semua perangkat. Kirim password barunya lewat WhatsApp (minimal 8 karakter,
jangan dipakai ulang untuk pelanggan lain). Password lama **tidak bisa dilihat**: Supabase hanya
menyimpan hash-nya. Butuh migration `20261023000000_admin_reset_password.sql`.

**Kebijakan yang disarankan** (putuskan dan tulis di syarat layanan): data disimpan **90 hari** sejak
langganan berakhir, lalu dihapus kalau tidak diperpanjang. Beri tahu pelanggan sebelum menghapus.

---

## 3. Mengekspor data satu toko

Kapan: pelanggan menekan **Minta salinan data** di halaman Akun (pesannya masuk ke WhatsApp-mu),
atau pelanggan berhenti dan minta datanya.

**Verifikasi dulu bahwa yang meminta memang pemilik akun.** Pesan WhatsApp bisa dikirim siapa saja.
Cara yang cukup untuk skala kecil: minta mereka mengonfirmasi lewat email akunnya, atau tanyakan
sesuatu yang hanya pemilik toko tahu (nama toko di Shopee + email login). Jangan mengirim data ke
nomor atau email yang belum terverifikasi.

1. Cari id toko:

   ```sql
   select s.id, s.name, s.active_until, u.email
   from public.stores s
   join public.store_members m on m.store_id = s.id
   join auth.users u on u.id = m.user_id
   order by s.id;
   ```

2. Ekspor semua data satu toko sebagai satu dokumen JSON:

   ```sql
   select public.admin_export_store(5);
   ```

   Isi: toko, anggota (email), pengaturan, kategori biaya admin, produk + HPP, pesanan, penghasilan
   harian, penyesuaian, biaya bulanan, dan data iklan. Tidak ada data pribadi pembeli (memang tidak
   pernah disimpan). Salin hasilnya ke file `.json`.

3. **Toko besar** (puluhan ribu pesanan): satu dokumen JSON terlalu besar untuk SQL Editor. Ekspor per
   tabel ke CSV: jalankan query, lalu klik **Download CSV** di hasil.

   ```sql
   select * from public.products            where store_id = 5 order by product_name, variant_name;
   select * from public.order_items         where store_id = 5 order by id;
   select * from public.income              where store_id = 5 order by released_date;
   select * from public.income_adjustments  where store_id = 5 order by id;
   select * from public.income_orders       where store_id = 5 order by released_date, order_no, line_no;
   select * from public.expenses            where store_id = 5 order by month, category;
   select * from public.fee_categories      where store_id = 5 order by name;
   select * from public.store_settings      where store_id = 5;
   select r.*, x.* from public.ad_reports r join public.ad_rows x on x.report_id = r.id where r.store_id = 5;
   ```

   Kolom `uploaded_by` berisi id akun internal; hapus dari file sebelum dikirim kalau mau rapi.

4. Kirim file lewat saluran yang aman (tautan berbatas waktu atau berkas dengan password yang dikirim
   terpisah), bukan lampiran biasa di grup.

---

## 4. Menghapus data satu toko

**Tidak bisa dibatalkan.** Lakukan berurutan:

1. **Pastikan permintaannya sah** (lihat verifikasi di bagian 3). Kalau pelanggan masih membutuhkan
   datanya, ekspor dulu dan serahkan sebelum menghapus.
2. **Pastikan ada cadangan terbaru:** Supabase → Database → Backups. (Paket Pro menyimpan cadangan
   harian beberapa hari.)
3. **Hitung dulu apa yang akan dihapus.** Bawaannya hanya menghitung, dan nama toko harus persis sama:

   ```sql
   select * from public.admin_delete_store(5, 'Nama Toko Persis');
   ```

   Periksa angkanya masuk akal untuk toko itu (jumlah pesanan, produk, dst.).

4. **Hapus sungguhan** (argumen ketiga `false`):

   ```sql
   select * from public.admin_delete_store(5, 'Nama Toko Persis', false);
   ```

   Menghapus iklan, pesanan, produk, penghasilan, penyesuaian, biaya, kategori, pengaturan,
   keanggotaan, lalu tokonya. Toko lain tidak tersentuh. Laporan error tetap ada tapi tidak lagi
   menunjuk ke toko itu.

5. **Hapus akun loginnya** kalau pelanggan memintanya. Fungsi di atas tidak menghapus akun. Lihat akun
   yang sudah tidak punya toko:

   ```sql
   select * from public.admin_list_orphan_users();
   ```

   Lalu hapus lewat **Authentication → Users → (akun) → Delete user**. Jangan menghapus akun yang masih
   punya toko lain.

6. **Catat** di berkas pribadimu: tanggal, id dan nama toko, siapa yang meminta, bagaimana
   diverifikasi.

**Jujur soal cadangan:** data yang sudah dihapus masih ada di cadangan Supabase sampai cadangan itu
berputar (hilang sendiri sesuai masa simpan paketmu). Katakan itu kepada pelanggan kalau mereka
bertanya, dan jangan memulihkan cadangan lama tanpa memeriksa apakah ada toko yang sudah dihapus.

---

## 5. Kalau ada yang rusak

1. Lihat ringkasan error (bagian 1) dan cari `versi_terakhir`. Kalau error baru muncul setelah deploy,
   penyebabnya hampir pasti versi itu.
2. **Kembalikan versi:** Cloudflare → Workers & Pages → proyek → Deployments → pilih deploy
   sebelumnya → **Rollback** (atau push ulang commit sebelumnya).
3. Error `does not exist` / `schema cache` di kolom `message` = ada migration yang belum dijalankan di
   project itu. Jalankan file yang disebut console browser (`[HitungCuan] Database belum diperbarui:
   jalankan …`) lalu muat ulang. Semua migration aman diulang.
4. Setelah migration yang mengubah angka (view Rekap), bandingkan satu bulan di Rekap dengan hitungan
   sebelumnya sebelum memberi tahu pelanggan.
5. Kerusakan data: pulihkan dari cadangan **ke project baru**, bukan menimpa yang berjalan; salin
   hanya data toko yang terdampak.

---

## 6. Rutinitas

| Kapan | Apa |
|---|---|
| Tiap pagi | Cek `client_error_summary` (bagian 1) |
| Awal bulan | Lihat siapa yang belum mengunggah data bulan lalu (kartu pengingat di aplikasi menolong pelanggan; kamu bisa mengingatkan lewat WhatsApp) |
| Tiap beberapa hari | Halaman Pengelola → **Uji coba**: tanya lewat WhatsApp yang masih "Belum pernah login" |
| Sebelum langganan habis | Hubungi pelanggan (status kuning di halaman Pengelola saat sisa ≤ 3 hari); banner pengingat di aplikasi muncul 7 hari sebelumnya |
| Sebulan sekali | `select public.admin_purge_client_errors(90);` dan tinjau akun yatim |
| Setiap migration baru | Jalankan berurutan, lalu jalankan `supabase/uji-pemisahan-toko.sql` di SQL Editor (harus `0 gagal, 0 perlu dicek`; tidak mengubah data). Cek `client_error_summary` beberapa jam kemudian |
