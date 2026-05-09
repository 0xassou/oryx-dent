import { getSession } from "@/app/actions/auth";
import SettingsPageClient from "@/components/settings/SettingsPageClient";

export default async function SettingsPage() {
  const session = await getSession();
  const isAdmin = session?.userId === "admin";
  return <SettingsPageClient isAdmin={isAdmin} />;
}
