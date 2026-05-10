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

export type { InvitationTokenPayload } from "@/lib/types/invitation-token";

/** Mono-cabinet : identifiant stable pour les tokens d’invitation (plus de localStorage). */
export function getCabinetId(): string {
  const raw =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_ORYX_CABINET_ID
      : undefined;
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim();
  }
  throw new Error(
    "[Oryx] NEXT_PUBLIC_ORYX_CABINET_ID est requis pour les invitations et l’identification cabinet.",
  );
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

export type CurrentUser = {
  email: string;
  nom: string;
  role: Role;
};

let memoryRole: Role | null = null;
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
  financesDepenses: ["admin", "assistant"],
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

export function getCurrentRole(): Role | null {
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
  memoryRole = null;
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
