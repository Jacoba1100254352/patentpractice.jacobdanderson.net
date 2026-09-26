import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  buildEngineCompatibility,
  buildGeneratedEngineCompatibilityModule,
  collectEngineCompatibilityInputs,
  DEFAULT_ENGINE_COMPATIBILITY_PATH,
} from "../../scripts/build-engine-compatibility.mjs";
import { engineCompatibility } from "./generated/compatibility.generated.js";

describe("engine compatibility identity", () => {
  it("matches the complete generated compatibility module", () => {
    expect(buildGeneratedEngineCompatibilityModule()).toBe(
      readFileSync(DEFAULT_ENGINE_COMPATIBILITY_PATH, "utf8"),
    );
    expect(engineCompatibility.hash).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(engineCompatibility.version).toMatch(/^digest-[a-f0-9]{16}$/u);
  });

  it("changes when a compatibility-sensitive source changes", () => {
    const current = buildEngineCompatibility();
    const changed = buildEngineCompatibility({
      readSource(filePath) {
        const source = readFileSync(filePath, "utf8");
        return filePath.endsWith("/src/engine/scoring.js")
          ? `${source}\n// compatibility probe\n`
          : source;
      },
    });

    expect(changed.hash).not.toBe(current.hash);
    expect(changed.version).not.toBe(current.version);
  });

  it("covers the runtime orchestration and its complete local dependency closure", () => {
    const paths = collectEngineCompatibilityInputs().map((input) => input.path);
    expect(paths).toEqual(expect.arrayContaining([
      "src/challenges/challenge01.js",
      "src/domain/claims.js",
      "src/domain/sessionModel.js",
      "src/domain/workflow.js",
      "src/engine/evaluator.js",
      "src/engine/preflight.js",
      "src/engine/runtimeCompatibility.js",
      "src/engine/scoring.js",
    ]));
    expect(paths.some((inputPath) => /(?:App\.jsx|\.css)$/u.test(inputPath))).toBe(false);
  });

  it("changes when the runtime orchestration changes", () => {
    const current = buildEngineCompatibility();
    const changed = buildEngineCompatibility({
      readSource(filePath) {
        const source = readFileSync(filePath, "utf8");
        return filePath.endsWith("/src/engine/runtimeCompatibility.js")
          ? `${source}\n// orchestration compatibility probe\n`
          : source;
      },
    });

    expect(changed.hash).not.toBe(current.hash);
  });
});
