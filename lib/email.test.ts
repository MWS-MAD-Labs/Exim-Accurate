import assert from "node:assert/strict";
import { createVerify, generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { parseServiceAccount, sendWithGmail, serviceAccountAssertion } from "./email";

// A throwaway key, generated for the test. The real key never appears in tests.
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const keyJson = JSON.stringify({
  type: "service_account",
  client_email: "sade-mailer@example.iam.gserviceaccount.com",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  token_uri: "https://oauth2.googleapis.com/token",
});

test("service account credentials are read from JSON or from base64 of it", () => {
  assert.equal(parseServiceAccount(keyJson).client_email, "sade-mailer@example.iam.gserviceaccount.com");
  assert.equal(parseServiceAccount(Buffer.from(keyJson).toString("base64")).client_email, "sade-mailer@example.iam.gserviceaccount.com");
  assert.throws(() => parseServiceAccount(JSON.stringify({ type: "authorized_user" })), /service account key/);
  assert.throws(() => parseServiceAccount("not json"), /not valid JSON/);
});

test("the assertion acts as the sender, asks only gmail.send, and is signed by the key", () => {
  const assertion = serviceAccountAssertion(parseServiceAccount(keyJson), "no-reply@example.org", 1_000);
  const [header, claims, signature] = assertion.split(".");
  const body = JSON.parse(Buffer.from(claims, "base64url").toString());
  assert.deepEqual(body, {
    iss: "sade-mailer@example.iam.gserviceaccount.com",
    sub: "no-reply@example.org",
    scope: "https://www.googleapis.com/auth/gmail.send",
    aud: "https://oauth2.googleapis.com/token",
    iat: 1_000,
    exp: 4_600,
  });
  const valid = createVerify("RSA-SHA256").update(`${header}.${claims}`).verify(publicKey, Buffer.from(signature, "base64url"));
  assert.equal(valid, true);
});

test("a message goes out through the Gmail API as the configured sender", async () => {
  process.env.GMAIL_CREDENTIALS_JSON = keyJson;
  process.env.GMAIL_SENDER_EMAIL = "no-reply@example.org";
  process.env.GMAIL_SENDER_NAME = "Sade Notifications";
  const calls: { url: string; init: RequestInit }[] = [];
  const fakeFetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (url.includes("oauth2")) return Response.json({ access_token: "token-1", expires_in: 3600 });
    return Response.json({ id: "gmail-message-1" });
  }) as unknown as typeof fetch;

  const result = await sendWithGmail(
    { to: "staff@example.org", subject: "Terima kasih", text: "Halo", html: "<p>Halo</p>" },
    fakeFetch,
  );

  assert.deepEqual(result, { provider: "gmail", id: "gmail-message-1", accepted: ["staff@example.org"], rejected: [] });
  assert.equal(calls.length, 2);
  assert.equal((calls[1].init.headers as Record<string, string>).authorization, "Bearer token-1");
  const raw = Buffer.from(JSON.parse(String(calls[1].init.body)).raw, "base64url").toString();
  assert.match(raw, /^From: Sade Notifications <no-reply@example\.org>/m);
  assert.match(raw, /^To: staff@example\.org/m);
  assert.match(raw, /^Subject: Terima kasih/m);
});
