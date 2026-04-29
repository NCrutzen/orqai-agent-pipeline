// Phase 61 hotfix. Override-category constants live OUTSIDE actions.ts
// because Next 15 enforces: a `"use server"` file can only export async
// functions. A non-function export (the readonly tuple below) breaks
// production builds with:
//   "A 'use server' file can only export async functions, found object."

export const OVERRIDE_CATEGORIES = [
  "payment",
  "auto_reply",
  "ooo_temporary",
  "ooo_permanent",
  "unknown",
] as const;

export type OverrideCategory = (typeof OVERRIDE_CATEGORIES)[number];
