---
name: Profit Shopee / HitungCuan
description: Profit, ads and price tool for Shopee sellers (the family's "Profit Shopee" and the multi-tenant "HitungCuan"). Every page answers first in a sentence on a warm light page, then shows its working on white sheets. Same skin as the HitungCuan landing page.
colors:
  canvas: "#fffbf6"
  paper: "#ffffff"
  tint: "#f7f1e8"
  line: "#ece2d4"
  rule: "#d6cab9"
  control: "#8a8178"
  ink: "#1c1917"
  ink-2: "#57534e"
  ink-3: "#6f6860"
  accent: "#2b3a9e"
  accent-hover: "#3546b5"
  accent-tint: "#dde2fa"
  loss: "#c4361e"
  loss-tint: "#fcebe6"
  gain: "#146c43"
  mintbg: "#ddf3e9"
  sun: "#f5d547"
  sun-ink: "#4a3200"
  sun-tint: "#fdf3d0"
  warn: "#8a5300"
typography:
  hero-figure:
    fontFamily: "Parkinsans, Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "7.5rem"
    fontWeight: 800
    lineHeight: 0.95
    letterSpacing: "-0.05em"
  story:
    fontFamily: "Parkinsans, Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "3.75rem"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Parkinsans, Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.75rem"
    fontWeight: 800
    lineHeight: 1.08
    letterSpacing: "-0.025em"
  chapter:
    fontFamily: "Parkinsans, Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Parkinsans, Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.3
  kicker:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "0.025em"
  body:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  figure:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    fontFeature: "tnum"
rounded:
  tag: "6px"
  file: "8px"
  control: "12px"
  well: "16px"
  sheet: "24px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  chapter-gap: "56px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.paper}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    borderColor: "{colors.control}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "44px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    borderColor: "{colors.control}"
    rounded: "{rounded.control}"
    height: "44px"
  pill-select:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    borderColor: "{colors.control}"
    rounded: "{rounded.pill}"
    height: "44px"
  sheet:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.sheet}"
    padding: "28px"
  nav-item-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.pill}"
    height: "40px"
  nav-item:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.pill}"
    height: "40px"
  sticker-positive:
    backgroundColor: "{colors.mintbg}"
    textColor: "{colors.gain}"
    borderColor: "{colors.gain}"
    rounded: "{rounded.tag}"
  sticker-loss:
    backgroundColor: "{colors.loss}"
    textColor: "{colors.paper}"
    rounded: "{rounded.tag}"
  sticker-warn:
    backgroundColor: "{colors.sun}"
    textColor: "{colors.sun-ink}"
    borderColor: "{colors.sun-ink}"
    rounded: "{rounded.tag}"
---

# Design System: Profit Shopee / HitungCuan

## Overview

**Creative North Star: "Cerita Bulan Ini" (this month's story), in the "Dapur Terang" skin of the landing page.**

The structure is unchanged: every page answers its question first, as a big sentence ("September 2026, Harel Beauty
**untung bersih** Rp3,42 juta"), and the working (arithmetic, tables, forms) follows on rounded white sheets. Rekap is
told in chapters: Bab 1 Untung bersih, Bab 2 Dari mana angkanya, Bab 3 Iklan, Bab 4 Pesanan & produk.

**What changed on 15 Oct 2026 (owner's request): the skin now matches the HitungCuan landing page** (repo
`harykheng/hitung-cuan`, `DESIGN.md` and `src/index.css` there). The ink-blue field, lime, coral card, Bricolage
Grotesque and Public Sans are gone. The app uses the landing's warm cream page, ink text, one indigo accent,
Parkinsans for display and Plus Jakarta Sans for everything else. Reasons: someone who clicks "Coba gratis" on the
landing and logs in should land in the same world; the landing's own rules (no confetti, no word-by-word headlines, no
colour used as decoration) apply here too. The landing's Rekap mock card ("Toko kamu untung bersih Rp3,42 juta", stickers
Takedown and Hero) is what Rekap Bab 1 now looks like.

