import { describe, expect, it } from "vitest";
import { challenge01 } from "../challenges/index.js";
import {
  evaluateClaimSet,
  mapCompetitorToClaim,
  matchLimitationConcepts,
} from "./evaluator.js";

describe("deterministic evaluator", () => {
  it("matches configured concepts through disclosed synonyms, not exact answer text", () => {
    const match = matchLimitationConcepts(
      {
        id: "drafted-limitation",
        text:
          "a force-responsive input element producing a force value for a scroll-gain mapping",
      },
      challenge01,
    );
    expect(match.conceptIds).toEqual(
      expect.arrayContaining([
        "pressure-responsive-element",
        "pressure-value",
        "pressure-to-scroll-mapping",
      ]),
    );
    expect(match.conceptMatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          conceptId: "pressure-responsive-element",
          method: "phrase",
          matchedPhrase: "force responsive input element",
        }),
      ]),
    );
  });

  it("produces different dispositions for substantively different claim sets", () => {
    const initial = evaluateClaimSet(
      challenge01.fixtures.initialClaims,
      challenge01,
      { mode: "practitioner" },
    );
    const amended = evaluateClaimSet(
      challenge01.fixtures.amendedClaims,
      challenge01,
      { mode: "practitioner" },
    );

    expect(initial.byClaimId["initial-claim-1"].disposition).toEqual(
      expect.objectContaining({
        status: "rejected",
        outcome: "rejected-103",
        recipeId: "reject-initial-claim-1-core",
      }),
    );
    expect(amended.byClaimId["amended-claim-1"].disposition).toEqual(
      expect.objectContaining({
        status: "survives",
        outcome: "survives-record",
        recipeId: "withdraw-amended-claim-1-core",
      }),
    );
  });

  it("carries inherited limitations into each dependent-claim disposition", () => {
    const result = evaluateClaimSet(
      challenge01.fixtures.initialClaims,
      challenge01,
      { mode: "practitioner" },
    );
    const parent = result.byClaimId["initial-claim-1"];
    const dependent = result.byClaimId["initial-claim-2"];

    expect(dependent.inheritedLimitationsCarried).toBe(true);
    expect(dependent.inheritedConceptIds).toEqual(
      expect.arrayContaining(parent.conceptIds),
    );
    expect(dependent.addedConceptIds).toEqual(
      expect.arrayContaining(["correction-sequence", "correction-interval"]),
    );
    expect(dependent.disposition.referenceIds).toEqual(["ref-a", "ref-b"]);
  });

  it("preserves amendment-target caution instead of calling it an allowance", () => {
    const result = evaluateClaimSet(
      challenge01.fixtures.initialClaims,
      challenge01,
      { mode: "practitioner" },
    );
    expect(result.byClaimId["initial-claim-3"].disposition).toEqual(
      expect.objectContaining({
        status: "uncertain",
        outcome: "amendment-target",
      }),
    );
  });

  it("maps competitor limitations as mapped, omitted, or uncertain", () => {
    const mapping = mapCompetitorToClaim(
      challenge01.fixtures.amendedClaims,
      "amended-claim-1",
      challenge01,
    );

    expect(mapping.counts).toEqual({ mapped: 7, omitted: 3, uncertain: 3 });
    expect(mapping.completeLiteralMapping).toBe(false);
    expect(mapping.limitations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          limitationId: "a1-assign-records",
          status: "omitted",
        }),
        expect.objectContaining({
          limitationId: "a1-labeled-records",
          status: "uncertain",
        }),
      ]),
    );
    expect(mapping.conclusion).toMatch(/not a noninfringement opinion/i);
  });

  it("replays the frozen challenge deterministically", () => {
    const first = evaluateClaimSet(
      challenge01.fixtures.amendedClaims,
      challenge01,
      { mode: "practitioner" },
    );
    const second = evaluateClaimSet(
      challenge01.fixtures.amendedClaims,
      challenge01,
      { mode: "practitioner" },
    );
    expect(second).toEqual(first);
  });

  it("emits a JSON-safe Office Action without undefined evidence fields", () => {
    const result = evaluateClaimSet(
      challenge01.fixtures.initialClaims,
      challenge01,
      { mode: "practitioner" },
    );
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    const evidence = result.claims.flatMap((claim) =>
      claim.evidenceChart.flatMap((row) =>
        [...row.concepts, ...row.relations].flatMap((item) => item.evidence),
      ),
    );
    expect(evidence.length).toBeGreaterThan(0);
    expect(
      evidence.every((entry) =>
        Object.values(entry).every((value) => value !== undefined),
      ),
    ).toBe(true);
  });
});
