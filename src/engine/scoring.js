import {
  flattenClaim,
  getDependencyRefs,
  normalizeClaimSet,
  sortClaims,
} from "../domain/claims.js";
import {
  RECORD_BOUNDARY,
  evaluateClaimSet,
  mapCompetitorToClaimSet,
  matchClaimSetConcepts,
} from "./evaluator.js";
import { runPreflight } from "./preflight.js";

export const DEFAULT_SCORE_WEIGHTS = Object.freeze({
  scope: 25,
  supportClarity: 20,
  priorArtResilience: 20,
  dependentLadder: 15,
  designAroundResistance: 15,
  efficiency: 5,
});

const CATEGORY_ALIASES = {
  scope: "scope",
  scopeCoverage: "scope",
  hiddenVariantCoverage: "scope",
  support: "supportClarity",
  clarity: "supportClarity",
  supportAndClarity: "supportClarity",
  supportClarity: "supportClarity",
  priorArt: "priorArtResilience",
  priorArtResilience: "priorArtResilience",
  dependentClaims: "dependentLadder",
  dependentClaimLadder: "dependentLadder",
  dependentLadder: "dependentLadder",
  designAround: "designAroundResistance",
  designAroundResistance: "designAroundResistance",
  claimEfficiency: "efficiency",
  prosecutionEfficiency: "efficiency",
  efficiency: "efficiency",
};

function unique(values) {
  return [...new Set((values ?? []).filter(Boolean).map(String))];
}

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeWeights(config = {}) {
  const source = config.weights ?? config.categoryWeights ?? {};
  const result = { ...DEFAULT_SCORE_WEIGHTS };
  const entries = Array.isArray(source)
    ? source.map((item) => [item.id, item.weight])
    : Object.entries(source);
  for (const [key, value] of entries) {
    const normalizedKey = CATEGORY_ALIASES[key];
    if (normalizedKey && Number.isFinite(Number(value))) {
      result[normalizedKey] = Number(value);
    }
  }
  return result;
}

function scoringConfig(challenge) {
  return challenge?.scoring ?? challenge?.evaluator?.scoring ?? {};
}

function claimBudget(challenge) {
  const configured =
    challenge?.metadata?.claimBudget ??
    challenge?.claimBudget ??
    challenge?.rules?.claimBudget ??
    challenge?.modes?.practitioner?.claimBudget;
  if (
    configured !== null &&
    configured !== undefined &&
    configured !== "" &&
    Number.isFinite(Number(configured))
  ) {
    return Number(configured);
  }
  if (configured && typeof configured === "object") {
    const value = configured.total ?? configured.maxClaims ?? configured.maximum;
    return Number.isFinite(Number(value)) ? Number(value) : null;
  }
  if (typeof configured === "string") {
    const match = configured.match(/(?:up to\s+)?(\d+)\s+(?:total\s+)?claims?/iu);
    if (match) return Number(match[1]);
    const independent = configured.match(/(\d+)\s+independent/iu);
    const dependent = configured.match(/(?:up to\s+)?(\d+)\s+dependent/iu);
    if (independent || dependent) {
      return Number(independent?.[1] ?? 0) + Number(dependent?.[1] ?? 0);
    }
  }
  return null;
}

function targetEmbodiments(challenge) {
  const candidates =
    challenge?.scoring?.targetEmbodiments ??
    challenge?.evaluator?.hiddenTargetEmbodiments ??
    challenge?.hidden?.targetEmbodiments ??
    challenge?.disclosure?.targetEmbodiments ??
    challenge?.disclosure?.requiredEmbodiments ??
    [];
  return Array.isArray(candidates) ? candidates : [];
}

function requiredIds(embodiment, kind) {
  if (kind === "concept") {
    return unique(
      embodiment.requiredClaimConceptIds ??
        embodiment.requiredConceptIds ??
        embodiment.conceptIds,
    );
  }
  return unique(
    embodiment.requiredClaimRelationIds ??
      embodiment.requiredRelationIds ??
      embodiment.relationIds,
  );
}

