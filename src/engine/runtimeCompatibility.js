import {
  challenge01ContentDigest,
  challenge01EvaluatorData,
  challenge01PlayerFacing,
  getChallenge01ForMode,
} from "../challenges/index.js";
import { normalizeClaimSet } from "../domain/claims.js";
import {
  createEngineChallenge,
  createStarterClaimSet,
  selectCompetitorTargetClaim,
} from "../domain/sessionModel.js";
import { createAttemptState } from "../domain/workflow.js";
import { evaluateClaimSet, mapCompetitorToClaim } from "./evaluator.js";
import { runPreflight } from "./preflight.js";
import { scorePortfolio } from "./scoring.js";

export function stageForPhase(phase) {
  if (phase === "office-action") return "office-action";
  if (["response", "final-action"].includes(phase)) return "amendment";
  if (["competitor-prediction", "competitor-result"].includes(phase)) return "competitor";
  if (phase === "debrief") return "debrief";
  return "drafting";
}

export function createInitialAttempt({
  modeId = "practitioner",
  engineVersion,
  engineHash,
} = {}) {
  return createAttemptState({
    challengeId: challenge01PlayerFacing.challengeId,
    challengeVersion: challenge01PlayerFacing.contentVersion,
    challengeHash: challenge01ContentDigest,
    engineVersion,
    engineHash,
    difficulty: modeId,
    mappingChallenges: challenge01EvaluatorData.mappingChallengeRulings.map((ruling) => ({
      id: ruling.id,
      prompt: ruling.prompt,
      challengedFindingId: ruling.challengedFindingId,
    })),
    initialDraft: { claims: createStarterClaimSet().claims, notes: "" },
  });
}

export function buildChallengeRuntime({ modeId, phase }) {
  const playerChallenge = getChallenge01ForMode(modeId, {
    stage: stageForPhase(phase),
  });
  return {
    playerChallenge,
    engineChallenge: createEngineChallenge(
      playerChallenge,
      challenge01EvaluatorData,
      modeId,
    ),
  };
}

export function claimSetFromDraft(draft) {
  return normalizeClaimSet({ id: "claim-set", claims: draft?.claims ?? [] });
}

export function buildDraftRuntime({
  draft,
  playerChallenge,
  engineChallenge,
  modeId,
}) {
  const claimSet = claimSetFromDraft(draft);
  return {
    claimSet,
    preflight: runPreflight(claimSet, {
      challenge: engineChallenge,
      claimBudget: playerChallenge.activeMode.claimBudget,
      mode: modeId,
    }),
  };
}

export function evaluateDraftRuntime({
  claimSet,
  preflight,
  playerChallenge,
  engineChallenge,
  modeId,
}) {
  return evaluateClaimSet(claimSet, engineChallenge, {
    preflight,
    mode: modeId,
    claimBudget: playerChallenge.activeMode.claimBudget,
  });
}

export function buildCompetitorRuntime({ draft, finalAction, engineChallenge }) {
  const claimSet = claimSetFromDraft(draft);
  return {
    claimSet,
    targetClaim: selectCompetitorTargetClaim(claimSet, finalAction),
    engineChallenge,
  };
}

export function evaluateCompetitorRuntime({ claimSet, targetClaim, engineChallenge }) {
  if (!targetClaim) return null;
  return mapCompetitorToClaim(
    claimSet,
    targetClaim,
    engineChallenge,
    engineChallenge.competitor,
  );
}

export function buildDebriefRuntime({
  claimSet,
  finalAction,
  competitorResult,
  playerChallenge,
  engineChallenge,
  modeId,
}) {
  return scorePortfolio({
    claimSet,
    challenge: engineChallenge,
    evaluation: finalAction,
    competitorMappings: competitorResult ? [competitorResult] : [],
    preflight: runPreflight(claimSet, {
      challenge: engineChallenge,
      claimBudget: playerChallenge.activeMode.claimBudget,
      mode: modeId,
    }),
  });
}
