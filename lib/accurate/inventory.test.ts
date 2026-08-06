import assert from "node:assert/strict";
import test from "node:test";
import { parseAccurateSaveResponse } from "./inventory";

test("parses current Accurate save responses returned under r", () => {
  const result = parseAccurateSaveResponse(
    {
      r: { id: 39000, name: "Cap Badak Strawberry" },
      d: ['Barang & Jasa "Cap Badak Strawberry" berhasil disimpan'],
    },
    "Unable to save item",
  );

  assert.deepEqual(result, { id: 39000, name: "Cap Badak Strawberry" });
});

test("parses legacy Accurate save responses returned under d", () => {
  const result = parseAccurateSaveResponse(
    { s: true, d: { id: 42, r: "IA.2026.00042" } },
    "Unable to save adjustment",
  );

  assert.deepEqual(result, { id: 42, r: "IA.2026.00042" });
});

test("throws Accurate validation messages from failed save responses", () => {
  assert.throws(
    () => parseAccurateSaveResponse({ s: false, d: ["Invalid warehouse"] }, "Save failed"),
    /Invalid warehouse/,
  );
});
