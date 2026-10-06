---
name: Profit Shopee
description: Internal profit, ads and price tool for two Shopee beauty stores, read like a store receipt.
colors:
  stamp-ink: "#3a3fb8"
  stamp-ink-deep: "#2c309b"
  stamp-wash: "#ecedfb"
  receipt-ink: "#17202b"
  receipt-ink-soft: "#3a4553"
  receipt-ink-muted: "#5a6574"
  rail-ink: "#141b25"
  rail-ink-raised: "#222c3a"
  rail-text: "#c5cdd8"
  counter-grey: "#eceef2"
  paper-white: "#ffffff"
  hairline: "#d8dce3"
  tear-rule: "#aeb5c0"
  loss-red: "#b3261e"
  loss-wash: "#fdeceb"
  gain-green: "#146c43"
  gain-wash: "#e5f3eb"
  warn-amber: "#8a5300"
  warn-wash: "#fff3d9"
  warn-line: "#ebc06a"
  info-blue: "#1d4f86"
  info-wash: "#e8f0fa"
typography:
  headline:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 700
    letterSpacing: "0.1em"
  figure:
    fontFamily: "Azeret Mono, ui-monospace, Menlo, Consolas, monospace"
    fontSize: "1.125rem"
    fontWeight: 600
    letterSpacing: "-0.01em"
    fontFeature: "tnum"
  figure-total:
    fontFamily: "Azeret Mono, ui-monospace, Menlo, Consolas, monospace"
    fontSize: "2.25rem"
    fontWeight: 700
    letterSpacing: "-0.01em"
    fontFeature: "tnum"
rounded:
  stamp: "3px"
  control: "6px"
  sheet: "8px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.stamp-ink}"
    textColor: "{colors.paper-white}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.stamp-ink-deep}"
  button-secondary:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.receipt-ink}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  input:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.receipt-ink}"
    rounded: "{rounded.control}"
    height: "44px"
  sheet:
    backgroundColor: "{colors.paper-white}"
    rounded: "{rounded.sheet}"
    padding: "24px"
  nav-item-active:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.receipt-ink}"
    rounded: "{rounded.control}"
    height: "44px"
  nav-item:
    backgroundColor: "{colors.rail-ink}"
    textColor: "{colors.rail-text}"
    rounded: "{rounded.control}"
    height: "44px"
  filter-chip-active:
    backgroundColor: "{colors.receipt-ink}"
    textColor: "{colors.paper-white}"
    rounded: "{rounded.control}"
    height: "44px"
  stamp:
    textColor: "{colors.loss-red}"
    typography: "{typography.label}"
    rounded: "{rounded.stamp}"
    padding: "2px 8px"
---

# Design System: Profit Shopee

## Overview

**Creative North Star: "The Store Receipt (Nota Kasir)"**

Every answer the app gives is printed as a nota: itemised lines, an operator column (`+`, `−`, `=`, `≈`), a dashed tear rule, and a total. The family already trusts receipts, so profit, ad performance and price checks borrow that reading order instead of a dashboard of metric tiles. Sheets of white receipt paper sit on a cool grey counter; a blue-black ink rail holds the navigation; verdicts are pressed on top as rubber stamps.

It is an Operate surface first. Navigation, buttons, inputs, tabs and tables stay standard web controls; the world only lends the palette, the two-family type pairing, a moderately dense rhythm, and one signature move (the stamp). Laptop is the primary device, iPad and phone must keep working without horizontal scroll.

**Key Characteristics:**
- White sheets on a cool grey counter; one blue-black rail.
- Every Rupiah, percentage, ROAS and quantity set in a tabular monospace.
- Dashed tear rule before every total.
- Verdicts (Angka final, Takedown, Hero, Iklan rugi) as double-ruled, slightly tilted stamps.
- Colour carries meaning only: stamp ink for action and selection, red loss, green gain, amber attention.

## Colors

A restrained receipt palette: cool neutrals, one stamp-ink accent, and four state inks.

### Primary
- **Stamp Ink** (`stamp-ink`): primary buttons, focus outline, selected tab underline, links, the active nav icon. Never decorative fill.
- **Deep Stamp Ink** (`stamp-ink-deep`): hover and pressed state of primary buttons.
- **Stamp Wash** (`stamp-wash`): text selection, the "result" row of the sold-items flow.

