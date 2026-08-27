#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  assertValidChallengeBundle,
} from "../src/challenges/validateChallengeBundle.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const DEFAULT_REVIEWED_CHALLENGE_PATH = path.join(
  root,
  "data",
  "challenges",
  "reviewed",
  "challenge01.json",
);

export const DEFAULT_GENERATED_CHALLENGE_PATH = path.join(
  root,
  "src",
  "challenges",
  "generated",
  "challenge01.generated.js",
);

const FORBIDDEN_PUBLIC_KEYS = new Set([
  "apikey",
  "attorneynotes",
  "authorization",
  "clientname",
  "cookie",
  "credential",
  "credentials",
  "inventorname",
  "localpath",
  "matterid",
  "password",
  "privatekey",
  "providerpayload",
  "secret",
  "sourcepath",
  "token",
  "transcript",
]);

const LOCAL_PATH_PATTERN =
  /(?:\/Users\/|\/home\/|[A-Za-z]:\\Users\\|Confidential\/|\.ai-work\/|ops\/challenge-candidates\/)/u;
const PRIVATE_KEY_PATTERN = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/u;
const CREDENTIAL_ASSIGNMENT_PATTERN =
  /\b(?:api[_-]?key|authorization|bearer|client[_-]?secret|password|private[_-]?key|secret|token)\b\s*[:=]\s*["'`][^"'`\s]{6,}/iu;
const PRIVILEGED_MATTER_PATTERN =
  /\b(?:attorney[- ]client privileged|confidential matter|privileged and confidential|do not distribute)\b/iu;

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function normalizeKey(key) {
  return String(key).replace(/[^a-z0-9]/giu, "").toLowerCase();
}

function isForbiddenPublicKey(key) {
  const normalized = normalizeKey(key);
  return (
    FORBIDDEN_PUBLIC_KEYS.has(normalized) ||
    /(?:apikey|authorization|cookie|credential|password|privatekey|secret|token)$/u.test(
      normalized,
    )
  );
}

function assertSafeUrl(value, location) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${location} must be an absolute URL.`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`${location} must use HTTPS.`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`${location} must not contain URL credentials.`);
  }
  for (const key of parsed.searchParams.keys()) {
    if (isForbiddenPublicKey(key)) {
      throw new Error(`${location} must not contain credential query parameters.`);
    }
  }
}

function assertPublicSafeValue(value, location = "challenge") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertPublicSafeValue(entry, `${location}[${index}]`));
    return;
  }
  if (isObject(value)) {
    for (const [key, nested] of Object.entries(value)) {
      const nestedLocation = `${location}.${key}`;
      if (isForbiddenPublicKey(key)) {
        throw new Error(`${nestedLocation} is not permitted in a public challenge.`);
      }
      if (
        typeof nested === "string" &&
        /(?:href|uri|url)$/iu.test(key)
      ) {
        assertSafeUrl(nested, nestedLocation);
      }
      assertPublicSafeValue(nested, nestedLocation);
    }
    return;
  }
  if (typeof value !== "string") return;
  for (const [label, pattern] of [
    ["a local or confidential path", LOCAL_PATH_PATTERN],
    ["private-key material", PRIVATE_KEY_PATTERN],
    ["an assigned credential", CREDENTIAL_ASSIGNMENT_PATTERN],
    ["privileged-matter wording", PRIVILEGED_MATTER_PATTERN],
  ]) {
    if (pattern.test(value)) {
      throw new Error(`${location} contains ${label} and cannot be published.`);
    }
  }
}

export function buildChallengeBundle(record) {
  if (!isObject(record?.playerFacing) || !isObject(record?.evaluator)) {
    throw new Error("Reviewed challenge must contain playerFacing and evaluator objects.");
  }
  return {
    ...record.playerFacing,
    fixtures: record.evaluator.fixtures,
    evaluator: record.evaluator,
  };
}

export function validateReviewedChallengeRecord(record) {
  if (!isObject(record)) {
    throw new Error("Reviewed challenge record must be an object.");
  }
  const allowedRecordKeys = new Set(["review", "playerFacing", "evaluator"]);
  const unexpectedRecordKey = Object.keys(record).find(
    (key) => !allowedRecordKeys.has(key),
  );
  if (unexpectedRecordKey) {
    throw new Error(`Reviewed challenge record contains unexpected key ${unexpectedRecordKey}.`);
  }
  if (!isObject(record.review)) {
    throw new Error("Reviewed challenge record must contain review metadata.");
  }

  const review = record.review;
  const allowedReviewKeys = new Set([
    "reviewStatus",
    "reviewedAt",
    "reviewedBy",
    "fictionalized",
    "publicReleaseApproved",
    "compatibilityHash",
    "reviewPolicy",
  ]);
  const unexpectedReviewKey = Object.keys(review).find(
    (key) => !allowedReviewKeys.has(key),
  );
  if (unexpectedReviewKey) {
    throw new Error(`review contains unexpected key ${unexpectedReviewKey}.`);
  }
  if (review.reviewStatus !== "reviewed") {
    throw new Error("review.reviewStatus must be reviewed.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(review.reviewedAt ?? "")) {
    throw new Error("review.reviewedAt must use YYYY-MM-DD.");
  }
  if (typeof review.reviewedBy !== "string" || !review.reviewedBy.trim()) {
    throw new Error("review.reviewedBy must identify the completed review.");
  }
  if (review.fictionalized !== true) {
    throw new Error("review.fictionalized must be true.");
  }
  if (review.publicReleaseApproved !== true) {
    throw new Error("review.publicReleaseApproved must be true.");
  }
  if (!/^sha256:[a-z0-9._-]+$/iu.test(review.compatibilityHash ?? "")) {
    throw new Error("review.compatibilityHash must be a sha256-prefixed compatibility identifier.");
  }

  const { playerFacing, evaluator } = record;
  if (!isObject(playerFacing) || !isObject(evaluator)) {
    throw new Error("Reviewed challenge must contain playerFacing and evaluator objects.");
  }
  if (!review.compatibilityHash.endsWith(`-v${playerFacing.contentVersion}`)) {
    throw new Error(
      "review.compatibilityHash must end with the reviewed playerFacing contentVersion.",
    );
  }
  for (const forbidden of ["evaluator", "fixtures", "hidden"]) {
    if (Object.hasOwn(playerFacing, forbidden)) {
      throw new Error(`playerFacing must not contain ${forbidden}.`);
    }
  }
  if (Object.hasOwn(playerFacing.disclosure ?? {}, "targetEmbodiments")) {
    throw new Error("playerFacing disclosure must not contain targetEmbodiments.");
  }
  if (evaluator.visibility !== "evaluator-only") {
    throw new Error("evaluator.visibility must be evaluator-only.");
  }

  assertPublicSafeValue(record, "record");
  assertValidChallengeBundle(buildChallengeBundle(record));
  return record;
}

export function computeChallengeDigest(record) {
  validateReviewedChallengeRecord(record);
  const publicRecord = {
    playerFacing: record.playerFacing,
    evaluator: record.evaluator,
  };
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(canonicalize(publicRecord)))
    .digest("hex")}`;
}

