/**
 * Planification locale : sauvegarde quotidienne à 02:00 (heure du serveur).
 * Démarré depuis instrumentation (runtime Node uniquement).
 */

import cron from "node-cron";
import { runBackupToDisk } from "@/lib/server/backup/oryx-backup";

let started = false;

export function startBackupCron(): void {
  if (started) return;
  started = true;

  if (process.env.DISABLE_BACKUP_CRON === "1") {
    console.log("[backup-cron] Désactivé (DISABLE_BACKUP_CRON=1).");
    return;
  }

  cron.schedule("0 2 * * *", async () => {
    try {
      if (!process.env.DATABASE_URL) {
        console.warn("[backup-cron] DATABASE_URL absent — sauvegarde ignorée.");
        return;
      }
      const { filename } = await runBackupToDisk();
      console.log(`✓ Backup automatique créé : ${filename}`);
    } catch (e) {
      console.error("[backup-cron] Échec :", e);
    }
  });

  console.log("[backup-cron] Planifié tous les jours à 02:00.");
}
