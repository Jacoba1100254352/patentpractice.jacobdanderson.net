import { describe, expect, it } from "vitest";
import {
  challenge01EvaluatorData,
  challenge01PlayerFacing,
} from "../challenges/index.js";
import { evaluateClaimSet } from "../engine/evaluator.js";
import { runPreflight } from "../engine/preflight.js";
import {
  createEngineChallenge,
  createStarterClaimSet,
  promoteDependentLimitations,
  selectCompetitorTargetClaim,
} from "./sessionModel.js";

describe("session integration model", () => {
  it("creates a fair broad starter without hidden answer material", () => {
    const starter = createStarterClaimSet();
    const allText = starter.claims.map((claim) => claim.text).join(" ").toLowerCase();

    expect(starter.claims).toHaveLength(4);
    expect(starter.claims.map((claim) => claim.id)).toEqual([
      "starter-claim-1",
      "starter-claim-2",
      "starter-claim-3",
      "starter-claim-4",
    ]);
    expect(starter.claims.map((claim) => claim.dependsOn)).toEqual([
      null,
      1,
      1,
      3,
    ]);
    expect(allText).not.toMatch(
      /correction label|pressure interval|correction measure|selective interval|retain(?:ing)? (?:a|another|second) mapping value/iu,
    );
    expect(
      starter.claims.flatMap((claim) =>
        claim.limitations.flatMap((limitation) => limitation.conceptIds),
      ),
    ).toEqual([]);
    expect(runPreflight(starter).blockers).toHaveLength(0);
  });

  it("builds an internal engine challenge without enriching the player view", () => {
    expect(challenge01PlayerFacing).not.toHaveProperty("evaluator");
    expect(challenge01PlayerFacing).not.toHaveProperty("fixtures");
    expect(challenge01PlayerFacing).not.toHaveProperty("hidden");

    const engineChallenge = createEngineChallenge(
      challenge01PlayerFacing,
      challenge01EvaluatorData,
      "practitioner",
    );
    expect(engineChallenge.metadata.difficulty).toBe("practitioner");
    expect(engineChallenge.claimBudget).toEqual({
      independent: 1,
      dependent: 5,
      total: 6,
    });
    expect(engineChallenge.fixtures.amendedClaims).toHaveLength(6);
    expect(engineChallenge.hidden.targetEmbodiments).toHaveLength(3);
    expect(challenge01PlayerFacing.disclosure).not.toHaveProperty(
      "targetEmbodiments",
    );

    const evaluated = evaluateClaimSet(
      engineChallenge.fixtures.initialClaims,
      engineChallenge,
    );
    expect(evaluated.byClaimId["initial-claim-1"].disposition.status).toBe(
      "rejected",
    );
  });

  it("promotes only player-owned dependent limitations with stable IDs", () => {
    const starter = createStarterClaimSet();
    const promoted = promoteDependentLimitations(starter);
    const originalTarget = starter.claims[0];
    const promotedTarget = promoted.claims[0];
    const additions = promotedTarget.limitations.slice(
      originalTarget.limitations.length,
    );

    expect(additions).toHaveLength(2);
    expect(additions.map((item) => item.text)).toEqual([
      starter.claims[2].limitations[0].text,
      starter.claims[3].limitations[0].text,
    ]);
    expect(additions.map((item) => item.promotedFromClaimNumber)).toEqual([3, 4]);
    expect(new Set(promotedTarget.limitations.map((item) => item.id)).size).toBe(
      promotedTarget.limitations.length,
    );
    expect(starter.claims[0].limitations).toHaveLength(4);
    expect(promoteDependentLimitations(starter)).toEqual(promoted);
    expect(promoteDependentLimitations(promoted).claims[0].limitations).toHaveLength(
      promotedTarget.limitations.length,
    );
    expect(promoted.claims.map((claim) => claim.number)).toEqual([1, 2]);
    expect(runPreflight(promoted).blockers).toHaveLength(0);
  });

  it("reparents a surviving fallback when its promoted parent is canceled", () => {
    const starter = createStarterClaimSet();
    const extended = {
      ...starter,
      claims: [
        ...starter.claims,
        {
          id: "starter-claim-5",
          number: 5,
          kind: "dependent",
          dependsOn: 4,
          subject: "computer input system",
          text:
            "5. The computer input system of claim 4, wherein the input element comprises a strip.",
          limitations: [
            {
              id: "starter-c5-strip",
              text: "the input element comprises a strip",
              conceptIds: [],
              relationIds: [],
              supportAnchorIds: [],
            },
          ],
        },
      ],
    };
    const promoted = promoteDependentLimitations(extended);
    expect(promoted.claims.find((claim) => claim.number === 5)?.dependsOn).toBe(1);
    expect(runPreflight(promoted).dependencies.missing).toHaveLength(0);
  });

  it("selects a surviving independent claim and falls back safely", () => {
    const starter = createStarterClaimSet();
    const evaluation = {
      claims: [
        {
          claimId: "starter-claim-1",
          claimNumber: 1,
          disposition: { status: "survives" },
        },
        {
          claimId: "starter-claim-3",
          claimNumber: 3,
          disposition: { status: "survives" },
        },
      ],
    };
    expect(selectCompetitorTargetClaim(starter, evaluation).id).toBe(
      "starter-claim-1",
    );

    evaluation.claims[0].disposition.status = "rejected";
    expect(selectCompetitorTargetClaim(starter, evaluation).id).toBe(
      "starter-claim-3",
    );
    expect(selectCompetitorTargetClaim(starter, null).id).toBe(
      "starter-claim-1",
    );
    expect(selectCompetitorTargetClaim([], null)).toBeNull();
  });

  it("rejects unknown modes without exposing evaluator data", () => {
    expect(() =>
      createEngineChallenge(
        challenge01PlayerFacing,
        challenge01EvaluatorData,
        "unknown",
      ),
    ).toThrow(RangeError);
  });
});
