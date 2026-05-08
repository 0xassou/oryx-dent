import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Gestion Financière",
};

export default function FinancesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