### Neutral
- **Receipt Ink** (`receipt-ink`): body text and totals.
- **Soft Ink** (`receipt-ink-soft`) and **Muted Ink** (`receipt-ink-muted`): secondary text, line details, table headers, operator column.
- **Rail Ink** (`rail-ink`) with **Raised Rail** (`rail-ink-raised`) and **Rail Text** (`rail-text`): the navigation rail / top bar and the store picker on it.
- **Counter Grey** (`counter-grey`): page ground and quiet wells (advice boxes, explanations).
- **Paper White** (`paper-white`): every sheet, input and secondary button.
- **Hairline** (`hairline`): sheet borders, row dividers. **Tear Rule** (`tear-rule`): dashed tear lines.

### State
- **Loss Red** / **Loss Wash**: negative money, Takedown, Iklan rugi, errors.
- **Gain Green** / **Gain Wash**: positive results, Angka final, Hero/Aman, saved.
- **Warn Amber** / **Warn Wash** / **Warn Line**: Belum lengkap, ROAS terlalu kecil, missing data.
- **Info Blue** / **Info Wash**: neutral notices and "where this number came from" notes.

**The Meaning-Only Rule.** Stamp ink, red, green and amber are never used for decoration. If a colour does not tell the reader to act, that money was lost, gained, or needs attention, it is a neutral.

**The Counter-and-Paper Rule.** The page ground stays Counter Grey and content sits on Paper White sheets. No tinted sheets except the state washes for alerts and the ad-result box.

## Typography

**Body Font:** Public Sans (with ui-sans-serif, system-ui)
**Figure Font:** Azeret Mono (with ui-monospace, Menlo, Consolas)

**Character:** A plain, administrative sans for words, like a printed form; a tabular mono for every figure, like a cash-register printout. Both are self-hosted from `public/fonts` (OFL).

### Hierarchy
- **Headline** (600, 1.875rem on ≥640px / 1.5rem below, 1.2): page titles and the nota title ("Untung bersih Agustus 2026").
- **Title** (600, 1.125rem, 1.4): sheet titles.
- **Body** (400, 1rem, 1.5): all copy; subtitles capped at 70ch.
- **Small** (400, 0.875rem): line details under each nota line, hints, table headers.
- **Label** (700, 0.875rem, 0.1em, uppercase): stamps and the "UNTUNG BERSIH" total label.
- **Figure** (Azeret Mono 600, 1.125rem, tabular): nota amounts, table cells, input values.
- **Figure Total** (Azeret Mono 700, 1.875–2.25rem, tabular): the one total per nota.

**The Figures-Are-Mono Rule.** Every money amount, percentage, ROAS and count is set in Azeret Mono with tabular numerals so columns align like a receipt. Words, including words that sit in a figure column ("belum diisi", "tidak mungkin"), stay in Public Sans.

**The No-Costume Rule.** Mono is for figures only: not for headings, buttons, stamps or labels.

## Layout

- **Shell:** at ≥1024px a fixed-width rail (15.5rem) on the left with brand, store picker, two nav groups ("Lihat hasil": Rekap, Iklan, Simulasi Harga; "Input bulanan": Upload, HPP, Biaya) and the account at the bottom; the rail is sticky and its colour runs the full page height. Below 1024px a sticky ink top bar with brand, store picker and logout (icon only under 640px), and a horizontally scrolling single-row nav.
- **Content:** max width 72rem, padding 16px → 24px (≥640px) → 40px (≥1024px). Rekap's nota and its tabs share a 56rem column so the receipt reads as one strip.
- **Grids:** product cards in two columns at ≥1024px; Simulasi Harga puts inputs (22rem) beside the results.
- **Rhythm:** 4px base; 12–20px between related rows, 24px between sheets; more space above a heading than below it.
- **Touch:** every interactive control is at least 44px tall.

## Elevation & Depth

Flat paper on a counter. Depth is a single soft sheet shadow plus a hairline border; nothing floats higher except the HPP recalculation dialog.

### Shadow Vocabulary
- **Sheet** (`box-shadow: 0 1px 2px rgb(23 32 43 / 0.06), 0 2px 8px rgb(23 32 43 / 0.05)`): every sheet and product card.
- **Dialog** (Tailwind `shadow-xl`): the modal dialog only, over an ink scrim at 40%.

**The One-Sheet-Deep Rule.** Sheets never nest inside sheets. Inside a sheet, group with hairline dividers, a tear rule, or a Counter Grey well.

## Shapes

Small, practical radii: 3px for stamps, 6px for controls (buttons, inputs, chips, nav items, wells), 8px for sheets. Dividers are 1px hairlines; tear rules are 2px dashed in Tear Rule grey. Stamps use a 3px double border.

## Components

