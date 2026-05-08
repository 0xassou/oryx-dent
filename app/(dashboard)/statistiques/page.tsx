import { redirect } from "next/navigation";

export default function StatistiquesPage() {
  redirect("/finances?tab=statistiques");
}
