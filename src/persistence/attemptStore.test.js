import { describe, expect, it } from "vitest";

import {
  ACTION_TYPES,
  AttemptValidationError,
  attemptReducer,
  createAttemptState,
} from "../domain/workflow.js";
import {
  ATTEMPT_RETENTION_POLICY,
  AttemptPersistenceError,
  createAttemptStore,
  exportAttemptState,
  importAttemptState,
} from "./attemptStore.js";

function makeAttempt({
  id = "attempt-persisted",
  challengeHash = "challenge-v1",
  now = "2026-08-24T13:00:00.000Z",
} = {}) {
  let state = createAttemptState({
    attemptId: id,
    challengeId: "adaptive-mouse",
    challengeVersion: "1.0.0",
    challengeHash,
    engineVersion: "2.0.0",
    engineHash: "engine-v2",
    mappingChallenges: [{ id: "support", source: "paragraph-14" }],
    now,
  });
  state = attemptReducer(state, {
    type: ACTION_TYPES.START_DRAFTING,
    meta: { now: new Date(Date.parse(now) + 60_000).toISOString() },
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

  it("prunes expired and excess browser records under the documented retention policy", async () => {
    const memory = new Map();
    memory.set("expired", makeAttempt({
      id: "expired",
      now: "2026-05-01T12:00:00.000Z",
    }));
    for (let day = 1; day <= 22; day += 1) {
      const attempt = makeAttempt({
        id: `september-${String(day).padStart(2, "0")}`,
        now: `2026-09-${String(day).padStart(2, "0")}T12:00:00.000Z`,
      });
      memory.set(attempt.attemptId, attempt);
    }
    const store = createAttemptStore({
      namespace: "test-retention",
      forceFallback: true,
      localStorage: null,
      memory,
      now: "2026-09-26T12:00:00.000Z",
    });

    const listed = await store.list();
    expect(listed).toHaveLength(ATTEMPT_RETENTION_POLICY.maxAttempts);
    expect(listed[0].attemptId).toBe("september-22");
    expect(listed.at(-1).attemptId).toBe("september-03");
    expect(memory.has("expired")).toBe(false);
    expect(memory.has("september-01")).toBe(false);
    expect(memory.has("september-02")).toBe(false);
  });

  it("rejects a single saved draft that exceeds the local record limit", async () => {
    const store = createAttemptStore({
      namespace: "test-record-limit",
      forceFallback: true,
      localStorage: null,
      memory: new Map(),
      now: "2026-09-26T12:00:00.000Z",
    });
    const oversized = makeAttempt({ now: "2026-09-26T11:00:00.000Z" });
    oversized.draft.notes = "x".repeat(ATTEMPT_RETENTION_POLICY.maxRecordBytes);

    await expect(store.save(oversized)).rejects.toThrow(/exceeds.*local-storage limit/iu);
  });

  it("drops the oldest records when the aggregate browser-storage limit is reached", async () => {
    const records = [1, 2, 3].map((day) => makeAttempt({
      id: `aggregate-${day}`,
      now: `2026-09-2${day}T12:00:00.000Z`,
    }));
    const recordBytes = (record) => new TextEncoder().encode(JSON.stringify(record)).byteLength;
    const memory = new Map(records.map((record) => [record.attemptId, record]));
    const store = createAttemptStore({
      namespace: "test-aggregate-limit",
      forceFallback: true,
      localStorage: null,
      memory,
      now: "2026-09-26T12:00:00.000Z",
      retentionPolicy: {
        ...ATTEMPT_RETENTION_POLICY,
        maxTotalBytes: recordBytes(records[1]) + recordBytes(records[2]),
      },
    });

    expect((await store.list()).map((record) => record.attemptId)).toEqual([
      "aggregate-3",
      "aggregate-2",
    ]);
    expect(memory.has("aggregate-1")).toBe(false);
  });

  it("clears orphaned localStorage records even when the saved index is corrupt", async () => {
    const localStorage = createFakeLocalStorage();
    const namespace = "test-orphan-clear";
    localStorage.setItem(`${namespace}:index`, "not-json");
    localStorage.setItem(
      `${namespace}:attempt:orphaned-draft`,
      JSON.stringify(makeAttempt({ id: "orphaned-draft" })),
    );
    const store = createAttemptStore({
      namespace,
      forceFallback: true,
      localStorage,
      now: "2026-09-26T12:00:00.000Z",
    });

    await store.clearAttempts();
    expect(localStorage.getItem(`${namespace}:attempt:orphaned-draft`)).toBeNull();
    expect(localStorage.getItem(`${namespace}:index`)).toBeNull();
  });

  it("clears dormant localStorage drafts while IndexedDB is active", async () => {
    const localStorage = createFakeLocalStorage();
    const namespace = "test-cross-backend-clear";
    localStorage.setItem(`${namespace}:index`, JSON.stringify(["confidential-draft"]));
    localStorage.setItem(
      `${namespace}:attempt:confidential-draft`,
      JSON.stringify(makeAttempt({ id: "confidential-draft" })),
    );
    const indexedRecords = new Map([
      ["indexed-draft", makeAttempt({ id: "indexed-draft" })],
    ]);
    const fakeDatabase = {
      async clear() {
        indexedRecords.clear();
      },
      async delete(storeName, id) {
        indexedRecords.delete(id);
      },
      async get(storeName, id) {
        return indexedRecords.get(id);
      },
      async getAll() {
        return Array.from(indexedRecords.values());
      },
      async getKey(storeName, id) {
        return indexedRecords.has(id) ? id : undefined;
      },
      async put(storeName, attempt) {
        indexedRecords.set(attempt.attemptId, attempt);
      },
    };
    const store = createAttemptStore({
      namespace,
      localStorage,
      openDB: async () => fakeDatabase,
      now: "2026-09-26T12:00:00.000Z",
    });

    expect(await store.backend()).toBe("indexedDB");
    await store.clearAttempts();

    expect(indexedRecords.size).toBe(0);
    expect(localStorage.getItem(`${namespace}:attempt:confidential-draft`)).toBeNull();
    expect(localStorage.getItem(`${namespace}:index`)).toBeNull();
  });
});
