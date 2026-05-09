/**
 * Système de rôles Oryx — 4 rôles : admin, praticien, assistant, remplacant.
 * Les membres d'équipe sont aussi persistés en PostgreSQL (`team_members`) ;
 * la session locale (localStorage) est synchronisée après connexion Better Auth.
 *
 * Données client (démo / invitations) :
 *  - oryx_current_role  : rôle de la session en cours
 *  - oryx_current_user  : {email, nom, role} de la session en cours
 *  - oryx_team          : liste des membres (hors admin) avec mot de passe hashé
 *  - oryx_invitations   : copie côté admin (mail + lien) — le lien d’invitation
 *                         est un token auto-suffisant (payload signé) lisible
 *                         dans n’importe quel navigateur, sans oryx_invitations
 *                         chez l’invité.
 *  - oryx_cabinet_id     : identifiant cabinet (admin) embarqué dans le token
 */

export type Role = "admin" | "praticien" | "assistant" | "remplacant";

/** Rôles invitables par lien (hors admin). */
export type InvitableRole = "assistant" | "remplacant";

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrateur",
  praticien: "Praticien",
  assistant: "Assistante",
  remplacant: "Remplaçant",
};

export const STORAGE_KEYS = {
  currentRole: "oryx_current_role",
  currentUser: "oryx_current_user",
  team: "oryx_team",
  invitations: "oryx_invitations",
} as const;

export const ORYX_ROLE_CHANGED_EVENT = "oryx-role-changed";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export type TeamMember = {
  id: string;
  email: string;
  nom: string;
  role: InvitableRole;
  statut: "actif" | "invité" | "désactivé";
  dateInvitation: string;
  dateAcceptation?: string;
  /** Hash simple (non cryptographique) — données client-side uniquement. */
  passwordHash?: string;
};

/** Métadonnées côté admin ; le vrai `token` est le payload signé (lien d’invitation). */
export type Invitation = {
  /** Token d’URL auto-suffisant (base64url JSON + signature HMAC intégrée). */
  token: string;
  email: string;
  role: InvitableRole;
  dateInvitation: string;
  /** ISO, pour l’affichage admin. */
  expiresAt: string;
  consumed?: boolean;
};

/** Chargé / signé sur le disque client (démo). Ne pas s’y fier pour la vraie sécurité. */
const INVITATION_TOKEN_VERSION = 1;

function getInvitationSecret(): string {
  if (
    typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_ORYX_INVITATION_SECRET
  ) {
    return process.env.NEXT_PUBLIC_ORYX_INVITATION_SECRET;
  }
  return "oryx-invitation-hmac-v1";
}

/** Mono-cabinet : identifiant stable pour les tokens d’invitation (plus de localStorage). */
export function getCabinetId(): string {
  if (
    typeof process !== "undefined" &&
    typeof process.env.NEXT_PUBLIC_ORYX_CABINET_ID === "string" &&
    process.env.NEXT_PUBLIC_ORYX_CABINET_ID.trim()
  ) {
    return process.env.NEXT_PUBLIC_ORYX_CABINET_ID.trim();
  }
  return "default";
}

/** Id stable d’un membre (même clé côté admin qu’après acceptation sur un autre appareil). */
export function makeMemberId(cabinetId: string, email: string): string {
  const key = `${cabinetId}|${email.trim().toLowerCase()}`;
  let h = 5381;
  for (let i = 0; i < key.length; i++) {
    h = (h * 33) ^ key.charCodeAt(i);
  }
  return `m-${(h >>> 0).toString(16).padStart(8, "0")}`;
}

