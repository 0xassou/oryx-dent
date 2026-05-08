import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export async function getBetterAuthSession() {
  const h = await headers();
  return auth.api.getSession({ headers: h });
}
