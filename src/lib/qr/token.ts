/**
 * Kiosk QR token. Format: `kioskId.iat.sigBase64Url` (three dot-separated
 * segments, all URL-safe). Signed with HMAC-SHA256 using QR_SECRET.
 *
 * Verification rules:
 *  - Signature must match the (kioskId, iat) pair under the same secret.
 *  - iat must be within [now - maxAgeSeconds, now + 60s] (60s clock-skew grace).
 *
 * Stateless: rotating QR_SECRET in production invalidates all outstanding
 * tokens. No DB row.
 */

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function hmac(secret: string, message: string): Promise<Uint8Array> {
  const key = await importHmacKey(secret);
  const sig = await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return new Uint8Array(sig);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function signKioskToken(input: {
  kioskId: string;
  now: Date;
  secret: string;
}): Promise<string> {
  const iat = Math.floor(input.now.getTime() / 1000);
  const payload = `${input.kioskId}.${iat}`;
  const sig = await hmac(input.secret, payload);
  return `${payload}.${toBase64Url(sig)}`;
}

export type KioskTokenVerifyResult =
  | { ok: true; kioskId: string; iat: number }
  | {
      ok: false;
      reason:
        | "malformed"
        | "invalid_signature"
        | "token_expired"
        | "token_future";
    };

export async function verifyKioskToken(input: {
  token: string;
  now: Date;
  secret: string;
  maxAgeSeconds: number;
}): Promise<KioskTokenVerifyResult> {
  const parts = input.token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [kioskId, iatStr, sigB64] = parts;
  if (!kioskId || !sigB64 || !/^\d+$/.test(iatStr)) {
    return { ok: false, reason: "malformed" };
  }
  const iat = Number(iatStr);

  const expectedSig = await hmac(input.secret, `${kioskId}.${iat}`);
  let providedSig: Uint8Array;
  try {
    providedSig = fromBase64Url(sigB64);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!constantTimeEqual(expectedSig, providedSig)) {
    return { ok: false, reason: "invalid_signature" };
  }

  const nowSec = Math.floor(input.now.getTime() / 1000);
  if (iat > nowSec + 60) return { ok: false, reason: "token_future" };
  if (iat < nowSec - input.maxAgeSeconds) {
    return { ok: false, reason: "token_expired" };
  }
  return { ok: true, kioskId, iat };
}
