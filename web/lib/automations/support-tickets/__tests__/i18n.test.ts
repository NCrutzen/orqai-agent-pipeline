import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  resolveSubmitterLocale,
  resolveVendorLocale,
} from "@/lib/automations/support-tickets/i18n";

describe("resolveSubmitterLocale", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("returns 'nl' for input 'nl' without warning", () => {
    expect(resolveSubmitterLocale("nl")).toBe("nl");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("returns 'en' for input 'en' without warning", () => {
    expect(resolveSubmitterLocale("en")).toBe("en");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("returns 'fr' for input 'fr' without warning", () => {
    expect(resolveSubmitterLocale("fr")).toBe("fr");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("returns 'en' AND logs a warning for input null", () => {
    expect(resolveSubmitterLocale(null)).toBe("en");
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(String(warnSpy.mock.calls[0]?.[0] ?? "")).toMatch(/I18N-05/);
  });

  it("returns 'en' AND logs a warning for unknown input 'de'", () => {
    expect(resolveSubmitterLocale("de")).toBe("en");
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(String(warnSpy.mock.calls[0]?.[0] ?? "")).toMatch(/I18N-05/);
  });

  it("returns 'en' AND logs a warning for empty string", () => {
    expect(resolveSubmitterLocale("")).toBe("en");
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(String(warnSpy.mock.calls[0]?.[0] ?? "")).toMatch(/I18N-05/);
  });
});

describe("resolveVendorLocale", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("returns provided locale 'nl'", () => {
    expect(resolveVendorLocale("nl")).toBe("nl");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("returns provided locale 'en'", () => {
    expect(resolveVendorLocale("en")).toBe("en");
  });

  it("returns provided locale 'fr'", () => {
    expect(resolveVendorLocale("fr")).toBe("fr");
  });

  it("returns 'en' for null WITHOUT a warning", () => {
    expect(resolveVendorLocale(null)).toBe("en");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("returns 'en' for unknown 'de' WITHOUT a warning", () => {
    expect(resolveVendorLocale("de")).toBe("en");
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
