# Technology Stack

**Project:** Agent Workforce V7.0 Agent OS
**Researched:** 2026-04-15
**Scope:** NEW stack additions for V7.0 only. Does not re-research existing validated stack. See V6.0 STACK.md (git history) for Recharts, next-themes, date-fns, @orq-ai/node decisions.

## Existing Stack (DO NOT CHANGE)

Locked and validated. Listed for integration context only.

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js (App Router) | `^16.1` | Full-stack framework on Vercel |
| React | `19.2` | UI framework |
| @supabase/supabase-js | `^2.99` | Auth, DB, Realtime, Storage |
| @supabase/ssr | `^0.9` | Server-side auth with cookie handling |
| inngest | `^3.52` | Durable pipeline orchestration |
| @xyflow/react | `^12.10` | Node graph visualization (delegation graph) |
| @dagrejs/dagre | `^3.0` | Graph auto-layout |
| radix-ui | `^1.4` | Accessible UI primitives |
| shadcn (CLI) | `^4.0` | Component generation |
| Tailwind CSS | `^4` | Utility-first CSS |
| recharts | `^3.8` | Charts via shadcn/ui chart components |
| next-themes | `^0.4` | Dark/light mode switching |
| date-fns | `^4.1` | Date formatting |
| @orq-ai/node | `4.4.9` | Orq.ai SDK for agent/trace data |
| lucide-react | `^0.577` | Icons |
| sonner | `^2.0` | Toasts |
| zod | `^4.3` | Schema validation |
| tw-animate-css | `^1.4` | CSS animations |

## New Stack Additions for V7.0

### 1. Animation Library -- Motion (formerly Framer Motion)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `motion` | `^12.38` | Page transitions, glassmorphism hover effects, micro-interactions, layout animations, Kanban card movement | The React animation standard. Renamed from `framer-motion` to `motion` in 2025. Import from `motion/react`. Runs at 120fps without triggering React re-renders. v12 supports oklch colors (matching Tailwind 4/shadcn theme). Hardware-accelerated scroll animations. |

**Import pattern:**
```typescript
import { motion, AnimatePresence } from "motion/react";
```

**V7.0 uses:**
- `AnimatePresence` for page/view transitions (sidebar navigation)
- `motion.div` with `layoutId` for fleet card expand-to-drawer animations
- `whileHover` / `whileTap` for glassmorphism card interactions
- `motion.div` with stagger for Kanban column entry animations
- `useMotionValue` + `useTransform` for parallax glassmorphism depth effects

**NOT needed for edge particles:** The existing `animated-edge.tsx` already uses native SVG `<animateMotion>` for particles traveling along @xyflow/react edges. Pure SVG animation is more performant than JS-driven animation for graph edges. Keep this approach.

**Why not GSAP/anime.js:** Motion covers all our animation needs with React-native API. Adding a second animation library creates confusion about which to use when.

**Confidence:** HIGH -- npm v12.38.0 verified, official docs confirm React 19 support.

---

### 2. Drag-and-Drop -- @dnd-kit/react (v2 rewrite)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@dnd-kit/react` | `^0.4.0` | Kanban board drag-and-drop between business-stage columns | Modern v2 rewrite of dnd-kit. Single package replaces the old `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` combo. Built-in sortable support, accessible by default (keyboard DnD), collision detection. Extensive community examples with shadcn/ui + Tailwind. |

**Important:** This is the NEW `@dnd-kit/react` package (v0.4.0) -- NOT the legacy `@dnd-kit/core`. The v2 API is simpler:

```typescript
import { DragDropProvider, Draggable, Droppable } from "@dnd-kit/react";
import { move } from "@dnd-kit/helpers";
```

**V7.0 uses:**
- Kanban columns as `Droppable` zones (e.g., "Inbox", "Processing", "Awaiting Response", "Resolved")
- Job cards as `Draggable` items with sort within columns
- `DragOverlay` for smooth drag preview (card follows cursor)
- Persist column changes to Supabase on drop

