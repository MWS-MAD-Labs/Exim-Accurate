import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

export type ComparisonMode = "previous" | "year" | "custom";

const DATE_FORMAT = "YYYY-MM-DD";
const MAX_RANGE_DAYS = 366;

function parseDate(value: string) {
  const date = dayjs.utc(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !date.isValid() || date.format(DATE_FORMAT) !== value) {
    throw new Error("Invalid date: expected YYYY-MM-DD calendar date");
  }
  return date;
}

function validatePeriod(start: string, end: string) {
  const first = parseDate(start);
  const last = parseDate(end);
  const days = last.diff(first, "day") + 1;
  if (days < 1) throw new Error("Invalid date range: start must not be after end");
  if (days > MAX_RANGE_DAYS) throw new Error(`Date range cannot exceed ${MAX_RANGE_DAYS} days`);
  return { start, end, days };
}

export function resolveComparisonPeriod(
  start: string,
  end: string,
  mode: ComparisonMode,
  customStart?: string,
  customEnd?: string,
): { start: string; end: string; days: number } {
  const current = validatePeriod(start, end);
  if (mode === "custom") {
    if (customStart === undefined || customEnd === undefined) {
      throw new Error("Custom comparison requires comparisonStart and comparisonEnd");
    }
    return validatePeriod(customStart, customEnd);
  }
  if (customStart !== undefined || customEnd !== undefined) {
    throw new Error("Comparison dates require custom comparison mode");
  }
  if (mode === "previous") {
    const first = parseDate(start);
    return validatePeriod(
      first.subtract(current.days, "day").format(DATE_FORMAT),
      first.subtract(1, "day").format(DATE_FORMAT),
    );
  }
  if (mode === "year") {
    // Dayjs clamps February 29 to February 28 in a non-leap target year.
    return validatePeriod(
      parseDate(start).subtract(1, "year").format(DATE_FORMAT),
      parseDate(end).subtract(1, "year").format(DATE_FORMAT),
    );
  }
  throw new Error("Invalid comparison mode");
}
