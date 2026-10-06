---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: ["src/pages/RecapPage.tsx","src/pages/AdsPage.tsx","src/pages/PriceSimPage.tsx"]
---

## Scope

App shell and the three most-used Operate surfaces: Rekap, Iklan, Simulasi Harga (stage 1). Upload, HPP, Biaya follow in stage 2 inside the same world. Mode: Operate.

## Audience and job

Family running two Shopee beauty stores; laptop first, iPad/phone secondary. Read monthly net profit, decide ads (takedown/hero, ROAS target), check prices before listing. Must stay plain Indonesian and trustworthy.

## Direction contract

THESIS: Every answer is a nota — itemised lines, an operator column, a torn rule, a total — so profit, ads and prices read like the store receipts the family already trusts. Refuses the dashboard of hero-metric tiles and orange marketplace cards.

OWN-WORLD: Thermal-paper white sheets on a cool grey counter; blue-black receipt ink for text and the shell rail; stempel violet-blue for actions and selection; ink red for rugi, ink green for untung, amber for warnings. Public Sans for words, Azeret Mono tabular for every Rupiah, %, and ROAS. Dashed tear rules before totals. Verdicts are inked rubber stamps.

STORY: Pick the store, open Rekap, read the nota top to bottom and see the FINAL / BELUM LENGKAP stamp; in Iklan each product is a mini nota stamped HERO / TAKEDOWN; Simulasi prints the nota of one order.

FIRST VIEWPORT: ≥1024px: left ink rail (brand, store select, six nav links, account). Smaller: top ink bar, store select, horizontally scrolling nav. Main: title row with period controls right; the nota sheet leads, status stamp at its top-right corner; tabs and detail below.

FORM: Nota kasir (receipt), grounded list position 1 (user chose it over the assigned position 5), seed 96807187.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Constraints

No change to calculations, copy meaning, routes or data. No new npm dependencies; fonts self-hosted in public/fonts (OFL; Public Sans + Azeret Mono — Geist was rejected by the detector as overused). Touch targets ≥44px. No horizontal scroll at 375px.
