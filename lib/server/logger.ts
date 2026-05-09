/**
 * Journalisation serveur centralisée (Server Actions, routes API).
 * Prévu pour brancher un service de monitoring plus tard.
 */
export function logServerError(
  context: string,
  error: unknown,
  extra?: Record<string, unknown>,
): void {
  const message = error instanceof Error ? error.message : String(error);
  if (extra && Object.keys(extra).length > 0) {
    console.error(`[Oryx:${context}]`, message, extra);
  } else {
    console.error(`[Oryx:${context}]`, message);
  }
}
