"use client";

import { createAuthClient } from "better-auth/react";

const baseURL =
  typeof window !== "undefined"
    ? window.location.origin
    : (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");

/** Client Better Auth — cookies HTTP-only via `/api/auth`. */
export const authClient = createAuthClient({
  baseURL,
  basePath: "/api/auth",
});
