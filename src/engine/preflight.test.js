import { describe, expect, it } from "vitest";
import { runPreflight } from "./preflight.js";

describe("preflight", () => {
  it("blocks cycles, forward references, empty claims, and budget overruns", () => {
    const result = runPreflight(
      [
        { id: "c1", number: 1, dependsOn: "c2", text: "1. A system comprising a sensor." },
        { id: "c2", number: 2, dependsOn: "c1", text: "" },
      ],
      { claimBudget: 1 },
    );
    const codes = result.blockers.map((item) => item.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        "CLAIM_BUDGET_EXCEEDED",
        "DEPENDENCY_CYCLE",
        "EMPTY_CLAIM",
        "FORWARD_DEPENDENCY",
      ]),
    );
    expect(result.canSubmit).toBe(false);
  });

  it("requires a dependent claim to add material beyond its parent", () => {
    const result = runPreflight([
      {
        id: "c1",
        number: 1,
        limitations: [{ id: "l1", text: "a pressure sensor" }],
      },
      {
        id: "c2",
        number: 2,
        dependsOn: "c1",
        limitations: [{ id: "l2", text: "a pressure sensor" }],
      },
    ]);
    expect(result.blockers).toContainEqual(
      expect.objectContaining({
        claimId: "c2",
        code: "DEPENDENT_NO_ADDED_LIMITATION",
      }),
    );
  });

  it("classifies possible antecedent defects as bounded warnings", () => {
    const result = runPreflight([
      {
        id: "c1",
        number: 1,
        text: "1. A system comprising a sensor configured to drive the missing actuator.",
      },
    ]);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: "POSSIBLE_ANTECEDENT",
        term: "missing actuator",
      }),
    );
    expect(result.blockers).toHaveLength(0);
  });

  it("reports a valid added limitation and remaining budget as information", () => {
    const result = runPreflight(
      [
        {
          id: "c1",
          number: 1,
          text: "1. A system comprising a sensor and a controller.",
        },
        {
          id: "c2",
          number: 2,
          dependsOn: "c1",
          text:
            "2. The system of claim 1, wherein the sensor comprises a capacitive strip.",
        },
      ],
      { claimBudget: 4 },
    );
    expect(result.info).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "CLAIM_BUDGET_REMAINING" }),
        expect.objectContaining({
          code: "DEPENDENT_ADDS_LIMITATION",
          claimId: "c2",
        }),
      ]),
    );
  });

  it("gives repeated antecedent warnings distinct stable item IDs", () => {
    const result = runPreflight([
      {
        id: "c1",
        number: 1,
        text:
          "1. A system comprising a controller configured to use the mapping and revise the mapping.",
      },
    ]);
    const mappingWarnings = result.warnings.filter(
      (item) => item.code === "POSSIBLE_ANTECEDENT" && item.term === "mapping",
    );
    expect(mappingWarnings).toHaveLength(2);
    expect(new Set(mappingWarnings.map((item) => item.id)).size).toBe(2);
    expect(runPreflight(result.claimSet).warnings.map((item) => item.id)).toEqual(
      result.warnings.map((item) => item.id),
    );
  });
});
