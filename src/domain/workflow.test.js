import { describe, expect, it } from "vitest";

import {
  ACTION_TYPES,
  ATTEMPT_SCHEMA_VERSION,
  AttemptTransitionError,
  attemptReducer,
  createAttemptState,
  openAttemptState,
  validateAttemptState,
} from "./workflow.js";

const CLOCK = {
  created: "2026-08-24T12:00:00.000Z",
  step: "2026-08-24T12:01:00.000Z",
};

function createState(overrides = {}) {
  return createAttemptState({
    attemptId: "attempt-one",
    challengeId: "adaptive-mouse",
    challengeVersion: "1.0.0",
    challengeHash: "sha256:challenge-a",
    engineVersion: "1.0.0",
    engineHash: "sha256:engine-a",
    mappingChallenges: [
      { id: "map-1", prompt: "Map the pressure sensor limitation." },
      { id: "map-2", prompt: "Map the interval update limitation." },
    ],
    initialDraft: { claims: ["A system comprising a pressure sensor."], notes: "" },
    now: CLOCK.created,
    ...overrides,
  });
}

function dispatch(state, type, payload, minute = 1) {
  return attemptReducer(state, {
    type,
    payload,
    meta: { now: `2026-08-24T12:${String(minute).padStart(2, "0")}:00.000Z` },
  });
}

