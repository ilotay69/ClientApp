// A from-scratch Web Push client (RFC 8291 message encryption + RFC 8292
// VAPID auth) using only Node's built-in crypto — deliberately not the
// `web-push` npm package. Adding a new dependency here would need a
// regenerated package-lock.json (this project's build runs `npm ci`, which
// fails hard on any lockfile/package.json mismatch), and there's no way to
// safely regenerate a lockfile without running npm itself. Same "plain
// fetch, no SDK" approach already used for Graph/Anthropic in this app.

import * as crypto from "node:crypto";

export type PushSubscriptionKeys = {
  endpoint: string;
  p256dh: string; // base64url, the subscriber's raw P-256 public key point
  auth: string; // base64url, 16-byte auth secret
};

export type WebPushResult = { ok: boolean; status: number; body?: string };

function base64urlToBuffer(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

function hkdf(ikm: Buffer, salt: Buffer, info: Buffer, length: number): Buffer {
  return Buffer.from(crypto.hkdfSync("sha256", ikm, salt, info, length));
}

/** Signs a VAPID JWT (RFC 8292) with our VAPID private key — ES256, raw
 * (IEEE P1363) signature encoding, since JWS wants r||s, not the DER
 * signature Node produces by default. */
function signVapidJwt(
  audience: string,
  subject: string,
  vapidPublicKeyRaw: Buffer,
  vapidPrivateKeyRaw: Buffer
): string {
  const header = { typ: "JWT", alg: "ES256" };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: subject,
  };
  const signingInput = `${Buffer.from(JSON.stringify(header)).toString("base64url")}.${Buffer.from(
    JSON.stringify(payload)
  ).toString("base64url")}`;

  const x = vapidPublicKeyRaw.subarray(1, 33);
  const y = vapidPublicKeyRaw.subarray(33, 65);
  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: x.toString("base64url"),
    y: y.toString("base64url"),
    d: vapidPrivateKeyRaw.toString("base64url"),
  };
  const privateKey = crypto.createPrivateKey({ key: jwk, format: "jwk" });
  const signature = crypto.sign("sha256", Buffer.from(signingInput), {
    key: privateKey,
    dsaEncoding: "ieee-p1363",
  });

  return `${signingInput}.${signature.toString("base64url")}`;
}

/** Encrypts the payload per RFC 8291 (aes128gcm content-coding, RFC 8188) —
 * a single record, since every payload here is well under the 4KB push
 * size limit so no chunking is needed. */
function encryptPayload(
  plaintext: Buffer,
  subscriberPublicKeyRaw: Buffer,
  authSecret: Buffer
): Buffer {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  const serverPublicKeyRaw = ecdh.getPublicKey(); // uncompressed, 65 bytes
  const sharedSecret = ecdh.computeSecret(subscriberPublicKeyRaw);

  // Stage 1: combine the ECDH shared secret with the subscription's own
  // auth secret into one IKM, bound to both parties' public keys.
  const keyInfo = Buffer.concat([
    Buffer.from("WebPush: info", "utf8"),
    Buffer.from([0]),
    subscriberPublicKeyRaw,
    serverPublicKeyRaw,
  ]);
  const ikm = hkdf(sharedSecret, authSecret, keyInfo, 32);

  // Stage 2 (RFC 8188): derive the content-encryption key and nonce from
  // that IKM, salted with this message's own random salt.
  const salt = crypto.randomBytes(16);
  const cek = hkdf(ikm, salt, Buffer.concat([Buffer.from("Content-Encoding: aes128gcm", "utf8"), Buffer.from([0])]), 16);
  const nonce = hkdf(ikm, salt, Buffer.concat([Buffer.from("Content-Encoding: nonce", "utf8"), Buffer.from([0])]), 12);

  // Single record: plaintext + a 0x02 delimiter byte (marks "last record",
  // no chunking) — no extra padding needed beyond that one byte.
  const padded = Buffer.concat([plaintext, Buffer.from([2])]);

  const cipher = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const ciphertext = Buffer.concat([cipher.update(padded), cipher.final(), cipher.getAuthTag()]);

  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(4096, 0);
  const idLen = Buffer.from([serverPublicKeyRaw.length]);

  return Buffer.concat([salt, recordSize, idLen, serverPublicKeyRaw, ciphertext]);
}

/**
 * Sends one Web Push message to one subscription. Best-effort by design —
 * callers should never let a push failure block the action that triggered
 * it (same convention as every other notification path in this app).
 * Returns the raw HTTP status so the caller can prune subscriptions the
 * push service reports as gone (404/410 — the user unsubscribed, cleared
 * site data, or uninstalled).
 */
export async function sendWebPush(
  subscription: PushSubscriptionKeys,
  payload: unknown,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidSubject: string
): Promise<WebPushResult> {
  const endpointUrl = new URL(subscription.endpoint);
  const audience = `${endpointUrl.protocol}//${endpointUrl.host}`;

  const vapidPublicKeyRaw = base64urlToBuffer(vapidPublicKey);
  const vapidPrivateKeyRaw = base64urlToBuffer(vapidPrivateKey);
  const jwt = signVapidJwt(audience, vapidSubject, vapidPublicKeyRaw, vapidPrivateKeyRaw);

  const body = encryptPayload(
    Buffer.from(JSON.stringify(payload), "utf8"),
    base64urlToBuffer(subscription.p256dh),
    base64urlToBuffer(subscription.auth)
  );

  const res = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      TTL: "86400",
      Authorization: `vapid t=${jwt}, k=${vapidPublicKey}`,
    },
    body: body as BodyInit,
  });

  if (res.ok) return { ok: true, status: res.status };
  const text = await res.text().catch(() => undefined);
  return { ok: false, status: res.status, body: text };
}
