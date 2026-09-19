import { headers } from "next/headers";
import { createHash } from "crypto";

/**
 * The caller's address, as seen through Cloudflare and then Railway.
 *
 * Order matters, and it is the opposite of what it looks like.
 * `x-forwarded-for` is a header the CLIENT can set and each proxy appends
 * to — so anyone who finds the Railway origin and reaches it without going
 * through Cloudflare can set it to whatever they like. For counting proposal
 * views that is a nuisance. For rate limiting it defeats the control
 * entirely: every attempt looks like it came from a fresh address.
 *
 * `cf-connecting-ip` is OVERWRITTEN by Cloudflare rather than appended to,
 * so it cannot be forged through Cloudflare. It is preferred here for that
 * reason — but it is only as good as the guarantee that Cloudflare is the
 * only way in. Until the origin is locked down (Authenticated Origin Pulls,
 * a Tunnel, or a shared secret header checked in proxy.ts), a request
 * straight to the *.up.railway.app host can set this header too. Treat this
 * as a meaningful improvement over x-forwarded-for, not as trusted input.
 */
export async function clientIp(): Promise<string | null> {
  const h = await headers();
  const cf = h.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return h.get("x-real-ip");
}

/**
 * Salted SHA-256, for storing something identifying without storing the
 * thing itself.
 *
 * The salt is the control, not the hash: SHA-256 over the whole IPv4 space,
 * or over the plausible email addresses at a known company domain, is
 * trivially exhaustible by anyone who holds both the table and the salt. So
 * callers pass a salt that lives only in the server environment, and
 * different callers pass DIFFERENT salts — otherwise two tables storing
 * ip_hash could be joined on it, linking (say) a prospect reading a proposal
 * to a portal sign-in from the same address.
 */
export function hashWithSalt(value: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${value}`).digest("hex");
}
