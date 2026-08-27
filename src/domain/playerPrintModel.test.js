import { describe, expect, it } from "vitest";

import {
  PRINT_PACKET_TYPES,
  availablePrintPacketTypes,
  buildPlayerPrintModel,
} from "./playerPrintModel.js";

const playerChallenge = {
  challengeId: "challenge-01",
  contentVersion: "1.0.0",
  metadata: { number: 1, title: "Player challenge" },
  activeMode: { id: "practitioner", label: "Practitioner" },
  educationalBoundary: {
    full: "Educational only.",
    officeAction: "Simulated Office Action only.",
    final: "Bounded final result.",
  },
  editorScaffold: {
    independent: "A system comprising: [player work].",
    dependent: "The system of claim 1, wherein [player work].",
  },
  disclosure: {
    sections: [{ id: "problem", title: "Problem", body: "Player-facing facts." }],
    supportedAlternatives: [{ category: "sensor", values: ["capacitive"] }],
  },
  evaluator: { answerKey: "DO NOT PRINT THIS ANSWER KEY" },
  hidden: { targetEmbodiments: ["DO NOT PRINT HIDDEN TARGETS"] },
};

const draftedClaim = {
  id: "claim-1",
  number: 1,
  kind: "independent",
  subject: "input system",
  limitations: [{ id: "limitation-1", text: "a player-authored sensor" }],
};

function baseAttempt() {
  return {
    difficulty: "practitioner",
    phase: "drafting",
    draft: { claims: [draftedClaim], notes: "Player note" },
    snapshots: { submitted: null, amended: null },
    response: { draft: null, argument: "" },
    officeAction: null,
    competitor: { prediction: null, result: null },
    debrief: null,
  };
}

function forbiddenKeys(value) {
  const matches = [];
  const forbidden = new Set([
    "answerKey",
    "benchmark",
    "evaluation",
    "evaluator",
    "evidenceFactIds",
    "fixtures",
    "hidden",
    "metrics",
    "recipeId",
  ]);
  function visit(current) {
    if (!current || typeof current !== "object") return;
    for (const [key, nested] of Object.entries(current)) {
      if (forbidden.has(key)) matches.push(key);
      visit(nested);
    }
  }
  visit(value);
  return matches;
}

describe("player print model", () => {
  it("uses only player-facing disclosure and the player's current claims", () => {
    const attempt = baseAttempt();
    const model = buildPlayerPrintModel({
      playerChallenge,
      attempt,
      packetType: PRINT_PACKET_TYPES.DRAFTING,
    });

    expect(JSON.stringify(model)).toContain("Player-facing facts");
    expect(JSON.stringify(model)).toContain("a player-authored sensor");
    expect(JSON.stringify(model)).not.toContain("DO NOT PRINT");
    expect(forbiddenKeys(model)).toEqual([]);
  });

  it("prints scaffolding rather than the starter claim set during briefing", () => {
    const attempt = { ...baseAttempt(), phase: "briefing" };
    const model = buildPlayerPrintModel({
      playerChallenge,
      attempt,
      packetType: PRINT_PACKET_TYPES.DRAFTING,
    });
    expect(model.claims).toEqual([]);
    expect(model.scaffold.independent).toMatch(/player work/iu);
  });

  it("phase-gates amendment and debrief packets", () => {
    const attempt = baseAttempt();
    expect(availablePrintPacketTypes(attempt)).toEqual(["drafting"]);
    expect(() =>
      buildPlayerPrintModel({
        playerChallenge,
        attempt,
        packetType: PRINT_PACKET_TYPES.AMENDMENT,
      }),
    ).toThrow(/not been unlocked/iu);
  });

  it("allowlists revealed amendment fields without copying recipe identifiers", () => {
    const attempt = baseAttempt();
    attempt.phase = "response";
    attempt.snapshots.submitted = { draft: attempt.draft };
    attempt.response.draft = attempt.draft;
    attempt.response.argument = "Player response argument.";
    attempt.officeAction = {
      recordBoundary: "Bounded record.",
      claims: [
        {
          claimNumber: 1,
          disposition: {
            status: "rejected",
            label: "Simulated rejection",
            rationale: "Visible rationale.",
            recipeId: "DO NOT PRINT RECIPE",
            evidenceFactIds: ["DO NOT PRINT FACT ID"],
          },
          evidenceChart: [],
        },
      ],
    };

    const model = buildPlayerPrintModel({
      playerChallenge,
      attempt,
      packetType: PRINT_PACKET_TYPES.AMENDMENT,
    });
    expect(JSON.stringify(model)).toContain("Visible rationale");
    expect(JSON.stringify(model)).not.toContain("DO NOT PRINT");
    expect(forbiddenKeys(model)).toEqual([]);
  });

  it("limits a debrief packet to UI-visible scores and prediction results", () => {
    const attempt = baseAttempt();
    attempt.phase = "debrief";
    attempt.snapshots.submitted = { draft: attempt.draft };
    attempt.snapshots.amended = { draft: attempt.draft, argument: "Final argument." };
    attempt.competitor = {
      prediction: { "limitation-1": "mapped" },
      result: {
        conclusion: "Visible bounded conclusion.",
        limitations: [
          {
            limitationId: "limitation-1",
            text: "a player-authored sensor",
            status: "omitted",
            rationale: "Visible mapping explanation.",
          },
        ],
      },
    };
    attempt.debrief = {
      total: 70,
      possibleTotal: 100,
      eligible: true,
      gates: { formalSupport: { pass: true, detail: "Visible gate." } },
      categories: { scope: { score: 20, maximum: 25 } },
      metrics: { secret: "DO NOT PRINT METRICS" },
      evaluation: { secret: "DO NOT PRINT EVALUATION" },
      benchmark: { secret: "DO NOT PRINT BENCHMARK" },
    };

    const model = buildPlayerPrintModel({
      playerChallenge,
      attempt,
      packetType: PRINT_PACKET_TYPES.DEBRIEF,
    });
    expect(model.score).toMatchObject({ total: 70, possibleTotal: 100 });
    expect(JSON.stringify(model)).toContain("Visible mapping explanation");
    expect(JSON.stringify(model)).not.toContain("DO NOT PRINT");
    expect(forbiddenKeys(model)).toEqual([]);
  });
});
