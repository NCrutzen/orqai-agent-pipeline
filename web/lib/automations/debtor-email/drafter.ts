import { type Page, type BrowserContext } from "playwright-core";
import {
  connectWithSession,
  saveSession,
  captureScreenshot,
} from "@/lib/browser";
import { resolveCredentials } from "@/lib/credentials/proxy";

const AUTOMATION_NAME = "debtor-email-drafter";

export type IControllerEnv = "acceptance" | "production";

/** Dedicated session key — NOT shared with cleanup automation. */
const SESSION_KEY = "icontroller_session_drafter";

interface EnvConfig {
  url: string;
  credentialId: string;
  label: string;
}

function resolveEnvConfig(env: IControllerEnv): EnvConfig {
  if (env === "production") {
    return {
      url: "https://walkerfire.icontroller.eu",
      credentialId: "dfae6b50-59dd-44e6-81ac-79d4f3511c3f",
      label: "PRODUCTION -- iController (drafter) -- Actie: create draft reply",
    };
  }
  return {
    url: "https://test-walkerfire-testing.icontroller.billtrust.com",
    credentialId: "e9a9570e-5f0d-4d50-8b41-212fc6bdb78a",
    label: 'ACCEPTANCE -- iController (drafter) -- Credentials: "icontroller-test"',
  };
}

export type CreateDraftInput =
  | {
      mode?: "reply";
      messageId: string;
      bodyHtml: string;
      pdfBase64: string;
      filename: string;
      env?: IControllerEnv;
    }
  | {
      mode: "new";
      to: string;
      subject: string;
      bodyHtml: string;
      pdfBase64: string;
      filename: string;
      env?: IControllerEnv;
    };

export type DraftFailureReason =
  | "login_failed"
  | "message_not_found"
  | "attach_failed"
  | "save_failed"
  | "composer_failed";

export interface CreateDraftSuccess {
  success: true;
  draftUrl: string;
  screenshots: {
    beforeSave: { path: string | null; url: string | null };
    afterSave: { path: string | null; url: string | null };
  };
  bodyInjectionPath: "iframe" | "textarea" | "skipped";
}

export interface CreateDraftFailure {
  success: false;
  reason: DraftFailureReason;
  screenshot: { path: string | null; url: string | null } | null;
  details: string;
}

export type CreateDraftResult = CreateDraftSuccess | CreateDraftFailure;

/**
 * Login to iController if the session isn't already authenticated.
 * Selectors match those used in the cleanup automation (#login-username,
 * #login-password, #login-submit). Throws on credential failure so the
 * caller can surface `login_failed`.
 */
async function ensureLoggedIn(page: Page, cfg: EnvConfig): Promise<void> {
  await page.goto(cfg.url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  const hasLoginForm = await page
    .locator("#login-username")
    .isVisible({ timeout: 3000 })
    .catch(() => false);
  if (!hasLoginForm) return;

  const creds = await resolveCredentials(cfg.credentialId);
  await page.fill("#login-username", creds.username);
  await page.fill("#login-password", creds.password);
  await page.click("#login-submit");

  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2000);

  const stillOnLogin = await page
    .locator("#login-username")
    .isVisible({ timeout: 1500 })
    .catch(() => false);
  if (stillOnLogin) {
    throw new Error("login_failed: credentials rejected by iController");
  }
}

/**
 * Validate-before-trust: if the saved storageState is still good we should
 * land on the composer without being bounced to /login. If we ARE bounced,
 * re-login and try the composer again.
 * Returns true when the composer is loaded and ready.
 */
