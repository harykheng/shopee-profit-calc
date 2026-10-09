---
name: Profit Shopee
description: Internal profit, ads and price tool for two Shopee beauty stores. Every page answers first in a sentence, then shows its working.
colors:
  field: "#2b2fa6"
  field-deep: "#1d2079"
  field-raised: "#3b3fb4"
  on-field: "#f6f4ff"
  on-field-muted: "#c3c5f2"
  lime: "#d7f45a"
  coral: "#c4361e"
  coral-soft: "#ff9b85"
  paper: "#ffffff"
  counter: "#eef0f7"
  line: "#dfe2ee"
  rule: "#b4b9cf"
  ink: "#16173d"
  ink-soft: "#3b3d63"
  ink-muted: "#5d6088"
  stamp: "#3a3fb8"
  stamp-strong: "#2c309b"
  stamp-tint: "#ecedfb"
  loss: "#b3261e"
  loss-tint: "#fdeceb"
  gain: "#146c43"
  gain-tint: "#e5f3eb"
  warn: "#8a5300"
  warn-tint: "#fff3d9"
  warn-line: "#ebc06a"
  info: "#1d4f86"
  info-tint: "#e8f0fa"
typography:
  hero-figure:
    fontFamily: "Bricolage Grotesque, Public Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "8.5rem"
    fontWeight: 800
    lineHeight: 0.9
    letterSpacing: "-0.05em"
    fontFeature: "tnum"
  story:
    fontFamily: "Bricolage Grotesque, Public Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "3.75rem"
    fontWeight: 700
    lineHeight: 1.04
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Bricolage Grotesque, Public Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "3rem"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.025em"
  chapter:
    fontFamily: "Bricolage Grotesque, Public Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Bricolage Grotesque, Public Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.3
  kicker:
    fontFamily: "Bricolage Grotesque, Public Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.4
  body:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  figure:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    fontFeature: "tnum"
rounded:
  control: "12px"
  pill: "9999px"
  well: "16px"
  sheet: "24px"
  chapter: "32px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  chapter-gap: "56px"
components:
  button-primary:
    backgroundColor: "{colors.stamp}"
    textColor: "{colors.paper}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.stamp-tint}"
    textColor: "{colors.stamp-strong}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "44px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "44px"
  field-select:
    backgroundColor: "{colors.field-raised}"
    textColor: "{colors.on-field}"
    rounded: "{rounded.pill}"
    height: "44px"
  sheet:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.sheet}"
    padding: "28px"
  nav-item-active:
    backgroundColor: "{colors.on-field}"
    textColor: "{colors.field}"
    rounded: "{rounded.pill}"
    height: "40px"
  nav-item:
    backgroundColor: "{colors.field}"
    textColor: "{colors.on-field-muted}"
    rounded: "{rounded.pill}"
    height: "40px"
  bottom-bar-marker:
    backgroundColor: "{colors.lime}"
    textColor: "{colors.field-deep}"
    rounded: "{rounded.pill}"
  sticker-final:
    backgroundColor: "{colors.lime}"
    textColor: "{colors.field-deep}"
    rounded: "{rounded.pill}"
    padding: "4px 12px"
  sticker-loss:
    backgroundColor: "{colors.coral}"
    textColor: "{colors.paper}"
    rounded: "{rounded.pill}"
    padding: "4px 12px"
  ads-chapter:
    backgroundColor: "{colors.coral}"
    textColor: "{colors.paper}"
    rounded: "{rounded.chapter}"
    padding: "36px"
---

# Design System: Profit Shopee

## Overview