**Why not react-beautiful-dnd:** Abandoned -- no longer maintained, no React 19 support.

**Confidence:** HIGH -- npm v0.4.0 verified, active development, community Kanban examples exist.

---

### 3. Fonts -- Satoshi + Cabinet Grotesk (self-hosted)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Satoshi Variable | - | Body text, UI labels, navigation | Free via Fontshare (Indian Type Foundry). Variable font = single woff2 file for all weights 300-900. Modern geometric sans with humanist details. Pairs with Cabinet Grotesk. |
| Cabinet Grotesk Variable | - | Headings, KPI numbers, hero text | Free via Fontshare. Personality-rich grotesk with distinctive R, angled terminals. Strong display presence for the "cinematic" design language. |

**Licensing:** Both fonts are 100% free for personal AND commercial use under Fontshare's EULA. No per-seat, revenue, or impression restrictions. Self-hosting explicitly permitted.

**Loading strategy -- `next/font/local`:**

```typescript
// app/layout.tsx
import localFont from "next/font/local";

const satoshi = localFont({
  src: "../public/fonts/Satoshi-Variable.woff2",
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

// Apply to <html> alongside existing font classes
// <html className={`${satoshi.variable} ${cabinetGrotesk.variable}`}>
```

**Why NOT Fontshare CDN:** Adds external dependency, GDPR concern with third-party font loading. Self-hosting is faster (Vercel CDN), private, and more reliable.

**Why NOT Google Fonts:** Satoshi and Cabinet Grotesk are not on Google Fonts.

**Font role mapping:**

| Element | Font | Weight | CSS Variable |
|---------|------|--------|-------------|
| Body text | Satoshi | 400 | `--font-satoshi` |
| UI labels, buttons | Satoshi | 500 | `--font-satoshi` |
| Sidebar nav | Satoshi | 500-600 | `--font-satoshi` |
| Section headings | Cabinet Grotesk | 700 | `--font-cabinet` |
| KPI numbers | Cabinet Grotesk | 700-800 | `--font-cabinet` |
| Hero/display text | Cabinet Grotesk | 800 | `--font-cabinet` |

**Migration note:** This replaces Geist Sans as the primary font. Geist Mono can stay for code/terminal output in the event stream. Update `--font-sans` in `@theme inline` block of globals.css to point to `--font-satoshi`.

**Confidence:** HIGH -- Fontshare EULA confirmed across multiple sources, self-hosting supported.

---

### 4. Glassmorphism Design Tokens -- CSS Custom Properties (no package)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| CSS custom properties | - | Glassmorphism theming layer for dark/light modes | Extend existing shadcn CSS variable system in globals.css. `backdrop-filter: blur()` + semi-transparent backgrounds are native CSS. Tailwind CSS 4 has `backdrop-blur-*` utilities built in. No library needed. |

**New CSS variables to add to globals.css:**

```css
:root {
  /* Glassmorphism tokens */
  --glass-bg: oklch(1 0 0 / 0.7);
  --glass-border: oklch(0.8 0 0 / 0.3);
  --glass-blur: 16px;
  --glass-shadow: 0 8px 32px oklch(0 0 0 / 0.08);

  /* Agent status colors */
  --agent-thinking: oklch(0.7 0.15 250);   /* blue */
  --agent-tool-call: oklch(0.7 0.15 150);  /* green */
  --agent-waiting: oklch(0.7 0.12 80);     /* amber */
  --agent-done: oklch(0.6 0.1 160);        /* teal */
  --agent-error: oklch(0.6 0.2 25);        /* red */
}

.dark {
  --glass-bg: oklch(0.2 0 0 / 0.6);
  --glass-border: oklch(0.4 0 0 / 0.2);
  --glass-blur: 20px;
  --glass-shadow: 0 8px 32px oklch(0 0 0 / 0.4);
}
```

**Tailwind utility pattern:**

