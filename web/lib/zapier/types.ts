import type { Page } from "playwright-core";

export interface SelectorStrategy {
  name: string;
  selector: string;
  extract: (page: Page) => Promise<string | null>;
}

export interface SelectorResult {
  value: string | null;
  strategy: string;
  allFailed: boolean;
}

export interface ZapierScrapedData {
  activeZaps: number | null;
  tasksUsed: number | null;
  tasksLimit: number | null;
  errorCount: number | null;
  successRatePct: number | null;
  topZaps: Array<{
    name: string;
    taskCount: number;
    errorCount?: number;
  }> | null;
  rawHtml: string;
  selectorResults: Record<string, SelectorResult>;
}

export interface ScraperConfig {
  credentialId: string;
  sessionKey: string;
  analyticsUrl: string;
}

export const SCRAPER_CONFIG: ScraperConfig = {
  // Credential ID must be set after user creates the credential in the vault
  // Store in settings table as "zapier_credential_id" or use env var
  credentialId: "", // Will be resolved from settings table at runtime
  sessionKey: "zapier_session_state",
  analyticsUrl: "https://zapier.com/app/settings/analytics",
};