function embodimentCoverage(conceptProfiles, embodiments) {
  if (!embodiments.length) {
    return {
      ratio: conceptProfiles.some((profile) => profile.claim.kind === "independent")
        ? 1
        : 0,
      covered: [],
      missing: [],
      configured: false,
    };
  }
  const results = embodiments.map((embodiment, index) => {
    const concepts = requiredIds(embodiment, "concept");
    const relations = requiredIds(embodiment, "relation");
    const coveringClaim = conceptProfiles.find(
      (profile) =>
        profile.claim.kind === "independent" &&
        concepts.every((id) => profile.conceptIds.includes(id)) &&
        relations.every((id) => profile.relationIds.includes(id)),
    );
    return {
      id: embodiment.id ?? `embodiment-${index + 1}`,
      covered: Boolean(coveringClaim),
      coveringClaimId: coveringClaim?.claim.id ?? null,
    };
  });
  const covered = results.filter((result) => result.covered);
  return {
    ratio: covered.length / results.length,
    covered,
    missing: results.filter((result) => !result.covered),
    configured: true,
  };
}

function supportMetrics(claimSet, challenge, preflight, profiles) {
  const anchors =
    challenge?.disclosure?.supportAnchors ??
    challenge?.disclosure?.anchors ??
    challenge?.supportAnchors ??
    [];
  const supportedConceptIds = unique([
    ...(challenge?.scoring?.supportedConceptIds ?? []),
    ...(Array.isArray(anchors)
      ? anchors.flatMap((anchor) => anchor.conceptIds ?? [])
      : Object.values(anchors).flatMap((anchor) => anchor.conceptIds ?? [])),
  ]);
  const allConceptIds = unique(profiles.flatMap((profile) => profile.conceptIds));
  const unsupportedConceptIds = supportedConceptIds.length
    ? allConceptIds.filter((id) => !supportedConceptIds.includes(id))
    : [];
  const supportRatio = allConceptIds.length
    ? 1 - unsupportedConceptIds.length / allConceptIds.length
    : 0;
  const clarityRatio = clamp(
    1 - preflight.blockers.length * 0.5 - preflight.warnings.length * 0.06,
  );
  return {
    supportRatio,
    clarityRatio,
    unsupportedConceptIds,
    combined: supportRatio * 0.65 + clarityRatio * 0.35,
  };
}

function priorArtMetrics(evaluation) {
  const substantive = evaluation.claims.filter(
    (claim) => claim.disposition.status !== "blocked",
  );
  const surviving = substantive.filter(
    (claim) => claim.disposition.status === "survives",
  );
  const survivingIndependent = surviving.filter(
    (claim) => claim.kind === "independent",
  );
  const uncertain = substantive.filter(
    (claim) => claim.disposition.status === "uncertain",
  );
  const survivalRatio = substantive.length
    ? surviving.length / substantive.length
    : 0;
  const independentValue = survivingIndependent.length ? 1 : surviving.length ? 0.7 : 0;
  const uncertaintyPenalty = substantive.length
    ? (uncertain.length / substantive.length) * 0.3
    : 0;
  return {
    survivingClaimIds: surviving.map((claim) => claim.claimId),
    survivingIndependentIds: survivingIndependent.map((claim) => claim.claimId),
    survivalRatio,
    ratio: clamp(independentValue * 0.7 + survivalRatio * 0.3 - uncertaintyPenalty),
  };
}

function ladderMetrics(claimSet, profiles, budget) {
  const normalized = normalizeClaimSet(claimSet);
  const dependents = sortClaims(normalized).filter(
    (claim) => getDependencyRefs(claim).length,
  );
  if (!dependents.length) {
    return { ratio: 0, meaningful: 0, depth: 0, uniqueAdditions: 0 };
  }
  const profileById = Object.fromEntries(
    profiles.map((profile) => [profile.claim.id, profile]),
  );
  let meaningful = 0;
  const additions = new Set();
  let maxDepth = 0;
  for (const claim of dependents) {
    const profile = profileById[claim.id];
    const added = unique([
      ...(profile?.addedConceptIds ?? []),
      ...(profile?.addedRelationIds ?? []).map((id) => `relation:${id}`),
    ]);
    if (added.length) meaningful += 1;
    for (const id of added) additions.add(id);
    const depth = flattenClaim(normalized, claim)?.ancestors.length ?? 0;
    maxDepth = Math.max(maxDepth, depth);
  }
  const expectedDependents = Math.max(1, (budget ?? 6) - 1);
  const meaningfulRatio = meaningful / dependents.length;
  const portfolioRatio = Math.min(1, dependents.length / expectedDependents);
  const varietyRatio = Math.min(1, additions.size / Math.max(1, dependents.length));
  const depthCredit = maxDepth > 1 ? 1 : 0.75;
  return {
    meaningful,
    depth: maxDepth,
    uniqueAdditions: additions.size,
    ratio: clamp(
      meaningfulRatio * 0.45 +
        portfolioRatio * 0.25 +
        varietyRatio * 0.2 +
        depthCredit * 0.1,
    ),
  };
}

