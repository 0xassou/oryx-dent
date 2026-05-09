export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startBackupCron } = await import("./lib/server/cron/backup-cron");
    startBackupCron();
  }
}
