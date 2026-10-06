# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Three people from one family run two Shopee beauty stores together: **Harel Beauty** and **Oraiste
Beauty House**. They are the owner, the owner's older sister and younger sibling. None of them is
technical. They mostly use the app on a **laptop/PC**; iPad and phone are secondary but must keep
working. All three accounts see both stores.

Their jobs:
- At the start of each month: upload Shopee exports, fill HPP and costs, then read the month's real
  net profit.
- Weekly or monthly: decide which advertised products to keep, push or take down, and which ROAS
  target to set in Shopee Ads.
- Before listing a product or changing a price: check profit per order and whether ads can pay off.

## Product Purpose

An internal tool that turns Shopee's exports (order Excel, monthly income PDF, ads CSV) into
decisions: the true net profit per month and per product, which ads lose money, and what price or
ROAS target makes a product worth advertising. Success is that the family trusts the numbers enough
to act on them without re-checking in spreadsheets.

## Positioning

It is built around this family's actual Shopee data and habits: profit is counted by the date money
is released, HPP is locked at upload, cancelled orders are subtracted from Shopee's ad numbers, and
Shopee fees are computed per component. It answers "did we really make money, and what should we
change", not generic analytics.

## Operating Context

- Most used pages, in order of importance: **Rekap** (monthly net profit "nota"), **Iklan** (ad
  verdicts per product), **Simulasi Harga** (price simulation). Upload, HPP and Biaya are the
  monthly input routine.
- Store is chosen once in the header and applies to every page.
- Monthly ritual at the start of the month for the previous month; ads checked weekly or monthly.
- Source files come from Shopee Seller Centre: order export (.xlsx, status "Semua"), income report
  (.pdf), ads data (.csv: Data Keseluruhan, Rincian Iklan Produk Otomatis, Grup Iklan).

## Capabilities and Constraints

- Stack: React + Vite + Tailwind CSS v4, Supabase (Postgres, Auth, RLS), SheetJS and pdf.js in the
  browser, Vitest, deployed on Vercel from GitHub. No new runtime dependencies without the owner's
  approval.
- Pages: Upload, HPP, Biaya, Rekap (nota + tabs Semua pesanan / Per produk / Per bulan), Iklan
  (upload, period or combined months, per-product cards with labels Hero / Aman / ROAS terlalu
  kecil / Takedown / Data belum cukup / HPP belum diisi), Simulasi Harga.
- Closed auth: three manual accounts, no public signup.
- All UI text in Bahasa Indonesia; money as `Rp1.250.000`. Terms follow the glossary in
  PANDUAN.md (HPP, ROAS nyata, Balik modal, Takedown, Hero, Angka final, …).
- Privacy: buyer personal data is never read or stored.
- Calculation logic lives in `src/lib/` and is covered by tests; UI work must not change results.

## Brand Commitments

- App name in the header: "Profit" / "Profit Shopee". Store names: Harel Beauty, Oraiste Beauty
  House.
- No logo files or brand colours exist in the repository; none have been made binding.

## Evidence on Hand

- Real Shopee exports for July–September 2026 exist only in the git-ignored `sample-data/` folder
  (never committed or shown). Committed tests use dummy fixtures in `tests/fixtures/`.
- PANDUAN.md documents every page and term for users.
- No testimonials, metrics or external claims exist; none should be invented.

## Product Principles

1. **Trustworthy numbers first.** Every figure shows where it comes from and whether it is final or
   an estimate.
2. **Decisions, not data dumps.** Lead with the verdict (untung/rugi, takedown/hero, harga minimum),
   details on demand.
3. **Plain language for non-technical people.** Indonesian everyday words, short explanations next
   to numbers, no jargon without the glossary meaning.
4. **Safe to repeat.** Uploading twice never duplicates data; nothing destructive without clear
   confirmation.

## Accessibility & Inclusion

No special requirement beyond the Indonesian language. Primary use is laptop/PC; layouts must still
work on iPad and phones at 375px wide without horizontal scrolling.
