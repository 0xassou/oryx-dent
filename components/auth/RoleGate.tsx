"use client";

import type { ReactNode } from "react";
import { useRole } from "@/hooks/useRole";
import type { Role } from "@/utils/roles";

export interface RoleGateProps {
  /** Rôle(s) autorisé(s). Si l'utilisateur n'en fait pas partie, le contenu est masqué. */
  role: Role | Role[];
  children: ReactNode;
  /** Affichage alternatif quand l'utilisateur n'est pas autorisé. Par défaut : rien. */
  fallback?: ReactNode;
  /** Inverse la logique : cache aux rôles listés. */
  deny?: boolean;
}

export function RoleGate({ role, children, fallback = null, deny = false }: RoleGateProps) {
  const { role: current, ready } = useRole();
  if (!ready) return null;
  const allowed = Array.isArray(role) ? role : [role];
  const match = allowed.includes(current);
  const ok = deny ? !match : match;
  return ok ? <>{children}</> : <>{fallback}</>;
}
