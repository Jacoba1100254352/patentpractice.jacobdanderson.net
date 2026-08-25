export const ATTEMPT_SCHEMA_VERSION = 1;

export const PHASES = Object.freeze([
  "briefing",
  "drafting",
  "preflight",
  "office-action",
  "response",
  "final-action",
  "competitor-prediction",
  "competitor-result",
  "debrief",
]);

export const ACTION_TYPES = Object.freeze({
  START_DRAFTING: "attempt/start-drafting",
  UPDATE_DRAFT: "attempt/update-draft",
  SET_MAPPING_RESPONSE: "attempt/set-mapping-response",
  REQUEST_PREFLIGHT: "attempt/request-preflight",
  SET_PREFLIGHT_RESULT: "attempt/set-preflight-result",
  SUBMIT_APPLICATION: "attempt/submit-application",
  SET_OFFICE_ACTION: "attempt/set-office-action",
  OPEN_RESPONSE: "attempt/open-response",
  UPDATE_RESPONSE: "attempt/update-response",
  SUBMIT_RESPONSE: "attempt/submit-response",
  SET_FINAL_ACTION: "attempt/set-final-action",
  START_COMPETITOR_PREDICTION: "attempt/start-competitor-prediction",
  UPDATE_COMPETITOR_PREDICTION: "attempt/update-competitor-prediction",
  SUBMIT_COMPETITOR_PREDICTION: "attempt/submit-competitor-prediction",
  SET_COMPETITOR_RESULT: "attempt/set-competitor-result",
  OPEN_DEBRIEF: "attempt/open-debrief",
  SET_DEBRIEF: "attempt/set-debrief",
  MARK_SAVED: "attempt/mark-saved",
  RESET_ATTEMPT: "attempt/reset",
  NEW_ATTEMPT: "attempt/new",
});

const KNOWN_ACTIONS = new Set(Object.values(ACTION_TYPES));
const SNAPSHOT_KEYS = ["original", "submitted", "amended"];

export class AttemptValidationError extends Error {
  constructor(message, errors = []) {
    super(message);
    this.name = "AttemptValidationError";
    this.errors = errors;
  }
}

