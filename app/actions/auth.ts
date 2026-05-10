"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSession, verifySession } from "@/lib/server/auth/session";

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete("oryx-session");
  redirect("/login");
}

/**
 * Ouvre une session pour un membre d'équipe (remplaçant ou assistante).
 * La vérification des identifiants est effectuée côté client contre
 * le localStorage `oryx_team`. Cette action se contente de poser le cookie
 * de session (JWT signé) pour que le middleware laisse passer les requêtes.
 */
export async function loginAsMemberAction(memberId: string) {
  if (!memberId || typeof memberId !== "string") {
    return { ok: false, error: "Identifiant invalide" };
  }
  const token = await createSession(`member:${memberId}`);
  const cookieStore = await cookies();
  cookieStore.set("oryx-session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
  return { ok: true };
}

export interface RegisterPayload {
  cabinet: string;
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  password: string;
}

/**
 * Pré-enregistrement d’un compte cabinet.
 *
 * Cette instance est mono-utilisateur (admin). Tant que le backend multi-compte
 * n’est pas branché, on valide les données côté serveur et on retourne un message
 * explicite. Remplacer ce placeholder par l’intégration au provider réel le moment venu.
 */
export async function registerAction(payload: RegisterPayload) {
  const requiredFields: (keyof RegisterPayload)[] = [
    "cabinet",
    "nom",
    "prenom",
    "email",
    "telephone",
    "password",
  ];
  for (const f of requiredFields) {
    if (!payload[f]?.toString().trim()) {
      return { ok: false, error: "Tous les champs sont obligatoires" };
    }
  }
  if (payload.password.length < 8) {
    return {
      ok: false,
      error: "Le mot de passe doit contenir au moins 8 caractères",
    };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(payload.email.trim())) {
    return { ok: false, error: "Email invalide" };
  }
  return {
    ok: false,
    error:
      "L'inscription en libre-service n'est pas encore disponible. Contactez support@oryx.dz pour activer votre cabinet.",
  };
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("oryx-session")?.value;
  if (!token) return null;
  return await verifySession(token);
}
