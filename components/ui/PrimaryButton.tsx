"use client";

import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./PrimaryButton.module.css";

export interface PrimaryButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  children: ReactNode;
  isLoading?: boolean;
}

export function PrimaryButton({
  children,
  className,
  disabled,
  isLoading = false,
  type = "button",
  ...rest
}: PrimaryButtonProps) {
  const isDisabled = Boolean(disabled) || isLoading;

  return (
    <button
      type={type}
      className={[styles.root, className].filter(Boolean).join(" ")}
      disabled={isDisabled}
      aria-busy={isLoading || undefined}
      {...rest}
    >
      <span className={styles.inner}>
        {isLoading ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
        ) : (
          children
        )}
      </span>
    </button>
  );
}