async function navigateToComposer(
  page: Page,
  cfg: EnvConfig,
  messageId: string,
): Promise<{ ok: boolean; reason?: DraftFailureReason; detail?: string }> {
  const composerUrl = `${cfg.url}/messages/compose/direction/reply/messageId/${messageId}`;

  await page.goto(composerUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  const onLogin = await page
    .locator("#login-username")
    .isVisible({ timeout: 1500 })
    .catch(() => false);

  if (onLogin) {
    // Saved session stale — log in then re-navigate.
    try {
      await ensureLoggedIn(page, cfg);
    } catch (err) {
      return { ok: false, reason: "login_failed", detail: String(err) };
    }
    await page.goto(composerUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
  }

  // Wait for either the composer form OR a Billtrust error shell.
  const composerReady = await page
    .locator('textarea[name="message"]')
    .waitFor({ state: "attached", timeout: 10_000 })
    .then(() => true)
    .catch(() => false);

  if (!composerReady) {
    // Detect common "message not found" shell: iController returns the
    // inbox page or a generic error if the message id is invalid.
    const url = page.url();
    if (!url.includes("/messages/compose/")) {
      return {
        ok: false,
        reason: "message_not_found",
        detail: `Redirected away from composer to ${url} for messageId=${messageId}`,
      };
    }
    return {
      ok: false,
      reason: "message_not_found",
      detail: `Composer form (textarea[name="message"]) never appeared for messageId=${messageId}`,
    };
  }

  return { ok: true };
}

/**
 * Navigate to the cold-compose form ({baseUrl}/messages/compose?) and wait
 * for the composer to be ready. Handles stale-session bounce-to-login the
 * same way navigateToComposer does.
 */
async function navigateToNewComposer(
  page: Page,
  cfg: EnvConfig,
): Promise<{ ok: boolean; reason?: DraftFailureReason; detail?: string }> {
  const composerUrl = `${cfg.url}/messages/compose?`;

  await page.goto(composerUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  const onLogin = await page
    .locator("#login-username")
    .isVisible({ timeout: 1500 })
    .catch(() => false);

  if (onLogin) {
    try {
      await ensureLoggedIn(page, cfg);
    } catch (err) {
      return { ok: false, reason: "login_failed", detail: String(err) };
    }
    await page.goto(composerUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
  }

  const composerReady = await page
    .locator('textarea[name="message"]')
    .waitFor({ state: "attached", timeout: 10_000 })
    .then(() => true)
    .catch(() => false);

  if (!composerReady) {
    return {
      ok: false,
      reason: "composer_failed",
      detail: `Cold composer form never appeared at ${page.url()}`,
    };
  }
  return { ok: true };
}

/**
 * Fill a Select2-backed recipient field (to/cc/bcc). The visible `.select2-input`
 * sibling of the hidden `input[name="<field>"]` receives the typed email; we
 * commit the chip by pressing Enter (Select2 createSearchChoice path). As a
 * belt-and-braces fallback we also set the hidden input's `data-value` JSON
 * so the form submits the address even if the tag-UI didn't materialise.
 */
async function fillRecipient(
  page: Page,
  field: "to" | "cc" | "bcc",
  email: string,
): Promise<void> {
  // Locate the Select2 search input that precedes the hidden input[name=<field>].
  // Structure: <div.select2-container> ... <input.select2-input> ... </div>
  //            <input type="text" name="<field>" class="select2-offscreen" ...>
  const hidden = page.locator(`input[name="${field}"]`);
  await hidden.waitFor({ state: "attached", timeout: 5000 });

  // The visible input lives in the preceding select2-container.
  const searchInput = page
    .locator(`input[name="${field}"]`)
    .locator('xpath=preceding-sibling::div[contains(@class,"select2-container")][1]//input[contains(@class,"select2-input")]');

  const hasSearch = await searchInput.count();
  if (hasSearch > 0) {
    await searchInput.first().click();
    await searchInput.first().type(email, { delay: 30 });
    await page.waitForTimeout(400);
    // Enter commits a free-text tag in select2 when createSearchChoice is on;
    // on ic-contact-selector this also commits the highlighted suggestion.
    await searchInput.first().press("Enter");
    await page.waitForTimeout(300);
  }

  // Fallback: ensure the hidden input carries the value so form POST has it.
  await page.evaluate(
    ({ name, email }) => {
      const el = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
      if (!el) return;
      const payload = [{ id: email, text: email }];
      el.setAttribute("data-value", JSON.stringify(payload));
      el.value = email;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    },
    { name: field, email },
  );
}

/**
 * Fill the subject line (plain input[name="subject"]).
 */
async function fillSubject(page: Page, subject: string): Promise<void> {
  const input = page.locator('input[name="subject"]').first();
  await input.waitFor({ state: "attached", timeout: 5000 });
  await input.fill(subject);
}

/**
 * Attach a PDF via the hidden Dropzone input. Bypasses the "Add attachments"
 * button to avoid triggering the native file chooser (which Playwright can
 * handle but adds latency + flakiness).
 *
 * The input is `input.dz-hidden-input` (see probe artifact 06 → replyComposerState.fileInputs).
 */
async function attachPdf(
  page: Page,
  filename: string,
  pdfBase64: string,
): Promise<void> {
  const buffer = Buffer.from(pdfBase64, "base64");
  if (buffer.length === 0) {
    throw new Error("attach_failed: empty PDF buffer");
  }

  // Prefer the Dropzone hidden input (multiple=true). Fall back to any
  // type=file input on the page if the class changes.
  const fileInput = page
    .locator('input[type="file"].dz-hidden-input, input[type="file"]')
    .first();

  await fileInput.waitFor({ state: "attached", timeout: 5000 });
  await fileInput.setInputFiles({
    name: filename,
    mimeType: "application/pdf",
    buffer,
  });

  // Wait for Dropzone to render the preview row so we know it accepted the
  // file. Looks for a .dz-preview / .dz-filename node with our filename.
  const accepted = await page
    .locator(`.dz-preview:has-text(${JSON.stringify(filename)})`)
    .first()
    .waitFor({ state: "attached", timeout: 8000 })
    .then(() => true)
    .catch(() => false);

  if (!accepted) {
    // Not fatal: some iController versions don't render previews. Give the
    // upload a beat to finish then move on — save-as-draft will fail loudly
    // if the attachment never reached the server.
    await page.waitForTimeout(1500);
  }
}

/**
 * Inject the cover-text HTML into the reply body. Tries the CKEditor iframe
 * first; if that fails, falls back to setting the mirrored textarea and
 * dispatching an input event. Returns which path was taken.
 */
async function injectBody(
  page: Page,
  bodyHtml: string,
): Promise<"iframe" | "textarea"> {
  try {
    await page
      .frameLocator("iframe.cke_wysiwyg_frame")
      .locator("body")
      .evaluate((el, html) => {
        (el as HTMLElement).innerHTML = html;
      }, bodyHtml);
    // Nudge CKEditor to sync iframe → textarea so the form submission picks
    // up our HTML. The global CKEDITOR.instances.message.updateElement() is
    // the canonical way; guard so we don't crash if the API differs.
    await page.evaluate(() => {
      const ck = (window as unknown as { CKEDITOR?: { instances?: Record<string, { updateElement?: () => void }> } }).CKEDITOR;
      try {
        ck?.instances?.message?.updateElement?.();
      } catch {
        /* non-fatal */
      }
    });
    return "iframe";
  } catch {
    // Fallback: set the hidden textarea + dispatch input.
    await page.evaluate((html) => {
      const ta = document.querySelector<HTMLTextAreaElement>('textarea[name="message"]');
      if (!ta) throw new Error('textarea[name="message"] not found');
      ta.value = html;
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      ta.dispatchEvent(new Event("change", { bubbles: true }));
    }, bodyHtml);
    return "textarea";
  }
}

/**
 * Click the Save-as-draft button. The probe artifact confirms a single
 * match: `<button type="submit" class="save-as-draft" data-save-draft-button="1">Save as draft</button>`.
 * We target by class first (most stable), then by text as a fallback.
 */
async function clickSaveAsDraft(page: Page): Promise<void> {
  const byClass = page.locator("button.save-as-draft, button[data-save-draft-button]").first();
  const byText = page.locator('button:has-text("Save as draft")').first();

  const button = (await byClass.count()) > 0 ? byClass : byText;
  await button.waitFor({ state: "visible", timeout: 5000 });
  await button.click();

  // Saving triggers a server round-trip. iController may redirect to the
  // message detail page or show a toast; we wait a beat and check for
  // either a URL change away from /messages/compose/ or a visible toast.
  await Promise.race([
    page
      .waitForURL((url) => !url.toString().includes("/messages/compose/"), {
        timeout: 10_000,
      })
      .catch(() => null),
    page
      .locator('.alert-success, .toast-success, .notification-success')
      .waitFor({ state: "visible", timeout: 10_000 })
      .catch(() => null),
    page.waitForTimeout(5000),
  ]);
}

/**
 * Main flow. Creates a draft reply to `messageId` with `pdfBase64` attached.
 * Captures screenshots before and after the save click, persists session
 * state on success, and returns a structured result.
 */
export async function createIcontrollerDraft(
  input: CreateDraftInput,
): Promise<CreateDraftResult> {
  const env: IControllerEnv =
    input.env ?? (process.env.ICONTROLLER_ENV === "production" ? "production" : "acceptance");
  const cfg = resolveEnvConfig(env);
  const mode: "reply" | "new" = input.mode === "new" ? "new" : "reply";

  // Env banner — CLAUDE.md §Test-First Pattern.
  console.log(`[debtor-email-drafter] ${cfg.label} [mode=${mode}]`);

  const replyComposerUrl =
    mode === "reply"
      ? `${cfg.url}/messages/compose/direction/reply/messageId/${(input as { messageId: string }).messageId}`
      : `${cfg.url}/messages/compose?`;
  const labelId = mode === "reply" ? (input as { messageId: string }).messageId : "new";

  let browser: Awaited<ReturnType<typeof connectWithSession>>["browser"] | undefined;
  let context: BrowserContext | undefined;
  let page: Page | undefined;

  try {
    ({ browser, context, page } = await connectWithSession(SESSION_KEY));

    if (mode === "reply") {
      const nav = await navigateToComposer(page, cfg, (input as { messageId: string }).messageId);
      if (!nav.ok) {
        const shot = await captureScreenshot(page, {
          automation: AUTOMATION_NAME,
          label: `error-${nav.reason}`,
        }).catch(() => ({ path: null, url: null }));
        return {
          success: false,
          reason: nav.reason ?? "login_failed",
          screenshot: shot,
          details: nav.detail ?? "navigateToComposer failed",
        };
      }
    } else {
      const nav = await navigateToNewComposer(page, cfg);
      if (!nav.ok) {
        const shot = await captureScreenshot(page, {
          automation: AUTOMATION_NAME,
          label: `error-${nav.reason}`,
        }).catch(() => ({ path: null, url: null }));
        return {
          success: false,
          reason: nav.reason ?? "composer_failed",
          screenshot: shot,
          details: nav.detail ?? "navigateToNewComposer failed",
        };
      }
      const newInput = input as { to: string; subject: string };
      try {
        await fillRecipient(page, "to", newInput.to);
        await fillSubject(page, newInput.subject);
      } catch (err) {
        const shot = await captureScreenshot(page, {
          automation: AUTOMATION_NAME,
          label: "error-compose-fields",
        }).catch(() => ({ path: null, url: null }));
        return {
          success: false,
          reason: "composer_failed",
          screenshot: shot,
          details: `Filling to/subject failed: ${String(err)}`,
        };
      }
    }

    // Attach
    try {
      await attachPdf(page, input.filename, input.pdfBase64);
    } catch (err) {
      const shot = await captureScreenshot(page, {
        automation: AUTOMATION_NAME,
        label: "error-attach",
      }).catch(() => ({ path: null, url: null }));
      return {
        success: false,
        reason: "attach_failed",
        screenshot: shot,
        details: String(err),
      };
    }

    // Inject body (if any)
    let injectionPath: "iframe" | "textarea" | "skipped" = "skipped";
    if (input.bodyHtml && input.bodyHtml.trim().length > 0) {
      injectionPath = await injectBody(page, input.bodyHtml);
      console.log(`[debtor-email-drafter] body injected via: ${injectionPath}`);
    }

    // Screenshot BEFORE save
    const beforeSave = await captureScreenshot(page, {
      automation: AUTOMATION_NAME,
      label: `before-save-${labelId}`,
    }).catch(() => ({ path: null, url: null }));

    // Save
    try {
      await clickSaveAsDraft(page);
    } catch (err) {
      const shot = await captureScreenshot(page, {
        automation: AUTOMATION_NAME,
        label: "error-save",
      }).catch(() => ({ path: null, url: null }));
      return {
        success: false,
        reason: "save_failed",
        screenshot: shot,
        details: String(err),
      };
    }

    // Screenshot AFTER save (before we close the browser)
    const afterSave = await captureScreenshot(page, {
      automation: AUTOMATION_NAME,
      label: `after-save-${labelId}`,
    }).catch(() => ({ path: null, url: null }));

    // Save session state for reuse next run. The composer load already
    // validated the session, so we only persist on success.
    if (context) {
      await saveSession(context, SESSION_KEY).catch((err) => {
        console.warn(`[debtor-email-drafter] saveSession failed (non-fatal): ${err}`);
      });
    }

    // In new-mode the composerUrl is the pre-save compose URL; the post-save
    // location (often the draft's own show/edit URL) is more useful.
    const draftUrl = mode === "new" ? page.url() || replyComposerUrl : replyComposerUrl;

    return {
      success: true,
      draftUrl,
      screenshots: { beforeSave, afterSave },
      bodyInjectionPath: injectionPath,
    };
  } catch (err) {
    const shot = page
      ? await captureScreenshot(page, {
          automation: AUTOMATION_NAME,
          label: "error-unhandled",
        }).catch(() => ({ path: null, url: null }))
      : null;
    return {
      success: false,
      reason: "save_failed",
      screenshot: shot,
      details: `Unhandled: ${String(err)}`,
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
