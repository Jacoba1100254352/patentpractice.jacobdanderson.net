import {
  challenge01CompatibilityHash,
  challenge01ContentDigest,
  challenge01ContentVersion,
  challenge01GeneratedRecord,
} from "./generated/challenge01.generated.js";
import {
  assertValidChallengeBundle as assertBundle,
  validateChallengeBundle as validateBundle,
} from "./validateChallengeBundle.js";

export {
  challenge01CompatibilityHash,
  challenge01ContentDigest,
  challenge01ContentVersion,
};

export const challenge01PlayerFacing = deepFreeze(
  challenge01GeneratedRecord.playerFacing,
);

export const challenge01EvaluatorData = deepFreeze(
  challenge01GeneratedRecord.evaluator,
);

export const challenge01 = deepFreeze({
  ...challenge01PlayerFacing,
  fixtures: challenge01EvaluatorData.fixtures,
  evaluator: challenge01EvaluatorData,
});

export function getChallenge01ForMode(
  modeId = "practitioner",
  { stage = "drafting", includeEvaluator = false } = {},
) {
  const mode = challenge01PlayerFacing.modes[modeId];
  if (!mode) {
    throw new RangeError(`Unknown Challenge 01 mode: ${modeId}`);
  }

  const validStages = new Set([
    "drafting",
    "office-action",
    "amendment",
    "competitor",
    "debrief",
  ]);
  if (!validStages.has(stage)) {
    throw new RangeError(`Unknown Challenge 01 stage: ${stage}`);
  }

  const afterSubmission = stage !== "drafting";
  const visibleReferenceIds = afterSubmission
    ? mode.visibleReferenceIdsAfterSubmission
    : mode.visibleReferenceIdsAtDrafting;
  const allCards = [
    ...challenge01PlayerFacing.priorArt.cards,
    challenge01EvaluatorData.expertReference,
  ];
  const references = allCards.filter((reference) =>
    visibleReferenceIds.includes(reference.id),
  );

  const view = cloneData(challenge01PlayerFacing);
  view.activeMode = cloneData(mode);
  view.activeStage = stage;
  view.priorArt.cards = cloneData(references);
  view.priorArt.locked = references.length === 0;
  view.priorArt.lockedMessage =
    references.length === 0
      ? "References are concealed until the initial claim set is submitted in Examiner mode."
      : null;

  if (mode.revealTargetEmbodiments) {
    view.disclosure.targetEmbodiments = cloneData(
      challenge01EvaluatorData.hiddenTargetEmbodiments,
    );
  }

  if (includeEvaluator) {
    view.evaluator = cloneData(challenge01EvaluatorData);
  }

  return deepFreeze(view);
}

export function validateChallengeBundle(bundle = challenge01) {
  return validateBundle(bundle);
}

export function assertValidChallengeBundle(bundle = challenge01) {
  return assertBundle(bundle);
}

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object") return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.isFrozen(value) ? value : Object.freeze(value);
}

assertValidChallengeBundle(challenge01);
