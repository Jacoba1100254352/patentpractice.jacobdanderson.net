import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  buildChallengeBundle,
  buildGeneratedChallengeModule,
  computeChallengeDigest,
  DEFAULT_GENERATED_CHALLENGE_PATH,
  DEFAULT_REVIEWED_CHALLENGE_PATH,
  generateReviewedChallenge,
  readReviewedChallenge,
  validateReviewedChallengeRecord,
} from "../../scripts/build-reviewed-challenges.mjs";
import {
  challenge01,
  challenge01CompatibilityHash,
  challenge01ContentDigest,
  challenge01ContentVersion,
  challenge01EvaluatorData,
  challenge01PlayerFacing,
} from "./index.js";

function mutableCopy(value) {
  return JSON.parse(JSON.stringify(value));
}

const temporaryDirectories = [];

afterAll(() => {
  for (const directory of temporaryDirectories) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("reviewed challenge promotion pipeline", () => {
  it("makes the reviewed record the exact source of the legacy runtime exports", () => {
    const record = readReviewedChallenge();

    expect(challenge01PlayerFacing).toEqual(record.playerFacing);
    expect(challenge01EvaluatorData).toEqual(record.evaluator);
    expect(challenge01).toEqual(buildChallengeBundle(record));
    expect(Object.isFrozen(challenge01PlayerFacing.disclosure.anchors[0])).toBe(true);
    expect(Object.isFrozen(challenge01EvaluatorData.fixtures.amendedClaims[0])).toBe(true);
    expect(challenge01CompatibilityHash).toBe("sha256:challenge01-v1.0.0");
    expect(challenge01ContentVersion).toBe(challenge01PlayerFacing.contentVersion);
  });

  it("keeps player and evaluator material separate until engine construction", () => {
    expect(challenge01PlayerFacing).not.toHaveProperty("evaluator");
    expect(challenge01PlayerFacing).not.toHaveProperty("fixtures");
    expect(challenge01PlayerFacing).not.toHaveProperty("hidden");
    expect(challenge01PlayerFacing.disclosure).not.toHaveProperty(
      "targetEmbodiments",
    );
    expect(challenge01EvaluatorData.visibility).toBe("evaluator-only");
  });

  it("generates deterministic, current public output without review metadata", () => {
    const record = readReviewedChallenge(DEFAULT_REVIEWED_CHALLENGE_PATH);
    const first = buildGeneratedChallengeModule(record);
    const second = buildGeneratedChallengeModule(mutableCopy(record));

    expect(second).toBe(first);
    expect(first).toBe(readFileSync(DEFAULT_GENERATED_CHALLENGE_PATH, "utf8"));
    expect(first).not.toContain('"reviewStatus"');
    expect(first).not.toContain(record.review.reviewedBy);
    expect(computeChallengeDigest(record)).toBe(challenge01ContentDigest);
    expect(challenge01ContentDigest).toMatch(/^sha256:[a-f0-9]{64}$/u);
  });

  it("refuses to compile content that has not completed every review gate", () => {
    for (const mutate of [
      (record) => { record.review.reviewStatus = "candidate"; },
      (record) => { record.review.fictionalized = false; },
      (record) => { record.review.publicReleaseApproved = false; },
      (record) => { record.review.reviewedBy = ""; },
    ]) {
      const record = mutableCopy(readReviewedChallenge());
      mutate(record);
      expect(() => validateReviewedChallengeRecord(record)).toThrow();
    }
  });

  it("blocks confidential paths, sensitive fields, and credential-bearing URLs", () => {
    const sensitiveField = mutableCopy(readReviewedChallenge());
    sensitiveField.evaluator.attorneyNotes = "internal";
    expect(() => validateReviewedChallengeRecord(sensitiveField)).toThrow(
      /attorneyNotes.*not permitted/iu,
    );

    const localPath = mutableCopy(readReviewedChallenge());
    localPath.playerFacing.disclosure.sections[0].body =
      "Copied from /Users/example/Confidential/source.docx";
    expect(() => validateReviewedChallengeRecord(localPath)).toThrow(
      /local or confidential path/iu,
    );

    const credentialUrl = mutableCopy(readReviewedChallenge());
    credentialUrl.playerFacing.priorArt.cards[0].sourceUrl =
      "https://example.test/patent?access_token=not-public";
    expect(() => validateReviewedChallengeRecord(credentialUrl)).toThrow(
      /credential query parameters/iu,
    );

    const reviewPath = mutableCopy(readReviewedChallenge());
    reviewPath.review.reviewPolicy = "See /Users/example/private-review.txt";
    expect(() => validateReviewedChallengeRecord(reviewPath)).toThrow(
      /local or confidential path/iu,
    );
  });

  it("supports a non-mutating stale-output check", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "scopecraft-challenge-"));
    temporaryDirectories.push(directory);
    const outputPath = path.join(directory, "challenge01.generated.js");

    generateReviewedChallenge({ outputPath });
    expect(() =>
      generateReviewedChallenge({ outputPath, check: true }),
    ).not.toThrow();

    writeFileSync(outputPath, "// stale\n");
    expect(() =>
      generateReviewedChallenge({ outputPath, check: true }),
    ).toThrow(/stale/iu);
  });

  it("requires content and compatibility versions to advance together", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "scopecraft-version-"));
    temporaryDirectories.push(directory);
    const inputPath = path.join(directory, "challenge01.json");
    const outputPath = path.join(directory, "challenge01.generated.js");
    const changed = mutableCopy(readReviewedChallenge());
    changed.playerFacing.disclosure.sections[0].body += " Reviewed content change.";

    writeFileSync(inputPath, `${JSON.stringify(changed, null, 2)}\n`);
    writeFileSync(outputPath, readFileSync(DEFAULT_GENERATED_CHALLENGE_PATH));
    expect(() => generateReviewedChallenge({ inputPath, outputPath })).toThrow(
      /without advancing both contentVersion and compatibilityHash/iu,
    );

    changed.review.compatibilityHash = "sha256:alternate-v1.0.0";
    writeFileSync(inputPath, `${JSON.stringify(changed, null, 2)}\n`);
    expect(() => generateReviewedChallenge({ inputPath, outputPath })).toThrow(
      /without advancing both contentVersion and compatibilityHash/iu,
    );

    changed.playerFacing.contentVersion = "1.0.1";
    changed.review.compatibilityHash = "sha256:challenge01-v1.0.1";
    writeFileSync(inputPath, `${JSON.stringify(changed, null, 2)}\n`);
    expect(() => generateReviewedChallenge({ inputPath, outputPath })).not.toThrow();
  });
});