### Buttons
- **Shape:** gently squared (6px), 44px tall, 16px side padding, semibold 1rem, optional 18px line icon on the left.
- **Primary:** Stamp Ink fill, white text; hover/pressed Deep Stamp Ink; disabled at 40% opacity.
- **Secondary:** Paper White with a Hairline border, Receipt Ink text; hover darkens the border to Muted Ink.
- **Danger:** Loss Red fill, white text.
- **Focus:** 2px Stamp Ink outline, 2px offset (global `:focus-visible`).

### Filter chips
- **Style:** 44px, 6px radius, Hairline border on Paper White, Soft Ink text; counts in the figure font.
- **Active:** Receipt Ink fill with white text.

### Sheets
- **Corner Style:** 8px. **Background:** Paper White. **Border:** 1px Hairline. **Shadow:** Sheet. **Padding:** 20px, 24–28px from 640px.

### Inputs / Fields
- **Style:** 44px, 6px radius, Hairline border, Paper White, values in the figure font, right-aligned for money with a muted "Rp" prefix or "%" suffix.
- **Hover:** border to Muted Ink. **Focus:** border Stamp Ink plus a 2px Stamp Ink ring at 25%.
- **Error:** Loss Red border and a one-line red hint under the field. Source notes ("↳ Dari halaman HPP") are Info Blue with a corner-arrow line icon.
- **Text fields** (email, notes, search) share one class (`inputClass` in `ui.tsx`): same box, words in the sans face, muted placeholder. Search fields carry an 18px search icon inside on the left.
- **Missing values** (HPP not yet filled): the money field turns Loss tint with a soft Loss border, and the row is washed Loss tint so gaps are findable while scrolling.
- **File picker:** a dashed Hairline well holding a primary "Pilih file" button with an upload icon and the chosen file name (truncated) beside it. Long names wrap anywhere so phones never scroll sideways.

### Input pages (Upload, HPP, Biaya, Login)
- **Upload:** a Stamp-tint banner names the store being written to; two sheets side by side at ≥1024px (Excel, PDF); the save result is a sheet with a "TERSIMPAN" stamp and counts in figures.
- **Biaya:** a small nota: one row per cost (label, money field, note), then a tear rule and "TOTAL BIAYA" in Figure Total. Unsaved changes show a Warn line with an alert icon.
- **Login:** one centred sheet on the counter with an ink receipt badge; nothing else.

### Navigation
- **Rail item:** 44px, 6px radius, 18px line icon + label, Rail Text on Rail Ink; hover lightens to white on a 5% white wash.
- **Active:** Paper White pill with Receipt Ink text and a Stamp Ink icon.
- **Mobile:** same items in one scrolling row inside the ink top bar, short labels ("Simulasi").

### Nota (signature)
- A sheet whose body is a three-column grid: operator (`+ − = ≈`, muted mono), label with a small detail line, amount (figure font, right-aligned). Rows divided by hairlines; a dashed tear rule above the first line and before the total; the total row uses the uppercase label and Figure Total. Used for Untung bersih (Rekap), Perkiraan untung, ad summaries, each ad product card, and Rincian per order (Simulasi Harga).

### Stamp (signature)
- Uppercase Public Sans 700, 0.875rem, 0.1em tracking, 3px double border in the state ink, translucent paper fill, tilted −2° (upright when used inline in explanations or tables). Tones: final/gain = Gain Green, warn = Warn Amber, loss = Loss Red, neutral = Muted Ink. It is text, readable by screen readers, never an image or texture.

### Alerts
- 6px radius, 1px tinted border, state wash background, a 20px line icon in the state ink, title in Receipt Ink, body in Soft Ink. No side stripes.

## Do's and Don'ts

### Do:
- **Do** print results as a nota: operator column, tear rule, one total.
- **Do** put every figure in Azeret Mono with tabular numerals and every word in Public Sans.
- **Do** use a stamp for a verdict (status, ad label, ad result) and nowhere else.
- **Do** keep controls standard and at least 44px tall.
- **Do** use the line icons in `src/components/icons.tsx` (24px grid, 1.75 stroke) for any new icon.

### Don't:
- **Don't** use emoji or unicode glyphs as icons or status markers.
- **Don't** nest sheets, or add coloured side stripes to cards or alerts.
- **Don't** use stamp ink, red, green or amber for decoration.
- **Don't** set headings, buttons, stamps or labels in the monospace.
- **Don't** fake paper or ink texture (no grain, torn-edge images or ink-bleed effects); the receipt is expressed through structure and type.
