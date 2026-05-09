"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useRole } from "@/hooks/useRole";
import { canAccessPath } from "@/utils/roles";
import { showAppToast } from "@/utils/appToast";

/**
 * Protège les routes du dashboard :
 *  - Lit le rôle courant.
 *  - Si la route n'est pas autorisée → redirection vers `/` + toast.
 *
 * Ne bloque rien tant que le rôle n'est pas chargé (pour éviter les flashs).
 */
export function RouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const { role, ready } = useRole();
  const toastFiredRef = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || role === null) return;
    if (canAccessPath(role, pathname)) {
      toastFiredRef.current = null;
      return;
    }
    if (toastFiredRef.current !== pathname) {
      toastFiredRef.current = pathname;
      showAppToast("Accès non autorisé pour votre rôle");
    }
    router.replace("/");
  }, [pathname, role, ready, router]);

  if (ready && role !== null && !canAccessPath(role, pathname)) return null;
  return <>{children}</>;
}
