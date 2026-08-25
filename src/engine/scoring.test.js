import { describe, expect, it } from "vitest";
import { challenge01 } from "../challenges/index.js";
import { scorePortfolio } from "./scoring.js";

describe("portfolio scoring", () => {
  it("applies the configured semantic benchmark to the model amendment", () => {
    const score = scorePortfolio(challenge01.fixtures.amendedClaims, challenge01);

    expect(score.eligible).toBe(true);
    expect(score.benchmarkApplied).toBe(true);
    expect(score.total).toBe(76);
    expect(
      Object.fromEntries(
        Object.entries(score.categories).map(([key, value]) => [key, value.score]),
      ),
    ).toEqual({
      scope: 20,
      supportClarity: 18,
      priorArtResilience: 12,
      dependentLadder: 13,
      designAroundResistance: 9,
      efficiency: 4,
    });
  });

  it("recalculates when the portfolio changes instead of retaining fixture points", () => {
    const model = scorePortfolio(challenge01.fixtures.amendedClaims, challenge01);
    const shortened = challenge01.fixtures.amendedClaims.slice(0, 2);
    const changed = scorePortfolio(shortened, challenge01);

    expect(changed.benchmarkApplied).toBe(false);
    expect(changed.total).not.toBe(model.total);
    expect(changed.categories.dependentLadder.score).toBeLessThan(
      model.categories.dependentLadder.score,
    );
  });

  it("keeps threshold gates separate from category points", () => {
    const score = scorePortfolio(
      [{ id: "empty", number: 1, text: "" }],
      challenge01,
    );
    expect(score.eligible).toBe(false);
    expect(score.status).toBe("threshold-gate-not-met");
    expect(score.gates.formalSupport.pass).toBe(false);
    expect(score.preflight.blockers).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "EMPTY_CLAIM" })]),
    );
  });

  it("keeps category totals transparent and bounded by their weights", () => {
    const score = scorePortfolio(challenge01.fixtures.initialClaims, challenge01);
    const categoryTotal = Object.values(score.categories).reduce(
      (sum, category) => sum + category.score,
      0,
    );
    expect(categoryTotal).toBe(score.total);
    for (const category of Object.values(score.categories)) {
      expect(category.score).toBeGreaterThanOrEqual(0);
      expect(category.score).toBeLessThanOrEqual(category.maximum);
    }
  });
});
