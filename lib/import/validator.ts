import { z } from "zod";
import { findItemByCode } from "@/lib/accurate/inventory";

export const ImportRowSchema = z.object({
  itemCode: z.string().min(1, "Item code is required"),
  itemName: z.string().optional(),
  type: z.enum(["Penambahan", "Pengurangan"], {
    error: 'Type must be "Penambahan" or "Pengurangan"',
  }),
  quantity: z.number().positive("Quantity must be positive"),
  unit: z.string().min(1, "Unit is required"),
  adjustmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
  referenceNumber: z.string().optional(),
  warehouse: z.string().optional(),
  description: z.string().optional(),
});

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  itemId?: number;
  itemName?: string;
}

export interface ImportRow {
  itemCode: string;
  itemName?: string;
  type: string;
  quantity: number;
  unit: string;
  adjustmentDate: string;
  referenceNumber?: string;
  warehouse?: string;
  description?: string;
}

/**
 * Validate a single import row
 */
export async function validateImportRow(
  row: ImportRow,
  credentials: {
    apiToken: string;
    signatureSecret: string;
    host: string;
    session?: string;
  },
  rowIndex: number
): Promise<ValidationResult> {
  const errors: string[] = [];

  // Schema validation
  try {
    ImportRowSchema.parse(row);
  } catch (err) {
    if (err instanceof z.ZodError) {
      errors.push(...err.issues.map((issue) => `Row ${rowIndex}: ${issue.message}`));
    }
  }

  // Check if item exists in Accurate
  let itemId: number | undefined;
  let itemName: string | undefined;

  try {
    const item = await findItemByCode(credentials, row.itemCode);
    if (!item) {
      errors.push(`Row ${rowIndex}: Item code "${row.itemCode}" not found in Accurate`);
    } else {
      itemId = item.id;
      itemName = item.name;
    }
  } catch (err: any) {
    errors.push(`Row ${rowIndex}: Failed to validate item code: ${err.message}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    itemId,
    itemName,
  };
}

/**
 * Validate all import rows
 */
export async function validateImportRows(
  rows: ImportRow[],
  credentials: {
    apiToken: string;
    signatureSecret: string;
    host: string;
    session?: string;
  }
): Promise<{
  valid: boolean;
  results: Array<ValidationResult & { row: ImportRow }>;
  errors: string[];
}> {
  const results: Array<ValidationResult & { row: ImportRow }> = [];
  const allErrors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const result = await validateImportRow(rows[i], credentials, i + 2); // +2 for 1-indexed and header row
    results.push({ ...result, row: rows[i] });

    if (!result.valid) {
      allErrors.push(...result.errors);
    }
  }

  return {
    valid: allErrors.length === 0,
    results,
    errors: allErrors,
  };
}