**Creative North Star: "Cerita Bulan Ini" (this month's story)**

The app does not look like a dashboard. Every page answers its question first, as a sentence set large on one committed field of ink blue: "Agustus 2026, Harel Beauty untung **Rp2,78 juta**." The working (the arithmetic, the tables, the forms) follows on rounded white sheets. Rekap is told in chapters: Bab 1 Untung, Bab 2 Dari mana angkanya, Bab 3 Iklan, Bab 4 Pesanan & produk. Iklan opens with "Juli 2026, iklan rugi Rp283 ribu"; Simulasi Harga with "Dijual Rp198.200, untung Rp9.671 per order", which updates while the numbers are typed.

It was chosen by the user from three rendered previews (Resi & Kardus, Cerita Bulan Ini, Papan Toko), replacing the earlier "Nota kasir" receipt system, which they found "masih terlalu dashboard". The structures that worked there stay: answer before line items, operator column in the arithmetic, verdict labels, celebration on a real result.

**Key Characteristics:**
- One saturated field for the whole page; colour commits at page scale, not as scattered accents.
- Answers are sentences in a display face; the one figure the reader came for is lime (or light coral when it is a loss).
- Work happens on white sheets with plain Public Sans and tabular numerals.
- Verdicts are colour stickers that pop on; real results get a small paper-confetti burst.
- Operate rules still hold: standard controls, 44px targets, plain Indonesian, no horizontal scroll from 360px.

## Colors

**The Field-and-Sheet Rule.** Text sitting directly on the blue field uses On Field (`#f6f4ff`) or On Field Muted (`#c3c5f2`) and is wrapped in an element with the `on-field` class (which also turns the focus ring lime). Text on a white sheet uses the ink scale. Never put ink on the field or on-field colours on a sheet.

### Field
- **Field** (`field`, #2b2fa6): page background everywhere, including Login.
- **Field Deep** (`field-deep`, #1d2079): bottom bar on phones/iPad; text on lime.
- **Field Raised** (`field-raised`, #3b3fb4): scrollbar thumb; pills drawn with `bg-white/10` read the same.
- **On Field / On Field Muted**: sentences, chapter titles, labels on the field (9.4:1 and 6.1:1).
- **Lime** (`lime`, #d7f45a): the answer figure, chapter kickers ("Bab 1 · Untung"), the bottom-bar marker, the final/gain sticker, the focus ring on the field (8.2:1 on Field).
- **Coral Soft** (`coral-soft`, #ff9b85): a loss figure written on the field (5.0:1). Never the deep coral there (2.5:1).
- **Coral** (`coral`, #c4361e): the Iklan chapter card in Rekap, the loss sticker, the "Dengan iklan, rugi" card in Simulasi. Text on it is white (5.4:1); the kicker uses #ffe4dc at large size only.

### Sheets
- **Paper** (#ffffff) sheets; **Counter** (#eef0f7) wells and table washes; **Line** (#dfe2ee) hairlines; **Rule** (#b4b9cf) dashed dividers.
- **Ink** (#16173d), **Ink Soft** (#3b3d63), **Ink Muted** (#5d6088): text on sheets.
- **Stamp** (#3a3fb8) / **Stamp Strong** / **Stamp Tint** (#ecedfb): primary buttons, links and selection on sheets; Stamp Tint also fills the total pills.
- **Status**: Loss, Gain, Warn, Info with their tints, unchanged meanings (rugi, untung, perlu perhatian, informasi). Each always carries a word or icon, never colour alone.

## Typography

**Display Font:** Bricolage Grotesque (self-hosted, OFL; latin + latin-ext) for every sentence, chapter title, page title, sheet title, total and sticker.
**Body Font:** Public Sans (self-hosted, OFL) for everything else, figures included (`.num` = tabular numerals so columns line up).

### Hierarchy
- **Hero Figure** (800, 8.5rem on ≥640px / 4.5rem below, 0.9, −0.05em): the one answer figure in Rekap Bab 1, written short ("Rp2,78 juta", `formatRupiahShort`, rounded down) with the exact amount in the next sentence.
- **Story** (700, 3.75rem / 2.25rem): the Bab 1 sentence; Iklan and Simulasi answer lines use 3rem / 1.875rem.
- **Headline** (700, 3rem / 2.25rem): page titles (`PageTitle`).
- **Chapter** (700, 2.25rem / 1.875rem): "Dari mana angkanya", "Pesanan & produk".
- **Kicker** (700, 1.125rem, lime): "Bab 2 · Hitungannya".
- **Title** (700, 1.25rem): sheet titles.
- **Body** (400, 1rem, 1.5) and **Figure** (600, 1.125rem, tabular) on sheets.

## Layout

- **Shell:** sticky top bar on the field at every width: brand, store pill, logout. From 1024px the six nav pills sit in it (Rekap, Iklan, Simulasi, Upload, HPP, Biaya) with one sliding marker. Below 1024px the nav moves to a fixed Field Deep bottom bar of six equal cells (icon over short label) with a lime marker; the page reserves room for it plus the safe-area inset. The brand text hides under 640px so the store name fits.
- **Content:** max 72rem, 16 / 24 / 32px side padding.
- **Rekap chapters:** 56px apart. Bab 1 is two columns from 1024px (sentence + hero figure left at ~70%, the "Dari setiap Rp100" bar right); one column below. Bab 2 and the tabs of Bab 4 are sheets under a chapter title; Bab 3 is the coral card.
- **Answer first:** Iklan puts its answer line between the period select and the summary sheet; Simulasi puts its live answer line between the product picker and the input/results grid.

## Elevation & Depth

Two levels: the field, and sheets on it with one soft shadow (`--shadow-sheet`: 0 2px 4px / 0 14px 34px in field-tinted black). No nested sheets; wells inside sheets use Counter or Stamp Tint without shadow.

## Shapes

Pills (9999px) for buttons, nav, selects on the field, tabs and stickers; 12px for inputs; 16px for wells and total pills; 24px for sheets; 32px for the coral chapter card.

## Components

### Buttons
- **Primary:** Stamp fill, white text, pill, 44px. **Secondary:** Stamp Tint fill, Stamp Strong text. **Danger:** Loss fill. Press scales to 97%.

### Field controls
- **Field select** (`FieldSelect` in `pickers.tsx`): pill with a 35% On Field border on a 10% white wash, On Field text, chevron icon; used for Bulan (Rekap, Biaya), Periode iklan, and the store picker in the top bar. Focus ring lime.
- **Tabs (Rekap Bab 4):** pills inside a 10% white track; the active tab is On Field with Field text.
- **Filter chips (Iklan):** pills on the field; active is On Field with Field text.

### Sheets, inputs, alerts
- **Sheet** (`Card`): Paper, 24px radius, 20 / 28px padding, display-face title.
- **Inputs:** 44px, 12px radius, Line border, Stamp focus ring; money right-aligned with a muted "Rp". Text fields share `inputClass`.
- **Alerts:** 16px radius, tinted border and wash, line icon; readable on the field and on sheets.

### Arithmetic (`NotaLine`)
- Operator column (`+ − = ≈`), label with a detail line, amount right-aligned in figures; on phones the amount drops under its label. Totals are a Stamp Tint pill ("= Untung bersih", "≈ Perkiraan untung", "= Untung per order", "Total biaya") with the amount in the display face; Simulasi colours its pill gain/loss.

### Part-to-whole bar ("Dari setiap Rp100 yang masuk")
- One bar split into modal (10% white), biaya (35% white), untung (lime), sized by their true share of the money in; labelled inside only when a part is at least 12% (others are named in the caption). Vertical from 1024px, horizontal below. Hidden with a plain sentence when the month is a loss (the parts no longer sum to 100).

### Sticker (`Stamp`)
- Display face, 700, pill, slight −3° tilt, solid fill: final/gain = lime on Field Deep, warn = amber (#ffcf5c) on brown, loss = coral on white, neutral = Counter on Ink Soft. Text, never an image.

### Iklan chapter (Rekap Bab 3)
- Coral card: kicker, the answer sentence ("Iklan rugi Rp283 ribu. 4 iklan sebaiknya dimatikan."), the exact figure, up to three takedown products as white-wash tiles, and a white pill to the Iklan page. Only for a single month with a full-month ad report; otherwise it invites an upload.

## Motion

Motion marks an answer arriving or a state changing. All of it lives in `src/index.css` and `src/components/motion.tsx` (no library) and is off under `prefers-reduced-motion`: sentences appear whole, figures show their final value, stickers are simply there, no confetti.

- **Words rise** (`WordsRise`, `.word-rise`): answer sentences rise word by word, 55ms apart (520ms each).
- **Counting** (`useCountUp`): the hero figure rolls up to its value (700ms ease-out).
- **Bar grows** (`.grow-split`): the Rp100 bar segments grow from the base (vertical) or the left (horizontal), 140ms apart.
- **Sticker pop** (`.stamp-in`): from 30% with a twist, overshoot to 114%, settle (460ms). Iklan cards stagger 60ms per card; Simulasi's verdict card re-appears when the verdict flips.
- **Printing** (`.print-in`, `.print-last`): arithmetic lines appear one after another, the total last.
- **Celebration** (`Confetti`): paper scraps burst once from the sticker: after every saved upload, and the first time a month shows ANGKA FINAL in this browser. Clipped to the viewport, mounted on `<body>`.
- **Feedback:** nav marker slides (260ms) with link colours fading in step; buttons press to 97%; opened panels fade down 4px; pages and tabs fade up 4px.

## Do's and Don'ts

### Do:
- **Do** answer in a sentence on the field before showing any table, and give the exact figure right after a rounded one.
- **Do** keep working content on white sheets and wrap anything on the field in `on-field`.
- **Do** use lime only for the answer, kickers, the marker and positive stickers; use coral-soft for losses on the field.
- **Do** keep controls standard, pill-shaped and at least 44px tall.
- **Do** tie any new motion to a state change and add it to the reduced-motion block.

### Don't:
- **Don't** build grids of metric tiles; one answer per chapter.
- **Don't** put ink text on the field or deep coral text on the field.
- **Don't** nest sheets or add coloured side stripes.
- **Don't** use emoji or unicode glyphs as icons or status markers; use `src/components/icons.tsx`.
- **Don't** loop animations or fire confetti for anything but a save or a first ANGKA FINAL.
