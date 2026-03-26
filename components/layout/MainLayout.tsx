"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Sidebar, SIDEBAR_WIDTH } from "./Sidebar";

const LAYOUT_TRANSITION = { type: "spring" as const, stiffness: 320, damping: 34 };

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const pathname = usePathname();
  const isPlanning = pathname === "/planning";
  const [collapsed, setCollapsed] = useState(false);
  const marginLeft = collapsed ? SIDEBAR_WIDTH.collapsed : SIDEBAR_WIDTH.expanded;

  return (
    <div className="flex h-screen flex-row overflow-hidden bg-slate-50 text-slate-900">
      <Sidebar
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((v) => !v)}
      />

      <motion.main
        animate={{ marginLeft }}
        transition={LAYOUT_TRANSITION}
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      >
        <div
          className={
            isPlanning
              ? "flex min-h-0 flex-1 flex-col overflow-hidden px-6 pb-4 pt-0"
              : "flex min-h-0 flex-1 flex-col overflow-auto p-6"
          }
        >
          <div
            className={
              isPlanning
                ? "flex min-h-0 flex-1 flex-col overflow-hidden"
                : "mx-auto w-full max-w-6xl"
            }
          >
            {children}
          </div>
        </div>
      </motion.main>
    </div>
  );
}
