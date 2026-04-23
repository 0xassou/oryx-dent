"use client";

import { useEffect, useState } from "react";
import {
  getCurrentRole,
  getCurrentUser,
  ORYX_ROLE_CHANGED_EVENT,
  type CurrentUser,
  type Role,
} from "@/utils/roles";

export function useRole(): { role: Role; user: CurrentUser | null; ready: boolean } {
  const [role, setRole] = useState<Role>("admin");
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    function sync() {
      setRole(getCurrentRole());
      setUser(getCurrentUser());
      setReady(true);
    }
    sync();
    window.addEventListener(ORYX_ROLE_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(ORYX_ROLE_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return { role, user, ready };
}
