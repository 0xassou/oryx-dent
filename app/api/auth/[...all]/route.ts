import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

/** Pool PostgreSQL (`pg`) : exécution Node uniquement. */
export const runtime = "nodejs";

export const { GET, POST, PUT, PATCH, DELETE } = toNextJsHandler(auth);
