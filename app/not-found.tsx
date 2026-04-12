"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Home, ArrowLeft, Search } from "lucide-react";

export default function NotFound() {
  const router = useRouter();

  return (
    <div className="fixed inset-0 
      bg-[var(--ds-layout-bg,#ddd6fe)] 
      flex items-center justify-center p-4">
      
      <div className="w-full max-w-md 
        bg-[var(--ds-surface,#ffffff)] 
        rounded-2xl shadow-2xl 
        border border-[var(--ds-primary-border,#ede9fe)]
        p-8 text-center space-y-6">
        
        {/* Logo */}
        <div className="flex justify-center">
          <div className="flex h-14 w-14 
            items-center justify-center 
            rounded-2xl 
            bg-[var(--ds-primary,#7c3aed)]
            shadow-lg">
            <img
              src="/logo-white.svg"
              alt="Oryx"
              className="h-8 w-8 object-contain"
              style={{ filter: "brightness(0) invert(1)" }}
            />
          </div>
        </div>

        {/* 404 */}
        <div>
          <p className="text-8xl font-black 
            text-[var(--ds-primary,#7c3aed)] 
            leading-none tabular-nums 
            opacity-20">
            404
          </p>
          <h1 className="text-xl font-bold 
            text-[var(--ds-text,#0f172a)] 
            mt-2">
            Page introuvable
          </h1>
          <p className="text-sm 
            text-[var(--ds-text-muted,#64748b)] 
            mt-2 leading-relaxed">
            Cette page n&apos;existe pas ou 
            a été déplacée. Retournez au 
            tableau de bord pour continuer.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <Link
            href="/"
            className="flex items-center 
              justify-center gap-2 
              rounded-xl 
              bg-[var(--ds-primary,#7c3aed)]
              text-white text-sm font-semibold 
              px-4 py-3 transition-all
              hover:bg-[var(--ds-primary-hover,#6d28d9)]
              shadow-lg 
              shadow-[var(--ds-primary,#7c3aed)]/25">
            <Home className="h-4 w-4" />
            Tableau de bord
          </Link>

          <button
            onClick={() => router.back()}
            className="flex items-center 
              justify-center gap-2
              rounded-xl border 
              border-[var(--ds-primary-border,#ede9fe)]
              bg-[var(--ds-primary-soft,#f5f3ff)]
              text-[var(--ds-primary,#7c3aed)] 
              text-sm font-medium
              px-4 py-3 transition-all
              hover:bg-[var(--ds-primary,#7c3aed)]
              hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            Page précédente
          </button>
        </div>

        {/* Footer */}
        <p className="text-xs 
          text-[var(--ds-text-muted,#64748b)]">
          Oryx · Gestion Dentaire · Algérie
        </p>
      </div>
    </div>
  );
}
