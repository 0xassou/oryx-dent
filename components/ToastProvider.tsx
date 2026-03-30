"use client";

import { useEffect, useState } from "react";
import { APP_TOAST_EVENT } from "@/utils/appToast";

export function ToastProvider() {
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    function onToast(e: Event) {
      const ce = e as CustomEvent<{ message?: string }>;
      const m = ce.detail?.message;
      if (typeof m === "string" && m.trim()) setMsg(m.trim());
    }
    window.addEventListener(APP_TOAST_EVENT, onToast);
    return () => window.removeEventListener(APP_TOAST_EVENT, onToast);
  }, []);

  useEffect(() => {
    if (!msg) return;
    const t = window.setTimeout(() => setMsg(null), 5200);
    return () => window.clearTimeout(t);
  }, [msg]);

  if (!msg) return null;

  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[100] w-[min(100%,28rem)] -translate-x-1/2 px-4">
      <div
        role="status"
        className="pointer-events-auto rounded-2xl border border-slate-700/80 bg-slate-900 px-4 py-3 text-center text-sm leading-snug text-white shadow-xl"
      >
        {msg}
      </div>
    </div>
  );
}
