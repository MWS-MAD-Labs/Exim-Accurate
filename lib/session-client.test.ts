import assert from "node:assert/strict";
import test from "node:test";
import { checkSession, sessionEnded } from "./session-client";

test("only signed out and access taken away end the session, server hiccups do not", () => {
  assert.equal(sessionEnded(401), true);
  assert.equal(sessionEnded(403), true);
  for (const status of [200, 500, 502, 503, 504]) assert.equal(sessionEnded(status), false);
});

function fakeFetch(answers: Record<string, number[]>) {
  const calls: string[] = [];
  const impl = (async (url: string) => {
    calls.push(url);
    const status = answers[url].shift();
    if (status === undefined) throw new TypeError("Failed to fetch");
    return new Response(null, { status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const REFRESH = "http://hub.test/auth/refresh";

test("a token that expired during a break is renewed before the session is judged", async () => {
  const { impl, calls } = fakeFetch({ "/api/session": [401, 200], [REFRESH]: [200] });
  assert.equal(await checkSession(REFRESH, impl), 200);
  assert.deepEqual(calls, ["/api/session", REFRESH, "/api/session"]);
});

test("the session ends when the Hub also refuses to renew", async () => {
  const { impl } = fakeFetch({ "/api/session": [401], [REFRESH]: [401] });
  assert.equal(await checkSession(REFRESH, impl), 401);
});

test("an unreachable Hub does not end the session", async () => {
  const { impl } = fakeFetch({ "/api/session": [401], [REFRESH]: [] });
  assert.equal(sessionEnded(await checkSession(REFRESH, impl)), false);
});

test("a valid session or taken away access needs no renewal", async () => {
  for (const status of [200, 403]) {
    const { impl, calls } = fakeFetch({ "/api/session": [status], [REFRESH]: [] });
    assert.equal(await checkSession(REFRESH, impl), status);
    assert.deepEqual(calls, ["/api/session"]);
  }
});