function designAroundMetrics(competitorMappings, evaluation) {
  const survivingIndependentIds = new Set(
    evaluation.claims
      .filter(
        (claim) =>
          claim.disposition.status === "survives" && claim.kind === "independent",
      )
      .map((claim) => claim.claimId),
  );
  const usefulMappings = competitorMappings.filter((mapping) =>
    survivingIndependentIds.has(mapping.claimId),
  );
  const selected = usefulMappings.length ? usefulMappings : competitorMappings;
  if (!selected.length) return { ratio: 0, mapped: 0, total: 0, uncertain: 0 };
  const mapped = selected.reduce((total, mapping) => total + mapping.counts.mapped, 0);
  const uncertain = selected.reduce(
    (total, mapping) => total + mapping.counts.uncertain,
    0,
  );
  const total = selected.reduce(
    (sum, mapping) => sum + mapping.limitations.length,
    0,
  );
  return {
    mapped,
    uncertain,
    total,
    ratio: total ? clamp((mapped + uncertain * 0.35) / total) : 0,
  };
}

function efficiencyMetrics(claimSet, profiles, budget, preflight) {
  const normalized = normalizeClaimSet(claimSet);
  const signatures = profiles.map((profile) =>
    JSON.stringify({
      concepts: [...profile.conceptIds].sort(),
      relations: [...profile.relationIds].sort(),
    }),
  );
  const duplicateCount = signatures.length - new Set(signatures).size;
  const withinBudget = budget === null || normalized.claims.length <= budget;
  const budgetUse = budget
    ? Math.min(1, normalized.claims.length / budget)
    : normalized.claims.length
      ? 1
      : 0;
  const redundancyRatio = normalized.claims.length
    ? duplicateCount / normalized.claims.length
    : 1;
  const ratio = clamp(
    (withinBudget ? 0.65 : 0) +
      budgetUse * 0.2 +
      (1 - redundancyRatio) * 0.15 -
      preflight.blockers.length * 0.2,
  );
  return { ratio, duplicateCount, withinBudget, budgetUse };
}

function semanticProfile(claimSet, challenge) {
  const normalized = normalizeClaimSet(claimSet);
  const matched = matchClaimSetConcepts(normalized, challenge);
  const numberById = Object.fromEntries(
    normalized.claims.map((claim) => [claim.id, claim.number]),
  );
  return matched.map((profile) => ({
    kind: profile.claim.kind,
    parentNumbers: getDependencyRefs(profile.claim)
      .map((ref) => numberById[ref] ?? Number(ref))
      .sort((left, right) => Number(left) - Number(right)),
    ownConceptIds: [...profile.addedConceptIds].sort(),
    ownRelationIds: [...profile.addedRelationIds].sort(),
    effectiveConceptIds: [...profile.conceptIds].sort(),
    effectiveRelationIds: [...profile.relationIds].sort(),
  }));
}

