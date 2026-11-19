import assert from "node:assert/strict";
import test from "node:test";
import { BUSY, singleFlight } from "./single-flight";

test("a call made while a run is going does not start another", async () => {
  let started = 0;
  let release: () => void = () => {};
  const run = singleFlight(() => {
    started += 1;
    return new Promise<string>((resolve) => {
      release = () => resolve("done");
    });
  }, 60_000);

  const first = run();
  assert.equal(await run(), BUSY);
  assert.equal(started, 1);
  release();
  assert.equal(await first, "done");
});

test("the next call starts a new run once the last one has ended, also after it failed", async () => {
  let started = 0;
  const run = singleFlight(async () => {
    started += 1;
    if (started === 1) throw new Error("boom");
    return started;
  }, 60_000);

  await assert.rejects(run(), /boom/);
  assert.equal(await run(), 2);
  assert.equal(started, 2);
});

test("a run that never ends stops blocking after the stale time", async () => {
  let clock = 0;
  let started = 0;
  const run = singleFlight(() => {
    started += 1;
    return new Promise<never>(() => {});
  }, 1000, () => clock);

  void run();
  clock = 999;
  assert.equal(await run(), BUSY);
  clock = 1000;
  void run();
  assert.equal(started, 2);
});
