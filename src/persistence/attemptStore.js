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
      for (const id of readIndex()) {
        const serialized = storage.getItem(recordKey(id));
        if (!serialized) continue;
        try {
          records.push(JSON.parse(serialized));
          validIds.push(id);
        } catch {
          // A corrupt record is omitted, while healthy attempts remain available.
        }
      }
      if (validIds.length !== readIndex().length) writeIndex(validIds);
      return records;
    },
    async clear() {
      readIndex().forEach((id) => storage.removeItem(recordKey(id)));
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
} = {}) {
  const memoryAdapter = createMemoryAdapter(memory ?? getSharedMemory(namespace));
  let adapterPromise;
  let activeAdapter;

  async function chooseAdapter() {
    if (suppliedAdapter) return suppliedAdapter;

    if (!forceFallback && (typeof globalThis.indexedDB !== "undefined" || openDBImpl !== openDB)) {
      try {
        return await createIndexedDbAdapter({ openDBImpl, databaseName, storeName });
      } catch {
        // Storage can be disabled in private or policy-controlled browsing contexts.
      }
    }

    const storage = resolveLocalStorage(explicitStorage);
    if (storageProbe(storage, namespace)) {
      return createLocalStorageAdapter(storage, namespace);
    }
    return memoryAdapter;
  }

  async function getAdapter() {
    if (!adapterPromise) adapterPromise = chooseAdapter();
    activeAdapter = await adapterPromise;
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

  async function saveAttempt(attempt) {
    assertValidAttemptState(attempt);
    const record = cloneJson(attempt);
    await run("put", record);
    return openAttemptState(record, compatibility);
  }

  async function loadAttempt(attemptId, expected = compatibility) {
    const record = await run("get", requireAttemptId(attemptId));
    if (record === undefined) return null;
    assertValidAttemptState(record);
    return openAttemptState(record, expected);
  }

  async function deleteAttempt(attemptId) {
    return run("delete", requireAttemptId(attemptId));
  }

  async function listAttempts(expected = compatibility) {
    const records = await run("getAll");
    const opened = [];
    for (const record of records) {
      try {
        assertValidAttemptState(record);
        opened.push(openAttemptState(record, expected));
      } catch {
        // One corrupt record must not make all saved attempts inaccessible.
      }
    }
    return opened.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
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
    await run("put", cloneJson(imported));
    return imported;
  }

  async function clearAttempts() {
    await run("clear");
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