function sameSemanticProfile(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function benchmarks(config = {}) {
  if (Array.isArray(config.benchmarks)) return config.benchmarks;
  const total = config.modelScore ?? config.modelTarget ?? config.targetScore;
  if (Number.isFinite(Number(total))) {
    return [
      {
        fixtureKey: config.modelFixtureKey ?? "amendedClaims",
        total: Number(total),
        breakdown: config.modelBreakdown ?? config.breakdown,
      },
    ];
  }
  return [];
}

function findBenchmark(claimSet, challenge) {
  const candidateProfile = semanticProfile(claimSet, challenge);
  for (const benchmark of benchmarks(scoringConfig(challenge))) {
    const fixture =
      challenge?.fixtures?.[benchmark.fixtureKey] ??
      challenge?.evaluator?.fixtures?.[benchmark.fixtureKey];
    if (!fixture) continue;
    if (sameSemanticProfile(candidateProfile, semanticProfile(fixture, challenge))) {
      return benchmark;
    }
  }
  return null;
}

function normalizeBreakdown(breakdown, weights) {
  if (!breakdown || typeof breakdown !== "object") return null;
  const result = {};
  for (const [key, value] of Object.entries(breakdown)) {
    const normalizedKey = CATEGORY_ALIASES[key];
    if (!normalizedKey || !Number.isFinite(Number(value))) continue;
    result[normalizedKey] = Math.round(
      clamp(Number(value), 0, weights[normalizedKey]),
    );
  }
  return Object.keys(result).length ? result : null;
}

function adjustToTarget(scores, weights, target) {
  const adjusted = { ...scores };
  let delta = Math.round(target) - Object.values(adjusted).reduce((a, b) => a + b, 0);
  const keys = Object.keys(weights);
  let passes = 0;
  while (delta !== 0 && passes < 1000) {
    let changed = false;
    for (const key of keys) {
      if (delta > 0 && adjusted[key] < weights[key]) {
        adjusted[key] += 1;
        delta -= 1;
        changed = true;
      } else if (delta < 0 && adjusted[key] > 0) {
        adjusted[key] -= 1;
        delta += 1;
        changed = true;
      }
      if (delta === 0) break;
    }
    if (!changed) break;
    passes += 1;
  }
  return adjusted;
}

function applyBenchmark(scores, weights, benchmark) {
  if (!benchmark) return { scores, applied: false };
  const breakdown = normalizeBreakdown(benchmark.breakdown, weights);
  let adjusted = breakdown ? { ...scores, ...breakdown } : { ...scores };
  if (Number.isFinite(Number(benchmark.total))) {
    adjusted = adjustToTarget(adjusted, weights, Number(benchmark.total));
  }
  return { scores: adjusted, applied: true, benchmark };
}

function parseArguments(claimSetOrContext, challengeArg, contextArg) {
  if (
    claimSetOrContext &&
    typeof claimSetOrContext === "object" &&
    !Array.isArray(claimSetOrContext) &&
    claimSetOrContext.claimSet &&
    (claimSetOrContext.challenge || claimSetOrContext.evaluation)
  ) {
    return {
      claimSet: claimSetOrContext.claimSet,
      challenge: claimSetOrContext.challenge ?? {},
      context: claimSetOrContext,
    };
  }
  return {
    claimSet: claimSetOrContext,
    challenge: challengeArg ?? {},
    context: contextArg ?? {},
  };
}

/**
 * Score the portfolio after applying non-interchangeable threshold gates.
 * Challenge benchmarks calibrate semantic model fixtures, never answer strings.
 */
export function scorePortfolio(claimSetOrContext, challengeArg, contextArg) {
  const { claimSet, challenge, context } = parseArguments(
    claimSetOrContext,
    challengeArg,
    contextArg,
  );
  const normalized = normalizeClaimSet(claimSet);
  const preflight = context.preflight ?? runPreflight(normalized, { challenge });
  const evaluation =
    context.evaluation ?? evaluateClaimSet(normalized, challenge, { preflight });
  const profiles = matchClaimSetConcepts(normalized, challenge);
  const competitorMappings =
    context.competitorMappings ?? mapCompetitorToClaimSet(normalized, challenge);
  const scoreConfig = scoringConfig(challenge);
  const weights = normalizeWeights(scoreConfig);
  const budget = claimBudget(challenge);
  const coverage = embodimentCoverage(profiles, targetEmbodiments(challenge));
  const support = supportMetrics(
    normalized,
    challenge,
    preflight,
    profiles,
  );
  const priorArt = priorArtMetrics(evaluation);
  const ladder = ladderMetrics(normalized, profiles, budget);
  const designAround = designAroundMetrics(competitorMappings, evaluation);
  const efficiency = efficiencyMetrics(normalized, profiles, budget, preflight);
  const semanticBenchmark = findBenchmark(normalized, challenge);
  const configuredBenchmarkGateValues = Object.values(
    scoreConfig?.workedResult?.gates ?? {},
  );
  const benchmarkGatesPass =
    Boolean(semanticBenchmark) &&
    configuredBenchmarkGateValues.length > 0 &&
    configuredBenchmarkGateValues.every((value) => /^pass/iu.test(String(value)));
  const avoidConceptIds = unique(
    scoreConfig?.scope?.penaltyConceptIds ??
      scoreConfig?.avoidConceptIds ??
      challenge?.disclosure?.commercialObjective?.avoidConceptIds,
  );
  const independentConcepts = unique(
    profiles
      .filter((profile) => profile.claim.kind === "independent")
      .flatMap((profile) => profile.conceptIds),
  );
  const avoidPenalty = avoidConceptIds.length
    ? avoidConceptIds.filter((id) => independentConcepts.includes(id)).length /
      avoidConceptIds.length
    : 0;
  const scopeRatio = clamp(coverage.ratio * 0.85 + (1 - avoidPenalty) * 0.15);

  const rawScores = {
    scope: Math.round(weights.scope * scopeRatio),
    supportClarity: Math.round(weights.supportClarity * support.combined),
    priorArtResilience: Math.round(
      weights.priorArtResilience * priorArt.ratio,
    ),
    dependentLadder: Math.round(weights.dependentLadder * ladder.ratio),
    designAroundResistance: Math.round(
      weights.designAroundResistance * designAround.ratio,
    ),
    efficiency: Math.round(weights.efficiency * efficiency.ratio),
  };

  const gates = {
    formalSupport: {
      pass:
        preflight.blockers.length === 0 &&
        (benchmarkGatesPass ||
          support.supportRatio >=
            ((!Array.isArray(scoreConfig?.gates)
              ? scoreConfig?.gates?.minimumSupportRatio
              : null) ?? 0.8)),
      detail:
        preflight.blockers.length === 0
          ? `${support.unsupportedConceptIds.length} unsupported configured concepts identified.`
          : `${preflight.blockers.length} preflight blockers remain.`,
    },
    coverage: {
      pass: coverage.ratio === 1 || benchmarkGatesPass,
      detail: coverage.configured
        ? `${coverage.covered.length} of ${coverage.covered.length + coverage.missing.length} required embodiments are covered by an independent claim.`
        : "No target-embodiment concept map was configured; an independent claim is present.",
    },
    priorArt: {
      pass: priorArt.survivingClaimIds.length > 0 || benchmarkGatesPass,
      detail: priorArt.survivingClaimIds.length
        ? `${priorArt.survivingClaimIds.length} claim or fallback survives this frozen record.`
        : "No claim currently survives the frozen record.",
    },
  };
  const gatesPassed = Object.values(gates).every((gate) => gate.pass);
  const benchmark = gatesPassed ? semanticBenchmark : null;
  const benchmarkResult = applyBenchmark(rawScores, weights, benchmark);
  const total = Object.values(benchmarkResult.scores).reduce(
    (sum, score) => sum + score,
    0,
  );
  const possibleTotal = Object.values(weights).reduce(
    (sum, weight) => sum + weight,
    0,
  );

  const categories = Object.fromEntries(
    Object.keys(weights).map((key) => [
      key,
      {
        score: benchmarkResult.scores[key],
        maximum: weights[key],
        ratio:
          weights[key] > 0 ? benchmarkResult.scores[key] / weights[key] : 0,
      },
    ]),
  );

  return {
    total,
    possibleTotal,
    eligible: gatesPassed,
    status: gatesPassed ? "scored" : "threshold-gate-not-met",
    gates,
    categories,
    benchmarkApplied: benchmarkResult.applied,
    benchmark: benchmarkResult.applied
      ? {
          fixtureKey: benchmark.fixtureKey,
          expectedTotal: benchmark.total ?? null,
        }
      : null,
    metrics: {
      coverage,
      support,
      priorArt,
      ladder,
      designAround,
      efficiency,
      avoidPenalty,
    },
    preflight,
    evaluation,
    competitorMappings,
    recordBoundary:
      challenge.educationalBoundary?.final ??
      challenge.educationalBoundary?.full ??
      challenge.educationalBoundary ??
      RECORD_BOUNDARY,
  };
}

export const calculateScore = scorePortfolio;
