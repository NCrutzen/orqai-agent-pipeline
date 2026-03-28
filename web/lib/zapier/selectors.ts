import type { Page } from "playwright-core";
import type { SelectorStrategy, SelectorResult } from "./types";

// =============================================
// DOM Reconnaissance (run FIRST to map selectors)
// =============================================
export async function captureAnalyticsPageState(page: Page): Promise<{
  url: string;
  title: string;
  html: string;
  screenshot: Buffer;
}> {
  return {
    url: page.url(),
    title: await page.title(),
    html: await page.content(),
    screenshot: await page.screenshot({ fullPage: true }),
  };
}

// =============================================
// Selector Strategies (multi-fallback per metric)
// =============================================
// NOTE: These selectors are INITIAL GUESSES based on common analytics dashboard patterns.
// The first scraper run should use captureAnalyticsPageState() to validate and refine.
// Each metric has 2-3 fallback strategies.

export const ACTIVE_ZAPS_STRATEGIES: SelectorStrategy[] = [
  {
    name: "heading-text",
    selector: 'h2:has-text("Active"), h3:has-text("Active")',
    extract: async (page) => {
      const el = page
        .locator('h2:has-text("Active"), h3:has-text("Active")')
        .first();
      if ((await el.count()) === 0) return null;
      // Look for adjacent number
      const parent = page
        .locator('h2:has-text("Active"), h3:has-text("Active")')
        .first()
        .locator("..");
      const text = await parent.textContent();
      const match = text?.match(/(\d+)/);
      return match ? match[1] : null;
    },
  },
  {
    name: "aria-label",
    selector: '[aria-label*="active" i][aria-label*="zap" i]',
    extract: async (page) => {
      const el = page
        .locator('[aria-label*="active" i][aria-label*="zap" i]')
        .first();
      if ((await el.count()) === 0) return null;
      const text = await el.textContent();
      const match = text?.match(/(\d+)/);
      return match ? match[1] : null;
    },
  },
  {
    name: "data-testid",
    selector: '[data-testid*="active-zap"]',
    extract: async (page) => {
      const el = page.locator('[data-testid*="active-zap"]').first();
      if ((await el.count()) === 0) return null;
      return el.textContent();
    },
  },
];

export const TASK_COUNT_STRATEGIES: SelectorStrategy[] = [
  {
    name: "heading-text",
    selector: ':text("tasks used"), :text("Task usage")',
    extract: async (page) => {
      const el = page
        .locator(':text("tasks used"), :text("Task usage")')
        .first();
      if ((await el.count()) === 0) return null;
      const parent = el.locator("..");
      const text = await parent.textContent();
      const match = text?.match(/([\d,]+)/);
      return match ? match[1].replace(/,/g, "") : null;
    },
  },
  {
    name: "aria-label",
    selector: '[aria-label*="task" i]',
    extract: async (page) => {
      const el = page.locator('[aria-label*="task" i]').first();
      if ((await el.count()) === 0) return null;
      const text = await el.textContent();
      const match = text?.match(/([\d,]+)/);
      return match ? match[1].replace(/,/g, "") : null;
    },
  },
];

export const ERROR_COUNT_STRATEGIES: SelectorStrategy[] = [
  {
    name: "heading-text",
    selector: ':text("error"), :text("Error")',
    extract: async (page) => {
      const el = page.locator(':text("error"), :text("Error")').first();
      if ((await el.count()) === 0) return null;
      const parent = el.locator("..");
      const text = await parent.textContent();
      const match = text?.match(/([\d,]+)/);
      return match ? match[1].replace(/,/g, "") : null;
    },
  },
];

// =============================================
// Generic fallback extraction runner
// =============================================
export async function extractWithFallback(
  page: Page,
  strategies: SelectorStrategy[]
): Promise<SelectorResult> {
  for (const strategy of strategies) {
    try {
      const value = await strategy.extract(page);
      if (value !== null && value.trim() !== "") {
        return { value: value.trim(), strategy: strategy.name, allFailed: false };
      }
    } catch {
      // Try next strategy
    }
  }
  return { value: null, strategy: "none", allFailed: true };
}

// All selector groups for iteration
export const ZAPIER_SELECTORS = {
  activeZaps: ACTIVE_ZAPS_STRATEGIES,
  tasksUsed: TASK_COUNT_STRATEGIES,
  errorCount: ERROR_COUNT_STRATEGIES,
} as const;
