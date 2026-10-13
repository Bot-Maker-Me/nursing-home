# DESIGN.md

Design system for the Henderson's Pharmacy portal and public site.
Reference for the public site: <https://www.pharmastrategies.ca/> (visual language only).

## Theme scopes — never mix these

Three independent token scopes live in `app/globals.css`. A scope only re-skins the
surface it is applied to, so nothing leaks between them.

| Scope | Applied where | Affects |
| --- | --- | --- |
| `:root` | always | Portal, admin console, pharmacy console — the default "forest/cream" palette |
| `[data-home-theme='<slug>']` | `app/portal/layout.tsx` | One nursing home's portal only (`lib/home-themes.ts`) |
| `[data-site-theme='pharma']` | `app/page.tsx` | The public marketing site only |

Adding a theme for another nursing home = one entry in `lib/home-themes.ts` plus
`{ "slug": "…" }` on that home's `homes.theme` row. Nothing else changes.

## Public site palette (`[data-site-theme='pharma']`)

```
--bg            #0B1220   deep navy page
--surface       #111A2B   panels, chips, cards
--line          #253049   hairlines / borders
--text          #EDE6DA   cream
--text-muted    #9AA3B2   muted cream (7.4:1 on --bg)
--brand         #E5484D   text-safe red (4.8:1 on --bg)
--highlight     #E5484D   accent red (labels, numbers, headline words)
--on-brand      #EDE6DA
--sheet         #EDE6DA   ledger sheet
--sheet-back    #DDD3C2   second sheet behind it
--sheet-line    #D8CFBE   ledger row dividers
--ink           #0B1220   ink on cream
--ink-muted     #6B6355   ledger column headers (4.7:1 on --sheet)
```

**Two reds, on purpose.** `#C8102E` is used for *solid fills* (buttons, active nav) where
the text on top is cream and contrast is 4.7:1. It is **not** safe as small text on navy
(3.2:1), so text and small accents use `#E5484D` instead. That is why `.bg-forest` /
`.bg-brand` are pinned to `#C8102E` in the marketing scope while `--brand` is `#E5484D`.

### Legacy alias corrections
`--color-cream` maps to `--bg` and `--color-mint` to `--brand-tint`, which were correct in
the light palette but invert on a dark one. The marketing scope therefore corrects a few
utilities directly (`.text-cream`, `.text-cream/70`, `.text-cream/50`, `.bg-mint`) instead
of swapping variables. **Do not add new usages of `text-cream` on the marketing site** —
use `text-foreground` / `text-muted-foreground`.

## Type

| Role | Family | Used for |
| --- | --- | --- |
| Display | **Fraunces** (serif) | H1/H2 on the public site — `font-display` |
| Body | **Manrope** | Public site body copy (set on the scope) |
| Mono | **IBM Plex Mono** | Public site labels, times, tabular data |
| App sans | Inter | Portal, admin, pharmacy consoles |
| App mono | JetBrains Mono | Portal IDs and times |

All five are loaded in `app/layout.tsx` as CSS variables only. The marketing fonts are
applied *by the scope*, never globally.

Rules: public-site body text is never below 14px (only the mono section label goes
smaller). Tabular figures always use `tabular-nums`.

## Shape

- Public site buttons: **2px** radius.
- Portal buttons: **pill** (`--radius-pill`).
- Cards: **16px** radius.
- Soft shadows only; no heavy borders.

## Motion

- 150ms ease-out on colour/background/border state changes. No layout animation.
- `prefers-reduced-motion` disables transitions and smooth scrolling.
- Smooth anchor scrolling with `scroll-margin-top` so the sticky nav never covers a heading.

## Accessibility

- WCAG AA everywhere; visible focus rings (`--highlight` on the dark scope so the ring stays
  visible on navy).
- No horizontal overflow: the rotated ledger sheet is contained with `overflow-x-clip`, and
  the floating chips fall back into normal flow below `lg`.