```typescript
// Reusable glass card class
const glassCard = "bg-[var(--glass-bg)] border border-[var(--glass-border)] backdrop-blur-[var(--glass-blur)] shadow-[var(--glass-shadow)] rounded-xl";
```

**Better approach -- create a shadcn-style variant:**

```typescript
// components/ui/glass-card.tsx
import { cn } from "@/lib/utils";

export function GlassCard({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "bg-[var(--glass-bg)] border border-[var(--glass-border)]",
        "backdrop-blur-[var(--glass-blur)] shadow-[var(--glass-shadow)]",
        "rounded-xl transition-all",
        className
      )}
      {...props}
    />
  );
}
```

**Confidence:** HIGH -- native CSS, Tailwind 4 supports all needed utilities.

---

### 5. Azure AD O365 SSO -- Supabase Auth Azure Provider (no package)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Supabase Auth (Azure provider) | existing | O365 SSO for frictionless executive access | Built into Supabase Auth. Azure (Microsoft) is a first-class social login provider. Works alongside existing email/password auth. No additional npm packages. |

**Configuration steps:**

**Azure Portal (Entra ID):**
1. App Registrations > New Registration
2. Name: "Agent Workforce"
3. Supported account types: "Accounts in this organizational directory only" (single-tenant -- MR employees only)
4. Redirect URI (Web): `https://mvqjhlxfvtqqubqgdvhz.supabase.co/auth/v1/callback`
5. Certificates & Secrets > New client secret > copy value immediately
6. Note: Application (client) ID + Directory (tenant) ID
7. API Permissions: ensure `email`, `openid`, `profile` are granted

**Supabase Dashboard:**
1. Authentication > Providers > Microsoft (Azure)
2. Enable provider toggle
3. Client ID: paste Application (client) ID
4. Client Secret: paste secret value
5. Azure Tenant URL: `https://login.microsoftonline.com/{MR-tenant-id}`

**Code (login page):**
```typescript
const handleMicrosoftLogin = async () => {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "azure",
    options: {
      scopes: "email profile openid",
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  });
};
```

**Key gotchas:**
- Supabase Auth REQUIRES Azure to return a valid email address -- the `email` scope is mandatory
- Azure does NOT allow `127.0.0.1` as redirect URI -- use `localhost` for local dev
- Single-tenant config restricts to MR organization -- no personal Microsoft accounts
- The existing `/auth/callback` route and `exchangeCodeForSession()` already handle the OAuth code exchange -- no changes needed to the callback
- Add `{SITE_URL}/auth/callback` to Supabase Auth > URL Configuration > Redirect URLs

**No middleware changes needed** -- existing `getUser()` validates any Supabase session regardless of auth provider.

**Confidence:** HIGH -- official Supabase docs, first-class provider support.

---

### 6. Gantt-Style Swimlane Timeline -- Custom SVG Component (no package)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Custom SVG + Motion | - | Per-agent execution timeline (thinking/tool_call/waiting/done phases) | Build custom. Our "Gantt" is a horizontal stacked-bar timeline per agent -- NOT a project management chart. Existing Gantt libraries (SVAR: GPLv3, Bryntum: $399+ commercial, DHTMLX: enterprise pricing) solve the wrong problem and add massive bundle weight. |

**Why custom:**
- Our visualization shows agent execution phases over a time axis -- closer to a flame chart / trace viewer than a Gantt chart
- Each row = one agent. Each segment = a phase (thinking, tool_call, waiting, done) with a color from `--agent-*` tokens
- No dependencies, milestones, resource allocation, or drag-to-resize needed
- Custom SVG gives full control over the cinematic aesthetic (glassmorphism, glow, dark theme)
- Estimated effort: ~150-200 lines of SVG with Motion for enter/update animations

**Component sketch:**
```typescript
// components/agent-os/swimlane-timeline.tsx
// SVG with one <g> per agent row
// Each phase = <rect> with x/width from timestamps, fill from agent status color
// Motion for staggered entry animation
// Hover tooltip showing phase details
```

