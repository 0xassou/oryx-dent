import "server-only";

import type { InvitableRole } from "@/utils/roles";
import type { InvitationTokenPayload } from "@/lib/types/invitation-token";

const INVITATION_TOKEN_VERSION = 1;

function getInvitationSecret(): string {
  const raw = process.env.ORYX_INVITATION_SECRET;
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim();
  }
  throw new Error(
    "[Oryx] ORYX_INVITATION_SECRET est requis pour signer ou vérifier les invitations.",
  );
}

function base64UrlEncodeFromUtf8(input: string): string {
  const utf8 = new TextEncoder().encode(input);
  let bin = "";
  for (let i = 0; i < utf8.length; i++) {
    bin += String.fromCharCode(utf8[i]!);
  }
  const b64 = Buffer.from(bin, "binary").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecodeToUtf8(data: string): string {
  let b = data.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (b.length % 4)) % 4;
  if (pad) b += "=".repeat(pad);
  return Buffer.from(b, "base64").toString("utf8");
}

function buildCanonicalString(
  v: number,
  email: string,
  role: string,
  cabinetId: string,
  expiresAt: number,
): string {
  return [v, email.trim().toLowerCase(), role, cabinetId, String(expiresAt)].join(
    "|",
  );
}

async function hmacSignHex(message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(getInvitationSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  const out = new Uint8Array(sig);
  return Array.from(out, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmacVerify(message: string, signatureHex: string): Promise<boolean> {
  const expected = await hmacSignHex(message);
  if (expected.length !== signatureHex.length) return false;
  let ok = 0;
  for (let i = 0; i < expected.length; i++) {
    ok |= expected.charCodeAt(i) ^ signatureHex.charCodeAt(i);
  }
  return ok === 0;
}

/**
 * Génère le segment d’URL d’une invitation (base64url sur JSON incluant la signature HMAC).
 * Réservé au code serveur (actions / routes API).
 */
export async function encodeInvitationToken(data: {
  email: string;
  role: InvitableRole;
  cabinetId: string;
  expiresAtMs: number;
}): Promise<string> {
  const email = data.email.trim().toLowerCase();
  const { role, cabinetId, expiresAtMs } = data;
  const canonical = buildCanonicalString(
    INVITATION_TOKEN_VERSION,
    email,
    role,
    cabinetId,
    expiresAtMs,
  );
  const signature = await hmacSignHex(canonical);
  const payload: InvitationTokenPayload = {
    v: INVITATION_TOKEN_VERSION,
    email,
    role,
    cabinetId,
    expiresAt: expiresAtMs,
    signature,
  };
  return base64UrlEncodeFromUtf8(JSON.stringify(payload));
}

/**
 * Décodage + vérification (signature + expiration). Réservé au code serveur.
 */
export async function parseInvitationToken(
  rawFromUrl: string,
): Promise<
  | { ok: true; data: InvitationTokenPayload }
  | { ok: false; error: string }
> {
  const raw = (() => {
    try {
      return decodeURIComponent(rawFromUrl.trim());
    } catch {
      return rawFromUrl.trim();
    }
  })();
  if (!raw) {
    return { ok: false, error: "Invitation manquante" };
  }
  let parsed: unknown;
  try {
    const json = base64UrlDecodeToUtf8(raw);
    parsed = JSON.parse(json) as unknown;
  } catch {
    return { ok: false, error: "Lien d’invitation invalide" };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "Lien d’invitation invalide" };
  }
  const p = parsed as Record<string, unknown>;
  if (p["v"] !== INVITATION_TOKEN_VERSION) {
    return { ok: false, error: "Version d’invitation non supportée" };
  }
  const email = typeof p["email"] === "string" ? p["email"] : "";
  const rawRole = p["role"];
  const roleCanonical =
    rawRole === "assistant"
      ? "assistant"
      : rawRole === "remplacant"
        ? "remplacant"
        : rawRole === "replacant"
          ? "replacant"
          : null;
  const roleNorm: InvitableRole | null =
    rawRole === "assistant"
      ? "assistant"
      : rawRole === "remplacant" || rawRole === "replacant"
        ? "remplacant"
        : null;
  const cabinetId = typeof p["cabinetId"] === "string" ? p["cabinetId"] : "";
  const expiresAt =
    typeof p["expiresAt"] === "number" ? p["expiresAt"] : Number.NaN;
  const signature = typeof p["signature"] === "string" ? p["signature"] : "";
  if (
    !email ||
    !roleCanonical ||
    !roleNorm ||
    !cabinetId ||
    !Number.isFinite(expiresAt) ||
    !signature
  ) {
    return { ok: false, error: "Données d’invitation incomplètes" };
  }
  if (Date.now() > expiresAt) {
    return { ok: false, error: "Cette invitation a expiré (48 h maximum)" };
  }
  const canonical = buildCanonicalString(
    INVITATION_TOKEN_VERSION,
    email,
    roleCanonical,
    cabinetId,
    expiresAt,
  );
  const good = await hmacVerify(canonical, signature);
  if (!good) {
    return { ok: false, error: "Signature d’invitation invalide" };
  }
  return {
    ok: true,
    data: {
      v: INVITATION_TOKEN_VERSION,
      email: email.toLowerCase(),
      role: roleNorm,
      cabinetId,
      expiresAt,
      signature,
    },
  };
}