function base64UrlEncodeFromUtf8(input: string): string {
  const utf8 = new TextEncoder().encode(input);
  let bin = "";
  for (let i = 0; i < utf8.length; i++) {
    bin += String.fromCharCode(utf8[i]!);
  }
  const b64 = typeof btoa !== "undefined" ? btoa(bin) : "";
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecodeToUtf8(data: string): string {
  let b = data.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (b.length % 4)) % 4;
  if (pad) b += "=".repeat(pad);
  const binary =
    typeof atob !== "undefined" ? atob(b) : "";
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder("utf-8").decode(bytes);
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

export type InvitationTokenPayload = {
  v: number;
  email: string;
  /** Ancien libellé "replacant" encore accepté à la lecture. */
  role: InvitableRole | "replacant";
  cabinetId: string;
  expiresAt: number;
  signature: string;
};

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
  return Array.from(out, (b) => b.toString(16).padStart(2, "0")).join("");
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
 * Décodage + vérification (signature + expiration). Aucun localStorage requis.
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
  if (!email || !roleCanonical || !roleNorm || !cabinetId || !Number.isFinite(expiresAt) || !signature) {
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

export type CurrentUser = {
  email: string;
  nom: string;
  role: Role;
};

let memoryRole: Role = "admin";
let memoryUser: CurrentUser | null = null;

/* ───────────────────────── Matrice de permissions ───────────────────────── */

/** Onglet de navigation : autorisé pour un ensemble de rôles. */
export type NavKey =
  | "dashboard"
  | "patients"
  | "planning"
  | "workflow"
  | "finances"
  /** Sous-page Dépenses uniquement (`/finances/depenses`) — admin + assistante, pas le remplaçant. */
  | "financesDepenses"
  | "statistiques"
  | "stocks"
  | "sterilisation"
  | "laboratoire"
  | "factures"
  | "settings";

export const NAV_ACCESS: Record<NavKey, Role[]> = {
  dashboard: ["admin", "praticien", "assistant", "remplacant"],
  patients: ["admin", "praticien", "assistant", "remplacant"],
  planning: ["admin", "praticien", "assistant", "remplacant"],
  workflow: ["admin", "praticien", "assistant", "remplacant"],
  finances: ["admin"],
  financesDepenses: ["admin"],
  statistiques: ["admin"],
  stocks: ["admin", "assistant"],
  sterilisation: ["admin"],
  laboratoire: ["admin", "praticien"],
  factures: ["admin"],
  settings: ["admin"],
};

/** Correspondance pathname → clé de navigation. */
export function pathToNavKey(pathname: string): NavKey | null {
  if (pathname === "/" || pathname === "") return "dashboard";
  if (pathname.startsWith("/patients")) return "patients";
  if (pathname.startsWith("/planning")) return "planning";
  if (pathname.startsWith("/workflow")) return "workflow";
  // Plus spécifique avant `/finances` : assistante = uniquement cette sous-route
  if (
    pathname === "/finances/depenses" ||
    pathname.startsWith("/finances/depenses/")
  ) {
    return "financesDepenses";
  }
  if (pathname.startsWith("/depenses")) return "financesDepenses";
  if (pathname.startsWith("/finances")) return "finances";
  if (pathname.startsWith("/statistiques")) return "statistiques";
  if (pathname.startsWith("/stocks")) return "stocks";
  if (pathname.startsWith("/sterilisation")) return "sterilisation";
  if (pathname.startsWith("/laboratoire")) return "laboratoire";
  if (pathname.startsWith("/factures")) return "factures";
  if (pathname.startsWith("/settings") || pathname.startsWith("/parametres"))
    return "settings";
  return null;
}

export function canAccessPath(role: Role, pathname: string): boolean {
  const key = pathToNavKey(pathname);
  if (!key) return true;
  return NAV_ACCESS[key].includes(role);
}

export function canAccessNav(role: Role, key: NavKey): boolean {
  return NAV_ACCESS[key].includes(role);
}

/* ───────────────────────── Session locale ───────────────────────── */

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function getCurrentRole(): Role {
  return memoryRole;
}

export function setCurrentRole(role: Role): void {
  memoryRole = role;
  if (isBrowser()) {
    window.dispatchEvent(new CustomEvent(ORYX_ROLE_CHANGED_EVENT));
  }
}

export function getCurrentUser(): CurrentUser | null {
  return memoryUser;
}

export function setCurrentUser(user: CurrentUser | null): void {
  memoryUser = user;
  if (isBrowser()) {
    window.dispatchEvent(new CustomEvent(ORYX_ROLE_CHANGED_EVENT));
  }
}

export function clearSession(): void {
  memoryRole = "admin";
  memoryUser = null;
  if (isBrowser()) {
    window.dispatchEvent(new CustomEvent(ORYX_ROLE_CHANGED_EVENT));
  }
}

/* ───────────────────────── Équipe ───────────────────────── */

/** @deprecated L’équipe est gérée en PostgreSQL (`getTeamMembersAction`). */
export function loadTeam(): TeamMember[] {
  return [];
}

/** @deprecated No-op — voir `getTeamMembersAction`. */
export function saveTeam(_team: TeamMember[]): void {}

/** @deprecated Invitations via flux serveur / tokens signés uniquement. */
export function loadInvitations(): Invitation[] {
  return [];
}

/** @deprecated No-op. */
export function saveInvitations(_list: Invitation[]): void {}

/**
 * Côté admin : enregistre l’équipe + copie d’invitation, et génère le token signé
 * encodé dans l’URL (autonome, lisible partout).
 */
export async function createInvitation(
  email: string,
  role: InvitableRole,
): Promise<{ invitation: Invitation; member: TeamMember }> {
  const now = new Date();
  const cabinetId = getCabinetId();
  const normalizedEmail = email.trim().toLowerCase();
  const expiresMs = now.getTime() + 48 * 60 * 60 * 1000;
  const token = await encodeInvitationToken({
    email: normalizedEmail,
    role,
    cabinetId,
    expiresAtMs: expiresMs,
  });
  const invitation: Invitation = {
    token,
    email: normalizedEmail,
    role,
    dateInvitation: now.toISOString(),
    expiresAt: new Date(expiresMs).toISOString(),
  };
  const member: TeamMember = {
    id: makeMemberId(cabinetId, normalizedEmail),
    email: invitation.email,
    nom: email.split("@")[0] ?? email,
    role,
    statut: "invité",
    dateInvitation: invitation.dateInvitation,
  };
  const invitations = loadInvitations().filter(
    (i) => i.email !== invitation.email,
  );
  invitations.push(invitation);
  saveInvitations(invitations);

  const team = loadTeam().filter((m) => m.email !== invitation.email);
  team.push(member);
  saveTeam(team);
  return { invitation, member };
}

export function isInvitationValid(inv: Invitation): boolean {
  if (inv.consumed) return false;
  return Date.parse(inv.expiresAt) > Date.now();
}

/** Hash non cryptographique suffisant pour stockage localStorage démo. */
export function hashPassword(pwd: string): string {
  let h = 0;
  for (let i = 0; i < pwd.length; i++) {
    h = (h * 31 + pwd.charCodeAt(i)) | 0;
  }
  return `h_${h.toString(36)}_${pwd.length}`;
}

/**
 * Côté invité : le token d’URL contient tout (signature + exp). Aucun `oryx_invitations`
 * requis. Enregistre le membre dans le `oryx_team` de ce navigateur.
 */
export async function acceptInvitation(
  rawToken: string,
  nom: string,
  password: string,
): Promise<{ ok: true; member: TeamMember } | { ok: false; error: string }> {
  const v = await parseInvitationToken(rawToken);
  if (!v.ok) return v;
  const { email, role: rawRole, cabinetId } = v.data;
  const role: InvitableRole =
    rawRole === "replacant" ? "remplacant" : rawRole;
  const id = makeMemberId(cabinetId, email);
  const nowIso = new Date().toISOString();
  const team = loadTeam();
  const idx = team.findIndex((m) => m.email === email);
  const displayName = nom.trim() || email.split("@")[0] || email;
  const base: TeamMember = {
    id,
    email,
    nom: displayName,
    role,
    statut: "actif",
    dateInvitation: team[idx]?.dateInvitation ?? nowIso,
    dateAcceptation: nowIso,
    passwordHash: hashPassword(password),
  };
  if (idx >= 0) {
    team[idx] = { ...team[idx], ...base, id, statut: "actif" };
  } else {
    team.push(base);
  }
  saveTeam(team);
  return { ok: true, member: team.find((m) => m.id === id) ?? base };
}

export function setMemberStatus(
  id: string,
  statut: TeamMember["statut"],
): void {
  const team = loadTeam().map((m) => (m.id === id ? { ...m, statut } : m));
  saveTeam(team);
}

export function removeMember(id: string): void {
  const team = loadTeam().filter((m) => m.id !== id);
  saveTeam(team);
}

export function findMemberByCredentials(
  email: string,
  password: string,
): TeamMember | null {
  const needle = email.trim().toLowerCase();
  const hash = hashPassword(password);
  const member = loadTeam().find(
    (m) =>
      m.email === needle &&
      m.statut === "actif" &&
      m.passwordHash &&
      m.passwordHash === hash,
  );
  return member ?? null;
}

/* ───────────────────────── UI helpers ───────────────────────── */

export function getInitials(source: string): string {
  const cleaned = source.trim();
  if (!cleaned) return "??";
  const parts = cleaned.split(/[\s.@_-]+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function roleBadgeTone(role: Role): string {
  if (role === "admin") return "#7c3aed";
  if (role === "praticien") return "#06b6d4";
  if (role === "assistant") return "#10b981";
  return "#f59e0b";
}