**Data shape:**
```typescript
interface AgentPhase {
  agentId: string;
  agentName: string;
  phase: "thinking" | "tool_call" | "waiting" | "done" | "error";
  startMs: number;  // relative to run start
  endMs: number;
}
```

**Confidence:** MEDIUM -- judgment call. No exact precedent for this specific visualization, but the SVG pattern is straightforward. Flag for validation during implementation -- if complexity exceeds estimate, reconsider a lightweight charting approach using Recharts stacked bar.

---

### 7. Real-Time Terminal Event Stream -- Supabase Realtime (no package)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Supabase Realtime (postgres_changes) | existing | Claude-style terminal event stream | Already in the stack. Subscribe to an `agent_events` table for real-time INSERT notifications. Client component with `useEffect` + channel cleanup. |

**Pattern:**
```typescript
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

function useAgentEvents(runId: string) {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const supabase = createClient();

  useEffect(() => {
    const channel = supabase
      .channel(`agent-events-${runId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "agent_events",
          filter: `run_id=eq.${runId}`,
        },
        (payload) => {
          setEvents((prev) => [...prev, payload.new as AgentEvent]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [runId, supabase]);

  return events;
}
```

**Table design for `agent_events`:**
```sql
create table agent_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references automation_runs(id),
  agent_name text not null,
  event_type text not null,  -- 'thinking', 'tool_call', 'tool_result', 'response', 'error'
  content jsonb,
  created_at timestamptz default now()
);

-- Enable realtime
alter publication supabase_realtime add table agent_events;
```

**Confidence:** HIGH -- Supabase Realtime with postgres_changes is well-documented, Next.js App Router pattern confirmed.

---

### 8. Orq.ai Trace/Event Data -- Existing SDK + REST API

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| @orq-ai/node | `4.4.9` (existing) | Fetch agent traces, tool calls, execution timelines | Already installed from V6.0. Use for agent inventory, deployment config, and whatever trace data the API exposes. |

**V7.0 data needs from Orq.ai:**

| Data Point | Source | Method |
|------------|--------|--------|
| Agent list + config | SDK `deployments.list()` | Direct API |
| Agent metrics (cost, latency) | Orq.ai dashboard | Browser scraper (Inngest cron, already designed in V6.0) |
| Execution traces/events | SDK or REST `/v2/traces` | Verify endpoint exists -- if not, scrape |
| Tool call logs | SDK or trace data | Part of trace data |

**Action item:** During implementation, verify whether `/v2/traces` or `/v2/logs` endpoints exist in the Orq.ai API for reading execution traces back. The V6.0 research confirmed analytics aggregates are not available via API, but individual trace/event data may be accessible. If not, extend the browser scraper to capture trace-level data.

**Confidence:** MEDIUM -- trace API availability needs verification during implementation.

---

## Summary: What Gets Added

| Package | Bundle Impact | Purpose |
|---------|--------------|---------|
| `motion` | ~33KB gzip | Animations, transitions, micro-interactions |
| `@dnd-kit/react` | ~15KB gzip | Kanban drag-and-drop |
| Satoshi Variable (woff2) | ~45KB | Body font |
| Cabinet Grotesk Variable (woff2) | ~40KB | Heading font |

**Total new JS packages: 2** (`motion`, `@dnd-kit/react`)
**Total new JS bundle: ~48KB gzip**
**Total new font weight: ~85KB** (loaded async, font-display: swap)
**New CSS-only additions: glassmorphism tokens, agent status colors**
**Config-only changes: Azure AD in Supabase Dashboard + Entra ID portal**
**Custom components (no library): swimlane timeline, glass card, terminal stream**

## What NOT to Add

| Rejected | Why |
|----------|-----|
| `framer-motion` | Deprecated package name. Use `motion` (same library, new name, import from `motion/react`) |
| `react-beautiful-dnd` | Abandoned, no React 19 support, no maintenance |
| `@dnd-kit/core` + `@dnd-kit/sortable` | Legacy v1 API. Use `@dnd-kit/react` (the v2 single-package rewrite) |
| Any Gantt library (SVAR, Bryntum, DHTMLX) | Wrong problem (project management), wrong license (GPLv3/commercial), heavy bundle. Custom SVG is simpler for our trace-viewer-style swimlanes |
| `@fontsource/satoshi` | Unnecessary wrapper. `next/font/local` handles variable fonts natively |
| `gsap` / `anime.js` | `motion` covers all animation needs. Two animation libs = confusion |
| `next-auth` / `auth.js` / `@azure/msal-react` | Supabase Auth handles Azure AD natively. Adding another auth layer is redundant |
| Custom WebSocket server | Supabase Realtime handles pub/sub natively |
| `react-grid-layout` | We need Kanban columns (1D sort + cross-column move), not a 2D grid layout |
| Fontshare CDN | GDPR concern, external dependency, slower than self-hosting on Vercel CDN |
| `d3` directly | Overkill for swimlane bars. SVG `<rect>` elements with Motion for animation suffices |

## Installation

```bash
cd web

