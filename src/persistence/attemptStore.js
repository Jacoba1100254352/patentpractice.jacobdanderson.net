import { openDB } from "idb";

import {
  ATTEMPT_SCHEMA_VERSION,
  AttemptValidationError,
  assertValidAttemptState,
  cloneJson,
  openAttemptState,
} from "../domain/workflow.js";

const DATABASE_VERSION = 1;
const DEFAULT_DATABASE_NAME = "scopecraft";
const DEFAULT_STORE_NAME = "attempts";
const EXPORT_FORMAT = "scopecraft-attempt";
const EXPORT_FORMAT_VERSION = 1;
const sharedMemoryStores = new Map();

export const ATTEMPT_RETENTION_POLICY = Object.freeze({
  maxAgeDays: 90,
  maxAttempts: 20,
  maxRecordBytes: 1024 * 1024,
  maxTotalBytes: 8 * 1024 * 1024,
});

export class AttemptPersistenceError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = "AttemptPersistenceError";
  }
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireAttemptId(attemptId) {
  if (typeof attemptId !== "string" || attemptId.trim().length === 0) {
    throw new AttemptValidationError("attemptId is required.");
  }
  return attemptId;
}

function readJson(serialized, label) {
  if (typeof serialized !== "string") {
    return cloneJson(serialized);
  }
  try {
    return JSON.parse(serialized);
  } catch (error) {
    throw new AttemptValidationError(`${label} is not valid JSON.`, [error.message]);
  }
}

function getSharedMemory(namespace) {
  if (!sharedMemoryStores.has(namespace)) {
    sharedMemoryStores.set(namespace, new Map());
  }
  return sharedMemoryStores.get(namespace);
}

function createMemoryAdapter(map) {
  return {
    kind: "memory",
    async get(id) {
      return map.has(id) ? cloneJson(map.get(id)) : undefined;
    },
    async put(attempt) {
      map.set(attempt.attemptId, cloneJson(attempt));
    },
    async delete(id) {
      return map.delete(id);
    },
    async getAll() {
      return Array.from(map.values(), cloneJson);
    },
    async clear() {
      map.clear();
    },
  };
}

function storageProbe(storage, namespace) {
  if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
    return false;
  }
  const key = `${namespace}:probe`;
  try {
    storage.setItem(key, "1");
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function createLocalStorageAdapter(storage, namespace) {
  const indexKey = `${namespace}:index`;
  const recordPrefix = `${namespace}:attempt:`;
  const recordKey = (id) => `${namespace}:attempt:${id}`;

  function readIndex() {
    const serialized = storage.getItem(indexKey);
    if (!serialized) return [];
    try {
      const ids = JSON.parse(serialized);
      return Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : [];
    } catch {
      return [];
    }
  }

  function writeIndex(ids) {
    storage.setItem(indexKey, JSON.stringify(Array.from(new Set(ids))));
  }

  function enumerateIds() {
    const ids = new Set(readIndex());
    if (typeof storage.key === "function" && Number.isInteger(storage.length)) {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key?.startsWith(recordPrefix)) ids.add(key.slice(recordPrefix.length));
      }
    }
    return Array.from(ids);
  }

  return {
    kind: "localStorage",
    async get(id) {
      const serialized = storage.getItem(recordKey(id));
      return serialized ? JSON.parse(serialized) : undefined;
    },
    async put(attempt) {
      storage.setItem(recordKey(attempt.attemptId), JSON.stringify(attempt));
      writeIndex([...readIndex(), attempt.attemptId]);
    },
    async delete(id) {
      const existed = storage.getItem(recordKey(id)) !== null;
      storage.removeItem(recordKey(id));
      writeIndex(readIndex().filter((candidate) => candidate !== id));
      return existed;
    },
    async getAll() {
      const records = [];
      const validIds = [];
      const indexedIds = enumerateIds();
      for (const id of indexedIds) {
        const serialized = storage.getItem(recordKey(id));
        if (!serialized) continue;
        try {
          records.push(JSON.parse(serialized));
          validIds.push(id);
        } catch {
          storage.removeItem(recordKey(id));
        }
      }
      if (validIds.length !== indexedIds.length) writeIndex(validIds);
      return records;
    },
    async clear() {
      enumerateIds().forEach((id) => storage.removeItem(recordKey(id)));
      storage.removeItem(indexKey);
    },
  };
}

async function createIndexedDbAdapter({ openDBImpl, databaseName, storeName }) {
  const database = await openDBImpl(databaseName, DATABASE_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName, { keyPath: "attemptId" });
      }
    },
  });

  return {
    kind: "indexedDB",
    async get(id) {
      return database.get(storeName, id);
    },
    async put(attempt) {
      await database.put(storeName, attempt);
    },
    async delete(id) {
      const existed = (await database.getKey(storeName, id)) !== undefined;
      await database.delete(storeName, id);
      return existed;
    },
    async getAll() {
      return database.getAll(storeName);
    },
    async clear() {
      await database.clear(storeName);
    },
  };
}

