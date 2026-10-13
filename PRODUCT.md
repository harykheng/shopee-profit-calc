# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two groups use the same codebase, as two deployments (`VITE_APP_NAME`):

1. **The family** ("Profit Shopee"): three people who run two Shopee beauty stores together, **Harel
   Beauty** and **Oraiste Beauty House**. All three accounts see both stores. No subscription.
2. **Paying sellers** ("HitungCuan", the multi-tenant version on branch `multi-tenant`): Indonesian
   Shopee sellers, mostly small and not technical, each with one store (some with several). Every
   account sees only its own stores. They subscribe per store (`stores.active_until`).

None of them is technical. They mostly use the app on a **laptop/PC**; iPad and phone are secondary
but must keep working.

Their jobs:
- At the start of each month: upload Shopee exports, fill HPP and costs, then read the previous
  month's real net profit.
- Weekly or monthly: decide which advertised products to keep, push or take down, and which ROAS
  target to set in Shopee Ads.
- Before listing a product or changing a price: check profit per order and whether ads can pay off.

The operator (the owner of this product) creates accounts and stores by hand, extends or stops
subscriptions with SQL, and is the single support contact (WhatsApp, `VITE_SUPPORT_WA`). There is no
admin screen and no self-service signup, payment or password reset.

## Product Purpose

A tool that turns Shopee's exports (order Excel, monthly income PDF, ads CSV) into decisions: the
true net profit per month and per product, which ads lose money, and what price or ROAS target makes
a product worth advertising. Success is that a seller trusts the numbers enough to act on them
without re-checking in spreadsheets, and comes back every month to do the routine.

## Positioning

Built around how Shopee actually pays out: profit is counted by the date money is released, HPP is
locked at upload, cancelled orders are subtracted from Shopee's ad numbers, and Shopee fees are
computed per component. It answers "did I really make money, and what should I change", not generic
analytics.

What differs per store is a **setting, never a hard-coded assumption**, and every default is visible:
- **Admin fee by category.** Shopee's admin fee differs by category and changes over time, and public
  sources disagree. The app ships no rate table: each store builds its own list of categories (name +
  %) from its Seller Centre and assigns them to products.
- **Profit targets** (default 5% after ads, 20% of the selling price before ads).
- **Returned goods** (default: 100% go back to stock, so their cost is not lost; lower it if returns
  are usually unsellable).

## Operating Context

- Most used pages, in order of importance: **Rekap** (the monthly net profit, told as a short story in
  chapters), **Iklan** (ad verdicts per product), **Simulasi Harga** (price simulation, with the store's
  admin-fee categories). Upload, HPP and Biaya are the monthly input routine. **Akun** holds the
  password and the store's calculation settings.
- A store is chosen in the header only when the account has more than one; names are hidden for
  single-store accounts.
- Monthly ritual at the start of the month for the previous month; ads checked weekly or monthly. An
  in-app reminder card appears while last month is incomplete (and not for a store that has never had
  data before last month).
- A new store starts from an empty Rekap that shows three steps (upload orders, upload income report,
  fill HPP) instead of zeros.
- Source files come from Shopee Seller Centre: order export (.xlsx, status "Semua"), income report
  (.pdf), ads data (.csv: Data Keseluruhan, Rincian Iklan Produk Otomatis, Grup Iklan).
- Access states: **active**; **expiring** (a reminder banner from 7 days before); **expired** (Rekap
  stays readable, everything that writes is refused by the database); **no store yet** (a screen that
  points to the operator).

## Capabilities and Constraints

- Stack: React + Vite + Tailwind CSS v4, Supabase (Postgres, Auth, RLS), SheetJS and pdf.js in the
  browser, Vitest. Static build: Vercel for the family deployment, Cloudflare Workers Builds for
  HitungCuan. No new runtime dependencies without the owner's approval.
- Multi-tenancy is enforced in the database, not the UI: every data table is behind RLS
  (`store_members`, `is_store_member`, `is_store_active`). Read = any member; write = member with an
  active subscription. The expired screen and banners are display only.
- Pages: Upload, HPP, Biaya, Rekap (chapters: Untung, Dari mana angkanya, Iklan, Pesanan & produk
  tabs), Iklan (upload, period or combined months, per-product cards with labels Hero / Aman / ROAS
  terlalu kecil / Takedown / Data belum cukup / HPP belum diisi), Simulasi Harga (single product, ad
  group, and the admin-fee category panel), Akun.
- Per-product fee in Iklan: the store's average fee (from the income report) is shifted by each
  product's admin fee relative to the sales-weighted average of the products that have one, so the
  total still matches the money actually received. Products without an admin fee use the average.
- Accounts are created by the operator; no public signup. A new account carries the operator's
  temporary password; a sticky banner asks the user to set their own until they do (a reminder, not
  a lock).
- Schema changes are SQL files in `supabase/migrations/`, run in order and safe to re-run. The app
  degrades when a newer file has not been run yet (defaults, no category panel) and shows customers
  a neutral message; the technical hint goes to the browser console only.
- All UI text in Bahasa Indonesia; money as `Rp1.250.000`. Terms follow the glossary in
  PANDUAN.md (HPP, ROAS nyata, Balik modal, Takedown, Hero, Angka final, …).
- Privacy: buyer personal data is never read or stored. A file that fails to parse can be reported to
  the operator over WhatsApp with only its name and the error message.
- Calculation logic lives in `src/lib/` (and two SQL views) and is covered by tests; UI work must not
  change results. Migrations that change numbers are checked against the previous definition on a
  real PostgreSQL before shipping.

## Brand Commitments

- App name comes from `VITE_APP_NAME`: "Profit Shopee" (family) or "HitungCuan" (customers).
- Family store names: Harel Beauty, Oraiste Beauty House.
- No logo files or brand colours exist in the repository beyond the design system's palette; none have
  been made binding.

## Evidence on Hand

- Real Shopee exports for July–September 2026 exist only in the git-ignored `sample-data/` folder
  (never committed or shown). Committed tests use dummy fixtures in `tests/fixtures/`.
- The parsers have only seen this family's files. Other sellers' exports (Star/Mall accounts, other
  categories) are **untested**; README lists a checklist for testing 3–5 real prospects.
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
5. **Defaults are visible.** Anything that differs between stores (fees, targets, returns) is a
   setting with its default written next to it, and a setting that changes past numbers says so.
6. **Say when data is missing, never fake zero.** An empty month is explained and acted on, not shown
   as Rp0; a number that depends on something not yet filled is labelled as such.
7. **Customers never see operator internals.** No SQL, migration or hosting talk on a customer's
   screen.

## Accessibility & Inclusion

No special requirement beyond the Indonesian language. Primary use is laptop/PC; layouts must still
work on iPad and phones at 375px wide. The page itself never scrolls sideways: wide tables scroll
inside their sheet, with an edge shadow and a "Geser ke samping" hint while columns are hidden.
Contrast is checked with WCAG ratios (see DESIGN.md); status never relies on colour alone.
