import { describe, expect, it } from "vitest";

import {
  ACTION_TYPES,
  AttemptValidationError,
  attemptReducer,
  createAttemptState,
} from "../domain/workflow.js";
import {
  AttemptPersistenceError,
  createAttemptStore,
  exportAttemptState,
  importAttemptState,
} from "./attemptStore.js";

function makeAttempt({ id = "attempt-persisted", challengeHash = "challenge-v1" } = {}) {
  let state = createAttemptState({
    attemptId: id,
    challengeId: "adaptive-mouse",
    challengeVersion: "1.0.0",
    challengeHash,
    engineVersion: "2.0.0",
    engineHash: "engine-v2",
    mappingChallenges: [{ id: "support", source: "paragraph-14" }],
    now: "2026-08-24T13:00:00.000Z",
  });
  state = attemptReducer(state, {
    type: ACTION_TYPES.START_DRAFTING,
    meta: { now: "2026-08-24T13:01:00.000Z" },
  });
  return state;
}

function createFakeLocalStorage() {
  const values = new Map();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    key(index) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

describe("attempt persistence", () => {
  it("uses the in-memory fallback for tests and supports the full CRUD surface", async () => {
    const memory = new Map();
    const store = createAttemptStore({
      namespace: "test-memory-crud",
      forceFallback: true,
      localStorage: null,
      memory,
    });
    const attempt = makeAttempt();

    expect(await store.backend()).toBe("memory");
    await store.save(attempt);
    expect((await store.load(attempt.attemptId)).attemptId).toBe(attempt.attemptId);
    expect(await store.list()).toHaveLength(1);
    expect(await store.delete(attempt.attemptId)).toBe(true);
    expect(await store.load(attempt.attemptId)).toBeNull();
  });

  it("uses localStorage when IndexedDB is unavailable and persists across facades", async () => {
    const localStorage = createFakeLocalStorage();
    const first = createAttemptStore({
      namespace: "test-local-storage",
      forceFallback: true,
      localStorage,
    });
    const second = createAttemptStore({
      namespace: "test-local-storage",
      forceFallback: true,
      localStorage,
    });

    await first.save(makeAttempt({ id: "local-one" }));
    expect(await first.backend()).toBe("localStorage");
    expect((await second.load("local-one")).challenge.hash).toBe("challenge-v1");
  });

  it("falls back to memory when localStorage is blocked", async () => {
    const blockedStorage = {
      getItem() {
        throw new Error("blocked");
      },
      removeItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    };
    const store = createAttemptStore({
      namespace: "test-blocked-storage",
      forceFallback: true,
      localStorage: blockedStorage,
      memory: new Map(),
    });

    await store.save(makeAttempt({ id: "private-mode" }));
    expect(await store.backend()).toBe("memory");
    expect((await store.load("private-mode")).attemptId).toBe("private-mode");
  });

  it("falls through a blocked IndexedDB open to localStorage", async () => {
    const localStorage = createFakeLocalStorage();
    const store = createAttemptStore({
      namespace: "test-blocked-indexed-db",
      localStorage,
      openDB: async () => {
        throw new Error("IndexedDB denied by browser policy");
      },
    });

    await store.save(makeAttempt({ id: "blocked-idb" }));
    expect(await store.backend()).toBe("localStorage");
    expect((await store.load("blocked-idb")).attemptId).toBe("blocked-idb");
  });

  it("exports and imports a validated envelope without losing hashes or mappings", async () => {
    const source = makeAttempt();
    const serialized = exportAttemptState(source, {
      now: "2026-08-24T14:00:00.000Z",
    });
    const imported = importAttemptState(serialized, {
      compatibility: {
        challengeHash: "challenge-v1",
        engineHash: "engine-v2",
      },
    });

    expect(imported.challenge.hash).toBe("challenge-v1");
    expect(imported.engine.hash).toBe("engine-v2");
    expect(imported.mappingChallenges).toEqual(source.mappingChallenges);
    expect(imported.readOnly).toBe(false);

    const store = createAttemptStore({
      namespace: "test-import",
      forceFallback: true,
      localStorage: null,
      memory: new Map(),
    });
    await store.importAttempt(serialized);
    expect((await store.exportAttempt(source.attemptId))).toContain("scopecraft-attempt");
    await expect(store.importAttempt(serialized)).rejects.toBeInstanceOf(AttemptPersistenceError);
    await expect(store.importAttempt(serialized, { overwrite: true })).resolves.toMatchObject({
      attemptId: source.attemptId,
    });
  });

  it("rejects malformed and schema-invalid imports", () => {
    expect(() => importAttemptState("not json")).toThrow(AttemptValidationError);
    expect(() => importAttemptState(JSON.stringify({ attemptId: "bare" }))).toThrow(
      /format is not supported/,
    );

    const envelope = JSON.parse(exportAttemptState(makeAttempt()));
    envelope.attempt.challenge.hash = "";
    expect(() => importAttemptState(envelope)).toThrow(AttemptValidationError);
  });

  it("flags challenge, engine, and schema mismatches read-only on load", async () => {
    const store = createAttemptStore({
      namespace: "test-mismatch",
      forceFallback: true,
      localStorage: null,
      memory: new Map(),
    });
    await store.save(makeAttempt());

    const mismatch = await store.load("attempt-persisted", {
      challengeHash: "challenge-v2",
      engineHash: "engine-v3",
      schemaVersion: 2,
    });
    expect(mismatch.readOnly).toBe(true);
    expect(mismatch.compatibility.reasons.map((reason) => reason.code)).toEqual([
      "schema-version",
      "challenge-hash",
      "engine-hash",
    ]);
    expect(mismatch.challenge.hash).toBe("challenge-v1");
    expect(mismatch.engine.hash).toBe("engine-v2");
  });

  it("opens a structurally valid attempt from another schema version as read-only", () => {
    const envelope = JSON.parse(exportAttemptState(makeAttempt()));
    envelope.attempt.schemaVersion = 2;
    const imported = importAttemptState(envelope);
    expect(imported.readOnly).toBe(true);
    expect(imported.compatibility.reasons[0]).toMatchObject({ code: "schema-version" });
  });
});
