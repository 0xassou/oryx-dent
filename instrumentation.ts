export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  const { startBackupCron } = await import("@/lib/server/cron/backup-cron");
  startBackupCron();
}
