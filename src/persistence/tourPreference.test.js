import { describe, expect, it } from "vitest";

import {
  TOUR_PREFERENCE_KEY,
  hasCompletedQuickTour,
  markQuickTourComplete,
} from "./tourPreference.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
}

describe("quick-tour preference", () => {
  it("records a versioned, local completion preference", () => {
    const storage = memoryStorage();
    expect(hasCompletedQuickTour(storage)).toBe(false);
    expect(markQuickTourComplete(storage)).toBe(true);
    expect(storage.getItem(TOUR_PREFERENCE_KEY)).toBe("complete");
    expect(hasCompletedQuickTour(storage)).toBe(true);
  });

  it("fails closed when browser storage is unavailable", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(hasCompletedQuickTour(blocked)).toBe(false);
    expect(markQuickTourComplete(blocked)).toBe(false);
  });
});
