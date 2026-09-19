import { createAdminClient } from "@/lib/supabase/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any;

export const PROPOSAL_SIGNATURES_BUCKET = "proposal-signatures";

/** A drawn signature on a ~500x150 canvas runs a few tens of KB; this caps
 * well above that purely to stop someone posting an arbitrarily large blob
 * at the endpoint, not because a real signature ever gets close. */
export const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024;

/** Parses the canvas's `data:image/png;base64,...` output back into raw
 * bytes for storage, rejecting anything that isn't exactly that shape —
 * this string comes from an unauthenticated public action, so it's treated
 * as untrusted input, not assumed to be what SignaturePad actually sends.
 *
 * The length check comes FIRST, before the regex and before the decode.
 * It used to come last, in the caller, after this function had already
 * allocated the Buffer — which meant an anonymous caller could post the
 * full 25MB that next.config.ts allows Server Actions, have it scanned and
 * base64-decoded into ~18MB of heap, and only then be told the 2MB limit
 * exists. Repeat that concurrently and the cost is paid entirely by us.
 * Rejecting on the string length costs one property read. */
export function parseSignatureDataUrl(dataUrl: string): Buffer | null {
  const raw = (dataUrl ?? "").trim();
  // base64 inflates by 4/3; the slack covers the `data:image/png;base64,`
  // prefix and any padding.
  if (raw.length > Math.ceil(MAX_SIGNATURE_BYTES * 4 / 3) + 64) return null;
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(raw);
  if (!match) return null;
  try {
    const buffer = Buffer.from(match[1]!, "base64");
    // Still checked after decoding too: the ratio above is an upper bound,
    // so a string under the cap can't exceed MAX_SIGNATURE_BYTES, but this
    // keeps the guarantee local to the parser rather than depending on
    // arithmetic done two lines earlier.
    return buffer.length > MAX_SIGNATURE_BYTES ? null : buffer;
  } catch {
    return null;
  }
}

/** A short-lived signed URL for the staff editor to display a captured
 * signature inline — the bucket is private, so nothing links to the
 * storage path directly. Null if there's nothing to sign (no signature on
 * this proposal, or the bucket lookup fails). */
export async function getSignedProposalSignatureUrl(
  storagePath: string | null,
  admin: AdminClient = createAdminClient()
): Promise<string | null> {
  if (!storagePath) return null;
  const { data, error } = await admin.storage
    .from(PROPOSAL_SIGNATURES_BUCKET)
    .createSignedUrl(storagePath, 300);
  if (error || !data) return null;
  return data.signedUrl;
}
