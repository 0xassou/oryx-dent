/**
 * Les réglages (dont l’onglet admin « Sauvegardes ») sont sur `/settings`.
 */
import { redirect } from "next/navigation";

export default function ParametresRedirectPage() {
  redirect("/settings");
}