# New dependencies for V7.0 (only 2 new npm packages!)
npm install motion@^12 @dnd-kit/react@^0.4

# Fonts: download variable woff2 files from Fontshare
mkdir -p public/fonts
# Download from https://www.fontshare.com/fonts/satoshi → Satoshi-Variable.woff2
# Download from https://www.fontshare.com/fonts/cabinet-grotesk → CabinetGrotesk-Variable.woff2
```

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Animation | `motion` v12 | GSAP, anime.js | One animation lib is enough. Motion is React-native with hooks API |
| Drag-drop | `@dnd-kit/react` v0.4 | react-beautiful-dnd, react-dnd | Abandoned / lower-level API respectively |
| Fonts | Self-hosted Fontshare | CDN, @fontsource | Privacy, performance, simplicity |
| Swimlanes | Custom SVG | SVAR Gantt, Bryntum | Wrong abstraction, licensing issues, bundle weight |
| O365 SSO | Supabase Azure OAuth | MSAL, NextAuth | Already have Supabase Auth, no need for second auth system |
| Realtime | Supabase Realtime | Custom WebSocket, Pusher | Already in the stack, zero config |
| Glass effects | CSS custom props | Material UI, dedicated glass lib | Native CSS, Tailwind 4 has backdrop-blur |

## Sources

- [Motion docs - React](https://motion.dev/docs/react)
- [Motion docs - SVG animation](https://motion.dev/docs/react-svg-animation)
- [Motion npm v12.38.0](https://www.npmjs.com/package/motion)
- [Motion upgrade guide (from framer-motion)](https://motion.dev/docs/react-upgrade-guide)
- [@dnd-kit/react npm v0.4.0](https://www.npmjs.com/package/@dnd-kit/react)
- [dnd-kit official docs](https://dndkit.com/)
- [dnd-kit + shadcn/ui Kanban example](https://github.com/Georgegriff/react-dnd-kit-tailwind-shadcn-ui)
- [Fontshare - Satoshi](https://www.fontshare.com/fonts/satoshi)
- [Fontshare - Cabinet Grotesk + Satoshi pairing](https://www.fontpair.co/pairings/cabinet-grotesk-satoshi)
- [Supabase - Login with Azure (Microsoft)](https://supabase.com/docs/guides/auth/social-login/auth-azure)
- [Supabase - Realtime with Next.js](https://supabase.com/docs/guides/realtime/realtime-with-nextjs)
- [React Flow - Animating Edges](https://reactflow.dev/examples/edges/animating-edges)
- [React Flow - AnimatedSVGEdge](https://reactflow.dev/ui/components/animated-svg-edge)
- [SVAR React Gantt chart comparison (2026)](https://svar.dev/blog/top-react-gantt-charts/)
