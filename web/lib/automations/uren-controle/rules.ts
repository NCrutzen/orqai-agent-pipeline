import type {
  DayData,
  EmployeeData,
  FlaggedRow,
  KnownException,
  ParsedHourCalculation,
} from "./types";
import { shouldSuppress } from "./known-exceptions";

/**
 * Rules engine skeleton. Task 2 (TDD) fills in the real detection logic
 * and unit tests. The signatures below are the contract consumed by
 * uren-controle-process.ts and the dashboard.
 */

// Thresholds — documented in README, surfaced for future tuning.
export const TNT_MISMATCH_MINUTES_THRESHOLD = 30;
export const VERSCHIL_OUTLIER_HOURS_THRESHOLD = 2;

export function detectTnTMismatch(
  _day: DayData,
  _employee: EmployeeData,
): FlaggedRow | null {
  // Task 2 implements the real comparison of i* vs u* times.
  return null;
}

export function detectVerschilOutlier(
  _day: DayData,
  _employee: EmployeeData,
): FlaggedRow | null {
  return null;
}

export function detectWeekendFlip(_employee: EmployeeData): FlaggedRow[] {
  return [];
}

export function detectVerzuimBcsDuplicate(
  _employee: EmployeeData,
): FlaggedRow[] {
  return [];
}

export function runAllRules(
  _parsed: ParsedHourCalculation,
  _exceptions: KnownException[],
): FlaggedRow[] {
  return [];
}

export function isSuppressed(
  flag: FlaggedRow,
  exceptions: KnownException[],
): boolean {
  return shouldSuppress(exceptions, flag.employeeName, flag.ruleType);
}