export function buildGeneratedChallengeModule(record) {
  validateReviewedChallengeRecord(record);
  const generatedRecord = cloneJson({
    playerFacing: record.playerFacing,
    evaluator: record.evaluator,
  });
  const serialized = JSON.stringify(generatedRecord, null, 2)
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
  return `// Generated by scripts/build-reviewed-challenges.mjs. Do not edit by hand.\n// Only reviewed, fictionalized, public-release-approved content is compiled here.\n\nexport const challenge01ContentVersion = ${JSON.stringify(record.playerFacing.contentVersion)};\nexport const challenge01ContentDigest = ${JSON.stringify(computeChallengeDigest(record))};\nexport const challenge01CompatibilityHash = ${JSON.stringify(record.review.compatibilityHash)};\nexport const challenge01GeneratedRecord = ${serialized};\n`;
}

export function readReviewedChallenge(filePath = DEFAULT_REVIEWED_CHALLENGE_PATH) {
  const record = JSON.parse(readFileSync(filePath, "utf8"));
  return validateReviewedChallengeRecord(record);
}

function readGeneratedMetadata(contents) {
  const contentVersion = contents.match(
    /export const challenge01ContentVersion = "([^"]+)";/u,
  )?.[1];
  const digest = contents.match(
    /export const challenge01ContentDigest = "([^"]+)";/u,
  )?.[1];
  const compatibilityHash = contents.match(
    /export const challenge01CompatibilityHash = "([^"]+)";/u,
  )?.[1];
  return { contentVersion, digest, compatibilityHash };
}

function compareSemanticVersions(left, right) {
  const leftParts = String(left).split(".").map(Number);
  const rightParts = String(right).split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] - rightParts[index];
    }
  }
  return 0;
}

export function generateReviewedChallenge({
  inputPath = DEFAULT_REVIEWED_CHALLENGE_PATH,
  outputPath = DEFAULT_GENERATED_CHALLENGE_PATH,
  check = false,
} = {}) {
  const record = readReviewedChallenge(inputPath);
  const generated = buildGeneratedChallengeModule(record);
  const contentDigest = computeChallengeDigest(record);

  if (existsSync(outputPath)) {
    const existing = readGeneratedMetadata(readFileSync(outputPath, "utf8"));
    if (existing.digest && existing.digest !== contentDigest) {
      const contentVersionAdvanced =
        existing.contentVersion &&
        compareSemanticVersions(
          record.playerFacing.contentVersion,
          existing.contentVersion,
        ) > 0;
      const compatibilityHashAdvanced =
        existing.compatibilityHash &&
        existing.compatibilityHash !== record.review.compatibilityHash;
      if (!contentVersionAdvanced || !compatibilityHashAdvanced) {
        throw new Error(
          "Reviewed challenge content changed without advancing both contentVersion and compatibilityHash.",
        );
      }
    }
  }

  if (check) {
    if (!existsSync(outputPath)) {
      throw new Error(`Missing generated challenge module: ${outputPath}`);
    }
    if (readFileSync(outputPath, "utf8") !== generated) {
      throw new Error(
        "Generated Challenge 01 data is stale. Run npm run challenges:generate and review the diff.",
      );
    }
  } else {
    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, generated);
  }

  return {
    inputPath,
    outputPath,
    compatibilityHash: record.review.compatibilityHash,
    contentDigest,
  };
}

export function main(args = process.argv.slice(2)) {
  const allowed = new Set(["--check"]);
  const unknown = args.filter((argument) => !allowed.has(argument));
  if (unknown.length) {
    throw new Error(`Unknown argument(s): ${unknown.join(", ")}`);
  }
  const result = generateReviewedChallenge({ check: args.includes("--check") });
  const action = args.includes("--check") ? "Verified" : "Generated";
  console.log(
    `${action} ${path.relative(root, result.outputPath)} from ${path.relative(root, result.inputPath)} (${result.contentDigest})`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
