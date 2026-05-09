import { isCabinetAdminFromSession } from "@/lib/server/auth/require-session";
import SettingsPageClient from "@/components/settings/SettingsPageClient";

export default async function SettingsPage() {
  const isAdmin = await isCabinetAdminFromSession();
  return <SettingsPageClient isAdmin={isAdmin} />;
}
