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
