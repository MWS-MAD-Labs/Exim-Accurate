import crypto from "crypto";

interface AccurateCredentials {
  apiToken: string;
  signatureSecret: string;
  host?: string;
  session?: string;
}

interface AccurateFetchOptions extends RequestInit {
  method?: string;
  body?: any;
}

/**
 * Build Accurate API headers with HMAC-SHA256 signature
 */
export function buildAccurateHeaders(
  apiToken: string,
  signatureSecret: string
): Record<string, string> {
  // Generate ISO timestamp
  const timestamp = new Date().toISOString();

  // Create HMAC-SHA256 signature
  const signature = crypto
    .createHmac("sha256", signatureSecret)
    .update(timestamp)
    .digest("base64");

  return {
    Authorization: `Bearer ${apiToken}`,
    "X-Api-Timestamp": timestamp,
    "X-Api-Signature": signature,
    "X-Language-Profile": "US",
    "Content-Type": "application/json",
  };
}

/**
 * Resolve Accurate host from legacy API token (non-OAuth)
 */
export async function resolveHostFromApiToken(apiToken: string): Promise<string> {
  const response = await fetch("https://account.accurate.id/api/api-token.do", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "api_token",
      api_token: apiToken,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to resolve host: ${response.statusText}`);
  }

  const data = await response.json();

  if (!data.sp?.webApiUrl) {
    throw new Error("Host URL not found in response");
  }

  return data.sp.webApiUrl; // e.g., https://zeus.accurate.id
}

/**
 * Resolve Accurate host from OAuth access token
 * 1. Get database list from db-list.do
 * 2. Open the first database via open-db.do to get session/host
 */
export async function resolveHost(accessToken: string): Promise<{ host: string; session: string; dbId: number }> {
  // Step 1: Get database list
  const dbListResponse = await fetch("https://account.accurate.id/api/db-list.do", {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
    },
  });

  if (!dbListResponse.ok) {
    throw new Error(`Failed to get Accurate database list (${dbListResponse.status})`);
  }

  const dbListData = await dbListResponse.json();

  if (!dbListData.s || !dbListData.d || !Array.isArray(dbListData.d) || dbListData.d.length === 0) {
    throw new Error("No databases found in Accurate account");
  }

  const dbId = dbListData.d[0].id;
  console.log("Opening database ID:", dbId);

  // Step 2: Open the database to get session and host
  const openDbResponse = await fetch(`https://account.accurate.id/api/open-db.do?id=${dbId}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
    },
  });

  if (!openDbResponse.ok) {
    throw new Error(`Failed to open Accurate database (${openDbResponse.status})`);
  }

  const openDbData = await openDbResponse.json();

  if (!openDbData.s) {
    throw new Error("Accurate refused to open the selected database");
  }

  const host = openDbData.host;
  const session = openDbData.session;

  if (!host || !session) {
    throw new Error("Missing host or session in Accurate open-db response");
  }

  return {
    host: host.startsWith("http") ? host : `https://${host}`,
    session,
    dbId,
  };
}

/**
 * Refresh session by calling open-db.do with the stored access token and database ID
 * Returns a fresh session token
 */
export async function refreshSession(accessToken: string, dbId: number): Promise<{ host: string; session: string }> {
  console.log(`[refreshSession] Refreshing session for database ${dbId}...`);

  const openDbResponse = await fetch(`https://account.accurate.id/api/open-db.do?id=${dbId}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
    },
  });

  if (!openDbResponse.ok) {
    throw new Error(`Failed to refresh Accurate session (${openDbResponse.status})`);
  }

  const openDbData = await openDbResponse.json();

  if (!openDbData.s) {
    throw new Error("Accurate refused to refresh the database session");
  }

  return {
    host: openDbData.host.startsWith("http") ? openDbData.host : `https://${openDbData.host}`,
    session: openDbData.session,
  };
}

/**
 * Refresh the OAuth access token using the refresh token
 * Returns new access token and optionally a new refresh token
 */
export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<{ accessToken: string; refreshToken?: string }> {
  console.log("[refreshAccessToken] Refreshing access token...");

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch("https://account.accurate.id/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const providerError =
      errorBody && typeof errorBody.error === "string"
        ? errorBody.error
        : "unknown_error";
    console.error(
      `[refreshAccessToken] Accurate rejected token refresh: status=${response.status} error=${providerError}`,
    );
    throw new Error(`Failed to refresh Accurate access token (${response.status})`);
  }

  const data = await response.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
  };
}

