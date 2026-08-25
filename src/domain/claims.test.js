import { describe, expect, it } from "vitest";
import {
  analyzeDependencies,
  buildIntroducedTermRegistry,
  flattenClaim,
  normalizeClaimSet,
  punctuateLimitations,
  renderClaimText,
} from "./claims.js";

describe("claim domain utilities", () => {
  it("assigns repeatable IDs while preserving supplied IDs", () => {
    const source = [
      {
        number: 1,
        limitations: [{ text: "a sensor" }, { id: "kept", text: "a controller" }],
      },
      { id: "claim-two", number: 2, dependsOn: 1, limitations: [] },
    ];
    const first = normalizeClaimSet(source);
    const second = normalizeClaimSet(source);

    expect(first.claims.map((claim) => claim.id)).toEqual([
      "claim-1",
      "claim-two",
    ]);
    expect(first.claims[0].limitations.map((item) => item.id)).toEqual([
      "limitation-claim-1-1",
      "kept",
    ]);
    expect(second).toEqual(first);
  });

  it("flattens every inherited limitation before the dependent addition", () => {
    const claimSet = [
      {
        id: "c1",
        number: 1,
        limitations: [{ id: "l1", text: "a sensor", conceptIds: ["sensor"] }],
      },
      {
        id: "c2",
        number: 2,
        dependsOn: "c1",
        limitations: [
          { id: "l2", text: "the sensor comprises a strip", conceptIds: ["strip"] },
        ],
      },
      {
        id: "c3",
        number: 3,
        dependsOn: "c2",
        limitations: [
          { id: "l3", text: "the strip is capacitive", conceptIds: ["capacitive"] },
        ],
      },
    ];

    const flattened = flattenClaim(claimSet, "c3");
    expect(flattened.chain.map((claim) => claim.id)).toEqual(["c1", "c2", "c3"]);
    expect(flattened.limitations.map((item) => item.id)).toEqual(["l1", "l2", "l3"]);
    expect(flattened.limitations.map((item) => item.inherited)).toEqual([
      true,
      true,
      false,
    ]);
  });

  it("renders structured claims with deterministic punctuation", () => {
    const claim = {
      id: "c1",
      number: 1,
      subject: "input device",
      limitations: [
        { text: "a sensor" },
        { text: "an interface" },
        { text: "a controller" },
      ],
    };
    expect(punctuateLimitations(claim.limitations)).toEqual([
      "a sensor;",
      "an interface; and",
      "a controller.",
    ]);
    expect(renderClaimText(claim, [claim])).toContain("1. An input device comprising:");
    expect(renderClaimText(claim, [claim])).toContain("    a controller.");
  });

  it("makes parent introductions available to dependent claims", () => {
    const claimSet = [
      {
        id: "c1",
        number: 1,
        text:
          "1. A computer input system comprising a pressure sensor and a controller configured to receive a pressure value from the pressure sensor.",
      },
      {
        id: "c2",
        number: 2,
        dependsOn: "c1",
        text:
          "2. The computer input system of claim 1, wherein the controller assigns the pressure value to a pressure interval.",
      },
    ];

    const registry = buildIntroducedTermRegistry(claimSet);
    const dependent = registry.byClaimId.c2;
    expect(dependent.availableTerms).toEqual(
      expect.arrayContaining([
        "computer input system",
        "pressure sensor",
        "controller",
        "pressure value",
      ]),
    );
    expect(
      dependent.issues.filter((issue) =>
        ["computer input system", "controller", "pressure value"].includes(
          issue.key,
        ),
      ),
    ).toHaveLength(0);
  });

  it("reports dependency cycles and forward references separately", () => {
    const report = analyzeDependencies([
      { id: "c1", number: 1, dependsOn: "c2", text: "claim one" },
      { id: "c2", number: 2, dependsOn: "c1", text: "claim two" },
    ]);
    expect(report.forwardRefs).toEqual([
      expect.objectContaining({ claimId: "c1", parentId: "c2" }),
    ]);
    expect(report.cycles).toHaveLength(1);
    expect(report.cycles[0]).toEqual(expect.arrayContaining(["c1", "c2"]));
  });
});
