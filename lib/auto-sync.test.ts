import assert from "node:assert/strict";
import test from "node:test";
import { autoSyncIntervalMs, startAutoSync } from "./auto-sync";

test("interval comes from the setting, with a floor and an off switch", () => {
  assert.equal(autoSyncIntervalMs(undefined), 60_000);
  assert.equal(autoSyncIntervalMs(""), 60_000);
  assert.equal(autoSyncIntervalMs("30"), 30_000);
  assert.equal(autoSyncIntervalMs("5"), 15_000);
  assert.equal(autoSyncIntervalMs("0"), 0);
  assert.equal(autoSyncIntervalMs("abc"), 60_000);
  assert.equal(autoSyncIntervalMs("-3"), 60_000);
});

test("one timer per process, a tick never overlaps the one before, and errors do not escape", async () => {
  let calls = 0;
  let release: () => void = () => undefined;
  const timers = { ticks: [] as (() => void)[] };
  const fake = {
    setTimeout: ((fn: () => void) => { timers.ticks.push(fn); return 0 as never; }) as unknown as typeof setTimeout,
    setInterval: ((fn: () => void) => { timers.ticks.push(fn); return 0 as never; }) as unknown as typeof setInterval,
  };
  const run = () => new Promise<{ status: string }>((resolve, reject) => {
    calls += 1;
    release = () => (calls === 1 ? resolve({ status: "unchanged" }) : reject(new Error("boom")));
  });

  const none = async () => undefined;
  const stop = startAutoSync(run, 60_000, fake, 5_000, none);
  const again = startAutoSync(run, 60_000, fake, 5_000, none);
  assert.equal(again, stop);
  assert.equal(timers.ticks.length, 2);

  timers.ticks[0]();
  timers.ticks[1]();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
  release();
  await new Promise((resolve) => setImmediate(resolve));

  timers.ticks[1]();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 2);
  release();
  await new Promise((resolve) => setImmediate(resolve));
  stop();
  assert.equal(startAutoSync(run, 0, fake, 5_000, none)(), undefined);
});

test("each tick also asks the permission retry, and an error there does not stop the sync", async () => {
  const ticks: (() => void)[] = [];
  const fake = {
    setTimeout: ((fn: () => void) => { ticks.push(fn); return 0 as never; }) as unknown as typeof setTimeout,
    setInterval: ((fn: () => void) => { ticks.push(fn); return 0 as never; }) as unknown as typeof setInterval,
  };
  const order: string[] = [];
  const quiet = console.error;
  console.error = () => undefined;
  try {
    const stop = startAutoSync(
      async () => { order.push("sync"); return { status: "unchanged" }; },
      60_000,
      fake,
      5_000,
      async () => { order.push("permissions"); throw new Error("down"); },
    );
    ticks[1]();
    await new Promise((resolve) => setImmediate(resolve));
    stop();
  } finally {
    console.error = quiet;
  }
  assert.deepEqual(order, ["permissions", "sync"]);
});
