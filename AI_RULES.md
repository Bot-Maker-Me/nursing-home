# AI_RULES.md

Project guidance for the Henderson's Pharmacy client portal. Keep this file accurate and scan-friendly.

## Tech Stack
- **Next.js 16 (App Router)** with React 19 — server components by default; layouts and pages in `app/`, API route handlers in `app/api/**/route.ts`.
- **TypeScript** (strict) with the `@/*` path alias mapped to the repo root.
- **Tailwind CSS v4** — CSS-first config (no `tailwind.config.js`); theme and tokens live in `app/globals.css` via `@import 'tailwindcss'` and `@theme`.
- **shadcn/ui** (style `base-nova`) primitives built on **`@base-ui/react`** (not Radix), generated into `components/ui/`.
- **Supabase** for auth, Postgres, and storage via `@supabase/ssr` + `@supabase/supabase-js`; schema lives in `supabase/migrations/*.sql`.
- **lucide-react** for all icons.
- **class-variance-authority + clsx + tailwind-merge** combined through the `cn()` helper in `lib/utils.ts`.
- **@vercel/analytics** mounted from the root layout (production only).
- **pnpm** as the package manager (`pnpm@12`, `next dev` / `next build` / `next start`).

## Library Rules — use these for what
- **UI components**: import from `components/ui/` (shadcn). Never edit generated files in `components/ui/` — compose a new component in `components/` instead.
- **Component primitives**: extend from `@base-ui/react/*`. Do NOT add or import Radix UI.
- **Icons**: use `lucide-react` only. No other icon sets, no inline SVG icon doodles.
- **Styling**: use Tailwind utility classes exclusively. Combine conditional classes with `cn()`. Prefer the app's design tokens over raw hex/value classes.
  - Custom theme colors: `cream`, `paper`, `forest`, `forest-soft`, `forest-deep`, `terracotta`, `mint`, `hairline` (plus the standard shadcn `background`/`foreground`/`primary`/`muted`/etc.).
  - Custom utilities: `eyebrow` (uppercase label) and `paper-shadow`. Use `border-hairline`, `bg-paper`, `text-forest`, etc.
- **Navigation & routing**: use `next/link` and `next/navigation` (`useRouter`, `usePathname`, `redirect`). Do NOT use `react-router`.
- **Data & auth**: query Supabase through the existing clients — `lib/supabase/server.ts` (server/render), `lib/supabase/client.ts` (browser), and `lib/supabase/proxy.ts` (session refresh). Never instantiate a separate Supabase client inline.
- **Session data**: in server components use the request-memoised helpers in `lib/auth.ts` (`getCurrentUser`, `getPortalProfile`, `getCurrentHome`, `getTenantName`) instead of calling `createClient()` + `auth.getUser()` in every page/layout — React `cache` dedupes them across a render to cut duplicate round trips.
- **Tenant labels**: every breadcrumb, page heading and tenant label must read from `getTenantName()` — never `profiles.home_name` directly, which is a denormalised copy that drifts from the `homes` row.
- **Rate limiting**: `lib/rate-limit.ts` (Upstash Redis over REST; env `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`). It fails open when unconfigured. Apply it to write endpoints.
- **Service role**: only use the service-role client (see `app/api/admin/*`) inside admin route handlers that call `requireAdmin()` first; never expose it to the browser.
- **Fonts**: the `next/font` setup in `app/layout.tsx` is the single loader — Inter (`--font-sans`) and JetBrains Mono (`--font-mono`) for the app, plus Fraunces / Manrope / IBM Plex Mono, which are applied **only** by the marketing scope. Don't add further font loaders.
- **State/outside data**: rely on React hooks (`useState`/`useEffect`) and server components. Don't introduce Redux, Zustand, React Query, etc. without approval.
- **Utilities/helpers**: keep one-off helpers local; add shared ones to `lib/`. Sample/static data goes in `lib/sample-data.ts`.

## Project Conventions
- Routes and their `page.tsx`/`layout.tsx` files live under `app/` (e.g. `app/portal/*`, `app/admin`, `app/sign-in`). Keep the existing route structure.
- Feature components live in `components/<area>/` (e.g. `components/portal/`, `components/landing/`, `components/admin/`).
- Reusable client hooks live in `hooks/` (e.g. `hooks/use-cutoff.ts`, which must keep `'use client'`).
- Default to server components; add `'use client'` only for interactivity (state, effects, event handlers).
- Session refresh runs through the Next 16 **`proxy.ts`** file (the renamed middleware). Do not create a `middleware.ts`.
- After changing a component that a page should render, wire it into the relevant `app/**/page.tsx` so it actually appears.
- **Per-home custom themes** live in `lib/home-themes.ts` (`HomeTheme` + `HOME_THEMES`) and are resolved/applied in `app/portal/layout.tsx` via `data-home-theme` + CSS-variable overrides, so a theme only affects that one home's portal — never other homes, the pharmacy/admin consoles, the landing page or sign-in. A home's theme is matched by the `theme` jsonb on its `homes` row (`{ "slug": "…" }`) or by name. Add theme-specific design polish as `[data-home-theme='<slug>']` rules in `app/globals.css`.
- **Three theme scopes** exist and must stay independent: `:root` (portal/admin/pharmacy default), `[data-home-theme='<slug>']` (one home's portal), and `[data-site-theme='pharma']` (the public landing route in `app/page.tsx` **and** the pre-auth `app/sign-in/page.tsx`). See `DESIGN.md` for the palette, type scale and the reason the marketing scope pins `.bg-forest`/`.bg-brand` to `#C8102E`.