function resolveLocalStorage(explicitStorage) {
  if (explicitStorage !== undefined) return explicitStorage;
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * Converts an attempt into a portable, versioned JSON envelope. It contains no
 * account data, telemetry identifiers, or network references.
 */
export function exportAttemptState(attempt, { pretty = true, now } = {}) {
  assertValidAttemptState(attempt);
  const timestamp = now === undefined
    ? new Date().toISOString()
    : new Date(typeof now === "function" ? now() : now).toISOString();
  const envelope = {
    format: EXPORT_FORMAT,
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: timestamp,
    attempt: cloneJson(attempt),
  };
  return JSON.stringify(envelope, null, pretty ? 2 : 0);
}

/**
 * Validates a portable envelope and flags old or hash-mismatched content read-only.
 */
export function importAttemptState(serialized, { compatibility = {} } = {}) {
  const envelope = readJson(serialized, "Attempt import");
  if (!isObject(envelope)) {
    throw new AttemptValidationError("Attempt import must contain an object.");
  }
  if (envelope.format !== EXPORT_FORMAT || envelope.formatVersion !== EXPORT_FORMAT_VERSION) {
    throw new AttemptValidationError("Attempt import format is not supported.");
  }
  assertValidAttemptState(envelope.attempt);
  return openAttemptState(envelope.attempt, compatibility);
}

/**
 * Creates a storage facade. IndexedDB is preferred; blocked/private contexts fall
 * through to localStorage and then an in-memory map without calling the network.
 */
export function createAttemptStore({
  databaseName = DEFAULT_DATABASE_NAME,
  storeName = DEFAULT_STORE_NAME,
  namespace = `${databaseName}:${storeName}`,
  compatibility = {},
  forceFallback = false,
  localStorage: explicitStorage,
  memory,
  openDB: openDBImpl = openDB,
  adapter: suppliedAdapter,
  retentionPolicy = ATTEMPT_RETENTION_POLICY,
  now = () => Date.now(),
} = {}) {
  const memoryAdapter = createMemoryAdapter(memory ?? getSharedMemory(namespace));
  const knownAdapters = new Set([memoryAdapter]);
  let adapterPromise;
  let activeAdapter;

  function nowMilliseconds() {
    const value = typeof now === "function" ? now() : now;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new AttemptPersistenceError("Attempt retention clock is invalid.");
    }
    return date.getTime();
  }

  function recordSize(record) {
    return new TextEncoder().encode(JSON.stringify(record)).byteLength;
  }

  function recordTimestamp(record) {
    const timestamp = Date.parse(record.updatedAt);
    if (Number.isNaN(timestamp)) {
      throw new AttemptValidationError("Attempt updatedAt is invalid.");
    }
    return timestamp;
  }

  function assertRecordWithinPolicy(record) {
    const bytes = recordSize(record);
    if (bytes > retentionPolicy.maxRecordBytes) {
      throw new AttemptPersistenceError(
        `Attempt ${record.attemptId} exceeds the ${retentionPolicy.maxRecordBytes}-byte local-storage limit. Export a smaller record instead.`,
      );
    }
    const age = nowMilliseconds() - recordTimestamp(record);
    if (age > retentionPolicy.maxAgeDays * 24 * 60 * 60 * 1000) {
      throw new AttemptPersistenceError(
        `Attempt ${record.attemptId} is outside the ${retentionPolicy.maxAgeDays}-day retention window.`,
      );
    }
    return bytes;
  }

  async function chooseAdapter() {
    if (suppliedAdapter) {
      knownAdapters.add(suppliedAdapter);
      return suppliedAdapter;
    }

    const storage = resolveLocalStorage(explicitStorage);
    const localStorageAdapter = storageProbe(storage, namespace)
      ? createLocalStorageAdapter(storage, namespace)
      : null;
    if (localStorageAdapter) knownAdapters.add(localStorageAdapter);

    if (!forceFallback && (typeof globalThis.indexedDB !== "undefined" || openDBImpl !== openDB)) {
      try {
        const indexedDbAdapter = await createIndexedDbAdapter({
          openDBImpl,
          databaseName,
          storeName,
        });
        knownAdapters.add(indexedDbAdapter);
        return indexedDbAdapter;
      } catch {
        // Storage can be disabled in private or policy-controlled browsing contexts.
      }
    }

    if (localStorageAdapter) return localStorageAdapter;
    return memoryAdapter;
  }

  async function getAdapter() {
    if (!adapterPromise) adapterPromise = chooseAdapter();
    activeAdapter = await adapterPromise;
    knownAdapters.add(activeAdapter);
    return activeAdapter;
  }

  async function run(method, ...args) {
    const selected = await getAdapter();
    try {
      return await selected[method](...args);
    } catch (error) {
      if (selected.kind === "memory" || suppliedAdapter) {
        throw new AttemptPersistenceError(`Attempt storage ${method} failed.`, error);
      }

      // A backend can become unavailable after its initial probe. Retry this
      // operation in memory so drafting can continue without data loss in-session.
      activeAdapter = memoryAdapter;
      adapterPromise = Promise.resolve(memoryAdapter);
      try {
        return await memoryAdapter[method](...args);
      } catch (fallbackError) {
        throw new AttemptPersistenceError(`Attempt storage ${method} failed.`, fallbackError);
      }
    }
  }

  async function runAcrossKnownAdapters(method, ...args) {
    await getAdapter();
    const results = await Promise.allSettled(
      Array.from(knownAdapters, (candidate) => candidate[method](...args)),
    );
    const failure = results.find((result) => result.status === "rejected");
    if (failure) {
      throw new AttemptPersistenceError(
        `Attempt storage ${method} did not complete across every active local backend.`,
        failure.reason,
      );
    }
    return results.map((result) => result.value);
  }

  async function pruneAndOpen(expected = compatibility) {
    const records = await run("getAll");
    const currentTime = nowMilliseconds();
    const candidates = [];
    const rejectedIds = new Set();

    for (const record of records) {
      try {
        assertValidAttemptState(record);
        const bytes = recordSize(record);
        const timestamp = recordTimestamp(record);
        if (
          bytes > retentionPolicy.maxRecordBytes
          || currentTime - timestamp > retentionPolicy.maxAgeDays * 24 * 60 * 60 * 1000
        ) {
          rejectedIds.add(record.attemptId);
          continue;
        }
        candidates.push({ bytes, record, timestamp });
      } catch {
        if (typeof record?.attemptId === "string") rejectedIds.add(record.attemptId);
      }
    }

    candidates.sort((left, right) => right.timestamp - left.timestamp);
    const retained = [];
    let retainedBytes = 0;
    for (const candidate of candidates) {
      if (
        retained.length >= retentionPolicy.maxAttempts
        || retainedBytes + candidate.bytes > retentionPolicy.maxTotalBytes
      ) {
        rejectedIds.add(candidate.record.attemptId);
        continue;
      }
      retained.push(candidate.record);
      retainedBytes += candidate.bytes;
    }

    for (const attemptId of rejectedIds) {
      await runAcrossKnownAdapters("delete", attemptId);
    }

    return retained.map((record) => openAttemptState(record, expected));
  }

  async function saveAttempt(attempt) {
    assertValidAttemptState(attempt);
    const record = cloneJson(attempt);
    assertRecordWithinPolicy(record);
    await run("put", record);
    await pruneAndOpen();
    return openAttemptState(record, compatibility);
  }

  async function loadAttempt(attemptId, expected = compatibility) {
    const record = await run("get", requireAttemptId(attemptId));
    if (record === undefined) return null;
    assertValidAttemptState(record);
    return openAttemptState(record, expected);
  }

  async function deleteAttempt(attemptId) {
    const results = await runAcrossKnownAdapters("delete", requireAttemptId(attemptId));
    return results.some(Boolean);
  }

  async function listAttempts(expected = compatibility) {
    return pruneAndOpen(expected);
  }

  async function exportAttempt(attemptId, options = {}) {
    const attempt = await loadAttempt(attemptId, options.compatibility ?? compatibility);
    if (!attempt) {
      throw new AttemptPersistenceError(`Attempt ${attemptId} was not found.`);
    }
    return exportAttemptState(attempt, options);
  }

  async function importAttempt(serialized, options = {}) {
    const imported = importAttemptState(serialized, {
      compatibility: options.compatibility ?? compatibility,
    });
    if (!options.overwrite && (await run("get", imported.attemptId)) !== undefined) {
      throw new AttemptPersistenceError(
        `Attempt ${imported.attemptId} already exists. Choose overwrite explicitly to replace it.`,
      );
    }
    const record = cloneJson(imported);
    assertRecordWithinPolicy(record);
    await run("put", record);
    await pruneAndOpen(options.compatibility ?? compatibility);
    return imported;
  }

  async function clearAttempts() {
    await runAcrossKnownAdapters("clear");
  }

  async function backend() {
    return (await getAdapter()).kind;
  }

  return Object.freeze({
    saveAttempt,
    loadAttempt,
    deleteAttempt,
    listAttempts,
    exportAttempt,
    importAttempt,
    clearAttempts,
    backend,
    save: saveAttempt,
    load: loadAttempt,
    delete: deleteAttempt,
    list: listAttempts,
    export: exportAttempt,
    import: importAttempt,
  });
}

export const ATTEMPT_EXPORT_FORMAT = Object.freeze({
  name: EXPORT_FORMAT,
  version: EXPORT_FORMAT_VERSION,
  attemptSchemaVersion: ATTEMPT_SCHEMA_VERSION,
});
