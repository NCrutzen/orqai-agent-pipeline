/**
 * Shared types for the Uren Controle automation.
 *
 * The parser (excel-parser.ts) produces ParsedHourCalculation.
 * The rules engine (rules.ts) consumes it and emits FlaggedRow[].
 * The Inngest function persists those rows with suppressed_by_exception.
 */

export type Environment = "production" | "acceptance" | "test";

export type EmployeeCategory = "monteur" | "detexie" | "kantoor" | "onbekend";

export type DayData = {
  /** YYYY-MM-DD */
  date: string;
  // T&T (Track & Trace) times — prefix i
  iar?: string;
  iaw?: string;
  iew?: string;
  ier?: string;
  // Urenbriefje (timesheet) times — prefix u
  uar?: string;
  uaw?: string;
  uew?: string;
  uer?: string;
  // Daadwerkelijk (final) times — no prefix
  ar?: string;
  aw?: string;
  ew?: string;
  er?: string;
  /** Diff in hours between registered and actually worked */
  verschil?: number;
  /** Verzuim code: 'ziekte' | 'vakantie' | 'atv' | 'verlof' | ... (case-insensitive) */
  verzuim?: string;
};

export type EmployeeData = {
  name: string;
  category: EmployeeCategory;
  days: DayData[];
};

export type ParsedHourCalculation = {
  /** YYYY-MM — extracted from filename or sheet title */
  period: string;
  employees: EmployeeData[];
  mutaties: Record<string, unknown>[];
  storingsdienst: Record<string, unknown>[];
  bonus: Record<string, unknown>[];
};

export type RuleType =
  | "tnt_mismatch"
  | "verschil_outlier"
  | "weekend_flip"
  | "verzuim_bcs_duplicate";

export type FlaggedRow = {
  employeeName: string;
  employeeCategory: EmployeeCategory;
  ruleType: RuleType;
  severity: "review" | "warning" | "info";
  dayDate: string | null;
  weekNumber: number | null;
  rawValues: Record<string, unknown>;
  description: string;
};

export type KnownException = {
  employeeName: string;
  ruleType: RuleType;
  reason: string;
};
