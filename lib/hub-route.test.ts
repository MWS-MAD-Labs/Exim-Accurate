import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { NextRequest } from "next/server";
import { GET } from "@/app/auth/hub/route";

describe("GET /auth/hub", () => {
  const original = process.env.HUB_BASE_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.HUB_BASE_URL;
    else process.env.HUB_BASE_URL = original;
  });

  it("sends the person to the Hub front page", async () => {
    process.env.HUB_BASE_URL = "https://hub.example.com";
    const response = await GET(new NextRequest("https://exima.example.com/auth/hub"));
    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), "https://hub.example.com/");
  });

  it("falls back to the login page when the Hub is not set", async () => {
    delete process.env.HUB_BASE_URL;
    const response = await GET(new NextRequest("https://exima.example.com/auth/hub"));
    assert.equal(new URL(response.headers.get("location") ?? "").pathname, "/login");
  });
});
