import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { centralApiBase, centralApiToken, centralConnection } from "./central-config";

const NAMES = ["CENTRAL_API_BASE_URL", "CENTRAL_API_TOKEN", "CENTRAL_DATA_API_BASE_URL", "CENTRAL_DATA_API_TOKEN"];
const saved = Object.fromEntries(NAMES.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const name of NAMES) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

function clear() {
  for (const name of NAMES) delete process.env[name];
}

test("the names every application gets are read as they are", () => {
  clear();
  process.env.CENTRAL_API_BASE_URL = "https://db.mws.web.id/api/internal/";
  process.env.CENTRAL_API_TOKEN = " mws_a.b ";
  assert.equal(centralApiBase(), "https://db.mws.web.id/api/internal");
  assert.equal(centralApiToken(), "mws_a.b");
  assert.deepEqual(centralConnection(), { base: "https://db.mws.web.id/api/internal", token: "mws_a.b" });
});

test("the older names still work, with /api/internal added to the address", () => {
  clear();
  process.env.CENTRAL_DATA_API_BASE_URL = "http://localhost:3000/";
  process.env.CENTRAL_DATA_API_TOKEN = "old";
  assert.equal(centralApiBase(), "http://localhost:3000/api/internal");
  assert.equal(centralApiToken(), "old");
});

test("the new names win when both are set, and nothing is returned when one is missing", () => {
  clear();
  process.env.CENTRAL_API_BASE_URL = "https://new/api/internal";
  process.env.CENTRAL_DATA_API_BASE_URL = "https://old";
  process.env.CENTRAL_API_TOKEN = "new";
  process.env.CENTRAL_DATA_API_TOKEN = "old";
  assert.equal(centralApiBase(), "https://new/api/internal");
  assert.equal(centralApiToken(), "new");
  delete process.env.CENTRAL_API_TOKEN;
  delete process.env.CENTRAL_DATA_API_TOKEN;
  assert.equal(centralConnection(), null);
});