/**
 * Rate limiter for Accurate API (8 req/sec, 8 concurrent)
 */
export class RateLimiter {
  private queue: Array<() => void> = [];
  private activeRequests = 0;
  private maxConcurrent = 8;
  private requestsPerSecond = 8;
  private lastRequestTime = 0;
  private minInterval: number;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.minInterval = 1000 / this.requestsPerSecond;
  }

  async acquire(): Promise<void> {
    return new Promise((resolve) => {
      this.queue.push(resolve);
      this.processQueue();
    });
  }

  release(): void {
    this.activeRequests--;
    this.processQueue();
  }

  private processQueue() {
    if (this.queue.length === 0) {
      return;
    }

    if (this.activeRequests >= this.maxConcurrent) {
      return;
    }

    if (this.timeoutId) {
      return;
    }

    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    const waitTime = this.minInterval - timeSinceLastRequest;

    if (waitTime <= 0) {
      const resolve = this.queue.shift();
      if (resolve) {
        this.activeRequests++;
        this.lastRequestTime = Date.now();
        resolve();
        // Try to process the next item immediately
        this.processQueue();
      }
    } else {
      this.timeoutId = setTimeout(() => {
        this.timeoutId = null;
        this.processQueue();
      }, waitTime);
    }
  }
}

const rateLimiter = new RateLimiter();

/**
 * Wrapper for Accurate API fetch with rate limiting
 * Uses OAuth Bearer token authentication
 */
export async function accurateFetch<T = any>(
  path: string,
  credentials: AccurateCredentials,
  options: AccurateFetchOptions = {}
): Promise<T> {
  if (!credentials.host) {
    throw new Error("Host is required. Call resolveHost first.");
  }

  if (!credentials.session) {
    throw new Error("Session is required. Re-connect to Accurate to get a new session.");
  }

  await rateLimiter.acquire();

  try {
    // URL includes /accurate prefix as per API documentation
    const url = `${credentials.host}/accurate${path}`;

    // Generate timestamp and signature for HMAC-SHA256 auth
    const timestamp = new Date().toISOString();
    const signature = crypto
      .createHmac("sha256", credentials.signatureSecret)
      .update(timestamp)
      .digest("base64");

    // Use Bearer token, X-Session-ID, and HMAC signature headers
    const headers: Record<string, string> = {
      "Authorization": `Bearer ${credentials.apiToken}`,
      "X-Session-ID": credentials.session,
      "X-Api-Timestamp": timestamp,
      "X-Api-Signature": signature,
      "Content-Type": "application/json",
    };

    console.log(
      `Accurate API request: ${(options.method || "GET").toUpperCase()} ${new URL(url).pathname}`,
    );

    const response = await fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });


    console.log(`Accurate API response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Accurate API request failed with status ${response.status}`);

      if (response.status === 403 && errorText.includes("insufficient_scope")) {
        const requiredScope = errorText.match(/<scope>([^<]+)<\/scope>/)?.[1];
        throw new Error(
          requiredScope
            ? `Accurate authorization is missing the ${requiredScope} permission. Reconnect the Accurate account, approve the requested permissions, then retry.`
            : "Accurate authorization is missing a required permission. Reconnect the Accurate account, approve the requested permissions, then retry."
        );
      }

      throw new Error(`Accurate API request failed with status ${response.status}`);
    }

    const responseText = await response.text();

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      console.error("Failed to parse Accurate API JSON response");
      throw new Error("Failed to parse Accurate API response");
    }

    // Check for Accurate-specific error responses
    // Accurate returns { s: boolean, d: data/error array }
    if (data.s === false) {
      const messages = Array.isArray(data.d)
        ? data.d
        : Array.isArray(data.d_message)
          ? data.d_message
          : [];
      const detail = messages.find((message: unknown) => typeof message === "string" && message.trim());
      throw new Error(
        typeof detail === "string"
          ? `Accurate API returned an unsuccessful response: ${detail}`
          : "Accurate API returned an unsuccessful response",
      );
    }

    return data;
  } finally {
    rateLimiter.release();
  }
}
