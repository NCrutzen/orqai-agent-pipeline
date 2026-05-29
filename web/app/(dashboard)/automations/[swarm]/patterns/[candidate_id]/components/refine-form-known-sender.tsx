"use client";

// Phase 4 Plan 03 Task 3 — kind-specific refine form: Known sender.
//
// sender_pattern textbox + customer_account_id input (NUMBER-ONLY, anti-drift
// #7 — no fuzzy customer-name search). Live validation against searchCustomers
// (debounced 250ms) mirrors Phase 3 Stage 2 Decide pattern verbatim.

import { useCallback, useEffect, useState } from "react";
import type { RefinementPayload } from "@/lib/promotion-recommender/types";
import { searchCustomers } from "../../../stage-1/components/stage-2-search";

export interface RefineFormKnownSenderProps {
  initial: { sender_pattern: string; customer_account_id: string };
  onChange: (next: { valid: boolean; payload: RefinementPayload }) => void;
}

type ValidationState =
  | { status: "idle" }
  | { status: "in-flight" }
  | { status: "match"; customer_name: string }
  | { status: "miss" };

const DIGITS_RX = /^\d+$/;

export function RefineFormKnownSender({
  initial,
  onChange,
}: RefineFormKnownSenderProps) {
  const [senderPattern, setSenderPattern] = useState(initial.sender_pattern ?? "");
  const [digits, setDigits] = useState(initial.customer_account_id ?? "");
  const [validation, setValidation] = useState<ValidationState>({ status: "idle" });

  const emit = useCallback(
    (sender: string, customer: string, valid: boolean) => {
      const payload: RefinementPayload = {
        kind: "sender_mapping",
        sender_pattern: sender,
        customer_account_id: customer,
      };
      onChange({ valid, payload });
    },
    [onChange],
  );

  // Debounced live validation against searchCustomers — mirrors stage-2-decide.
  // The two synchronous status updates below give the operator immediate
  // idle/in-flight feedback on each keystroke; the async match/miss result is
  // set in the deferred setTimeout callback. This intentional immediate-feedback
  // pattern trips react-hooks/set-state-in-effect (a performance advisory), so
  // the two synchronous calls are scoped-disabled — the debounce + its tests are
  // load-bearing and a refactor here is out of scope for this merge.
  useEffect(() => {
    if (!DIGITS_RX.test(digits)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- immediate idle feedback
      setValidation({ status: "idle" });
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- immediate in-flight feedback
    setValidation({ status: "in-flight" });
    const aborted = { current: false };
    const t = window.setTimeout(async () => {
      try {
        const results = await searchCustomers(digits);
        if (aborted.current) return;
        const hit = results.find((r) => r.customer_account_id === digits);
        if (hit) {
          setValidation({ status: "match", customer_name: hit.customer_name });
        } else {
          setValidation({ status: "miss" });
        }
      } catch {
        if (aborted.current) return;
        setValidation({ status: "miss" });
      }
    }, 250);
    return () => {
      aborted.current = true;
      window.clearTimeout(t);
    };
  }, [digits]);

  // Re-emit validity whenever validation flips.
  useEffect(() => {
    const senderValid = senderPattern.trim().length > 0;
    const digitsValid = DIGITS_RX.test(digits);
    const matched = validation.status === "match";
    emit(senderPattern, digits, senderValid && digitsValid && matched);
  }, [senderPattern, digits, validation, emit]);

  const handleDigitsChange = (raw: string) => {
    // Number-only input — strip everything that isn't a digit (anti-drift #7).
    const clean = raw.replace(/\D+/g, "");
    setDigits(clean);
  };

  return (
    <div
      data-testid="refine-form-known-sender"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
        padding: "var(--space-3)",
        border: "1px solid var(--v7-amber, var(--amber))",
        borderRadius: 6,
        background: "var(--v7-bg)",
      }}
    >
      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
        <span style={{ fontWeight: 600 }}>Sender</span>
        <input
          data-testid="refine-sender-pattern"
          type="text"
          value={senderPattern}
          onChange={(e) => setSenderPattern(e.target.value)}
          placeholder="ap@vendor.com"
          style={{
            padding: "var(--space-2)",
            border: "1px solid var(--v7-border)",
            borderRadius: 4,
            fontSize: 13,
            background: "var(--v7-bg)",
            color: "var(--v7-text)",
          }}
        />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
        <span style={{ fontWeight: 600 }}>Customer account number</span>
        <input
          data-testid="refine-customer-account-id"
          type="text"
          inputMode="numeric"
          pattern="\d+"
          value={digits}
          onChange={(e) => handleDigitsChange(e.target.value)}
          maxLength={10}
          placeholder="1234"
          style={{
            padding: "var(--space-2)",
            border: "1px solid var(--v7-border)",
            borderRadius: 4,
            fontSize: 13,
            fontFamily: "var(--v7-font-mono, monospace)",
            background: "var(--v7-bg)",
            color: "var(--v7-text)",
          }}
        />
        <span
          data-testid="refine-customer-validation"
          data-status={validation.status}
          style={{
            fontSize: 12,
            color:
              validation.status === "match"
                ? "var(--v7-lime, var(--lime))"
                : validation.status === "miss"
                  ? "var(--v7-red, var(--red))"
                  : "var(--v7-text-muted)",
          }}
        >
          {validation.status === "idle" && digits.length === 0 && "Enter a number"}
          {validation.status === "idle" && digits.length > 0 && "Numbers only"}
          {validation.status === "in-flight" && "Checking…"}
          {validation.status === "match" && `✓ ${validation.customer_name}`}
          {validation.status === "miss" && "Customer not found"}
        </span>
      </label>
    </div>
  );
}
