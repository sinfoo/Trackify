# Design system

Source of truth for tokens: `apps/web/src/app/globals.css` (OKLCH CSS variables, light default, `.dark` override).
Shared components: `apps/web/src/components/ui-kit/` on top of shadcn/ui (`src/components/ui/`).

## Identity

TECHX orange + navy. Sober operations console, readable on a projector.

| Token | Hex (ref) | OKLCH | Use |
|---|---|---|---|
| navy | #0B1730 | `oklch(0.209 0.053 263.3)` | Sidebar (both themes), dark background, text on orange |
| midnight | #101D38 | `oklch(0.235 0.055 263.4)` | Sidebar hover, dark surfaces |
| primary (orange) | #F5A623 | `oklch(0.784 0.159 73)` | Primary buttons, active nav indicator, key highlight. Max ~10% of surface |
| primary-text (dark orange) | #9A5B00 | `oklch(0.531 0.119 65.1)` | Orange used AS TEXT on light backgrounds |
| info (electric blue) | #397BFF | `oklch(0.615 0.208 262.2)` | Links, info status, chart series 2 |
| background | #F5F7FB | `oklch(0.976 0.006 264.5)` | App background (light) |
| surface / card | #FCFDFE | `oklch(0.994 0.002 247.8)` | Cards, popovers (tinted, never pure white) |
| foreground | #17233C | `oklch(0.259 0.05 263.8)` | Body text (light) |
| muted-foreground | #5F6B80 | `oklch(0.526 0.036 261.6)` | Secondary text. Brief's #718096 is 3.7:1 on bg (fails AA), darkened to 5:1 |
| success | #16A36A | `oklch(0.633 0.141 159)` | SUCCEEDED, COMPLETED, RESOLVED |
| warning | #E6A23C | `oklch(0.761 0.139 73.3)` | Holds, pending review, medium severity |
| danger / destructive | #E04F5F | `oklch(0.628 0.18 17.6)` | FAILED, BLOCKED, high/critical severity |

Status text variants (`--success-text`, `--warning-text`, `--danger-text`, `--info-text`) are darker (>= 5:1 on bg)
for use as text; base tones are for fills, dots and chart marks.

Dark theme: background navy, cards midnight, same accents, foreground `oklch(0.96 0.01 262)`.

Contrast rules:
- Orange on white fails AA for text. Orange is a FILL with navy text (`bg-primary text-primary-foreground`),
  or use `text-primary-text` (dark orange) for orange-tinted text in light theme.
- Status colors are used as tinted pill backgrounds (`bg-success/12 text-success-text`) plus an icon plus a label.
  Color is never the only signal.

## Typography

- UI: **Geist Sans** (`--font-sans`). Numbers, IDs, references, amounts: **Geist Mono** (`--font-mono`) with
  `tabular-nums` (utility `.num`).
- Scale (ratio 1.25 above base 15px): 12 (xs caption) / 14 (sm, dense controls) / **15 body (base)** / 18.75 (lg, h3) / 23.4 (xl, h2) / 29.3 (2xl, h1) /
  36.6 (KPI value). Line-height 1.5 for body, 1.2 for headings.
- Weights: 400 body, 500 labels, 600 headings. No all-caps paragraphs; small uppercase labels allowed with tracking.

## Layout

- Sidebar: deep navy in BOTH themes, 248px, collapsible to 64px icon rail on tablet (md), Sheet drawer on mobile.
  Active item: orange 3px indicator bar on the left edge of the item + lighter row. (This is the only accent
  stripe allowed; no side stripes on cards or alerts.)
- Content: max width 1400px, padding 24px (16px mobile). Cards radius 10px, 1px border, no heavy shadows.
- Page = `PageHeader` (title, description, actions) then content.

## Motion

150 to 200ms, `ease-out`, opacity/transform/color only. No bounce, no elastic, no parallax.
`prefers-reduced-motion: reduce` disables transitions and animations globally.

## Bans

No gradient text. No glassmorphism / backdrop blur panels. No colored side-stripe borders on cards or alerts.
No purple. No identical icon-card grids. No gradient hero metric. No em dashes in UI copy. No bounce.

## Accessibility

Visible focus rings (`ring-2 ring-ring ring-offset-2`, ring = electric blue). `aria-label` on every icon-only
button. Keyboard navigable nav (real links, `aria-current="page"`). Status badges = icon + text. Body >= 14px.

## Component rules

- `KpiCard`: label, value (mono, large), optional delta (arrow icon + signed text, color + icon), info tooltip
  with the metric definition. Flat card, no gradient.
- `StatusBadge`: single map for Transaction, Workflow, Approval, SecurityEvent status and severity.
  Tones: success, warning, danger, info, neutral, progress.
- `SimulatedBadge`: shown on every payment surface.
- Money is always rendered via `Money` / `formatMoney` from decimal strings; never parsed to float.