describe("attempt workflow", () => {
  it("moves through every guarded phase in order", () => {
    let state = createState();
    expect(state.schemaVersion).toBe(ATTEMPT_SCHEMA_VERSION);
    expect(state.phase).toBe("briefing");

    state = dispatch(state, ACTION_TYPES.START_DRAFTING, undefined, 1);
    state = dispatch(
      state,
      ACTION_TYPES.SET_MAPPING_RESPONSE,
      { mappingId: "map-1", response: { citation: "Fig. 1" } },
      2,
    );
    state = dispatch(state, ACTION_TYPES.REQUEST_PREFLIGHT, undefined, 3);
    expect(state.phase).toBe("preflight");

    state = dispatch(state, ACTION_TYPES.SET_PREFLIGHT_RESULT, { errors: [] }, 4);
    state = dispatch(
      state,
      ACTION_TYPES.SUBMIT_APPLICATION,
      { officeAction: { status: "pending" } },
      5,
    );
    expect(state.phase).toBe("office-action");

    state = dispatch(
      state,
      ACTION_TYPES.SET_MAPPING_RESPONSE,
      { mappingId: "map-2", response: { choice: "challenge" } },
      6,
    );
    expect(state.mappingResponses["map-2"]).toEqual({ choice: "challenge" });

    state = dispatch(state, ACTION_TYPES.SET_OFFICE_ACTION, { rejections: ["103"] }, 6);
    state = dispatch(state, ACTION_TYPES.OPEN_RESPONSE, undefined, 7);
    expect(state.phase).toBe("response");

    state = dispatch(
      state,
      ACTION_TYPES.UPDATE_RESPONSE,
      {
        draft: { claims: ["A system comprising a pressure sensor and a local history store."] },
        argument: "The cited references do not teach the local history store.",
      },
      8,
    );
    state = dispatch(
      state,
      ACTION_TYPES.SUBMIT_RESPONSE,
      { finalAction: { status: "pending" } },
      9,
    );
    expect(state.phase).toBe("final-action");

    state = dispatch(state, ACTION_TYPES.SET_FINAL_ACTION, { result: "allowed" }, 10);
    state = dispatch(state, ACTION_TYPES.START_COMPETITOR_PREDICTION, undefined, 11);
    expect(state.phase).toBe("competitor-prediction");

    state = dispatch(
      state,
      ACTION_TYPES.UPDATE_COMPETITOR_PREDICTION,
      { outcome: "design-around", rationale: "The competitor uses no correction history." },
      12,
    );
    state = dispatch(
      state,
      ACTION_TYPES.SUBMIT_COMPETITOR_PREDICTION,
      { result: { outcome: "design-around" } },
      13,
    );
    expect(state.phase).toBe("competitor-result");

    state = dispatch(state, ACTION_TYPES.SET_COMPETITOR_RESULT, { correct: true }, 14);
    state = dispatch(state, ACTION_TYPES.OPEN_DEBRIEF, { debrief: { score: 86 } }, 15);
    expect(state.phase).toBe("debrief");

    state = dispatch(state, ACTION_TYPES.SET_DEBRIEF, { score: 88 }, 16);
    expect(state.debrief.score).toBe(88);
    expect(state.mappingChallenges).toEqual(createState().mappingChallenges);
    expect(Object.isFrozen(state.mappingChallenges)).toBe(true);
    expect(state.mappingResponses["map-1"]).toEqual({ citation: "Fig. 1" });
    expect(state.persistence.dirty).toBe(true);
  });

  it("rejects known actions outside their legal phases", () => {
    const state = createState();
    expect(() => dispatch(state, ACTION_TYPES.SUBMIT_APPLICATION, {}, 1)).toThrow(
      AttemptTransitionError,
    );
    expect(() => dispatch(state, ACTION_TYPES.OPEN_RESPONSE, undefined, 1)).toThrow(
      /not permitted/,
    );

    const drafting = dispatch(state, ACTION_TYPES.START_DRAFTING, undefined, 1);
    expect(() => dispatch(drafting, ACTION_TYPES.SET_FINAL_ACTION, {}, 2)).toThrow(
      AttemptTransitionError,
    );
  });

  it("captures immutable original, submitted, and amended snapshots", () => {
    let state = createState();
    state = dispatch(state, ACTION_TYPES.START_DRAFTING, undefined, 1);
    state = dispatch(state, ACTION_TYPES.REQUEST_PREFLIGHT, undefined, 2);
    expect(state.snapshots.original.draft.claims[0]).toContain("pressure sensor");

    state = dispatch(
      state,
      ACTION_TYPES.UPDATE_DRAFT,
      { patch: { claims: ["A system comprising a pressure sensor and a controller."] } },
      3,
    );
    state = dispatch(state, ACTION_TYPES.SUBMIT_APPLICATION, {}, 4);
    state = dispatch(state, ACTION_TYPES.OPEN_RESPONSE, undefined, 5);

    const responseDraft = {
      claims: ["A system comprising a pressure sensor, a controller, and interval statistics."],
    };
    state = dispatch(state, ACTION_TYPES.UPDATE_RESPONSE, { draft: responseDraft }, 6);
    state = dispatch(state, ACTION_TYPES.SUBMIT_RESPONSE, {}, 7);

    responseDraft.claims[0] = "mutated outside the reducer";
    expect(state.snapshots.original.draft.claims[0]).toBe(
      "A system comprising a pressure sensor.",
    );
    expect(state.snapshots.submitted.draft.claims[0]).toContain("controller");
    expect(state.snapshots.submitted.draft.claims[0]).not.toContain("interval statistics");
    expect(state.snapshots.amended.draft.claims[0]).toContain("interval statistics");
    expect(Object.isFrozen(state.snapshots.original)).toBe(true);
    expect(Object.isFrozen(state.snapshots.submitted.draft.claims)).toBe(true);
    expect(Object.isFrozen(state.snapshots.amended.draft)).toBe(true);
  });

  it("permits exactly one prosecution response", () => {
    let state = createState();
    state = dispatch(state, ACTION_TYPES.START_DRAFTING, undefined, 1);
    state = dispatch(state, ACTION_TYPES.REQUEST_PREFLIGHT, undefined, 2);
    state = dispatch(state, ACTION_TYPES.SUBMIT_APPLICATION, {}, 3);
    state = dispatch(state, ACTION_TYPES.OPEN_RESPONSE, undefined, 4);
    state = dispatch(state, ACTION_TYPES.SUBMIT_RESPONSE, {}, 5);

    expect(state.responseBudget).toEqual({ total: 1, used: 1, remaining: 0 });
    expect(state.snapshots.amended).not.toBeNull();

    const exhaustedOfficeAction = { ...state, phase: "office-action" };
    expect(() => dispatch(exhaustedOfficeAction, ACTION_TYPES.OPEN_RESPONSE, undefined, 6)).toThrow(
      /No prosecution response remains/,
    );
  });

  it("requires an exact confirmation for reset and preserves challenge mappings", () => {
    const original = createState();
    expect(() =>
      dispatch(
        original,
        ACTION_TYPES.NEW_ATTEMPT,
        { confirmAttemptId: "wrong", newAttemptId: "attempt-two" },
        1,
      ),
    ).toThrow(/confirmation/);

    const replacement = dispatch(
      original,
      ACTION_TYPES.NEW_ATTEMPT,
      { confirmAttemptId: "attempt-one", newAttemptId: "attempt-two" },
      2,
    );
    expect(replacement.attemptId).toBe("attempt-two");
    expect(replacement.phase).toBe("briefing");
    expect(replacement.mappingChallenges).toEqual(original.mappingChallenges);
    expect(replacement.mappingChallenges).not.toBe(original.mappingChallenges);
    expect(replacement.responseBudget.remaining).toBe(1);
  });

  it("opens a hash-mismatched attempt read-only and prevents edits", () => {
    const opened = openAttemptState(createState(), {
      challengeHash: "sha256:challenge-b",
      engineHash: "sha256:engine-a",
    });
    expect(opened.readOnly).toBe(true);
    expect(opened.compatibility.reasons).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "challenge-hash" })]),
    );
    expect(() => dispatch(opened, ACTION_TYPES.START_DRAFTING, undefined, 1)).toThrow(
      /read-only/,
    );
  });

  it("reports schema defects without throwing from the validator", () => {
    const invalid = { ...createState(), responseBudget: { total: 1, used: 1, remaining: 1 } };
    const result = validateAttemptState(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("inconsistent");
  });

  it("exposes revision and saved markers suitable for debounced autosave", () => {
    const initial = createState();
    const changed = dispatch(initial, ACTION_TYPES.START_DRAFTING, undefined, 1);
    expect(changed.revision).toBe(initial.revision + 1);
    expect(changed.persistence.dirty).toBe(true);

    const saved = dispatch(
      changed,
      ACTION_TYPES.MARK_SAVED,
      { savedAt: "2026-08-24T12:02:00.000Z" },
      2,
    );
    expect(saved.revision).toBe(changed.revision);
    expect(saved.persistence).toEqual({
      dirty: false,
      lastSavedAt: "2026-08-24T12:02:00.000Z",
    });
  });
});
