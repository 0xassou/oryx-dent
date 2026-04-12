"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSession, verifySession } from 
  "@/lib/server/auth/session";

const ADMIN_EMAIL = 
  process.env.ADMIN_EMAIL ?? "admin@oryx.dz";
const ADMIN_PASSWORD = 
  process.env.ADMIN_PASSWORD ?? "oryx2026";

export async function loginAction(
  email: string, 
  password: string
) {
  if (
    email !== ADMIN_EMAIL || 
    password !== ADMIN_PASSWORD
  ) {
    return { ok: false, error: "Identifiants incorrects" };
  }
  const token = await createSession("admin");
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

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete("oryx-session");
  redirect("/login");
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("oryx-session")?.value;
  if (!token) return null;
  return await verifySession(token);
}
