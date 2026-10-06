---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: ["src/pages/RecapPage.tsx","src/pages/AdsPage.tsx","src/pages/PriceSimPage.tsx","src/pages/UploadPage.tsx","src/pages/HppPage.tsx","src/pages/ExpensesPage.tsx","src/pages/LoginPage.tsx"]
---

## Scope

App shell and every page (Rekap, Iklan, Simulasi Harga, Upload, HPP, Biaya, Login). Mode: Operate, with the Rekap opening written like a Read surface. Replaces the earlier "Nota kasir" direction (user feedback: "masih terlalu dashboard"); chosen from three rendered previews (Resi & Kardus, Cerita Bulan Ini, Papan Toko).

## Audience and job

Family running two Shopee beauty stores; laptop first, iPad/phone secondary. Read monthly net profit, decide ads (takedown/hero, ROAS target), check prices before listing. Must stay plain Indonesian and trustworthy.

## Direction contract

THESIS: Every page answers first, in a sentence ("Agustus 2026, Harel Beauty untung Rp2,78 juta"), then shows its working on white sheets. Rekap is a short story in chapters (Untung, Dari mana angkanya, Iklan, Pesanan & produk), not a grid of metric tiles.

OWN-WORLD: The whole page is one committed field of ink blue (#2b2fa6); answers and big figures in Bricolage Grotesque, the key figure in lime (#d7f45a), losses in a light coral on the field and a deep coral (#c4361e) chapter card for ads; working content (tables, forms, the arithmetic) on rounded white sheets in Public Sans with tabular numerals. Verdicts are bold colour stickers that pop on.

STORY: Open Rekap: the headline words rise, the profit rolls up, the ANGKA FINAL sticker pops (confetti the first time); scroll through the chapters to the arithmetic, the ads chapter and the order tables. Iklan opens with "Juli 2026, iklan rugi Rp283 ribu"; Simulasi with "Dijual Rp198.200, untung Rp9.671 per order", updating live.

FIRST VIEWPORT: Sticky top bar on the field (brand, store pill, nav pills with a sliding marker; logout). Phones/iPad: same top bar without nav, six-cell bottom bar with a lime marker. Rekap: month pill, then Chapter 1 (sentence + hero figure left, "Dari setiap Rp100" part-to-whole bar right).

FORM: Cerita Bulan Ini (story / "wrapped"), chosen by the user from three rendered previews.

FINISH: rendered at 1440 / 820 / 390 / 360; reduced motion checked; detector clean; DESIGN.md rewritten for this system.

## Constraints

No change to calculations, copy meaning, routes or data. No new npm dependencies; fonts self-hosted in public/fonts (OFL; Public Sans + Bricolage Grotesque). Touch targets ≥44px. No horizontal scroll at 375px.
