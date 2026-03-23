# Browserless.io Full Capabilities Reference

**Researched:** 2026-03-23
**Purpose:** Comprehensive capability map for V4.0 Browser Automation Builder AND potential optimizations to the initial agent pipeline.

## API Surface

### REST APIs (Stateless, single-session)

| Endpoint | Purpose | Relevance |
|----------|---------|-----------|
| `/function` | Run custom Puppeteer code server-side | Core: simple single-session automations |
| `/screenshot` | Capture PNG/JPEG/WebP screenshots | Testing: capture automation step results |
| `/pdf` | Generate PDFs from pages | Potential: export automation results |
| `/content` | Get fully rendered HTML including JS content | Potential: scrape page state for AI analysis |
| `/scrape` | Extract structured data with CSS selectors | Potential: data extraction automations |
| `/download` | Retrieve files Chrome downloads during execution | Core: "download file and upload to another system" use case |
| `/unblock` | Bypass CAPTCHAs and bot detection | Fallback: if internal systems have anti-bot |
| `/export` | Fetch URL and stream native content type | Potential: file transfer automations |
| `/performance` | Lighthouse audits (SEO, accessibility, speed) | Not relevant for V4.0 |
| `/search` | Search functionality | Not relevant for V4.0 |
| `/map` | Site mapping | Not relevant for V4.0 |
| `/smart-scrape` | Intelligent data extraction | Potential: enhanced scraping automations |

### BaaS — Browsers as a Service (Stateful, WebSocket)

Connect with Puppeteer or Playwright over `wss://` and treat Browserless as a remote browser cluster.

- **Full programmatic control** via CDP (Chrome DevTools Protocol)
- **Persistent sessions** with `userDataDir` for cookies/localStorage across reconnections
- **Session reconnection** via `Browserless.reconnect` CDP command
- **`processKeepAlive`** keeps browser alive between connections (preserves open pages, scroll position)
- **Multi-step workflows** across multiple script executions sharing state

**When to use BaaS over REST:**
- Multi-step automations needing state between steps
- Authentication flows requiring cookie/session persistence
- Complex page interactions that can't be expressed in a single script
- When you need to reconnect and continue from where you left off

### BrowserQL (BQL) — Stealth-First Automation

GraphQL-based API with built-in anti-detection:

- **Human-like behavior** built into all actions (mouse movements, typing speed, etc.)
- **Fingerprint randomization** (TLS fingerprint, browser fingerprint)
- **Residential proxies** for IP rotation
- **CAPTCHA solving** built-in
- **Stealth routes** (`/stealth/bql`) with ad/tracker blocking
- **Real consumer hardware** option for maximum stealth

**When to use BQL:**
- Target systems with bot detection (unlikely for NXT/iController/Intelly)
- External-facing sites that block headless browsers
- When standard Playwright scripts get blocked

## Session Management

### Persistent Sessions API

1. **Create:** `POST /session` with `ttl` (time-to-live in ms)
2. **Connect:** Use returned WebSocket URL with Puppeteer/Playwright
3. **Reconnect:** Same session ID restores persisted data (cookies, localStorage, cache)
4. **Terminate:** Call stop URL to permanently delete session

**Key parameters:**
- `ttl` (required): Session lifetime — Free: 1 day max, Scale: 90+ days
- `processKeepAlive`: Grace period (ms) to keep browser process alive after disconnect
- Without `processKeepAlive`: reconnect restores data but opens blank page
- With `processKeepAlive`: full state restoration (open pages, scroll, forms)

### Session Replay (RRWeb-based)

Records full session timeline using RRWeb technology:
- DOM mutations
- Mouse movements and clicks
- Scrolling
- Keyboard input
- Console logs
- Network requests

Lightweight, high-fidelity recordings playable at any speed. Available in dashboard after session ends.

**V4.0 relevance:** Perfect for showing non-technical users what happened during automation execution. No need to build custom recording. Replace "capture screenshots" with "replay session recording."

### Screen Recording with LiveURL

Real-time video streaming of automation execution. Users could watch the automation run live.

**V4.0 relevance:** For the "user watches results" confirmation step.

## Pricing (2026)

| Plan | Units/month | Concurrent | Price |
|------|-------------|------------|-------|
| Free | 1,000 | 1 | $0 |
| Prototyping | 20,000 | 3 | $25/mo (annual) |
| Starter | 180,000 | 20 | $140/mo (annual) |
| Scale | 500,000 | 50 | $350/mo (annual) |
| Enterprise | Custom | Custom | Custom |

**Unit = 30 seconds of browser time.** Each extra 30 seconds = 1 additional unit.

**Estimate for V4.0:**
- Script creation: ~5-10 test iterations x ~60 seconds each = 10-20 units per automation
- Recurring execution: ~1-3 units per run
- 5-15 users creating ~2-5 automations/month: ~200-1,500 units/month for creation
- Recurring runs (daily): ~30-90 units/month per automation
- **Prototyping plan sufficient for early adoption, Starter for production**

## Chrome Extensions Support

Browserless supports loading Chrome extensions in automated sessions. Could be relevant if target systems require specific browser extensions for access.

## Pipeline Optimization Opportunities

These Browserless.io capabilities could enhance the EXISTING agent pipeline (beyond V4.0):

1. **Session Replay for pipeline debugging** — Record what happens when agents interact with systems, replay for diagnosis
2. **`/scrape` for data extraction agents** — Agents that need to pull data from web UIs
3. **`/download` for file-handling agents** — Automated file downloads as part of agent workflows
4. **Persistent sessions for agent testing** — Maintain state across test iterations
5. **`/unblock` for web-facing agents** — Agents accessing external services with bot detection
6. **`/content` for page analysis** — Get rendered HTML for AI analysis of web pages

---

**Sources:**
- [Browserless REST APIs](https://docs.browserless.io/rest-apis/intro)
- [Browserless Session Management](https://docs.browserless.io/baas/session-management/standard-sessions)
- [Browserless Persistent Sessions](https://docs.browserless.io/baas/session-management/persisting-state)
- [Browserless Session Replay](https://docs.browserless.io/baas/interactive-browser-sessions/session-replay)
- [Browserless BQL](https://docs.browserless.io/browserql/start)
- [Browserless Pricing](https://www.browserless.io/pricing)
- [Browserless New Features 2025](https://www.browserless.io/blog/browserless-new-features-debug-chrome-extensions-replay-2025)
