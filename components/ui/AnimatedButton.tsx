"use client";

import Link from "next/link";
import type { ReactNode } from "react";

interface AnimatedButtonProps {
  onClick?: () => void;
  href?: string;
  children: ReactNode;
  className?: string;
  type?: "button" | "submit";
  variant?: "primary" | "danger" | "ghost";
}

export default function AnimatedButton({
  onClick,
  href,
  children,
  className = "",
  type = "button",
  variant = "primary",
}: AnimatedButtonProps) {
  const bgColor =
    variant === "danger"
      ? "bg-red-600"
      : variant === "ghost"
        ? "bg-[var(--ds-surface)]"
        : "bg-[var(--ds-primary)]";

  const hoverColor =
    variant === "danger"
      ? "bg-red-700"
      : variant === "ghost"
        ? "bg-[var(--ds-primary-soft)]"
        : "bg-[var(--ds-primary-hover)]";

  const textColor =
    variant === "ghost" ? "text-[var(--ds-primary)]" : "text-white";

  const sharedClass = [
    "relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-xl px-5 py-2.5 tracking-tight",
    textColor,
    bgColor,
    "group transition-all duration-300 hover:shadow-lg hover:shadow-[var(--ds-primary)]/20",
    className,
  ].join(" ");

  const inner = (
    <>
      <span
        className={`absolute h-0 w-0 rounded-full transition-all duration-500 ease-out ${hoverColor} group-hover:h-64 group-hover:w-64`}
      />

      <span className="pointer-events-none absolute bottom-0 left-0 -ml-2 h-full opacity-60">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-full w-auto"
          viewBox="0 0 487 487"
          aria-hidden
        >
          <path
            fillOpacity=".1"
            fillRule="nonzero"
            fill="#FFF"
            d="M0 .3c67 2.1 134.1 4.3 186.3 37 52.2 32.7 89.6 95.8 112.8 150.6 23.2 54.8 32.3 101.4 61.2 149.9 28.9 48.4 77.7 98.8 126.4 149.2H0V.3z"
          />
        </svg>
      </span>

      <span className="pointer-events-none absolute right-0 top-0 -mr-3 h-full w-12 opacity-60">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-full w-full object-cover"
          viewBox="0 0 487 487"
          aria-hidden
        >
          <path
            fillOpacity=".1"
            fillRule="nonzero"
            fill="#FFF"
            d="M487 486.7c-66.1-3.6-132.3-7.3-186.3-37s-95.9-85.3-126.2-137.2c-30.4-51.8-49.3-99.9-76.5-151.4C70.9 109.6 35.6 54.8.3 0H487v486.7z"
          />
        </svg>
      </span>

      <span className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-b from-white via-transparent to-transparent opacity-20" />

      <span className="relative z-10 flex items-center gap-2 text-sm font-semibold">
        {children}
      </span>
    </>
  );

  if (href) {
    return (
      <Link href={href} onClick={onClick} className={sharedClass}>
        {inner}
      </Link>
    );
  }

  return (
    <button type={type} onClick={onClick} className={sharedClass}>
      {inner}
    </button>
  );
}
