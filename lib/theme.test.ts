import assert from "node:assert/strict";
import test from "node:test";
import { theme } from "@/lib/theme";

test("checkboxes are squares, not the round shape the default radius would give", () => {
  assert.equal(theme.components?.Checkbox?.defaultProps?.radius, "xs");
});
