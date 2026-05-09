"use client";

import { useEffect, useState } from "react";
import {
  getCurrentRole,
  getCurrentUser,
  ORYX_ROLE_CHANGED_EVENT,
  type CurrentUser,
  type Role,
} from "@/utils/roles";

export function useRole(): {
  role: Role | null;
  user: CurrentUser | null;
  ready: boolean;
} {
  const [role, setRole] = useState<Role | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    function sync() {
      const nextRole = getCurrentRole();
      const nextUser = getCurrentUser();
      setRole(nextRole);
      setUser(nextUser);
      setReady(nextRole !== null);
    }
    sync();
    window.addEventListener(ORYX_ROLE_CHANGED_EVENT, sync);
    return () => {
      window.removeEventListener(ORYX_ROLE_CHANGED_EVENT, sync);
    };
  }, []);

  return { role, user, ready };
}
