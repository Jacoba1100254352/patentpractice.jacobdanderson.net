import {
  createStableId,
  getDependencyRefs,
  normalizeClaimSet,
  renderClaimText,
  sortClaims,
} from "./claims.js";

function cloneJson(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

function starterLimitation(id, text, depth = 0) {
  return {
    id,
    text,
    depth,
    conceptIds: [],
    relationIds: [],
    supportAnchorIds: [],
  };
}

/**
 * Start from visible, broad disclosure-level material. The starter intentionally
 * omits the hidden pressure-interval labeling and localized-update solution.
 */
export function createStarterClaimSet() {
  const normalized = normalizeClaimSet({
    id: "starter-claim-set",
    claims: [
      {
        id: "starter-claim-1",
        number: 1,
        kind: "independent",
        subject: "computer input system",
        limitations: [
          starterLimitation(
            "starter-c1-input",
            "a pressure-responsive input element configured to generate pressure values",
          ),
          starterLimitation(
            "starter-c1-interface",
            "an interface configured to communicate scrolling commands to a host device",
          ),
          starterLimitation(
            "starter-c1-processing",
            "one or more processors configured to maintain a mapping relating the pressure values to scrolling amounts",
          ),
          starterLimitation(
            "starter-c1-output",
            "the one or more processors being configured to determine a scrolling amount using the mapping and cause the interface to communicate a scrolling command specifying the scrolling amount",
            1,
          ),
        ],
      },
      {
        id: "starter-claim-2",
        number: 2,
        kind: "dependent",
        dependsOn: 1,
        subject: "computer input system",
        limitations: [
          starterLimitation(
            "starter-c2-structure",
            "the pressure-responsive input element comprises a user-actuated scrolling structure",
          ),
        ],
      },
      {
        id: "starter-claim-3",
        number: 3,
        kind: "dependent",
        dependsOn: 1,
        subject: "computer input system",
        limitations: [
          starterLimitation(
            "starter-c3-history",
            "the one or more processors are configured to update the mapping based on a history of scrolling commands",
          ),
        ],
      },
      {
        id: "starter-claim-4",
        number: 4,
        kind: "dependent",
        dependsOn: 3,
        subject: "computer input system",
        limitations: [
          starterLimitation(
            "starter-c4-correction",
            "the history identifies a correction sequence comprising scrolling in a first direction followed by scrolling in an opposite direction",
          ),
        ],
      },
    ],
  });

  const claims = normalized.claims.map((claim) => ({
    ...claim,
    text: renderClaimText(claim, normalized),
  }));
  return { ...normalized, claims };
}

/**
 * Create the internal evaluator view without mutating or enriching the object
 * rendered to the player. Callers should keep using playerView for UI content.
 */
export function createEngineChallenge(playerView, evaluatorData, modeId = "practitioner") {
  if (!playerView || typeof playerView !== "object" || Array.isArray(playerView)) {
    throw new TypeError("playerView must be a challenge object.");
  }
  if (!evaluatorData || typeof evaluatorData !== "object" || Array.isArray(evaluatorData)) {
    throw new TypeError("evaluatorData must be an evaluator object.");
  }
  const mode = playerView.modes?.[modeId];
  if (!mode) throw new RangeError(`Unknown ScopeCraft mode: ${modeId}`);

  const player = cloneJson(playerView);
  const evaluator = cloneJson(evaluatorData);
  const hiddenTargetEmbodiments = cloneJson(
    evaluator.hiddenTargetEmbodiments ?? [],
  );
  const internal = {
    ...player,
    metadata: {
      ...(player.metadata ?? {}),
      difficulty: modeId,
    },
    selectedModeId: modeId,
    claimBudget: cloneJson(mode.claimBudget),
    evaluator,
    fixtures: cloneJson(evaluator.fixtures ?? {}),
    hidden: {
      targetEmbodiments: hiddenTargetEmbodiments,
    },
  };
  return deepFreeze(internal);
}

function subjectFromClaim(claim) {
  if (claim.subject?.trim()) return claim.subject.trim();
  const match = claim.text?.match(
    /^\s*\d*\.?\s*(?:A|An)\s+(.+?)\s+comprising\s*:/iu,
  );
  return match?.[1]?.trim() || "system";
}

function isPreambleLimitation(limitation, subject) {
  if (/preamble$/iu.test(limitation.id ?? "")) return true;
  const normalizedText = String(limitation.text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const normalizedSubject = String(subject)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return (
    normalizedText === `a ${normalizedSubject}` ||
    normalizedText === `an ${normalizedSubject}`
  );
}

function renderPromotedTarget(target, claimSet) {
  const subject = subjectFromClaim(target);
  const renderable = {
    ...target,
    subject,
    limitations:
      target.kind === "independent"
        ? target.limitations.filter(
            (limitation) => !isPreambleLimitation(limitation, subject),
          )
        : target.limitations,
  };
  const renderingSet = {
    ...claimSet,
    claims: claimSet.claims.map((claim) =>
      claim.id === target.id ? renderable : claim,
    ),
  };
  return renderClaimText(renderable, renderingSet);
}

/**
 * Promote only limitations already present in the player's dependent claims.
 * Hidden challenge data is neither accepted nor consulted by this operation.
 */
export function promoteDependentLimitations(
  claimSet,
  targetClaimNumber = 1,
  sourceNumbers = [3, 4],
) {
  const normalized = normalizeClaimSet(claimSet);
  const target = normalized.claims.find(
    (claim) => claim.number === Number(targetClaimNumber),
  );
  if (!target) {
    throw new RangeError(`Target claim ${targetClaimNumber} is not in the claim set.`);
  }

  const requestedNumbers = new Set(sourceNumbers.map(Number));
  const sources = sortClaims(normalized).filter(
    (claim) =>
      requestedNumbers.has(claim.number) &&
      claim.id !== target.id &&
      getDependencyRefs(claim).length > 0,
  );
  const usedIds = new Set(
    normalized.claims.flatMap((claim) =>
      claim.limitations.map((limitation) => limitation.id),
    ),
  );
  const existingOrigins = new Set(
    target.limitations
      .map((limitation) =>
        limitation.promotedFromClaimId && limitation.promotedFromLimitationId
          ? `${limitation.promotedFromClaimId}:${limitation.promotedFromLimitationId}`
          : null,
      )
      .filter(Boolean),
  );
  const promoted = [];
  for (const source of sources) {
    for (const limitation of source.limitations) {
      if (!limitation.text.trim()) continue;
      const origin = `${source.id}:${limitation.id}`;
      if (existingOrigins.has(origin)) continue;
      promoted.push({
        ...cloneJson(limitation),
        id: createStableId(
          "limitation-promoted",
          `${source.id}-${limitation.id}`,
          usedIds,
        ),
        promotedFromClaimId: source.id,
        promotedFromClaimNumber: source.number,
        promotedFromLimitationId: limitation.id,
      });
      existingOrigins.add(origin);
    }
  }

  const fullyPromotedSources = sources.filter((source) => {
    const substantive = source.limitations.filter((limitation) =>
      limitation.text.trim(),
    );
    return (
      substantive.length > 0 &&
      substantive.every((limitation) =>
        existingOrigins.has(`${source.id}:${limitation.id}`),
      )
    );
  });
  if (!promoted.length && !fullyPromotedSources.length) return normalized;
  const updatedTarget = {
    ...target,
    limitations: [...target.limitations, ...promoted],
  };
  const removedIds = new Set(fullyPromotedSources.map((claim) => claim.id));
  const removedNumbers = new Set(
    fullyPromotedSources.map((claim) => String(claim.number)),
  );
  const reparent = (claim) => {
    const refs = getDependencyRefs(claim);
    if (!refs.length) return claim;
    const nextRefs = refs.map((ref) =>
      removedIds.has(String(ref)) || removedNumbers.has(String(ref))
        ? target.number
        : ref,
    );
    const uniqueRefs = [...new Set(nextRefs)];
    return {
      ...claim,
      dependsOn: uniqueRefs.length <= 1 ? (uniqueRefs[0] ?? null) : uniqueRefs,
    };
  };
  const updated = {
    ...normalized,
    claims: normalized.claims
      .filter((claim) => !removedIds.has(claim.id))
      .map((claim) =>
        claim.id === target.id ? updatedTarget : reparent(claim),
      ),
  };
  updatedTarget.text = renderPromotedTarget(updatedTarget, updated);
  return {
    ...updated,
    claims: updated.claims.map((claim) =>
      claim.id === target.id ? updatedTarget : claim,
    ),
  };
}

/** Select the best available claim for the fictional competitor-mapping round. */
export function selectCompetitorTargetClaim(claimSet, evaluation) {
  const claims = sortClaims(claimSet);
  if (!claims.length) return null;
  const evaluated = Array.isArray(evaluation?.claims) ? evaluation.claims : [];
  const dispositionFor = (claim) =>
    evaluated.find(
      (item) =>
        item.claimId === claim.id ||
        String(item.claimNumber) === String(claim.number),
    )?.disposition?.status;
  return (
    claims.find(
      (claim) =>
        claim.kind === "independent" && dispositionFor(claim) === "survives",
    ) ??
    claims.find((claim) => dispositionFor(claim) === "survives") ??
    claims.find((claim) => claim.kind === "independent") ??
    claims[0]
  );
}
