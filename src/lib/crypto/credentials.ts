import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Application-level encryption for stored vendor credentials.
 *
 * What this does and does not buy, stated plainly because it is easy to
 * oversell: the app must present these credentials to Autotask, NinjaOne,
 * Microsoft and the rest over HTTPS, so the plaintext — and the key that
 * produces it — necessarily exist inside this process at request time. No
 * scheme changes that. What changes is that the DATABASE alone no longer
 * yields a working credential.
 *
 *   Stopped:  a Supabase backup / PITR / pg_dump / read replica; someone
 *             holding the DB password; a read-only Postgres session (a BI
 *             tool, an MCP connector); a leaked service-role key on its own;
 *             SQL-Editor access.
 *   NOT stopped: Railway access that can read this env var; RCE or a
 *             malicious dependency inside this process; backups taken before
 *             the migration.
 *
 * One line: a Supabase-side compromise no longer yields working vendor
 * credentials; a Railway-side one still does.
 */

const VERSION = "v1";
const IV_BYTES = 12; // GCM standard nonce length
const TAG_BYTES = 16;

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.CREDENTIAL_ENC_KEY;
  if (!raw) {
    throw new Error(
      "CREDENTIAL_ENC_KEY is not set — stored vendor credentials cannot be read or written. " +
        "Set it in Railway (openssl rand -base64 32) before deploying the ciphertext-only build."
    );
  }
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) {
    throw new Error(
      `CREDENTIAL_ENC_KEY must decode to 32 bytes, got ${k.length}. Generate with: openssl rand -base64 32`
    );
  }
  cachedKey = k;
  return k;
}

/** True when the key is present and valid. Lets callers (a health route, a
 * settings banner) check without triggering the throw. */
export function credentialKeyAvailable(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

/**
 * Identifies exactly which column of which row a ciphertext belongs to,
 * bound into the GCM tag as additional authenticated data. A ciphertext
 * lifted from one row or column and pasted into another then fails to
 * decrypt rather than silently pointing one client's sync at another
 * client's tenant.
 */
export type CredentialRef = { table: string; column: string; row: string };

function aad(ref: CredentialRef): Buffer {
  return Buffer.from(`${ref.table}:${ref.column}:${ref.row}`, "utf8");
}

/** `v1.<base64(iv | tag | ciphertext)>`. The version prefix is what lets a
 * future key rotation run both versions during the swap. */
export function encryptCredential(plaintext: string, ref: CredentialRef): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(aad(ref));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const packed = Buffer.concat([iv, cipher.getAuthTag(), ct]);
  return `${VERSION}.${packed.toString("base64")}`;
}

export function decryptCredential(stored: string, ref: CredentialRef): string {
  const dot = stored.indexOf(".");
  const version = dot === -1 ? "" : stored.slice(0, dot);
  if (version !== VERSION) {
    throw new Error(`Unrecognized ciphertext version for ${ref.table}.${ref.column}`);
  }
  const buf = Buffer.from(stored.slice(dot + 1), "base64");
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ct = buf.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAAD(aad(ref));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

/**
 * MIGRATION-PHASE reader. Prefers ciphertext, falls back to the legacy
 * plaintext column while the backfill is still in flight and during the
 * dual-write bake. Once phase 6 drops the plaintext columns, callers switch
 * to decryptCredential directly and this — with its `legacy` parameter —
 * goes away.
 */
export function readCredential(
  encrypted: string | null | undefined,
  legacy: string | null | undefined,
  ref: CredentialRef
): string | null {
  if (encrypted) return decryptCredential(encrypted, ref);
  return legacy ?? null;
}

/**
 * Dual-write helper: the pair of column values to spread into an upsert
 * during the dual-write phase. Writes both the plaintext (for rollback) and
 * the ciphertext. In phase 5 this drops the plaintext half.
 */
export function credentialColumns(
  column: string,
  plaintext: string,
  ref: CredentialRef
): Record<string, string> {
  return {
    [column]: plaintext,
    [`${column}_enc`]: encryptCredential(plaintext, ref),
  };
}
