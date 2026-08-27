import {
  assertValidChallengeBundle,
  challenge01,
  challenge01CompatibilityHash,
  challenge01ContentDigest,
  challenge01ContentVersion,
  challenge01EvaluatorData,
  challenge01PlayerFacing,
  getChallenge01ForMode,
  validateChallengeBundle,
} from "./challenge01.js";

export {
  assertValidChallengeBundle,
  challenge01,
  challenge01CompatibilityHash,
  challenge01ContentDigest,
  challenge01ContentVersion,
  challenge01EvaluatorData,
  challenge01PlayerFacing,
  getChallenge01ForMode,
  validateChallengeBundle,
};

export const challengeCatalog = Object.freeze([
  Object.freeze({
    id: challenge01PlayerFacing.challengeId,
    number: challenge01PlayerFacing.metadata.number,
    slug: challenge01PlayerFacing.metadata.slug,
    title: challenge01PlayerFacing.metadata.title,
    contentVersion: challenge01PlayerFacing.contentVersion,
    contentDigest: challenge01ContentDigest,
    compatibilityHash: challenge01CompatibilityHash,
    jurisdiction: challenge01PlayerFacing.metadata.jurisdiction,
    availableModes: Object.keys(challenge01PlayerFacing.modes),
    status: "playable",
  }),
]);

export function getChallengeById(challengeId, options) {
  if (challengeId !== challenge01PlayerFacing.challengeId) {
    throw new RangeError(`Unknown ScopeCraft challenge: ${challengeId}`);
  }
  return getChallenge01ForMode(options?.modeId, options);
}
