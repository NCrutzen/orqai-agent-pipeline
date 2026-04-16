---
phase: 48-foundation
plan: 01
subsystem: ui
tags: [next-themes, fonts, css-tokens, glassmorphism, dark-mode, satoshi, cabinet-grotesk]

# Dependency graph
requires: []
provides:
  - V7 CSS token namespace (--v7-*) with 57 tokens for light and dark themes
  - Satoshi Variable and Cabinet Grotesk Variable font loading via next/font/local
  - ThemeProvider with data-theme attribute for dark/light switching
  - ThemeToggle component for manual theme switching
  - GlassCard utility component with glassmorphism styling
affects: [49-realtime-dashboard, 50-swarm-detail, 51-agent-drawer, 52-terminal, 53-kanban, 54-polish]

# Tech tracking
tech-stack:
  added: [next-themes@0.4]
  patterns: [parallel-css-namespace, data-theme-attribute, local-font-loading, glassmorphism-tokens]

key-files:
  created:
    - web/public/fonts/Satoshi-Variable.woff2
    - web/public/fonts/Satoshi-VariableItalic.woff2
    - web/public/fonts/CabinetGrotesk-Variable.woff2
    - web/components/theme-provider.tsx
    - web/components/theme-toggle.tsx
    - web/components/ui/glass-card.tsx
  modified:
    - web/app/globals.css
    - web/app/layout.tsx
    - web/package.json

key-decisions:
  - "V7 tokens added to existing globals.css (not separate file) to ensure correct cascade order"
  - "ThemeProvider uses data-theme attribute with dark default and system preference enabled"
  - "@custom-variant dark changed from .dark to [data-theme='dark'] selector"

patterns-established:
  - "Parallel CSS namespace: all V7 tokens use --v7-* prefix, existing shadcn tokens untouched"
  - "Font coexistence: Satoshi + Cabinet Grotesk loaded alongside Geist, 4 CSS variables on html"
  - "GlassCard pattern: Tailwind arbitrary values referencing CSS custom properties"

requirements-completed: [DS-01, DS-02, DS-03, DS-04]

# Metrics
duration: 8min
completed: 2026-04-15
---

# Phase 48 Plan 01: V7 Design System Summary

**Self-hosted Satoshi + Cabinet Grotesk fonts, next-themes dark/light toggle with data-theme attribute, 57 V7 CSS tokens in parallel --v7-* namespace, and GlassCard glassmorphism component**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-15T18:27:33Z
- **Completed:** 2026-04-15T18:36:00Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Installed next-themes and downloaded 3 variable font files (Satoshi normal, Satoshi italic, Cabinet Grotesk) from Fontshare
- Added complete V7 token namespace (57 tokens) to globals.css with light and dark theme variants, preserving all existing shadcn oklch tokens
- Wired ThemeProvider with data-theme attribute, created ThemeToggle and GlassCard components
- Updated @custom-variant dark selector from .dark class to [data-theme="dark"] attribute

## Task Commits

Each task was committed atomically:

1. **Task 1: Install next-themes, download fonts, add V7 tokens** - `8cebd9c` (feat)
2. **Task 2: Wire fonts and ThemeProvider, create components** - `60735b8` (feat)

## Files Created/Modified
- `web/public/fonts/Satoshi-Variable.woff2` - Body font (variable, 300-900 weight)
- `web/public/fonts/Satoshi-VariableItalic.woff2` - Body font italic variant
- `web/public/fonts/CabinetGrotesk-Variable.woff2` - Heading font (variable, 100-900 weight)
- `web/app/globals.css` - Updated @custom-variant, added 57 V7 tokens in --v7-* namespace
- `web/app/layout.tsx` - Added local font loading, ThemeProvider wrapping, 4 font CSS variables
- `web/components/theme-provider.tsx` - next-themes wrapper with data-theme attribute
- `web/components/theme-toggle.tsx` - Dark/light toggle button with Sun/Moon icons
- `web/components/ui/glass-card.tsx` - Glassmorphism utility component using V7 tokens
- `web/package.json` - Added next-themes dependency

## Decisions Made
- V7 tokens added to existing globals.css rather than a separate file, ensuring correct cascade order
- ThemeProvider uses data-theme attribute (not class-based) with dark as default theme
- @custom-variant dark updated from .dark to [data-theme="dark"] in same commit as ThemeProvider to prevent dark mode breakage
- GlassCard uses Tailwind arbitrary values referencing CSS custom properties for full theme-awareness

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing build error in @zapier/zapier-sdk keyring module (@napi-rs/keyring non-ESM asset). Not caused by this plan's changes -- verified by testing build on unmodified codebase. Out of scope.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All V7 CSS tokens available for consumption by any component via var(--v7-*)
- Theme toggle infrastructure ready for integration into sidebar (Phase 49)
- GlassCard component ready for use in dashboard panels (Phase 49)
- Font CSS variables --font-satoshi and --font-cabinet available for V7 typography

---
*Phase: 48-foundation*
*Completed: 2026-04-15*