export class AttemptTransitionError extends Error {
  constructor(message, { actionType, phase } = {}) {
    super(message);
    this.name = "AttemptTransitionError";
    this.actionType = actionType;
    this.phase = phase;
  }
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoDate(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function nowIso(now) {
  const value = typeof now === "function" ? now() : now;
  const date = value === undefined ? new Date() : value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new AttemptValidationError("The attempt timestamp is invalid.");
  }

  return date.toISOString();
}

function makeAttemptId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `attempt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function findJsonIssue(value, path = "value", ancestors = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? null : `${path} contains a non-finite number.`;
  }
  if (typeof value !== "object") {
    return `${path} contains an unsupported ${typeof value} value.`;
  }
  if (ancestors.has(value)) return `${path} contains a circular reference.`;

  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    return `${path} must contain only plain JSON objects.`;
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    return `${path} contains symbol-keyed data.`;
  }

  ancestors.add(value);
  const entries = Array.isArray(value)
    ? value.map((item, index) => [index, item])
    : Object.entries(value);
  for (const [key, child] of entries) {
    const issue = findJsonIssue(child, `${path}.${key}`, ancestors);
    if (issue) return issue;
  }
  ancestors.delete(value);
  return null;
}

export function cloneJson(value) {
  if (value === undefined) {
    return undefined;
  }
  const issue = findJsonIssue(value);
  if (issue) throw new AttemptValidationError(issue, [issue]);
  return JSON.parse(JSON.stringify(value));
}

export function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

function defaultCompatibility() {
  return {
    status: "current",
    readOnly: false,
    reasons: [],
  };
}

function defaultDraft(initialDraft) {
  if (initialDraft === undefined) {
    return {
      claims: [],
      notes: "",
    };
  }

  if (!isObject(initialDraft)) {
    throw new AttemptValidationError("initialDraft must be an object.");
  }

  return cloneJson(initialDraft);
}

/**
 * Creates a complete, serializable attempt. Pass explicit IDs and clocks in tests.
 */
export function createAttemptState({
  attemptId = makeAttemptId(),
  challengeId,
  challengeVersion = "1",
  challengeHash,
  engineVersion = "1",
  engineHash,
  difficulty = "guided",
  mappingChallenges = [],
  initialDraft,
  now,
} = {}) {
  if (!isNonEmptyString(attemptId)) {
    throw new AttemptValidationError("attemptId is required.");
  }
  if (!isNonEmptyString(challengeId) || !isNonEmptyString(challengeHash)) {
    throw new AttemptValidationError("challengeId and challengeHash are required.");
  }
  if (!isNonEmptyString(engineVersion) || !isNonEmptyString(engineHash)) {
    throw new AttemptValidationError("engineVersion and engineHash are required.");
  }
  if (!Array.isArray(mappingChallenges)) {
    throw new AttemptValidationError("mappingChallenges must be an array.");
  }

  const timestamp = nowIso(now);
  const state = {
    schemaVersion: ATTEMPT_SCHEMA_VERSION,
    attemptId,
    challenge: {
      id: challengeId,
      version: String(challengeVersion),
      hash: challengeHash,
    },
    engine: {
      version: String(engineVersion),
      hash: engineHash,
    },
    difficulty,
    phase: "briefing",
    readOnly: false,
    compatibility: defaultCompatibility(),
    createdAt: timestamp,
    updatedAt: timestamp,
    revision: 0,
    mappingChallenges: deepFreeze(cloneJson(mappingChallenges)),
    mappingResponses: {},
    draft: defaultDraft(initialDraft),
    preflight: null,
    officeAction: null,
    response: {
      draft: null,
      argument: "",
      metadata: {},
    },
    finalAction: null,
    competitor: {
      prediction: null,
      result: null,
    },
    debrief: null,
    snapshots: {
      original: null,
      submitted: null,
      amended: null,
    },
    responseBudget: {
      total: 1,
      used: 0,
      remaining: 1,
    },
    persistence: {
      dirty: false,
      lastSavedAt: null,
    },
  };

  assertValidAttemptState(state);
  return state;
}

function ensurePhase(state, actionType, allowedPhases) {
  if (!allowedPhases.includes(state.phase)) {
    throw new AttemptTransitionError(
      `${actionType} is not permitted during the ${state.phase} phase.`,
      { actionType, phase: state.phase },
    );
  }
}

function ensureWritable(state, actionType) {
  if (state.readOnly) {
    throw new AttemptTransitionError(
      "This attempt is read-only because its saved challenge or engine no longer matches the active version.",
      { actionType, phase: state.phase },
    );
  }
}

function requirePayloadObject(action) {
  if (!isObject(action.payload)) {
    throw new AttemptValidationError(`${action.type} requires an object payload.`);
  }
  return action.payload;
}

function mergeObject(current, patch, label) {
  if (!isObject(patch)) {
    throw new AttemptValidationError(`${label} must be an object.`);
  }
  return {
    ...current,
    ...cloneJson(patch),
  };
}

function makeSnapshot(kind, state, draft, timestamp, extras = {}) {
  return deepFreeze({
    kind,
    capturedAt: timestamp,
    phase: state.phase,
    draft: cloneJson(draft),
    mappingResponses: cloneJson(state.mappingResponses),
    ...cloneJson(extras),
  });
}

function touch(state, changes, timestamp) {
  return {
    ...state,
    ...changes,
    updatedAt: timestamp,
    revision: state.revision + 1,
    persistence: {
      ...state.persistence,
      dirty: true,
    },
  };
}

function createReplacementAttempt(state, action, timestamp) {
  const payload = requirePayloadObject(action);
  if (payload.confirmAttemptId !== state.attemptId) {
    throw new AttemptTransitionError(
      "Reset was refused because the confirmation did not match the current attempt.",
      { actionType: action.type, phase: state.phase },
    );
  }

  const replacementId = payload.attemptId ?? payload.newAttemptId ?? makeAttemptId();
  if (replacementId === state.attemptId && action.type === ACTION_TYPES.NEW_ATTEMPT) {
    throw new AttemptValidationError("A new attempt must use a new attemptId.");
  }

  return createAttemptState({
    attemptId: replacementId,
    challengeId: state.challenge.id,
    challengeVersion: state.challenge.version,
    challengeHash: state.challenge.hash,
    engineVersion: state.engine.version,
    engineHash: state.engine.hash,
    difficulty: payload.difficulty ?? state.difficulty,
    mappingChallenges: state.mappingChallenges,
    initialDraft: payload.initialDraft,
    now: timestamp,
  });
}

/**
 * Pure reducer for UI state and autosave. Every mutating action increments revision
 * and marks persistence.dirty, except MARK_SAVED.
 */
export function attemptReducer(state, action) {
  assertValidAttemptState(state);

  if (!isObject(action) || !isNonEmptyString(action.type)) {
    throw new AttemptValidationError("An action with a type is required.");
  }
  if (!KNOWN_ACTIONS.has(action.type)) {
    return state;
  }

  const timestamp = nowIso(action.meta?.now);

  if (action.type === ACTION_TYPES.MARK_SAVED) {
    const savedAt = action.payload?.savedAt
      ? nowIso(action.payload.savedAt)
      : timestamp;
    return {
      ...state,
      persistence: {
        dirty: false,
        lastSavedAt: savedAt,
      },
    };
  }

  if (action.type === ACTION_TYPES.RESET_ATTEMPT || action.type === ACTION_TYPES.NEW_ATTEMPT) {
    return createReplacementAttempt(state, action, timestamp);
  }

  ensureWritable(state, action.type);

  switch (action.type) {
    case ACTION_TYPES.START_DRAFTING:
      ensurePhase(state, action.type, ["briefing"]);
      return touch(state, { phase: "drafting" }, timestamp);

    case ACTION_TYPES.UPDATE_DRAFT: {
      ensurePhase(state, action.type, ["drafting", "preflight"]);
      const payload = requirePayloadObject(action);
      const nextDraft = payload.draft
        ? cloneJson(payload.draft)
        : mergeObject(state.draft, payload.patch, "draft patch");
      if (!isObject(nextDraft)) {
        throw new AttemptValidationError("draft must be an object.");
      }
      return touch(state, { draft: nextDraft }, timestamp);
    }

    case ACTION_TYPES.SET_MAPPING_RESPONSE: {
      ensurePhase(state, action.type, ["drafting", "preflight", "office-action", "response"]);
      const payload = requirePayloadObject(action);
      if (!isNonEmptyString(payload.mappingId)) {
        throw new AttemptValidationError("mappingId is required.");
      }
      if (payload.response === undefined) {
        throw new AttemptValidationError("mapping response is required.");
      }
      return touch(
        state,
        {
          mappingResponses: {
            ...state.mappingResponses,
            [payload.mappingId]: cloneJson(payload.response),
          },
        },
        timestamp,
      );
    }

    case ACTION_TYPES.REQUEST_PREFLIGHT: {
      ensurePhase(state, action.type, ["drafting"]);
      const original = state.snapshots.original
        ?? makeSnapshot("original", state, state.draft, timestamp);
      return touch(
        state,
        {
          phase: "preflight",
          snapshots: {
            ...state.snapshots,
            original,
          },
        },
        timestamp,
      );
    }

    case ACTION_TYPES.SET_PREFLIGHT_RESULT:
      ensurePhase(state, action.type, ["preflight"]);
      return touch(state, { preflight: cloneJson(action.payload ?? null) }, timestamp);

    case ACTION_TYPES.SUBMIT_APPLICATION: {
      ensurePhase(state, action.type, ["preflight"]);
      if (state.snapshots.submitted) {
        throw new AttemptTransitionError("The application was already submitted.", {
          actionType: action.type,
          phase: state.phase,
        });
      }
      const submitted = makeSnapshot("submitted", state, state.draft, timestamp, {
        preflight: state.preflight,
      });
      return touch(
        state,
        {
          phase: "office-action",
          snapshots: {
            ...state.snapshots,
            submitted,
          },
          officeAction: cloneJson(action.payload?.officeAction ?? state.officeAction),
        },
        timestamp,
      );
    }

    case ACTION_TYPES.SET_OFFICE_ACTION:
      ensurePhase(state, action.type, ["office-action"]);
      return touch(state, { officeAction: cloneJson(action.payload ?? null) }, timestamp);

    case ACTION_TYPES.OPEN_RESPONSE:
      ensurePhase(state, action.type, ["office-action"]);
      if (state.responseBudget.remaining < 1) {
        throw new AttemptTransitionError("No prosecution response remains for this attempt.", {
          actionType: action.type,
          phase: state.phase,
        });
      }
      return touch(
        state,
        {
          phase: "response",
          response: {
            ...state.response,
            draft: state.response.draft
              ?? cloneJson(state.snapshots.submitted?.draft ?? state.draft),
          },
        },
        timestamp,
      );

    case ACTION_TYPES.UPDATE_RESPONSE: {
      ensurePhase(state, action.type, ["response"]);
      const payload = requirePayloadObject(action);
      const changes = {};
      if (payload.draft !== undefined) {
        if (!isObject(payload.draft)) {
          throw new AttemptValidationError("response draft must be an object.");
        }
        changes.draft = cloneJson(payload.draft);
      }
      if (payload.patch !== undefined) {
        changes.draft = mergeObject(
          changes.draft ?? state.response.draft ?? {},
          payload.patch,
          "response draft patch",
        );
      }
      if (payload.argument !== undefined) {
        changes.argument = String(payload.argument);
      }
      if (payload.metadata !== undefined) {
        changes.metadata = mergeObject(state.response.metadata, payload.metadata, "response metadata");
      }
      return touch(
        state,
        {
          response: {
            ...state.response,
            ...changes,
          },
        },
        timestamp,
      );
    }

    case ACTION_TYPES.SUBMIT_RESPONSE: {
      ensurePhase(state, action.type, ["response"]);
      if (state.responseBudget.remaining < 1 || state.snapshots.amended) {
        throw new AttemptTransitionError("The single prosecution response has already been used.", {
          actionType: action.type,
          phase: state.phase,
        });
      }
      if (!isObject(state.response.draft)) {
        throw new AttemptValidationError("An amended claim draft is required before submission.");
      }
      const amended = makeSnapshot("amended", state, state.response.draft, timestamp, {
        argument: state.response.argument,
        metadata: state.response.metadata,
      });
      return touch(
        state,
        {
          phase: "final-action",
          snapshots: {
            ...state.snapshots,
            amended,
          },
          responseBudget: {
            total: 1,
            used: 1,
            remaining: 0,
          },
          finalAction: cloneJson(action.payload?.finalAction ?? state.finalAction),
        },
        timestamp,
      );
    }

    case ACTION_TYPES.SET_FINAL_ACTION:
      ensurePhase(state, action.type, ["final-action"]);
      return touch(state, { finalAction: cloneJson(action.payload ?? null) }, timestamp);

    case ACTION_TYPES.START_COMPETITOR_PREDICTION:
      ensurePhase(state, action.type, ["final-action"]);
      return touch(state, { phase: "competitor-prediction" }, timestamp);

    case ACTION_TYPES.UPDATE_COMPETITOR_PREDICTION:
      ensurePhase(state, action.type, ["competitor-prediction"]);
      return touch(
        state,
        {
          competitor: {
            ...state.competitor,
            prediction: cloneJson(action.payload ?? null),
          },
        },
        timestamp,
      );

    case ACTION_TYPES.SUBMIT_COMPETITOR_PREDICTION:
      ensurePhase(state, action.type, ["competitor-prediction"]);
      return touch(
        state,
        {
          phase: "competitor-result",
          competitor: {
            ...state.competitor,
            prediction: cloneJson(action.payload?.prediction ?? state.competitor.prediction),
            result: cloneJson(action.payload?.result ?? state.competitor.result),
          },
        },
        timestamp,
      );

    case ACTION_TYPES.SET_COMPETITOR_RESULT:
      ensurePhase(state, action.type, ["competitor-result"]);
      return touch(
        state,
        {
          competitor: {
            ...state.competitor,
            result: cloneJson(action.payload ?? null),
          },
        },
        timestamp,
      );

    case ACTION_TYPES.OPEN_DEBRIEF:
      ensurePhase(state, action.type, ["competitor-result"]);
      return touch(
        state,
        {
          phase: "debrief",
          debrief: cloneJson(action.payload?.debrief ?? state.debrief),
        },
        timestamp,
      );

    case ACTION_TYPES.SET_DEBRIEF:
      ensurePhase(state, action.type, ["debrief"]);
      return touch(state, { debrief: cloneJson(action.payload ?? null) }, timestamp);

    default:
      return state;
  }
}

function validateSnapshot(snapshot, key, errors) {
  if (snapshot === null) {
    return;
  }
  if (!isObject(snapshot)) {
    errors.push(`snapshots.${key} must be null or an object.`);
    return;
  }
  if (snapshot.kind !== key) {
    errors.push(`snapshots.${key}.kind must be ${key}.`);
  }
  if (!isIsoDate(snapshot.capturedAt)) {
    errors.push(`snapshots.${key}.capturedAt must be an ISO date.`);
  }
  if (!isObject(snapshot.draft)) {
    errors.push(`snapshots.${key}.draft must be an object.`);
  }
}

/** Returns a result object so import UIs can show every schema issue at once. */
export function validateAttemptState(value, { requireCurrentVersion = false } = {}) {
  const errors = [];
  if (!isObject(value)) {
    return { valid: false, errors: ["Attempt must be an object."] };
  }

  const jsonIssue = findJsonIssue(value, "attempt");
  if (jsonIssue) errors.push(jsonIssue);

  if (!Number.isInteger(value.schemaVersion) || value.schemaVersion < 1) {
    errors.push("schemaVersion must be a positive integer.");
  } else if (requireCurrentVersion && value.schemaVersion !== ATTEMPT_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${ATTEMPT_SCHEMA_VERSION}.`);
  }
  if (!isNonEmptyString(value.attemptId)) errors.push("attemptId is required.");
  if (!PHASES.includes(value.phase)) errors.push("phase is not recognized.");
  if (!isIsoDate(value.createdAt)) errors.push("createdAt must be an ISO date.");
  if (!isIsoDate(value.updatedAt)) errors.push("updatedAt must be an ISO date.");
  if (!Number.isInteger(value.revision) || value.revision < 0) errors.push("revision is invalid.");

  if (!isObject(value.challenge)) {
    errors.push("challenge is required.");
  } else {
    if (!isNonEmptyString(value.challenge.id)) errors.push("challenge.id is required.");
    if (!isNonEmptyString(value.challenge.version)) errors.push("challenge.version is required.");
    if (!isNonEmptyString(value.challenge.hash)) errors.push("challenge.hash is required.");
  }
  if (!isObject(value.engine)) {
    errors.push("engine is required.");
  } else {
    if (!isNonEmptyString(value.engine.version)) errors.push("engine.version is required.");
    if (!isNonEmptyString(value.engine.hash)) errors.push("engine.hash is required.");
  }
  if (!Array.isArray(value.mappingChallenges)) errors.push("mappingChallenges must be an array.");
  if (!isObject(value.mappingResponses)) errors.push("mappingResponses must be an object.");
  if (!isObject(value.draft)) errors.push("draft must be an object.");
  if (!isObject(value.response)) errors.push("response must be an object.");
  if (!isObject(value.competitor)) errors.push("competitor must be an object.");
  if (!isObject(value.snapshots)) {
    errors.push("snapshots is required.");
  } else {
    SNAPSHOT_KEYS.forEach((key) => validateSnapshot(value.snapshots[key], key, errors));
  }

  if (!isObject(value.responseBudget)) {
    errors.push("responseBudget is required.");
  } else {
    const { total, used, remaining } = value.responseBudget;
    if (total !== 1 || !Number.isInteger(used) || !Number.isInteger(remaining)) {
      errors.push("responseBudget must contain integer total, used, and remaining values.");
    } else if (used < 0 || remaining < 0 || used + remaining !== total) {
      errors.push("responseBudget values are inconsistent.");
    }
  }
  if (!isObject(value.persistence) || typeof value.persistence.dirty !== "boolean") {
    errors.push("persistence is invalid.");
  }

  return { valid: errors.length === 0, errors };
}

