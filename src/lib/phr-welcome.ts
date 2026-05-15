const WELCOME_STORAGE_PREFIX = "phr-welcome-seen-v1";

function welcomeStorageKey(uid: string): string {
  return `${WELCOME_STORAGE_PREFIX}:${uid}`;
}

export function hasSeenWelcomePanel(uid: string): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(welcomeStorageKey(uid)) === "1";
}

export function markWelcomePanelSeen(uid: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(welcomeStorageKey(uid), "1");
}

const IMPORT_PANEL_DISMISSED_KEY = "phr-import-panel-dismissed-v1";

/** Panneau « Analyser tes propres mains » déjà masqué (au moins un import effectué). */
export function hasDismissedImportPanel(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(IMPORT_PANEL_DISMISSED_KEY) === "1";
}

export function markImportPanelDismissed(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(IMPORT_PANEL_DISMISSED_KEY, "1");
}
