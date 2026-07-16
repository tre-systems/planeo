// Server-only helper — NOT a "use server" module. A "use server" directive
// here would publish getGoogleAccessToken as an anonymous public server-action
// endpoint handing out the service account's OAuth token.
import "server-only";

import { z } from "zod";

import { retry } from "./retry";

// Mints a Google Cloud OAuth2 access token from a service-account key using the
// Web Crypto API (RS256), so it works on the Cloudflare Workers runtime (the
// gRPC @google-cloud/* client libraries do not). Used by the TTS REST call.

const ServiceAccountSchema = z.object({
  client_email: z.string().email(),
  private_key: z.string(),
  token_uri: z.string().url().default("https://oauth2.googleapis.com/token"),
});

const SCOPE = "https://www.googleapis.com/auth/cloud-platform";

let cached: { token: string; expiresAt: number } | null = null;

const base64url = (input: ArrayBuffer | string): string => {
  const bytes =
    typeof input === "string"
      ? new TextEncoder().encode(input)
      : new Uint8Array(input);
  let binary = "";
  for (let i = 0; i < bytes.length; i++)
    binary += String.fromCharCode(bytes[i]);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

const pemToPkcs8 = (pem: string): ArrayBuffer => {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
};

const signJwt = async (sa: {
  client_email: string;
  private_key: string;
  token_uri: string;
}): Promise<string> => {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: SCOPE,
      aud: sa.token_uri,
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsigned = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  return `${unsigned}.${base64url(signature)}`;
};

export const getGoogleAccessToken = async (): Promise<string> => {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const credsJson = process.env["GOOGLE_APP_CREDS_JSON"];
  if (!credsJson) {
    throw new Error("GOOGLE_APP_CREDS_JSON environment variable not set.");
  }

  const sa = ServiceAccountSchema.parse(JSON.parse(credsJson));
  const assertion = await signJwt(sa);

  const data = await retry(async () => {
    const res = await fetch(sa.token_uri, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });
    if (!res.ok) {
      throw new Error(
        `Google token exchange failed: ${res.status} ${await res.text()}`,
      );
    }
    return (await res.json()) as { access_token: string; expires_in: number };
  });
  cached = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cached.token;
};
