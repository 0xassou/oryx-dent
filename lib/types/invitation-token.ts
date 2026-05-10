/**
 * Payload décodé d’un lien d’invitation (affichage client après validation serveur).
 */
export type InvitationTokenPayload = {
  v: number;
  email: string;
  /** Ancien libellé "replacant" encore accepté à la lecture. */
  role: "assistant" | "remplacant" | "replacant";
  cabinetId: string;
  expiresAt: number;
  signature: string;
};