**Key characteristics:**
- Warm light page (`canvas`), white sheets with one soft shadow and a 1px `line` ring.
- Answers are sentences in Parkinsans 800; the key word carries the `.hl` band (indigo tint under ink), and the figure is
  `gain` or `loss` when it is a profit or a loss.
- One accent, indigo, for the primary button, links, kickers, accent icons and focus rings. Never a status.
- Selected states (nav, tabs, filters) are filled `ink` with `paper` text, like the landing's selected button.
- Verdicts are stamp stickers: uppercase, tilted, 2px border, always word + icon.
- Operate rules hold: standard controls, 44px targets, plain Indonesian ("kamu"), no horizontal scroll from 360px.

**Dial: ENERGY 2 / RHYTHM 2 / MOTION 2** (antislop dials, the landing's values; inferred on 15 Oct 2026 with the reskin,
the owner confirms or changes them). The earlier ENERGY 3 came from the saturated blue field and the confetti; both are
gone, so the energy now lives only in the answer sentence, the green or red figure and the stickers.

## Colors

The palette is the landing's, value for value. The landing still uses legacy names for the accent (`ember` = `accent`,
`ember-text` = `accent`, `peach` = `accent-tint`); the values are identical. If either side changes a value, change both.

**Three groups, no more:**

- **Core, warm neutrals:** `canvas` (page), `paper` (sheets), `tint` (wells inside sheets, tab tracks, info alerts),
  `line` (hairlines, sheet ring), `rule` (dashed "tear" lines, column headers' underline), `control` (borders of inputs
  and outlined buttons, 3.8:1 on paper, WCAG 1.4.11 needs 3:1), and the ink scale: `ink` 17.2:1, `ink-2` 7.6:1, `ink-3`
  5.49:1 on paper (4.89:1 on tint).
- **One accent, indigo:** `accent` #2b3a9e (white on it 9.54:1; on canvas 9.26:1, on tint 8.49:1), `accent-hover`
  #3546b5 (white 7.79:1), `accent-tint` #dde2fa only for the `.hl` band under ink text (13.6:1) and nothing else.
- **Status, fixed meanings, always with a word or icon:** `loss` (rugi; 5.39:1 on paper, white on it 5.39:1) with
  `loss-tint`; `gain` (untung; 6.45:1 on paper, 5.55:1 on `mintbg`) with `mintbg`; `sun` (perlu perhatian) with `sun-ink`
  for text on it, `sun-tint` for warning wells and `warn` #8a5300 for warning text on light surfaces (6.3:1 on paper, 5.7:1
  on `sun-tint`).

Info alerts are neutral (`tint` well, accent icon): the landing has no blue "info" status, and adding one would be a
fourth group. Do not put `loss` text on the `.hl` band (4.19:1).

Charts stay neutral unless the segment is a status: the Rp100 bar uses `line` (modal), `rule` (biaya) and `gain`
(untung); the orders bar uses `ink` (selesai), `control` (diproses) and `line` (batal).

## Typography

- **Display: Parkinsans** (variable, self-hosted in `public/fonts`, OFL) at 700/800 for answer sentences, page and
  chapter titles, sheet titles, single big figures, nota totals and stickers.
- **Body: Plus Jakarta Sans** (variable, self-hosted, OFL) for everything else. Figures in columns use it with `.num`
  (tabular numerals); Parkinsans digits are proportional, so it is only used for single figures.

### Hierarchy
- **Hero Figure** (800; 3.75rem / 6rem from 640px / 7.5rem from 1024px; 0.95): Rekap Bab 1, short form
  (`formatRupiahShort`) with the exact amount in the next sentence. `gain` or `loss`.