export function assertValidAttemptState(value, options) {
  const result = validateAttemptState(value, options);
  if (!result.valid) {
    throw new AttemptValidationError("Attempt schema validation failed.", result.errors);
  }
  return value;
}

export function getAttemptCompatibility(
  attempt,
  {
    schemaVersion = ATTEMPT_SCHEMA_VERSION,
    challengeId,
    challengeHash,
    engineVersion,
    engineHash,
  } = {},
) {
  assertValidAttemptState(attempt);
  const reasons = [];

  if (attempt.schemaVersion !== schemaVersion) {
    reasons.push({
      code: "schema-version",
      saved: attempt.schemaVersion,
      expected: schemaVersion,
    });
  }
  if (challengeId !== undefined && attempt.challenge.id !== challengeId) {
    reasons.push({ code: "challenge-id", saved: attempt.challenge.id, expected: challengeId });
  }
  if (challengeHash !== undefined && attempt.challenge.hash !== challengeHash) {
    reasons.push({ code: "challenge-hash", saved: attempt.challenge.hash, expected: challengeHash });
  }
  if (engineVersion !== undefined && attempt.engine.version !== String(engineVersion)) {
    reasons.push({ code: "engine-version", saved: attempt.engine.version, expected: String(engineVersion) });
  }
  if (engineHash !== undefined && attempt.engine.hash !== engineHash) {
    reasons.push({ code: "engine-hash", saved: attempt.engine.hash, expected: engineHash });
  }

  return {
    status: reasons.length === 0 ? "current" : "mismatch",
    readOnly: reasons.length > 0,
    reasons,
  };
}

/** Rehydrates frozen snapshots and applies an explicit read-only compatibility flag. */
export function openAttemptState(attempt, expected = {}) {
  assertValidAttemptState(attempt);
  const opened = cloneJson(attempt);
  const compatibility = getAttemptCompatibility(opened, expected);

  opened.compatibility = compatibility;
  opened.readOnly = Boolean(attempt.readOnly) || compatibility.readOnly;
  deepFreeze(opened.mappingChallenges);
  SNAPSHOT_KEYS.forEach((key) => {
    if (opened.snapshots[key]) deepFreeze(opened.snapshots[key]);
  });
  return opened;
}
