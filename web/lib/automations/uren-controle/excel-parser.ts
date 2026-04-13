import type { ParsedHourCalculation } from "./types";

/**
 * Parse the Hour Calculation Excel into a normalised TypeScript model.
 *
 * Task 1: skeleton that returns an empty shape so the Inngest function
 * typechecks. Task 2 (TDD) replaces this with the real ExcelJS parser
 * and is validated against web/lib/automations/uren-controle/__fixtures__/sample.xlsx.
 */
export async function parseHourCalculationExcel(
  _buffer: Buffer,
): Promise<ParsedHourCalculation> {
  throw new Error(
    "parseHourCalculationExcel: not yet implemented (Task 2 will fill this in).",
  );
}
