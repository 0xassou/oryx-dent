"use client";

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  Phone,
  MessageSquare,
  AlertCircle,
  CheckCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type NotificationType = "urgence" | "message" | "rappel" | "call" | "care";

interface NotificationItem {
  id: string;
  message: string;
  type: NotificationType;
}

const DEFAULT_ALERTS: NotificationItem[] = [
  { id: "1", message: "M. Benali : Douleur signalée", type: "urgence" },
  { id: "2", message: "Mme Roux : RDV avancé à 10:00", type: "rappel" },
];

const NOTIFICATION_ICONS: Record<NotificationType, LucideIcon> = {
  urgence: AlertCircle,
  message: MessageSquare,
  rappel: Phone,
  call: Phone,
  care: AlertCircle,
};

export function NotificationsPopover() {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<NotificationItem[]>(DEFAULT_ALERTS);
  const containerRef = useRef<HTMLDivElement>(null);

  function handleMarkAllRead() {
    setAlerts([]);
    setOpen(false);
  }

  const hasUnread = alerts.length > 0;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-white/70 hover:text-slate-900"
        aria-label="Notifications"
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {hasUnread && (
          <span
            className="absolute right-1 top-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-slate-50"
            aria-hidden
          />
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div
              className="fixed inset-0 z-40"
              aria-hidden="true"
              onClick={() => setOpen(false)}
            />
            <motion.div
              role="dialog"
              aria-label="Notifications"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="absolute right-0 top-full z-50 mt-2 w-[340px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-white/20 bg-white/60 shadow-2xl backdrop-blur-xl"
            >
              <div className="flex items-start justify-between gap-3 border-b border-slate-200/50 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    Notifications
                  </p>
                  {hasUnread && (
                    <p className="mt-0.5 text-xs text-slate-500">
                      {alerts.length} non lue{alerts.length > 1 ? "s" : ""}
                    </p>
                  )}
                </div>
                {hasUnread && (
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-sky-600 transition-colors hover:bg-white/20"
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    Tout marquer comme lu
                  </button>
                )}
              </div>

              <div className="max-h-[300px] overflow-y-auto">
                {alerts.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-slate-500">
                    Aucune notification
                  </p>
                ) : (
                  <ul className="py-1">
                    {alerts.map((item, index) => {
                      const Icon =
                        NOTIFICATION_ICONS[item.type] ?? Bell;
                      return (
                        <li key={item.id ?? `notification-${index}`}>
                          <div className="flex cursor-default items-start gap-3 px-4 py-2.5 transition-colors hover:bg-white/10">
                            <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100/80 text-slate-600">
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className="text-sm text-slate-700">
                              {item.message}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
