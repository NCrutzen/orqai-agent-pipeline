# Phase 48: Foundation - Research

**Researched:** 2026-04-15
**Domain:** Design system migration, database schema creation, Azure AD OAuth SSO
**Confidence:** HIGH

## Summary

Phase 48 establishes three foundational layers that all subsequent V7.0 phases depend on: (1) a parallel-namespaced V7 design system with new fonts, glassmorphism tokens, and dark/light theme switching; (2) four new Supabase tables for real-time agent data; and (3) Azure AD OAuth SSO with automatic identity linking to existing email/password accounts.

The design system is the highest-risk area because it touches `globals.css` and `layout.tsx` -- files consumed by every page in the app. The parallel `--v7-*` token namespace is non-negotiable; overwriting existing shadcn tokens would break 100% of existing pages immediately. Azure AD SSO is already partially configured (client ID, secret, tenant URL set in Supabase Dashboard, env vars in Vercel) -- the remaining work is the login page button, post-login access check, and the "access pending" page. The database tables are straightforward Supabase migrations with Realtime publication enabled.

**Primary recommendation:** Build design tokens and theme infrastructure first (zero visual regressions on existing pages), then database migrations (quick, low-risk), then Azure AD SSO (requires end-to-end testing with real Microsoft accounts).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Use Satoshi Variable (body) and Cabinet Grotesk Variable (headings) loaded via `next/font/local` -- self-hosted woff2 from Fontshare (free commercial license)
- Parallel CSS namespace: all V7 tokens use `--v7-*` prefix, existing shadcn `--` tokens remain untouched
- Glassmorphism tokens: `--v7-glass-bg`, `--v7-glass-border`, `--v7-glass-blur` with dark/light variants
- Color palette from HTML design: teal (#3ac7c9), blue (#69a8ff), lime (#8ad05e), amber (#ffb547), pink (#ff78cf), red (#ff6b7a) for dark mode
- Use `next-themes` with `attribute="data-theme"` (not class-based) to prevent hydration mismatch
- Design reference: `docs/designs/agent-dashboard-v2.html` -- follow color system, spacing, border-radius patterns exactly
- Use Supabase Auth Azure OAuth provider (NOT SAML) for automatic identity linking
- Already configured in Supabase Dashboard (client ID, secret, tenant URL set)
- Single-tenant URL: `https://login.microsoftonline.com/771b9422-2016-420b-8ad2-4a6424a231b2`
- Add "Sign in with Microsoft" button to login page
- Post-login check: users without `project_members` rows redirect to "access pending" page
- Env vars already in Vercel: `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID`
- Create `agent_events`, `swarm_jobs`, `swarm_agents`, `swarm_briefings` tables with Realtime publication enabled (`REPLICA IDENTITY FULL`)
- All tables linked to `projects` table via `swarm_id` (FK to projects.id)
- RLS policies: authenticated users can read all, write restricted to service role

### Claude's Discretion
- Exact Tailwind config for glassmorphism utility classes
- Component structure for theme toggle (shadcn DropdownMenu vs custom)
- Migration file organization (single file vs per-table)
- Whether to add V7 tokens to existing `globals.css` or create a separate `v7-tokens.css`

### Deferred Ideas (OUT OF SCOPE)
- Font weight optimization (only load needed weights) -- verify during implementation
- Custom 404/500 pages with V7 styling -- defer to Phase 54 (Polish)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUTH-01 | User can login with Microsoft 365 account via Azure AD OAuth SSO | Azure OAuth provider pattern, `signInWithOAuth({ provider: 'azure' })`, existing callback handler compatible |
| AUTH-02 | Existing email/password accounts automatically link to M365 identity on first SSO login | OAuth (not SAML) auto-links when emails match and are verified; verified via Supabase identity linking docs |
| AUTH-03 | User without project_members association sees "access pending" page after SSO login | Post-login check pattern: query `project_members` table, redirect if zero rows |
| DS-01 | App uses Satoshi Variable (body) and Cabinet Grotesk Variable (headings) fonts loaded via next/font/local | Font loading pattern via `localFont()`, coexistence with Geist fonts, CSS variable injection |
| DS-02 | User can toggle between dark and light theme with persistent preference (no flash on page load) | `next-themes` v0.4.6 with `attribute="data-theme"`, blocking script prevents FOUC |
| DS-03 | New design tokens use parallel namespace (--v7-*) that coexists with existing shadcn tokens | Parallel token strategy, `@custom-variant dark` update, zero existing page regressions |
| DS-04 | Glassmorphism styling applied to all V7 components | Glass tokens defined, GlassCard utility component pattern, `backdrop-filter: blur()` |
| RT-02 | New agent_events Supabase table captures all agent execution events | Table schema with Realtime publication, REPLICA IDENTITY FULL, RLS policies |
| RT-03 | New swarm_jobs table tracks job lifecycle across Kanban stages | Table schema with stage enum, FK to projects, optimistic update support |
| RT-04 | New swarm_agents table registers agents per swarm with status, metrics, and skills | Table schema with JSONB for metrics and skills arrays |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next-themes | 0.4.6 | Dark/light theme switching with zero FOUC | Blocking script in `<head>` reads localStorage before paint. Supports `data-theme` attribute mode. De facto standard for Next.js theme switching. |
| next/font/local | (built-in) | Self-hosted font loading for Satoshi + Cabinet Grotesk | Automatic preloading, font-display swap, CSS variable injection. No CDN dependency. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| motion | 12.38.0 | Animations for GlassCard hover, page transitions | NOT needed in Phase 48 -- install now for Phase 49+. Phase 48 uses CSS-only transitions. |

### Already Installed (used in Phase 48)

| Library | Version | Purpose |
|---------|---------|---------|
| @supabase/supabase-js | ^2.99 | Database migrations, RLS policies, Realtime publication |
| @supabase/ssr | ^0.9 | Server-side auth with cookie handling (existing callback handler) |
| shadcn | ^4.0 | Button, Card, DropdownMenu components for login page and theme toggle |
| tailwindcss | ^4 | Utility classes, `@custom-variant` directive, `backdrop-blur-*` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| next-themes | Custom cookie-based theme | next-themes handles blocking script, system preference, hydration -- not worth rebuilding |
| next/font/local | Fontshare CDN | CDN adds GDPR concern, external dependency, slower than self-hosted on Vercel CDN |
| next/font/local | @fontsource/satoshi | Unnecessary wrapper; next/font/local handles variable fonts natively |

**Installation:**
```bash
cd web
npm install next-themes@^0.4

# Fonts: download variable woff2 files from Fontshare
mkdir -p public/fonts
# Download Satoshi-Variable.woff2 from https://www.fontshare.com/fonts/satoshi
# Download CabinetGrotesk-Variable.woff2 from https://www.fontshare.com/fonts/cabinet-grotesk
```

**Version verification:** `next-themes` v0.4.6 confirmed via `npm view next-themes version` on 2026-04-15.

## Architecture Patterns

### Recommended Project Structure (Phase 48 additions)
```
web/
├── app/
│   ├── layout.tsx                    # MODIFY: add Satoshi + Cabinet Grotesk fonts, add ThemeProvider
│   ├── globals.css                   # MODIFY: add --v7-* tokens, update @custom-variant
│   ├── (auth)/
│   │   ├── login/page.tsx            # MODIFY: add "Sign in with Microsoft" button
│   │   └── access-pending/page.tsx   # NEW: "access pending" page for users without project access
│   └── (dashboard)/
│       └── layout.tsx                # MODIFY: add post-login project_members check
├── components/
│   ├── theme-provider.tsx            # NEW: next-themes ThemeProvider wrapper
│   ├── theme-toggle.tsx              # NEW: dark/light toggle button
│   └── ui/
│       └── glass-card.tsx            # NEW: glassmorphism utility component
├── public/
│   └── fonts/
│       ├── Satoshi-Variable.woff2          # NEW: body font
│       ├── Satoshi-VariableItalic.woff2    # NEW: body font italic
│       ├── CabinetGrotesk-Variable.woff2   # NEW: heading font
└── supabase/
    └── migrations/
        └── YYYYMMDD_v7_foundation.sql      # NEW: 4 tables + RLS + Realtime
```

### Pattern 1: Parallel CSS Token Namespace

**What:** Add all V7 design tokens with `--v7-` prefix in `globals.css` alongside existing shadcn tokens. Existing components continue using `--background`, `--primary`, etc. New V7 components use `--v7-bg`, `--v7-text`, etc.

**When to use:** Always for V7 components. Never overwrite existing shadcn tokens.

**Example:**
```css
/* Add AFTER existing :root and .dark blocks in globals.css */

/* V7 Design System — Parallel namespace */
:root, [data-theme="light"] {
  --v7-bg: #f6f3ee;
  --v7-bg-2: #fbfaf7;
  --v7-panel: #f9f6f1;
  --v7-panel-2: #f2eee8;
  --v7-line: #d5d1ca;
  --v7-text: #231f19;
  --v7-muted: #6f6a61;
  --v7-faint: #958f84;
  --v7-inverse: #fbfaf7;
  /* ... accent colors, glass tokens, radius tokens ... */
}

[data-theme="dark"] {
  --v7-bg: #0c1117;
  --v7-bg-2: #101722;
  --v7-panel: rgba(19,26,36,0.82);
  /* ... all dark values from UI-SPEC ... */
}
```

### Pattern 2: Theme Provider with data-theme Attribute

**What:** Wrap app in next-themes `ThemeProvider` with `attribute="data-theme"` instead of class-based `.dark`. Update Tailwind's dark variant to match.

**When to use:** Root layout only. All dark mode styling flows through CSS custom properties.

**Example:**
```typescript
// components/theme-provider.tsx
"use client";
import { ThemeProvider as NextThemesProvider } from "next-themes";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="data-theme"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
```

**Critical:** Update line 5 of `globals.css` from:
```css
@custom-variant dark (&:is(.dark *));
```
to:
```css
@custom-variant dark (&:is([data-theme="dark"] *));
```

### Pattern 3: Font Coexistence

**What:** Load Satoshi and Cabinet Grotesk alongside existing Geist fonts. Apply V7 fonts via CSS variables, not by replacing Geist globally.

**Example:**
```typescript
// app/layout.tsx
import localFont from "next/font/local";
import { Geist, Geist_Mono } from "next/font/google";

const satoshi = localFont({
  src: [
    { path: "../public/fonts/Satoshi-Variable.woff2", style: "normal" },
    { path: "../public/fonts/Satoshi-VariableItalic.woff2", style: "italic" },
  ],
  variable: "--font-satoshi",
  display: "swap",
  weight: "300 900",
});

const cabinetGrotesk = localFont({
  src: "../public/fonts/CabinetGrotesk-Variable.woff2",
  variable: "--font-cabinet",
  display: "swap",
  weight: "100 900",
});

// Keep existing Geist fonts for backward compatibility
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

// Apply ALL font variables to <html>
// <html className={`${satoshi.variable} ${cabinetGrotesk.variable} ${geistSans.variable} ${geistMono.variable}`}>
```

### Pattern 4: Azure OAuth with Existing Callback

**What:** The existing `/auth/callback/route.ts` already calls `exchangeCodeForSession(code)` which handles any OAuth provider including Azure. No changes needed to the callback.

**Example:**
```typescript
// In login page -- add Microsoft SSO button
async function handleMicrosoftLogin() {
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "azure",
    options: {
      scopes: "email profile openid",
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  });
  if (error) setFormError(error.message);
}
```

### Pattern 5: Post-Login Access Check

**What:** In the dashboard layout (Server Component), check if the authenticated user has any `project_members` rows. If not, redirect to "access pending" page.

**Example:**
```typescript
// app/(dashboard)/layout.tsx -- add after user check
const { count } = await supabase
  .from("project_members")
  .select("*", { count: "exact", head: true })
  .eq("user_id", user.id);

if (count === 0) {
  redirect("/access-pending");
}
```

### Anti-Patterns to Avoid

- **Overwriting existing shadcn tokens:** Never modify values in the existing `:root` or `.dark` blocks. Add V7 tokens in separate blocks.
- **Replacing Geist font globally:** Keep Geist loaded for all existing pages. Only V7 layouts/components reference Satoshi/Cabinet Grotesk.
- **Using `.dark` class for V7 components:** All V7 dark mode must use `[data-theme="dark"]` selector. The `.dark` class is for existing shadcn backward compatibility only.
- **Creating Supabase client per component:** Share the client instance. Follow existing `createClient()` pattern from `lib/supabase/client.ts`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Theme persistence + FOUC prevention | Custom localStorage + blocking script | next-themes v0.4.6 | Handles system preference, multiple tabs, SSR hydration, blocking script injection |
| Font optimization + preloading | Manual `<link rel="preload">` tags | next/font/local | Automatic preload hints, font-display, CSS variable injection, zero CLS |
| OAuth flow state management | Custom OAuth state parameter handling | Supabase Auth `signInWithOAuth()` | Handles PKCE, state validation, session creation, identity linking |
| Database migration runner | Manual SQL execution | Supabase CLI migrations | Version control, rollback, environment sync |

**Key insight:** Phase 48's foundation work is mostly configuration and wiring, not custom code. The biggest risk is breaking existing functionality, not building new functionality.

## Common Pitfalls

### Pitfall 1: Design Token Collision Breaks Existing Pages
**What goes wrong:** Modifying existing `:root` or `.dark` CSS variable values changes every shadcn component in the app simultaneously.
**Why it happens:** All existing components consume `--background`, `--primary`, `--card`, etc. from `globals.css`.
**How to avoid:** Strict parallel namespace. V7 tokens in `--v7-*` prefix ONLY. Never touch existing token values. Visual regression check on all existing routes after every `globals.css` change.
**Warning signs:** Any existing page looking different after a CSS change.

### Pitfall 2: Azure AD Creates Duplicate Accounts
**What goes wrong:** Users get a new empty account instead of linking to their existing email/password account.
**Why it happens:** SAML SSO identities are excluded from auto-linking in Supabase Auth. Only OAuth identities auto-link when emails match.
**How to avoid:** Use OAuth provider (already decided). Verify ALL existing email/password accounts have confirmed/verified emails before enabling. Test with a real Microsoft account that matches an existing email.
**Warning signs:** Query `auth.users` for duplicate emails after first SSO login.

### Pitfall 3: Theme Hydration Mismatch (FOUC)
**What goes wrong:** Server renders light theme, client detects dark preference, React throws hydration error, user sees flash.
**Why it happens:** Server has no access to `localStorage`. Without blocking script, theme is applied after hydration.
**How to avoid:** `next-themes` with `attribute="data-theme"` injects blocking `<script>` that sets attribute before paint. Never conditionally render different JSX based on theme in Server Components.
**Warning signs:** Console hydration warnings, brief flash of wrong theme on refresh.

### Pitfall 4: @custom-variant Not Updated
**What goes wrong:** Tailwind `dark:` prefix stops working for V7 components that use `[data-theme="dark"]`.
**Why it happens:** Current `globals.css` line 5 uses `(&:is(.dark *))`. If not changed to `(&:is([data-theme="dark"] *))`, the `dark:` variant won't match the `data-theme` attribute set by next-themes.
**How to avoid:** Update `@custom-variant dark` declaration in the same commit that adds ThemeProvider. Test that `dark:bg-red-500` works with theme toggle.
**Warning signs:** Dark mode styles not applying to any component.

### Pitfall 5: Existing Dark Mode Breaks After @custom-variant Change
**What goes wrong:** Changing `@custom-variant dark` from `.dark` to `[data-theme="dark"]` breaks dark mode on ALL existing pages because the existing theme infrastructure (if any) still uses `.dark` class.
**Why it happens:** The app currently has `suppressHydrationWarning` on `<html>` but no `ThemeProvider`. There may be no runtime dark mode toggle -- dark mode may be OS-level only or unused.
**How to avoid:** The `@custom-variant` change and `ThemeProvider` addition must happen in the same commit. next-themes with `attribute="data-theme"` will set the attribute on `<html>`, and the updated variant will match it. Existing `.dark` class usage (if any) should be audited first.
**Warning signs:** Dark mode not working at all on any page after the change.

## Code Examples

### Database Migration: V7 Foundation Tables

```sql
-- Migration: V7 Foundation tables
-- All tables use projects.id as swarm_id FK

-- Agent execution events (terminal stream, swimlane, graph data source)
CREATE TABLE agent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  swarm_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_name TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('thinking', 'tool_call', 'tool_result', 'waiting', 'done', 'error', 'delegation')),
  span_id TEXT,
  parent_span_id TEXT,
  content JSONB DEFAULT '{}',
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agent_events_swarm ON agent_events(swarm_id, created_at DESC);
CREATE INDEX idx_agent_events_span ON agent_events(span_id);

-- Kanban job tracking
CREATE TABLE swarm_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  swarm_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  stage TEXT NOT NULL DEFAULT 'backlog' CHECK (stage IN ('backlog', 'ready', 'progress', 'review', 'done')),
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  assigned_agent TEXT,
  tags JSONB DEFAULT '[]',
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_swarm_jobs_swarm_stage ON swarm_jobs(swarm_id, stage);

-- Agent registry per swarm
CREATE TABLE swarm_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  swarm_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_name TEXT NOT NULL,
  role TEXT,
  status TEXT DEFAULT 'idle' CHECK (status IN ('idle', 'active', 'waiting', 'error', 'offline')),
  parent_agent TEXT,
  metrics JSONB DEFAULT '{}',
  skills JSONB DEFAULT '[]',
  orqai_deployment_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(swarm_id, agent_name)
);

CREATE INDEX idx_swarm_agents_swarm ON swarm_agents(swarm_id);

-- Cached AI briefing narratives
CREATE TABLE swarm_briefings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  swarm_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  narrative TEXT NOT NULL,
  metrics_snapshot JSONB DEFAULT '{}',
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 minutes')
);

CREATE INDEX idx_swarm_briefings_swarm ON swarm_briefings(swarm_id, generated_at DESC);

-- Enable Realtime for live UI subscriptions
ALTER TABLE agent_events REPLICA IDENTITY FULL;
ALTER TABLE swarm_jobs REPLICA IDENTITY FULL;
ALTER TABLE swarm_agents REPLICA IDENTITY FULL;
ALTER TABLE swarm_briefings REPLICA IDENTITY FULL;

-- Add tables to Realtime publication
-- NOTE: Run via Supabase Dashboard > Database > Replication if supabase_realtime publication doesn't exist
-- ALTER PUBLICATION supabase_realtime ADD TABLE agent_events, swarm_jobs, swarm_agents, swarm_briefings;

-- RLS: authenticated users can read all V7 tables
ALTER TABLE agent_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE swarm_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE swarm_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE swarm_briefings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read agent_events"
  ON agent_events FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read swarm_jobs"
  ON swarm_jobs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read swarm_agents"
  ON swarm_agents FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read swarm_briefings"
  ON swarm_briefings FOR SELECT TO authenticated USING (true);

-- Service role (via admin client) handles all writes -- no INSERT/UPDATE policies for authenticated
```

### GlassCard Component

```typescript
// components/ui/glass-card.tsx
import { cn } from "@/lib/utils";

export function GlassCard({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-[var(--v7-radius)]",
        "bg-[var(--v7-glass-bg)]",
        "border border-[var(--v7-glass-border)]",
        "backdrop-blur-[var(--v7-glass-blur)]",
        "shadow-[var(--v7-glass-shadow)]",
        "transition-all duration-200",
        className
      )}
      {...props}
    />
  );
}
```

### Theme Toggle

```typescript
// components/theme-toggle.tsx
"use client";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      aria-label="Toggle theme"
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:rotate-90 dark:scale-0" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
    </Button>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `.dark` class-based theme switching | `data-theme` attribute-based | Tailwind CSS 4 + next-themes 0.4 | Eliminates hydration mismatch; requires `@custom-variant` update |
| `next/font/google` for all fonts | `next/font/local` for self-hosted fonts | Next.js 13+ (stable) | Same optimization, no CDN dependency, GDPR compliant |
| Supabase Auth SAML SSO | Supabase Auth OAuth provider | Supabase clarification 2024-2025 | OAuth auto-links identities; SAML does NOT auto-link |
| framer-motion | motion (v12) | Renamed 2025 | Import from `motion/react` not `framer-motion` |

## Discretion Recommendations

These are areas marked as "Claude's Discretion" in CONTEXT.md:

### 1. Tailwind Config for Glassmorphism

**Recommendation:** Use CSS custom properties referenced via Tailwind arbitrary values (`bg-[var(--v7-glass-bg)]`), not custom Tailwind utility classes. This avoids extending the Tailwind theme configuration and keeps all V7 values centralized in `globals.css` where they are theme-aware.

### 2. Theme Toggle Component

**Recommendation:** Use a simple `Button` with `variant="ghost"` and `size="icon"` (existing shadcn component). The HTML design shows a minimal toggle in the sidebar bottom -- a `DropdownMenu` with "Light / Dark / System" options is over-engineered for the design. A single-click toggle button matches the design reference.

### 3. Migration File Organization

**Recommendation:** Single migration file for all 4 tables. They are logically coupled (all V7 foundation), all reference the same `projects` FK, and splitting into 4 files adds unnecessary overhead for no rollback benefit (you would never create `swarm_jobs` without `agent_events`).

### 4. V7 Tokens Location

**Recommendation:** Add V7 tokens to the existing `globals.css` file, placed AFTER the existing `:root` and `.dark` blocks with a clear comment separator. A separate `v7-tokens.css` file would require an additional import in `layout.tsx` and could cause specificity issues depending on import order. Keeping everything in `globals.css` follows the established pattern and ensures correct cascade order.

## Open Questions

1. **Existing dark mode usage status**
   - What we know: `globals.css` has a `.dark` block. `layout.tsx` has `suppressHydrationWarning`. No `ThemeProvider` or toggle exists.
   - What's unclear: Is dark mode ever activated in production? Is the `.dark` class added by any runtime code?
   - Recommendation: Assume it's unused (no toggle, no provider). The `@custom-variant` change from `.dark` to `[data-theme="dark"]` is safe if combined with ThemeProvider addition. If `.dark` IS used somewhere, existing shadcn dark styles will need the `.dark` class retained alongside `[data-theme="dark"]`. Audit all references to `.dark` class before making the change.

2. **Font file acquisition**
   - What we know: Fontshare provides free downloads, commercial license confirmed.
   - What's unclear: Exact download process (manual download vs script).
   - Recommendation: Manual download from fontshare.com, place in `web/public/fonts/`. Document exact URLs in plan.

3. **Supabase Realtime publication existence**
   - What we know: `ALTER PUBLICATION supabase_realtime ADD TABLE` is the standard command.
   - What's unclear: Whether the `supabase_realtime` publication already exists in this project's Supabase instance.
   - Recommendation: Check via Supabase Dashboard or run `SELECT * FROM pg_publication` before migration. If it doesn't exist, enable Realtime for the tables via the Dashboard UI instead.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 |
| Config file | `web/vitest.config.ts` |
| Quick run command | `cd web && npx vitest run --reporter=verbose` |
| Full suite command | `cd web && npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | Microsoft SSO button calls signInWithOAuth with azure provider | unit | `cd web && npx vitest run __tests__/auth-sso.test.tsx -x` | Wave 0 |
| AUTH-02 | OAuth identity linking (verified by Supabase, not testable in unit) | manual-only | Visual verification with real Microsoft account | N/A |
| AUTH-03 | Users without project_members redirected to access-pending | unit | `cd web && npx vitest run __tests__/access-pending.test.tsx -x` | Wave 0 |
| DS-01 | Font CSS variables injected on html element | unit | `cd web && npx vitest run __tests__/layout-fonts.test.tsx -x` | Wave 0 |
| DS-02 | ThemeProvider renders with data-theme attribute | unit | `cd web && npx vitest run __tests__/theme-toggle.test.tsx -x` | Wave 0 |
| DS-03 | V7 tokens present in globals.css, existing tokens unchanged | manual-only | Visual regression: screenshot all existing routes | N/A |
| DS-04 | GlassCard component renders with correct CSS classes | unit | `cd web && npx vitest run __tests__/glass-card.test.tsx -x` | Wave 0 |
| RT-02 | agent_events table exists with correct columns | manual-only | Verify via Supabase Dashboard after migration | N/A |
| RT-03 | swarm_jobs table exists with correct columns | manual-only | Verify via Supabase Dashboard after migration | N/A |
| RT-04 | swarm_agents table exists with correct columns | manual-only | Verify via Supabase Dashboard after migration | N/A |

### Sampling Rate
- **Per task commit:** `cd web && npx vitest run --reporter=verbose`
- **Per wave merge:** Full suite + visual regression of all existing routes
- **Phase gate:** Full suite green + all existing pages visually unchanged

### Wave 0 Gaps
- [ ] `web/__tests__/auth-sso.test.tsx` -- covers AUTH-01 (mock signInWithOAuth)
- [ ] `web/__tests__/access-pending.test.tsx` -- covers AUTH-03 (mock project_members query)
- [ ] `web/__tests__/theme-toggle.test.tsx` -- covers DS-02 (ThemeProvider renders)
- [ ] `web/__tests__/glass-card.test.tsx` -- covers DS-04 (GlassCard renders)

## Sources

### Primary (HIGH confidence)
- Current codebase analysis: `globals.css` (oklch tokens, `.dark` block, `@custom-variant`), `layout.tsx` (Geist fonts, `suppressHydrationWarning`), `middleware.ts` (auth exemptions for `/auth`, `/login`, `/api/inngest`), `login/page.tsx` (existing email/password form), `auth/callback/route.ts` (existing `exchangeCodeForSession` handler)
- npm registry: `next-themes` v0.4.6, `motion` v12.38.0 (verified 2026-04-15)
- `docs/designs/agent-dashboard-v2.html` -- design reference with exact CSS custom properties, color values, spacing, border-radius
- `48-UI-SPEC.md` -- comprehensive visual contract with all token values
- `48-CONTEXT.md` -- locked implementation decisions

### Secondary (MEDIUM confidence)
- Project research: `SUMMARY.md`, `STACK.md`, `PITFALLS.md` -- comprehensive pre-research covering Azure AD linking behavior, parallel token strategy, font loading patterns
- Supabase Identity Linking docs -- OAuth vs SAML auto-linking behavior verified
- Supabase Azure OAuth docs -- provider configuration, scopes, tenant URL format

### Tertiary (LOW confidence)
- Whether `supabase_realtime` publication already exists in this Supabase instance -- needs runtime verification
- Whether any code currently adds `.dark` class at runtime -- needs codebase audit before `@custom-variant` change

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all packages verified, versions confirmed, patterns well-documented
- Architecture: HIGH -- parallel token namespace proven safe, font coexistence straightforward, existing auth callback compatible
- Pitfalls: HIGH -- all critical pitfalls verified against official docs and current codebase
- Database schema: MEDIUM-HIGH -- table design follows standard patterns, but Realtime publication existence needs runtime check

**Research date:** 2026-04-15
**Valid until:** 2026-05-15 (stable domain, no fast-moving dependencies)