- **Story** (800; 2.25rem / 3rem / 3.75rem): the Bab 1 sentence; Iklan, Simulasi and Grup answers use 1.875rem / 3rem.
- **Headline** (800; 1.875rem / 2.25rem / 2.75rem, the landing's H2 scale): page titles (`PageTitle`), so the answer
  sentence below them stays the loudest thing on the page.
- **Chapter** (800; 1.875rem / 2.25rem): Rekap chapter titles.
- **Kicker** (Plus Jakarta Sans 600, `accent`, wide tracking): store name above page titles, "Bab 2 · Hitungannya".
- **Title** (700, 1.25rem): sheet titles. **Body** 400 / 1rem / 1.5; **Figure** 600 / 1.125rem tabular.

## Layout

- **Shell:** sticky top bar on `canvas` (1px `line` under it, 64px): brand (HitungCuan logo for the HitungCuan deploy,
  only its mark below 640px and between 1024 and 1279px where the nav shares the bar; the app name as text for other
  deploys), store pill select (only when the account has several stores), nav from 1024px (six pills with one sliding
  `ink` marker), Akun and Keluar icon buttons.
  Below 1024px the nav is a fixed `paper` bottom bar of six cells (icon over short label) with an `ink` pill marker
  behind the active icon; the page reserves room for it plus the safe-area inset.
- **Password banner:** while the user still has the operator's temporary password, a full-width `sun` strip with `ink`
  text sits at the top of the same sticky bar (hidden on the Akun page), with an `ink` pill "Ganti password". It is the
  only full-width coloured strip and never blocks anything. Akun and Keluar are icon buttons at the right of the bar
  (Akun turns `ink` when it is the current page).
- **Floating help:** a "Bantuan" pill (48px, bottom right) opens WhatsApp to the operator with a prefilled message
  (account, store, page). White with a 2px `control` border, `shadow-sheet` and the WhatsApp logo in `accent`: it is on
  every page, so it must not compete with the page's own primary button. Above the bottom bar on phones, 24px from the
  corner on laptops, 16px from the bottom on Login. Absent when `VITE_SUPPORT_WA` is empty.
- **Above the page content (not sticky):** the monthly reminder (info alert, one indigo pill per missing step,
  "Ingatkan besok" link) and the subscription banners (expiring: warning alert; expired: warning alert over a read-only
  Rekap where every button that changes data is hidden).
- **Store name:** shown (store select in the bar, kicker above page titles, "Disimpan ke toko") only when the account
  has more than one store.
- **Content:** max 72rem, 16 / 24 / 32px side padding.
- **Rekap:** chapters 56px apart. Bab 1 is two columns from 1024px (sentence + hero figure left, the "Dari setiap Rp100"
  sheet right, stretched to the same height); one column below. Bab 2 and Bab 3 are sheets; Bab 4 is a tab track over a
  sheet.
- **Empty Rekap:** no chapters and no Rp0, and nothing renders until the check has finished, so it never flashes after
  zeros. A store with no data at all gets the first-step screen: answer sentence "Mulai dengan 3 langkah ini.", one
  primary "Upload laporan" button, and a sheet with the three steps (export pesanan, laporan penghasilan, HPP; the last
  turns into a green check when done). For a new HitungCuan customer it is the first screen after login. A store that has
  data in other months gets a short info alert with an Upload button.
- **Answer first:** Iklan's answer sits between the period select and the summary sheet; Simulasi's between the product
  picker and the input/results grid, updating live.
- **HPP list:** stacked rows on phones (name, SKU, full-width input, status), four columns from 640px.

## Elevation & Depth

Two levels: the page, and sheets on it with one soft shadow (`--shadow-sheet`, the landing's value) plus a 1px `line`
ring. No nested sheets: wells inside a sheet use `tint` without shadow. Buttons have no shadow.

## Shapes

Radius marks the kind of element: 6px stickers, 8px the file button, 12px inputs, 16px wells and alerts, 24px sheets,
pill for buttons, selects, tabs, filters and nav.

## Components

- **Buttons** (`Button`, `buttonClass` for links): primary = `accent` pill, white text; secondary = `paper` pill with a
  2px `control` border, `ink` text, border turns `ink` on hover; danger = `loss` pill. All 44px, 2px border, press moves
  1px down. One primary per screen where possible.
- **Links** (`linkClass`): `accent`, semibold, thick underline at 35% that fills on hover. Secondary actions are links,
  not extra buttons.
- **WhatsApp button** (`WhatsAppButton`): primary pill with the WhatsApp logo, only on a screen whose only way forward
  is the operator (account without a store).
- **Pill select** (`PillSelect`): `paper`, `control` border, chevron; Bulan, Periode iklan, Toko.
- **Tabs and filters:** tabs sit in a `tint` track with a `line` ring; the active tab and active filter chip are `ink`
  with `paper` text; inactive chips are outlined with `control`.
- **Sheet** (`Card`): `paper`, 24px, 20 / 28px padding, Parkinsans title.
- **Inputs:** 44px, 12px radius, `control` border, `accent` border plus a 3px `accent` 25% ring on focus; money
  right-aligned with a muted "Rp"; missing HPP uses `loss-tint` with a `loss` border.
- **Alerts:** 16px radius, tinted well and border, line icon; info = `tint` + accent icon, warning = `sun-tint` + `sun`
  border, error = `loss-tint`, success = `mintbg`.
- **Nota** (`NotaLine`, `NotaTotal`): operator column (`+ − = ≈`), label with a detail line, amount right-aligned in
  tabular figures (below its label on phones). A dashed `rule` tears the nota before sub-totals; totals get a 2px `ink`
  line on top and a Parkinsans 800 amount, coloured `gain`/`loss` when it is a profit.
- **Sticker** (`Stamp`): Parkinsans 800, uppercase, `tracking-wide`, 6px radius, 2px border, tilted −3° (lists alternate
  −3° / 3°), with an icon per tone: positive = `mintbg`/`gain` + check (Angka final, Hero, Aman, Tersimpan, Disarankan);
  loss = `loss`/white + cross (Takedown, Iklan rugi); warn = `sun`/`sun-ink` + triangle (Belum lengkap, ROAS terlalu
  kecil); neutral = `tint`/`ink-2` + dash (HPP belum diisi, Data belum cukup). Sizes `xs`, `sm`, `md`.
- **Modal** (`Modal`): sheet in the middle of a 45% `ink` scrim. Escape and a click outside close it (not while it is
  working), Tab cycles inside, focus starts on the dialog box (so Enter does not run the action) and returns to the
  opener. Titles are questions in Parkinsans ("Hitung ulang HPP September 2026?").
- **Wide tables** (`ScrollX`): horizontal scroll inside the sheet, a `paper`-to-transparent fade on the right edge while
  columns are hidden, and a "Geser ke samping untuk kolom lainnya" hint with an arrow icon (`accent`) until the first
  scroll. Nothing shows when the table fits. The HPP list does not need it: it stacks on phones.
- **Settings forms** (Akun, Pengaturan hitungan, Kategori biaya admin): labels above fields (semibold), the default
  written in the hint ("Bawaan 5%"), money and percentages right-aligned with a muted suffix, locked fields use `tint`
  with `ink-2` text. Messages go **below** the buttons so the buttons never move: error alert first, then success.
  Destructive steps (delete a category) confirm inline with the consequence spelled out.
- **Category panel** (Simulasi Harga): an outlined pill "Kategori biaya admin · N kategori" opens it; list of categories
  (name, %, product count, delete), an add row on a `tint` well, then one row per product with a native select.
  Choosing a category fills and locks the product's admin %; "Isi persen sendiri" unlocks it.
- **Failure screens:** a page that fails to render shows one error alert ("Halaman ini mengalami gangguan."): data is
  safe, a primary pill "Muat ulang", and the WhatsApp link to the operator. Server errors shown to customers use the same
  neutral wording and never name SQL, migrations or hosting; operator hints go to the console only.
- **Reminder and banners:** info or warning alerts, never red: the reminder is a nudge, not an error.
- **Icons:** one hand-drawn line family in `src/components/icons.tsx` (24 viewBox, stroke 2 like the landing, round
  caps) instead of an icon library: the project allows no new runtime dependency without the owner's approval, and one
  stroke style lets the bottom bar, buttons and alerts read as one family. Icons support a word, they do not replace it
  (Akun and Keluar in the top bar are the two icon-only buttons, with a screen-reader label and a tooltip). The only
  filled icon is the WhatsApp logo on WhatsApp buttons. No emoji, sparkle, star, bolt or robot glyphs, and no unicode
  glyphs as icons (arrows in prose such as "Pesanan Saya → Export" are text, not icons).

## Motion

Motion marks an answer arriving or a state changing; only transform and opacity; all of it is in `src/index.css` and
`src/components/motion.tsx` (no library) and is off under `prefers-reduced-motion`.

- **Counting** (`useCountUp`): the hero figure rolls up to its value (700ms ease-out).
- **Sticker stamp** (`.stamp-in`): from 30% with a twist, overshoot to 114%, settle (460ms); lists stagger 60ms.
- **Printing** (`.print-in`, `.print-last`): nota lines appear one after another (120ms apart), the total last.
- **Bar grows** (`.grow-split`): Rp100 bar segments grow from the base (vertical) or left (horizontal).
- **Feedback:** nav marker slides (260ms); opened panels fade down 4px; pages and tabs fade up 4px; buttons press 1px.
- **Removed with the reskin:** confetti and word-by-word headlines. The landing dropped both as template patterns.

## Voice

- Everyday Indonesian, the reader is "kamu". Rupiah as `Rp1.250.000`, `Rp3,42 juta` for big rounded figures.
- Seller words where they fit (untung bersih, cuan, boncos only in the login headline borrowed from the landing).
  Glossary terms from PANDUAN.md: HPP, ROAS nyata, Balik modal, Takedown, Hero, Angka final.
- No em dash in visible text. Ranges keep the en dash ("1–30 Sep 2026").
- Buttons say the action and its object ("Simpan biaya September 2026", "Upload laporan", "Chat pengelola").
- The person who runs the app is "pengelola" (in full "pengelola aplikasi"), never "admin": "admin" already names
  Shopee's admin fee ("biaya admin"), so one word never names two things. (The landing says "admin"; the app keeps its
  rule.)
- Customers never see operator internals: no SQL, migration, Supabase or hosting in any message.
- An empty state explains the next step instead of showing zeros; a setting writes its default next to it and says when
  changing it rewrites past numbers.
- Privacy and operational claims must be true in code: the login line "Nama, alamat, dan nomor HP pembeli tidak
  disimpan" is backed by `BUYER_PRIVATE_COLUMNS` (README section 6).

## Do's and Don'ts

### Do:
- **Do** answer in a sentence before showing any table, and give the exact figure right after a rounded one.
- **Do** keep working content on white sheets, and use `tint` wells (not sheets) inside a sheet.
- **Do** use `accent` only for the primary action, links, kickers, accent icons and focus.
- **Do** keep controls standard, pill-shaped and at least 44px tall.
- **Do** tie any new motion to a state change and add it to the reduced-motion block.
- **Do** change the landing's `src/index.css` and `DESIGN.md` together with this file when a shared token changes.
- **Do** address the reader as "kamu" (never "Anda") and the operator as "pengelola".

### Don't:
- **Don't** build grids of metric tiles; one answer per chapter.
- **Don't** use `accent` as a status, or status colours as decoration (no coloured cards just for emphasis).
- **Don't** use red for anything that is not a loss (empty, missing, expired, a new store); missing HPP is a warning.
- **Don't** nest sheets, add coloured side stripes or gradients (the `.hl` band is the one exception).
- **Don't** use emoji or unicode glyphs as icons or status markers.
- **Don't** bring back confetti, looping animation or word-by-word headlines.
