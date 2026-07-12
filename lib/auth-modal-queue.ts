const TUTORIAL_DISMISSED_KEY = "found-u-tutorial-dismissed-session";

export type AuthModalType = "registration" | "tutorial" | null;

export function resolveActiveModal(params: {
  needsRegistration: boolean;
  showTutorial: boolean;
}): AuthModalType {
  if (params.needsRegistration) return "registration";
  if (params.showTutorial) return "tutorial";
  return null;
}

export function isTutorialDismissedThisSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(TUTORIAL_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function markTutorialDismissedThisSession(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(TUTORIAL_DISMISSED_KEY, "1");
  } catch {
    // ignore
  }
}

export const TUTORIAL_DEFER_MS = 500;

export function deferAfterNavigation(callback: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  let cancelled = false;
  let frame = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const run = () => {
    frame += 1;
    if (frame < 2) {
      window.requestAnimationFrame(run);
      return;
    }
    timer = setTimeout(() => {
      if (!cancelled) callback();
    }, TUTORIAL_DEFER_MS);
  };

  window.requestAnimationFrame(run);

  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
  };
}
