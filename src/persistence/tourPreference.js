export const TOUR_PREFERENCE_KEY = "scopecraft:quick-tour:v1";

function resolveStorage(explicitStorage) {
  if (explicitStorage !== undefined) return explicitStorage;
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function hasCompletedQuickTour(storage) {
  const selected = resolveStorage(storage);
  if (!selected || typeof selected.getItem !== "function") return false;
  try {
    return selected.getItem(TOUR_PREFERENCE_KEY) === "complete";
  } catch {
    return false;
  }
}

export function markQuickTourComplete(storage) {
  const selected = resolveStorage(storage);
  if (!selected || typeof selected.setItem !== "function") return false;
  try {
    selected.setItem(TOUR_PREFERENCE_KEY, "complete");
    return true;
  } catch {
    return false;
  }
}
