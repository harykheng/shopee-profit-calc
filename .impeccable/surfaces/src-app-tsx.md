---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: ["src/pages/RecapPage.tsx","src/pages/AdsPage.tsx","src/pages/PriceSimPage.tsx","src/pages/UploadPage.tsx","src/pages/HppPage.tsx","src/pages/ExpensesPage.tsx","src/pages/LoginPage.tsx"]
---

## Scope

App shell and every page (Rekap, Iklan, Simulasi Harga, Upload, HPP, Biaya, Login). Mode: Operate, with the Rekap opening written like a Read surface. Keeps the "Cerita Bulan Ini" structure; on 15 Oct 2026 the owner asked for the HitungCuan landing page's colours, fonts, UI/UX and copy, so the ink-blue field skin was replaced by the landing's "Dapur Terang" skin.

## Audience and job

Shopee sellers who advertise: the family's two beauty stores (Profit Shopee deploy) and paying HitungCuan customers, mostly with one store each. Laptop first, phone and iPad must work. Read monthly net profit, decide ads (takedown/hero, ROAS target), check prices before listing. Plain Indonesian ("kamu"), trustworthy numbers.

## Direction contract

THESIS: Every page answers first, in a sentence ("September 2026, Harel Beauty untung bersih Rp3,42 juta"), then shows its working on white sheets. Rekap is a short story in chapters (Untung bersih, Dari mana angkanya, Iklan, Pesanan & produk), not a grid of metric tiles.

OWN-WORLD: The landing's world, token for token: warm cream page (#fffbf6), ink text (#1c1917), one indigo accent (#2b3a9e) for the primary action, links, kickers and focus; Parkinsans 800 for answers, titles and stickers; Plus Jakarta Sans with tabular figures for the work; the `.hl` indigo-tint band under the answer word; stamp stickers (mint/gain, loss, sun) that are always word + icon. Selected states are filled ink.

STORY: Log in under the landing's own headline ("Tokomu sebenarnya cuan atau boncos?"). Rekap: the profit rolls up in green, the ANGKA FINAL sticker stamps on; scroll to the nota that prints line by line, the ads sheet with its Takedown stickers, and the order tabs. A new customer with no data sees the three Seller Centre reports and one "Upload laporan" button instead.

FIRST VIEWPORT: Sticky cream top bar (logo or mark, store, nav pills with a sliding ink marker from 1024px, logout); below 1024px a white six-cell bottom bar. Rekap: month pill, then Chapter 1 (sentence + hero figure left, the "Dari setiap Rp100" sheet right).

FORM: Cerita Bulan Ini (story / "wrapped") in the landing's Dapur Terang skin.

FINISH: rendered at 375 and 1366 with mocked Supabase data (no horizontal scroll, no console errors); reduced motion respected; DESIGN.md rewritten for this system.

## Constraints

No change to calculations, routes or data. No new npm dependencies; fonts self-hosted in public/fonts (OFL; Parkinsans + Plus Jakarta Sans, variable). Touch targets ≥44px. No horizontal scroll at 375px. Privacy and operational claims must match the code.
