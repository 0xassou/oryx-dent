"use client";

import { usePathname } from "next/navigation";
import { ToastProvider } from "@/components/ToastProvider";
import { Sidebar } from "@/components/layout/Sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isPlanning = pathname === "/planning";

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50 text-slate-900">
      <Sidebar />
      <main className="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-y-auto">
        <div
          className={
            isPlanning
              ? "flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden px-6 pb-4 pt-0"
              : "min-w-0 w-full p-6"
          }
        >
          {children}
        </div>
      </main>
      <ToastProvider />
    </div>
  );
}
