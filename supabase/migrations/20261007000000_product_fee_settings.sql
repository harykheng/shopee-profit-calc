-- =============================================================================
-- Pengaturan potongan Shopee per produk (untuk halaman Simulasi Harga)
--
-- % biaya admin beda per kategori dan ikut/tidaknya Gratis Ongkir XTRA tidak ada
-- di file export Shopee, jadi diisi sekali di halaman Simulasi Harga lalu disimpan
-- di sini. Kosong (null) = belum pernah diisi; halaman memakai nilai bawaan.
-- Disimpan untuk semua variasi dengan nama produk yang sama.
--
-- Aman dijalankan lebih dari sekali. Tidak mengubah/menghapus data yang ada.
-- =============================================================================

alter table public.products
  add column if not exists admin_pct numeric(5, 2)
    check (admin_pct is null or (admin_pct >= 0 and admin_pct < 100)),
  add column if not exists xtra boolean;
