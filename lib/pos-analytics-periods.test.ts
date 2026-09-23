import assert from "node:assert/strict";
import test from "node:test";
import { resolveComparisonPeriod, type ComparisonMode } from "./pos-analytics-periods";

test("previous comparison uses an adjacent equal-length inclusive period", () => {
  assert.deepEqual(resolveComparisonPeriod("2026-01-01", "2026-01-01", "previous"), {
    start: "2025-12-31", end: "2025-12-31", days: 1,
  });
  assert.deepEqual(resolveComparisonPeriod("2024-03-01", "2024-03-31", "previous"), {
    start: "2024-01-30", end: "2024-02-29", days: 31,
  });
});

test("previous comparison accepts the inclusive 366-day limit", () => {
  assert.deepEqual(resolveComparisonPeriod("2024-01-01", "2024-12-31", "previous"), {
    start: "2022-12-31", end: "2023-12-31", days: 366,
  });
});

test("year comparison subtracts a calendar year and clamps leap day", () => {
  assert.deepEqual(resolveComparisonPeriod("2024-02-29", "2024-02-29", "year"), {
    start: "2023-02-28", end: "2023-02-28", days: 1,
  });
  assert.deepEqual(resolveComparisonPeriod("2024-02-28", "2024-03-01", "year"), {
    start: "2023-02-28", end: "2023-03-01", days: 2,
  });
  assert.deepEqual(resolveComparisonPeriod("2025-02-28", "2025-03-01", "year"), {
    start: "2024-02-28", end: "2024-03-01", days: 3,
  });
  assert.deepEqual(resolveComparisonPeriod("2024-01-01", "2024-12-31", "year"), {
    start: "2023-01-01", end: "2023-12-31", days: 365,
  });
});

test("custom comparison can have a different inclusive length", () => {
  assert.deepEqual(resolveComparisonPeriod("2026-09-01", "2026-09-30", "custom", "2024-02-29", "2024-02-29"), {
    start: "2024-02-29", end: "2024-02-29", days: 1,
  });
  assert.deepEqual(resolveComparisonPeriod("2026-09-01", "2026-09-30", "custom", "2024-01-01", "2024-12-31"), {
    start: "2024-01-01", end: "2024-12-31", days: 366,
  });
});

for (const invalid of ["", "not-a-date", "2026-2-01", "2026-02-1", "2026-02-29", "2024-02-30", "2026-04-31", "2026-00-01", "2026-13-01", "2026-01-00", "2026-01-32", "2026-01-01T00:00:00Z", " 2026-01-01"]) {
  test(`rejects invalid calendar date ${JSON.stringify(invalid)} in every date argument`, () => {
    assert.throws(() => resolveComparisonPeriod(invalid, "2026-09-30", "previous"), /Invalid date/);
    assert.throws(() => resolveComparisonPeriod("2026-09-01", invalid, "year"), /Invalid date/);
    assert.throws(() => resolveComparisonPeriod("2026-09-01", "2026-09-30", "custom", invalid, "2026-09-30"), /Invalid date/);
    assert.throws(() => resolveComparisonPeriod("2026-09-01", "2026-09-30", "custom", "2026-09-01", invalid), /Invalid date/);
  });
}

test("all modes reject reversed and oversized current ranges", () => {
  for (const mode of ["previous", "year", "custom"] as const) {
    const custom = mode === "custom" ? ["2025-01-01", "2025-01-01"] as const : [] as const;
    assert.throws(() => resolveComparisonPeriod("2026-09-30", "2026-09-01", mode, ...custom), /start must not be after end/);
    assert.throws(() => resolveComparisonPeriod("2024-01-01", "2025-01-01", mode, ...custom), /cannot exceed 366/);
  }
});

test("custom comparison requires both dates, ordered and at most 366 days", () => {
  for (const [start, end] of [[undefined, undefined], ["2026-01-01", undefined], [undefined, "2026-01-01"]]) {
    assert.throws(() => resolveComparisonPeriod("2026-09-01", "2026-09-30", "custom", start, end), /requires comparisonStart and comparisonEnd/);
  }
  assert.throws(() => resolveComparisonPeriod("2026-09-01", "2026-09-30", "custom", "2026-01-02", "2026-01-01"), /start must not be after end/);
  assert.throws(() => resolveComparisonPeriod("2026-09-01", "2026-09-30", "custom", "2024-01-01", "2025-01-01"), /cannot exceed 366/);
});

test("year comparison also validates the resulting range limit", () => {
  assert.throws(() => resolveComparisonPeriod("2025-01-01", "2026-01-01", "year"), /cannot exceed 366/);
});

test("rejects unknown modes and custom dates outside custom mode", () => {
  assert.throws(() => resolveComparisonPeriod("2026-09-01", "2026-09-30", "invalid" as ComparisonMode), /Invalid comparison mode/);
  for (const mode of ["previous", "year"] as const) {
    for (const [start, end] of [["2026-01-01", undefined], [undefined, "2026-01-01"], ["2026-01-01", "2026-01-02"]]) {
      assert.throws(() => resolveComparisonPeriod("2026-09-01", "2026-09-30", mode, start, end), /require custom comparison mode/);
    }
  }
});

test("day counts are unaffected by daylight-saving transitions", () => {
  assert.deepEqual(resolveComparisonPeriod("2026-03-07", "2026-03-10", "previous"), {
    start: "2026-03-03", end: "2026-03-06", days: 4,
  });
});
