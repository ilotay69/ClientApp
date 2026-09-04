// Minimal Hudu REST API client — no SDK, same plain-fetch style as
// autotask.ts/ninjaone.ts. Auth and base path confirmed against Hudu's own
// community-maintained PowerShell module (lwhitelock/HuduAPI), since
// Hudu's own API reference lives per-instance (https://<yourdomain>/api_docs)
// rather than at one public URL: header `x-api-key`, paths under `/api/v1/`.
import { assertAsciiHeaderValue } from "@/lib/ascii-check";

export type HuduCredentials = {
  baseUrl: string;
  apiKey: string;
};

function normalizedBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function huduHeaders(creds: HuduCredentials): HeadersInit {
  assertAsciiHeaderValue(creds.apiKey, "Hudu API key");
  return { "x-api-key": creds.apiKey, "Content-Type": "application/json" };
}

/** Confirms the base URL + API key actually work — fetches one company
 * rather than just checking the key is well-formed. */
export async function testHuduConnection(
  creds: HuduCredentials
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${normalizedBaseUrl(creds.baseUrl)}/api/v1/companies?page_size=1`, {
      headers: huduHeaders(creds),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `Hudu API request failed (${res.status}): ${text}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
