import assert from "node:assert/strict";
import test from "node:test";
import { CentralError, errorForNetwork, errorForResponse, failureForStatus, isUnreachable } from "./central-errors";

test("statuses fall into asking again, not deployed yet, or no", () => {
  assert.equal(failureForStatus(503), "unreachable");
  assert.equal(failureForStatus(500), "unreachable");
  assert.equal(failureForStatus(429), "unreachable");
  assert.equal(failureForStatus(404), "missing");
  for (const status of [400, 401, 403, 409, 422]) assert.equal(failureForStatus(status), "rejected");
});

test("messages say what to do", () => {
  assert.match(errorForResponse(404).message, /deploy Central first/);
  assert.match(errorForResponse(409, "This list drops 3 of 4").message, /drops 3 of 4/);
  assert.equal(errorForResponse(502).kind, "unreachable");
  const network = errorForNetwork(new Error("fetch failed"));
  assert.equal(network.kind, "unreachable");
  assert.match(network.message, /fetch failed/);
});

test("only an unreachable Central counts as unreachable", () => {
  assert.equal(isUnreachable(new CentralError("x", "unreachable")), true);
  assert.equal(isUnreachable(new CentralError("x", "rejected")), false);
  assert.equal(isUnreachable(new Error("x")), false);
});
