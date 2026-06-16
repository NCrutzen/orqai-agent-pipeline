// Phase 67 Plan 02 Wave 1 — unit tests for the buildIcontrollerMessageUrl helper.
// Per 67-RESEARCH.md § URL Construction (Open Question 1, Option A): the helper
// returns the mailbox-LIST URL, not a per-message detail URL.
import { describe, it, expect } from "vitest";
import { buildIcontrollerMessageUrl } from "../url";

describe("buildIcontrollerMessageUrl", () => {
  it("smeba acceptance produces test-walkerfire host + mailbox/4", () => {
    expect(
      buildIcontrollerMessageUrl({
        source_mailbox: "debiteuren@smeba.nl",
        env: "acceptance",
      }),
    ).toBe(
      "https://test-walkerfire-testing.icontroller.billtrust.com/messages/index/mailbox/4",
    );
  });

  it("smeba production produces walkerfire.icontroller.eu host + mailbox/4", () => {
    expect(
      buildIcontrollerMessageUrl({
        source_mailbox: "debiteuren@smeba.nl",
        env: "production",
      }),
    ).toBe("https://walkerfire.icontroller.eu/messages/index/mailbox/4");
  });

  it("fire-control production produces mailbox/12", () => {
    expect(
      buildIcontrollerMessageUrl({
        source_mailbox: "administratie@fire-control.nl",
        env: "production",
      }),
    ).toBe("https://walkerfire.icontroller.eu/messages/index/mailbox/12");
  });

  it("berki production produces mailbox/171", () => {
    expect(
      buildIcontrollerMessageUrl({
        source_mailbox: "debiteuren@berki.nl",
        env: "production",
      }),
    ).toBe("https://walkerfire.icontroller.eu/messages/index/mailbox/171");
  });

  it("unknown source_mailbox throws", () => {
    expect(() =>
      buildIcontrollerMessageUrl({
        source_mailbox: "unknown@example.com",
        env: "production",
      }),
    ).toThrow(/unknown source_mailbox/);
  });
});
