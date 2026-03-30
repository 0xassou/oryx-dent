export const APP_TOAST_EVENT = "dental-app-toast";

export function showAppToast(message: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(APP_TOAST_EVENT, { detail: { message } }),
  );
}
