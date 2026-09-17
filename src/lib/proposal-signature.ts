import { createAdminClient } from "@/lib/supabase/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any;

export const PROPOSAL_SIGNATURES_BUCKET = "proposal-signatures";

/** Parses the canvas's `data:image/png;base64,...` output back into raw
 * bytes for storage, rejecting anything that isn't exactly that shape —
 * this string comes from an unauthenticated public action, so it's treated
 * as untrusted input, not assumed to be what SignaturePad actually sends. */
export function parseSignatureDataUrl(dataUrl: string): Buffer | null {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec((dataUrl ?? "").trim());
  if (!match) return null;
  try {
    return Buffer.from(match[1]!, "base64");
  } catch {
    return null;
  }
}

/** A drawn signature on a ~500x150 canvas runs a few tens of KB; this caps
 * well above that purely to stop someone posting an arbitrarily large blob
 * at the endpoint, not because a real signature ever gets close. */
export const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024;

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
