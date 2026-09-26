import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify, type KeyObject } from "node:crypto";

// Entitlement token: what the Avalet server says this install may use.
// Format: "v1.<base64url(JSON payload)>.<base64url(Ed25519 signature)>", the
// signature covering "v1.<payload part>". The client only verifies it with an
// embedded public key (config.ts); only the server holds the private key. See
// docs/dev/billing-api.md.

export type EntitlementPlan = "trial" | "pro" | "none";

export type EntitlementPayload = {
  v: 1;
  /** Install id the token was issued to. */
  iid: string;
  /** "none" = no active plan (trial used up long ago, Pro ended and not renewed). */
  plan: EntitlementPlan;
  /** Weighted tokens for the period (trial: one-off). */
  budget: number;
  /** Weighted tokens used in the period when the token was issued. */
  used: number;
  periodStart: number;
  /** End of the paid period; null for the trial, which does not expire by time. */
  periodEnd: number | null;
  /** Pro renews at periodEnd unless cancelled. */
  renews: boolean;
  /** Issued at, ms. */
  iat: number;
  /** Token expiry, ms: issuance + 72 h. Past it the client must refresh (offline grace ends). */
  exp: number;
};

const PREFIX = "v1";

function b64url(buffer: Buffer): string {
  return buffer.toString("base64url");
}

export function encodeToken(payload: EntitlementPayload, privateKey: KeyObject | string): string {
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const signed = `${PREFIX}.${body}`;
  const key = typeof privateKey === "string" ? createPrivateKey(privateKey) : privateKey;
  const signature = sign(null, Buffer.from(signed, "utf8"), key);
  return `${signed}.${b64url(signature)}`;
}

export type VerifyResult = { ok: true; payload: EntitlementPayload } | { ok: false; reason: "malformed" | "signature" | "payload" };

function isPayload(value: unknown): value is EntitlementPayload {
  const p = value as EntitlementPayload;
  return (
    Boolean(p) &&
    p.v === 1 &&
    typeof p.iid === "string" &&
    (p.plan === "trial" || p.plan === "pro" || p.plan === "none") &&
    Number.isFinite(p.budget) &&
    Number.isFinite(p.used) &&
    Number.isFinite(p.periodStart) &&
    (p.periodEnd === null || Number.isFinite(p.periodEnd)) &&
    typeof p.renews === "boolean" &&
    Number.isFinite(p.iat) &&
    Number.isFinite(p.exp)
  );
}

/** Checks the signature against any of the trusted keys (PEM, SPKI). Does not check expiry or install id. */
export function verifyToken(token: string, publicKeys: string[]): VerifyResult {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== PREFIX) return { ok: false, reason: "malformed" };
  const signed = Buffer.from(`${parts[0]}.${parts[1]}`, "utf8");
  let signature: Buffer;
  try {
    signature = Buffer.from(parts[2], "base64url");
  } catch {
    return { ok: false, reason: "malformed" };
  }
  const trusted = publicKeys.some((pem) => {
    try {
      return verify(null, signed, createPublicKey(pem), signature);
    } catch {
      return false;
    }
  });
  if (!trusted) return { ok: false, reason: "signature" };
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "payload" };
  }
  if (!isPayload(payload)) return { ok: false, reason: "payload" };
  return { ok: true, payload };
}

/** A fresh key pair, for the mocks and tests only. */
export function generateSigningKeys(): { privateKey: KeyObject; publicKeyPem: string } {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return { privateKey, publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString() };
}
