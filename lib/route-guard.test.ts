import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { NextRequest } from "next/server";
import { config, requiredPermissions } from "../proxy";

// Every page and route of the app, as the address it answers on (a [folder] becomes "x", a (group) is left out).
const appRoot = new URL("../app", import.meta.url).pathname;
type Entry = { path: string; file: string; kind: "route" | "page" };

function collect(dir: string, parts: string[], found: Entry[]) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      collect(full, name.startsWith("(") ? parts : [...parts, name.replace(/^\[\.*(.+)\]$/, "x")], found);
    } else if (name === "route.ts" || name === "page.tsx") {
      found.push({ path: `/${parts.join("/")}`, file: full, kind: name === "route.ts" ? "route" : "page" });
    }
  }
  return found;
}

const entries = collect(appRoot, [], []);
const matcher = config.matcher.map((pattern) => new RegExp(`^${pattern.replace(/[.]/g, "\\.").replace(/\/:path\*$/, "(?:/.*)?")}$`));
const guarded = (path: string) => matcher.some((pattern) => pattern.test(path));

// What the proxy leaves alone, and what guards it instead. A new route that is not guarded and not listed here fails the test.
const OWN_GUARD: { match: RegExp; guard: string; proof: RegExp }[] = [
  { match: /^\/api\/cron\//, guard: "the cron secret", proof: /CRON_SECRET/ },
  { match: /^\/api\/me\/badge$/, guard: "the signed-in session", proof: /getServerSession/ },
  { match: /^\/api\/session$/, guard: "reads the Hub session itself", proof: /fromCookieHeader/ },
  { match: /^\/auth\/(sso|hub)$/, guard: "only sends the browser on, checks the Hub session itself", proof: /hubSession|hubHomeUrl/ },
  { match: /^\/login\/hub$/, guard: "only sends the browser to the Hub", proof: /hubHomeUrl/ },
  { match: /^\/api\/health$/, guard: "open on purpose, it only says ok and which version runs", proof: /healthBody/ },
];
const PUBLIC_PAGES = new Set(["/", "/sign-in", "/terms"]);

test("every route is guarded by the proxy, by a guard of its own, or listed as public", () => {
  const loose = entries.filter((entry) => !guarded(entry.path)).filter((entry) => {
    if (entry.kind === "page" && PUBLIC_PAGES.has(entry.path)) return false;
    const rule = OWN_GUARD.find((item) => item.match.test(entry.path));
    return !rule;
  });
  assert.deepEqual(loose.map((entry) => entry.path), []);
});

test("a route with a guard of its own really has it", () => {
  const missing: string[] = [];
  for (const entry of entries.filter((item) => !guarded(item.path) && item.kind === "route")) {
    const rule = OWN_GUARD.find((item) => item.match.test(entry.path));
    if (rule && !rule.proof.test(readFileSync(entry.file, "utf8"))) missing.push(`${entry.path} (${rule.guard})`);
  }
  assert.deepEqual(missing, []);
});

test("every route the proxy guards asks for a permission, otherwise everybody is turned away", () => {
  const without = entries
    .filter((entry) => guarded(entry.path) && entry.path !== "/login")
    .filter((entry) => requiredPermissions(new NextRequest(`http://localhost${entry.path}`)).length === 0);
  assert.deepEqual(without.map((entry) => entry.path), []);
});
