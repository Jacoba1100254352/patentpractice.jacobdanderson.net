import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  assertValidChallengeBundle,
  challenge01,
  challenge01EvaluatorData,
  challenge01PlayerFacing,
  challengeCatalog,
  getChallenge01ForMode,
  getChallengeById,
  validateChallengeBundle,
} from "./index.js";

function mutableCopy(value) {
  return JSON.parse(JSON.stringify(value));
}

describe("Challenge 01 bundle", () => {
  it("passes the bundle's structural and evidence validation", () => {
    expect(validateChallengeBundle(challenge01)).toEqual({ valid: true, errors: [] });
    expect(assertValidChallengeBundle(challenge01)).toBe(challenge01);
  });

  it("is versioned and records the stipulated filing and prior-art rules", () => {
    expect(challenge01.schemaVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(challenge01.contentVersion).toBe("1.0.0");
    expect(challenge01.metadata.stipulatedEffectiveFilingDate).toBe("2025-01-02");
    expect(challenge01.metadata.priorArtStipulation).toMatch(/for this exercise only/i);
    expect(challenge01.metadata.priorArtStipulation).toMatch(/stipulated/i);
    expect(Object.isFrozen(challenge01.modes.examiner.claimBudget)).toBe(true);
    expect(Object.isFrozen(challenge01.fixtures.amendedClaims[0].limitations[0])).toBe(true);
  });

  it("contains exact six-claim initial and amended fixtures with valid dependencies", () => {
    const initial = challenge01.fixtures.initialClaims;
    const amended = challenge01.fixtures.amendedClaims;

    expect(initial).toHaveLength(6);
    expect(amended).toHaveLength(6);
    expect(initial.map((claim) => claim.dependsOn)).toEqual([null, 1, 2, 3, 1, 1]);
    expect(amended.map((claim) => claim.dependsOn)).toEqual([null, 1, 2, 1, 1, 1]);
    expect(amended[0].text).toContain("while retaining a second mapping value");
    expect(amended[0].text).toContain("selected pressure interval containing the current pressure value");
  });

  it("keeps hidden evaluator material out of the base player-facing export", () => {
    expect(challenge01PlayerFacing).not.toHaveProperty("evaluator");
    expect(challenge01PlayerFacing).not.toHaveProperty("fixtures");
    expect(challenge01PlayerFacing.disclosure).not.toHaveProperty("targetEmbodiments");
    expect(challenge01EvaluatorData.visibility).toBe("evaluator-only");
    expect(challenge01EvaluatorData.fixtures.amendedClaims).toHaveLength(6);
    expect(challenge01EvaluatorData.hiddenTargetEmbodiments).toHaveLength(3);
    expect(challenge01EvaluatorData.expertReference.id).toBe("ref-e");
  });

  it("reveals targets only in Guided mode and never leaks them in Practitioner mode", () => {
    const guided = getChallenge01ForMode("guided", { stage: "drafting" });
    const practitioner = getChallenge01ForMode("practitioner", { stage: "drafting" });

    expect(guided.disclosure.targetEmbodiments).toHaveLength(3);
    expect(practitioner.disclosure).not.toHaveProperty("targetEmbodiments");
    expect(practitioner).not.toHaveProperty("evaluator");
  });

  it("conceals Examiner references during drafting and reveals the expert card after submission", () => {
    const drafting = getChallenge01ForMode("examiner", { stage: "drafting" });
    const officeAction = getChallenge01ForMode("examiner", { stage: "office-action" });

    expect(drafting.priorArt.locked).toBe(true);
    expect(drafting.priorArt.cards).toEqual([]);
    expect(officeAction.priorArt.cards.map((reference) => reference.id)).toEqual([
      "ref-a",
      "ref-b",
      "ref-c",
      "ref-d",
      "ref-e",
    ]);
    expect(officeAction.disclosure).not.toHaveProperty("targetEmbodiments");
  });

  it("provides traceable evidence facts and deterministic core and expert recipes", () => {
    const evaluator = challenge01EvaluatorData;
    const recipeIds = evaluator.rejectionRecipes.map((recipe) => recipe.id);

    expect(evaluator.evidenceFacts.length).toBeGreaterThanOrEqual(10);
    expect(recipeIds).toContain("reject-initial-claim-1-core");
    expect(recipeIds).toContain("withdraw-amended-claim-1-core");
    expect(recipeIds).toContain("maintain-amended-claim-1-alternate");
    expect(recipeIds).toContain("maintain-amended-claim-1-expert");
    expect(
      evaluator.evidenceFacts.every(
        (fact) => fact.referenceId && fact.pinpointIds.length > 0 && fact.proposition,
      ),
    ).toBe(true);
  });

  it("maps every amended independent-claim limitation to the competitor model", () => {
    const target = challenge01.fixtures.amendedClaims[0];
    const competitor = challenge01EvaluatorData.competitor;

    expect(competitor.limitationMappings.map((mapping) => mapping.limitationId)).toEqual(
      target.limitations.map((limitation) => limitation.id),
    );
    expect(competitor.limitationMappings.filter((mapping) => mapping.status === "not-mapped")).toHaveLength(3);
    expect(competitor.result.status).toBe("no-complete-literal-mapping-in-stipulated-model");
    expect(competitor.result.boundary).toMatch(/not a noninfringement opinion/i);
  });

  it("calibrates the worked model portfolio to 76 points without bypassing gates", () => {
    const scoring = challenge01EvaluatorData.scoring;
    const benchmark = scoring.benchmarks[0];

    expect(scoring.weights.reduce((sum, item) => sum + item.weight, 0)).toBe(100);
    expect(benchmark).toMatchObject({ fixtureKey: "amendedClaims", total: 76 });
    expect(Object.values(benchmark.breakdown).reduce((sum, value) => sum + value, 0)).toBe(76);
    expect(scoring.workedResult.total).toBe(76);
    expect(scoring.gates).toHaveLength(3);
  });

  it("contains metadata and pinpoint summaries without embedding patent PDFs", () => {
    const references = [
      ...challenge01.priorArt.cards,
      challenge01EvaluatorData.expertReference,
    ];

    for (const reference of references) {
      expect(reference.sourceUrl).toMatch(/^https:\/\//);
      expect(reference.sourceUrl).not.toMatch(/\.pdf(?:$|\?)/i);
      expect(reference.pinpoints.length).toBeGreaterThan(0);
      expect(reference.pinpoints.every((pinpoint) => pinpoint.excerptType === "ScopeCraft paraphrase")).toBe(true);
      expect(reference.frozenEvidenceManifest.contentHash).toMatch(/^[a-f0-9]{64}$/);
      expect(
        createHash("sha256")
          .update(reference.frozenEvidenceManifest.hashInput)
          .digest("hex"),
      ).toBe(reference.frozenEvidenceManifest.contentHash);
      expect(reference.frozenEvidenceManifest.snapshotScope).toMatch(/no full patent text or PDF/i);
    }
  });

  it("preserves bounded educational language across patentability and competitor outcomes", () => {
    const boundary = challenge01.educationalBoundary;

    expect(boundary.full).toMatch(/not legal advice/i);
    expect(boundary.full).toMatch(/not.*patentability/i);
    expect(boundary.full).toMatch(/not.*infringement/i);
    expect(boundary.final).toMatch(/limited to the ScopeCraft challenge record/i);
    expect(challenge01EvaluatorData.answerKey.coreRecord.amendmentOutcome).toMatch(
      /medium-confidence/i,
    );
  });

  it("catches missing evidence, broken dependencies, and unbounded competitor copy", () => {
    const brokenEvidence = mutableCopy(challenge01);
    brokenEvidence.evaluator.evidenceFacts[0].referenceId = "missing-reference";
    expect(validateChallengeBundle(brokenEvidence)).toMatchObject({ valid: false });
    expect(validateChallengeBundle(brokenEvidence).errors.join(" ")).toMatch(/unknown reference/i);

    const brokenDependency = mutableCopy(challenge01);
    brokenDependency.fixtures.amendedClaims[2].dependsOn = 5;
    expect(validateChallengeBundle(brokenDependency).errors.join(" ")).toMatch(/earlier claim/i);

    const brokenBoundary = mutableCopy(challenge01);
    brokenBoundary.evaluator.competitor.result.boundary = "The competitor does not infringe.";
    expect(validateChallengeBundle(brokenBoundary).errors.join(" ")).toMatch(
      /noninfringement boundary/i,
    );
  });

  it("publishes a playable catalog entry and rejects unknown challenge identifiers", () => {
    expect(challengeCatalog).toEqual([
      expect.objectContaining({
        id: challenge01.challengeId,
        title: "Pressure-History Adaptive Mouse",
        status: "playable",
      }),
    ]);
    expect(
      getChallengeById(challenge01.challengeId, {
        modeId: "practitioner",
        stage: "drafting",
      }).activeMode.id,
    ).toBe("practitioner");
    expect(() => getChallengeById("missing-challenge")).toThrow(RangeError);
  });
});
