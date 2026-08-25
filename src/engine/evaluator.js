import {
  flattenClaim,
  getDependencyRefs,
  normalizeClaimSet,
  sortClaims,
} from "../domain/claims.js";
import { runPreflight } from "./preflight.js";

export const RECORD_BOUNDARY =
  "This result is limited to the supplied challenge record and is not a patentability, validity, infringement, or freedom-to-operate opinion.";

export function normalizeForMatching(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[_/–—-]+/g, " ")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values) {
  return [...new Set((values ?? []).filter(Boolean).map(String))];
}

function asEntries(collection) {
  if (Array.isArray(collection)) {
    return collection.map((entry, index) => ({
      id: String(entry?.id ?? `entry-${index + 1}`),
      ...(typeof entry === "string" ? { label: entry } : entry),
    }));
  }
  if (collection && typeof collection === "object") {
    return Object.entries(collection).map(([id, entry]) => ({
      id,
      ...(typeof entry === "string" ? { label: entry } : entry),
    }));
  }
  return [];
}

function phraseValues(entry, lexicon, kind) {
  const direct = [
    entry.label,
    entry.term,
    ...(entry.phrases ?? []),
    ...(entry.terms ?? []),
    ...(entry.synonyms ?? []),
    ...(entry.match?.phrases ?? []),
    ...(entry.match?.any ?? []),
  ];
  const synonymConfig = lexicon?.synonyms;
  if (Array.isArray(synonymConfig?.[entry.id])) {
    direct.push(...synonymConfig[entry.id]);
  } else if (synonymConfig && typeof synonymConfig === "object") {
    for (const [phrase, target] of Object.entries(synonymConfig)) {
      if (target === entry.id || target?.conceptId === entry.id) direct.push(phrase);
      if (Array.isArray(target) && target.includes(entry.id)) direct.push(phrase);
    }
  }
  if (kind === "relation") direct.push(...(entry.patterns ?? []));
  return unique(direct.map(normalizeForMatching).filter((value) => value.length >= 2));
}

export function normalizeLexicon(challenge = {}) {
  const lexicon = challenge.lexicon ?? {};
  const concepts = asEntries(lexicon.concepts).map((entry) => ({
    ...entry,
    phrases: phraseValues(entry, lexicon, "concept"),
  }));
  const relations = asEntries(lexicon.relations).map((entry) => ({
    ...entry,
    phrases: unique([
      ...phraseValues(entry, lexicon, "relation"),
      normalizeForMatching(entry.predicate),
    ]),
    requiredConceptIds: unique(
      entry.requiredConceptIds ??
        entry.conceptIds ??
        entry.between ??
        entry.connects ??
        [entry.subjectId, entry.objectId],
    ),
  }));
  return { concepts, relations };
}

function phraseOccurs(normalizedText, phrase) {
  if (!phrase) return false;
  return ` ${normalizedText} `.includes(` ${phrase} `);
}

function matchEntry(text, entry) {
  const normalizedText = normalizeForMatching(text);
  if (!normalizedText) return null;
  const matchedPhrase = entry.phrases.find((phrase) =>
    phraseOccurs(normalizedText, phrase),
  );
  if (matchedPhrase) return { matchedPhrase, method: "phrase" };

  const allTokens = unique(entry.match?.all?.map(normalizeForMatching));
  if (
    allTokens.length &&
    allTokens.every((token) => phraseOccurs(normalizedText, token))
  ) {
    return { matchedPhrase: allTokens.join(" + "), method: "token-combination" };
  }
  return null;
}

function lightStem(token) {
  return String(token)
    .replace(/ing$/u, "")
    .replace(/ied$/u, "y")
    .replace(/ed$/u, "")
    .replace(/es$/u, "")
    .replace(/s$/u, "");
}

function predicateOverlapsText(text, predicate) {
  const ignored = new Set([
    "and",
    "another",
    "by",
    "current",
    "each",
    "for",
    "from",
    "one",
    "the",
    "to",
    "whether",
  ]);
  const textStems = normalizeForMatching(text)
    .split(" ")
    .filter(Boolean)
    .map(lightStem);
  const predicateStems = normalizeForMatching(predicate)
    .split(" ")
    .filter((token) => token && !ignored.has(token))
    .map(lightStem);
  return predicateStems.some((predicateStem) =>
    textStems.some(
      (textStem) =>
        textStem === predicateStem ||
        (Math.min(textStem.length, predicateStem.length) >= 5 &&
          (textStem.startsWith(predicateStem) || predicateStem.startsWith(textStem))),
    ),
  );
}

/** Match one limitation transparently and retain the phrase that caused it. */
export function matchLimitationConcepts(limitation, challenge = {}) {
  const lexicon = normalizeLexicon(challenge);
  const declaredConceptIds = unique(limitation?.conceptIds);
  const declaredRelationIds = unique(limitation?.relationIds);
  const conceptMatches = declaredConceptIds.map((conceptId) => ({
    conceptId,
    method: "declared",
    matchedPhrase: null,
  }));

  for (const concept of lexicon.concepts) {
    if (declaredConceptIds.includes(concept.id)) continue;
    const match = matchEntry(limitation?.text, concept);
    if (match) conceptMatches.push({ conceptId: concept.id, ...match });
  }

  const conceptIds = unique(conceptMatches.map((match) => match.conceptId));
  const relationMatches = declaredRelationIds.map((relationId) => ({
    relationId,
    method: "declared",
    matchedPhrase: null,
  }));

  for (const relation of lexicon.relations) {
    if (declaredRelationIds.includes(relation.id)) continue;
    const phraseMatch = matchEntry(limitation?.text, relation);
    const configuredRelationMatch =
      Boolean(relation.subjectId && relation.objectId) &&
      relation.requiredConceptIds.every((id) => conceptIds.includes(id)) &&
      predicateOverlapsText(limitation?.text, relation.predicate);
    const cooccurrenceMatch =
      relation.inferFromCooccurrence === true &&
      relation.requiredConceptIds.length > 1 &&
      relation.requiredConceptIds.every((id) => conceptIds.includes(id));
    if (phraseMatch || configuredRelationMatch || cooccurrenceMatch) {
      relationMatches.push({
        relationId: relation.id,
        ...(phraseMatch ?? {
          matchedPhrase: configuredRelationMatch
            ? normalizeForMatching(relation.predicate)
            : relation.requiredConceptIds.join(" + "),
          method: configuredRelationMatch
            ? "configured-relation"
            : "concept-cooccurrence",
        }),
      });
    }
  }

  return {
    limitationId: limitation?.id ?? null,
    text: String(limitation?.text ?? ""),
    conceptIds,
    relationIds: unique(relationMatches.map((match) => match.relationId)),
    conceptMatches,
    relationMatches,
  };
}

/** Match a claim after carrying every parent limitation into the analysis. */
export function matchClaimConcepts(claimSet, claimOrRef, challenge = {}) {
  const flattened = flattenClaim(claimSet, claimOrRef);
  if (!flattened) return null;
  const limitationMatches = flattened.limitations.map((limitation) => ({
    ...matchLimitationConcepts(limitation, challenge),
    originClaimId: limitation.originClaimId,
    originClaimNumber: limitation.originClaimNumber,
    inherited: limitation.inherited,
  }));
  const ownClaimMatch = matchLimitationConcepts(
    {
      id: `${flattened.claim.id}-claim-level`,
      text: flattened.limitations.length ? "" : flattened.claim.text,
      conceptIds: flattened.claim.conceptIds,
      relationIds: flattened.claim.relationIds,
    },
    challenge,
  );
  if (
    ownClaimMatch.conceptIds.length ||
    ownClaimMatch.relationIds.length ||
    (!flattened.limitations.length && flattened.claim.text.trim())
  ) {
    limitationMatches.push({
      ...ownClaimMatch,
      originClaimId: flattened.claim.id,
      originClaimNumber: flattened.claim.number,
      inherited: false,
    });
  }

  const inheritedMatches = limitationMatches.filter((item) => item.inherited);
  const addedMatches = limitationMatches.filter((item) => !item.inherited);
  return {
    claim: flattened.claim,
    dependencyChain: flattened.chain.map((claim) => ({
      id: claim.id,
      number: claim.number,
    })),
    limitations: limitationMatches,
    conceptIds: unique(limitationMatches.flatMap((item) => item.conceptIds)),
    relationIds: unique(limitationMatches.flatMap((item) => item.relationIds)),
    inheritedConceptIds: unique(
      inheritedMatches.flatMap((item) => item.conceptIds),
    ),
    inheritedRelationIds: unique(
      inheritedMatches.flatMap((item) => item.relationIds),
    ),
    addedConceptIds: unique(addedMatches.flatMap((item) => item.conceptIds)),
    addedRelationIds: unique(addedMatches.flatMap((item) => item.relationIds)),
  };
}

export function matchClaimSetConcepts(claimSet, challenge = {}) {
  const normalized = normalizeClaimSet(claimSet);
  return sortClaims(normalized).map((claim) =>
    matchClaimConcepts(normalized, claim, challenge),
  );
}

function evaluatorConfig(challenge) {
  return challenge?.evaluation ?? challenge?.evaluator ?? {};
}

function evidenceFacts(challenge) {
  const evaluator = evaluatorConfig(challenge);
  return Array.isArray(evaluator.evidenceFacts)
    ? evaluator.evidenceFacts
    : Array.isArray(challenge?.evidenceFacts)
      ? challenge.evidenceFacts
      : [];
}

function recipes(challenge) {
  const evaluator = evaluatorConfig(challenge);
  return Array.isArray(evaluator.rejectionRecipes)
    ? evaluator.rejectionRecipes
    : Array.isArray(challenge?.rejectionRecipes)
      ? challenge.rejectionRecipes
      : [];
}

function factsForRecipe(recipe, facts) {
  const factIds = unique(recipe.evidenceFactIds);
  const referenceIds = unique(recipe.referenceIds);
  if (factIds.length) return facts.filter((fact) => factIds.includes(fact.id));
  if (referenceIds.length) {
    return facts.filter((fact) => referenceIds.includes(fact.referenceId));
  }
  return [];
}

function coverageFromFacts(facts) {
  return {
    conceptIds: unique(facts.flatMap((fact) => fact.conceptIds)),
    relationIds: unique(facts.flatMap((fact) => fact.relationIds)),
  };
}

function referenceCoverage(facts) {
  const byReference = new Map();
  for (const fact of facts.filter(
    (item) => !/partial|uncertain/iu.test(String(item.mappingStrength ?? "")),
  )) {
    const entry = byReference.get(fact.referenceId) ?? {
      referenceId: fact.referenceId,
      conceptIds: [],
      relationIds: [],
      evidenceFactIds: [],
    };
    entry.conceptIds = unique([...entry.conceptIds, ...(fact.conceptIds ?? [])]);
    entry.relationIds = unique([...entry.relationIds, ...(fact.relationIds ?? [])]);
    entry.evidenceFactIds.push(fact.id);
    byReference.set(fact.referenceId, entry);
  }
  return [...byReference.values()];
}

function conditionPasses(recipe, claimMatch) {
  const condition = recipe.appliesWhen ?? recipe.trigger ?? {};
  const allConceptIds = unique(
    condition.allConceptIds ?? recipe.requiredClaimConceptIds,
  );
  const anyConceptIds = unique(condition.anyConceptIds);
  const excludedConceptIds = unique(
    condition.excludedConceptIds ?? condition.noneConceptIds,
  );
  const allRelationIds = unique(
    condition.allRelationIds ?? recipe.requiredClaimRelationIds,
  );
  if (!allConceptIds.every((id) => claimMatch.conceptIds.includes(id))) return false;
  if (
    anyConceptIds.length &&
    !anyConceptIds.some((id) => claimMatch.conceptIds.includes(id))
  ) {
    return false;
  }
  if (excludedConceptIds.some((id) => claimMatch.conceptIds.includes(id))) {
    return false;
  }
  return allRelationIds.every((id) => claimMatch.relationIds.includes(id));
}

function recipeOutcome(recipe, mode) {
  return (
    recipe.outcomeByMode?.[mode] ??
    recipe.outcomeByMode?.default ??
    recipe.outcome ??
    "rejected"
  );
}

function isSurvivingOutcome(outcome) {
  return /withdraw|surviv|allow|no.complete.mapping|not.rejected|amendment.target/iu.test(
    String(outcome),
  );
}

function isCautionOutcome(outcome) {
  return /amendment.target|not.allowance|mapping.only/iu.test(String(outcome));
}

function fixtureClaimSets(challenge) {
  const fixtures = challenge.fixtures ?? evaluatorConfig(challenge).fixtures ?? {};
  return Object.values(fixtures).filter(
    (value) => Array.isArray(value) && value.some((item) => item?.id),
  );
}

/**
 * A configured recipe follows its fixture's concept and relation signature,
 * rather than a secret answer string. Broader variants remain subject to a
 * rejection recipe; narrower variants remain eligible for a withdrawal recipe.
 */
function semanticTargetMatch(recipe, claimMatch, challenge) {
  const configuredIds = unique(recipe.claimIds);
  const targetSets = fixtureClaimSets(challenge)
    .map((claims) => ({
      claims,
      targets: claims.filter((claim) => configuredIds.includes(claim.id)),
    }))
    .filter((entry) => entry.targets.length);
  const targets = targetSets.flatMap((entry) => entry.targets);
  if (!targets.length) return { applies: false, exact: false, configured: false };
  for (const { claims, targets: claimsToMatch } of targetSets) {
    const fixtureSet = normalizeClaimSet(claims);
    for (const target of claimsToMatch) {
      const targetMatch = matchClaimConcepts(fixtureSet, target, challenge);
      if (!targetMatch) continue;
      const rejectedOutcome = !isSurvivingOutcome(recipe.outcome);
      const conceptsPass = rejectedOutcome
        ? claimMatch.conceptIds.every((id) => targetMatch.conceptIds.includes(id))
        : targetMatch.conceptIds.every((id) => claimMatch.conceptIds.includes(id));
      const relationsPass = rejectedOutcome
        ? claimMatch.relationIds.every((id) => targetMatch.relationIds.includes(id))
        : targetMatch.relationIds.every((id) => claimMatch.relationIds.includes(id));
      if (conceptsPass && relationsPass) {
        return {
          applies: true,
          configured: true,
          exact:
            claimMatch.conceptIds.length === targetMatch.conceptIds.length &&
            claimMatch.relationIds.length === targetMatch.relationIds.length,
        };
      }
    }
  }
  return { applies: false, exact: false, configured: true };
}

function recipeCandidate(recipe, claimMatch, challenge, mode) {
  if (!conditionPasses(recipe, claimMatch)) return null;
  const facts = evidenceFacts(challenge);
  const recipeFacts = factsForRecipe(recipe, facts);
  const factCoverage = coverageFromFacts(recipeFacts);
  const coveredConceptIds = unique([
    ...factCoverage.conceptIds,
    ...(recipe.coveredConceptIds ?? []),
  ]);
  const coveredRelationIds = unique([
    ...factCoverage.relationIds,
    ...(recipe.coveredRelationIds ?? []),
  ]);
  const ignoredConceptIds = unique(recipe.nonlimitingConceptIds);
  const requiredConcepts = claimMatch.conceptIds.filter(
    (id) => !ignoredConceptIds.includes(id),
  );
  const unmappedConceptIds = requiredConcepts.filter(
    (id) => !coveredConceptIds.includes(id),
  );
  const unmappedRelationIds = claimMatch.relationIds.filter(
    (id) => !coveredRelationIds.includes(id),
  );
  const output = recipeOutcome(recipe, mode);
  const semanticTarget = semanticTargetMatch(recipe, claimMatch, challenge);
  const exactTarget =
    unique(recipe.claimIds).includes(claimMatch.claim.id) || semanticTarget.exact;
  const hasCoverage = coveredConceptIds.length || coveredRelationIds.length;
  if (
    !isSurvivingOutcome(output) &&
    !semanticTarget.applies &&
    (!hasCoverage || unmappedConceptIds.length || unmappedRelationIds.length)
  ) {
    return null;
  }
  if (
    isSurvivingOutcome(output) &&
    !semanticTarget.applies &&
    (semanticTarget.configured || !exactTarget)
  ) {
    return null;
  }
  return {
    recipe,
    output,
    exactTarget,
    recipeFacts,
    coveredConceptIds,
    coveredRelationIds,
    unmappedConceptIds,
    unmappedRelationIds,
    semanticTarget,
  };
}

function chooseRecipe(candidates) {
  return [...candidates].sort((left, right) => {
    if ((left.recordPriority ?? 0) !== (right.recordPriority ?? 0)) {
      return (left.recordPriority ?? 0) - (right.recordPriority ?? 0);
    }
    if (left.exactTarget !== right.exactTarget) return left.exactTarget ? -1 : 1;
    const leftStatute = String(left.recipe.statute ?? "");
    const rightStatute = String(right.recipe.statute ?? "");
    const leftAnticipation = /102|anticip/iu.test(leftStatute);
    const rightAnticipation = /102|anticip/iu.test(rightStatute);
    if (leftAnticipation !== rightAnticipation) return leftAnticipation ? -1 : 1;
    return (
      unique(left.recipe.referenceIds).length -
        unique(right.recipe.referenceIds).length ||
      String(left.recipe.id).localeCompare(String(right.recipe.id))
    );
  })[0];
}

function evidenceSummary(fact) {
  return Object.fromEntries(
    Object.entries({
      evidenceFactId: fact.id,
      referenceId: fact.referenceId,
      pinpoint: fact.pinpoint,
      pinpointIds: unique(fact.pinpointIds),
      proposition: fact.proposition,
      confidence: fact.confidence,
      mappingStrength: fact.mappingStrength,
      qualification: fact.qualification,
    }).filter(([, value]) => value !== undefined),
  );
}

function evidenceChart(claimMatch, facts) {
  return claimMatch.limitations.map((limitation) => ({
    limitationId: limitation.limitationId,
    text: limitation.text,
    originClaimId: limitation.originClaimId,
    originClaimNumber: limitation.originClaimNumber,
    inherited: limitation.inherited,
    concepts: limitation.conceptIds.map((conceptId) => ({
      conceptId,
      evidence: facts
        .filter((fact) => fact.conceptIds?.includes(conceptId))
        .map(evidenceSummary),
    })),
    relations: limitation.relationIds.map((relationId) => ({
      relationId,
      evidence: facts
        .filter((fact) => fact.relationIds?.includes(relationId))
        .map(evidenceSummary),
    })),
  }));
}

function activeRecordIds(challenge, mode) {
  const modeConfig = challenge?.modes?.[mode] ?? {};
  return modeConfig.includeExpertRecord
    ? ["expert-record", "core-record"]
    : ["core-record"];
}

function dispositionForClaim(claimMatch, challenge, mode, blockers) {
  if (blockers.length) {
    return {
      status: "blocked",
      outcome: "preflight-blocked",
      label: "Not substantively evaluated",
      rationale: "Resolve the claim-level preflight blockers before submission.",
      blockerIds: blockers.map((item) => item.id),
      referenceIds: [],
      evidenceFactIds: [],
    };
  }
  if (!claimMatch.conceptIds.length && !claimMatch.relationIds.length) {
    return {
      status: "uncertain",
      outcome: "insufficient-concept-mapping",
      label: "Insufficient structured mapping",
      rationale:
        "The deterministic judge could not identify enough configured concepts to reach a substantive result.",
      referenceIds: [],
      evidenceFactIds: [],
    };
  }

  const activeRecords = activeRecordIds(challenge, mode);
  const candidates = recipes(challenge)
    .filter(
      (recipe) =>
        !recipe.recordId || activeRecords.includes(String(recipe.recordId)),
    )
    .map((recipe) => {
      const candidate = recipeCandidate(recipe, claimMatch, challenge, mode);
      if (candidate) {
        candidate.recordPriority = Math.max(
          0,
          activeRecords.indexOf(recipe.recordId),
        );
      }
      return candidate;
    })
    .filter(Boolean);
  const chosen = chooseRecipe(candidates);
  if (chosen && !isSurvivingOutcome(chosen.output)) {
    const statute = chosen.recipe.statute ?? "103";
    return {
      status: "rejected",
      outcome: /102|anticip/iu.test(String(statute))
        ? "rejected-102"
        : "rejected-103",
      label: `Simulated rejection under Section ${statute}`,
      statute: String(statute),
      recipeId: chosen.recipe.id,
      referenceIds: unique(chosen.recipe.referenceIds),
      evidenceFactIds: chosen.recipeFacts.map((fact) => fact.id),
      rationale:
        chosen.recipe.rationale ??
        "The configured evidence combination maps the effective claim limitations within this challenge record.",
      confidence: chosen.recipe.confidence ?? "configured",
      mappedConceptIds: chosen.coveredConceptIds,
      unmappedConceptIds: [],
      unmappedRelationIds: [],
    };
  }

  const facts = evidenceFacts(challenge);
  const byReference = referenceCoverage(facts);
  const singleReference = byReference.find(
    (reference) =>
      claimMatch.conceptIds.every((id) => reference.conceptIds.includes(id)) &&
      claimMatch.relationIds.every((id) => reference.relationIds.includes(id)),
  );
  if (
    singleReference &&
    evaluatorConfig(challenge).deriveAnticipation !== false
  ) {
    return {
      status: "rejected",
      outcome: "rejected-102",
      label: "Simulated anticipation finding",
      statute: "102",
      referenceIds: [singleReference.referenceId],
      evidenceFactIds: singleReference.evidenceFactIds,
      rationale:
        "One configured reference maps every recognized concept and relation in the effective claim. Review the evidence chart before relying on the simulation.",
      confidence: "deterministic-concept-map",
      mappedConceptIds: claimMatch.conceptIds,
      unmappedConceptIds: [],
      unmappedRelationIds: [],
    };
  }

  if (chosen && isSurvivingOutcome(chosen.output)) {
    if (isCautionOutcome(chosen.output)) {
      return {
        status: "uncertain",
        outcome: "amendment-target",
        label: "Potential amendment target; not an allowance",
        recipeId: chosen.recipe.id,
        referenceIds: unique(chosen.recipe.referenceIds),
        evidenceFactIds: chosen.recipeFacts.map((fact) => fact.id),
        rationale:
          chosen.recipe.rationale ??
          "The configured record does not provide a complete mapping, but the claim remains dependent from rejected material.",
        confidence: chosen.recipe.confidence ?? "configured",
        unmappedConceptIds: chosen.unmappedConceptIds,
        unmappedRelationIds: chosen.unmappedRelationIds,
      };
    }
    return {
      status: "survives",
      outcome: "survives-record",
      label: "Survives this challenge record",
      recipeId: chosen.recipe.id,
      referenceIds: unique(chosen.recipe.referenceIds),
      evidenceFactIds: chosen.recipeFacts.map((fact) => fact.id),
      rationale:
        chosen.recipe.rationale ??
        "The configured answer key does not maintain the rejection for this concept and relation combination.",
      confidence: chosen.recipe.confidence ?? "configured",
      unmappedConceptIds: chosen.unmappedConceptIds,
      unmappedRelationIds: chosen.unmappedRelationIds,
    };
  }

  const allCoverage = coverageFromFacts(facts);
  const unmappedConceptIds = claimMatch.conceptIds.filter(
    (id) => !allCoverage.conceptIds.includes(id),
  );
  const unmappedRelationIds = claimMatch.relationIds.filter(
    (id) => !allCoverage.relationIds.includes(id),
  );
  if (unmappedConceptIds.length || unmappedRelationIds.length) {
    return {
      status: "survives",
      outcome: "survives-record",
      label: "No complete mapping located in the supplied record",
      rationale:
        "At least one recognized concept or relation is not completely mapped by the configured evidence. This bounded-record result is not a patentability conclusion.",
      referenceIds: [],
      evidenceFactIds: [],
      confidence: "bounded-record",
      unmappedConceptIds,
      unmappedRelationIds,
    };
  }

  return {
    status: "uncertain",
    outcome: "combination-rationale-needed",
    label: "Mapped across references; rationale required",
    rationale:
      "The configured facts collectively map the recognized material, but no applicable reasoned combination recipe supports a deterministic obviousness finding.",
    referenceIds: unique(facts.map((fact) => fact.referenceId)),
    evidenceFactIds: [],
    confidence: "requires-review",
    unmappedConceptIds: [],
    unmappedRelationIds: [],
  };
}

/**
 * Produce deterministic Office Action dispositions from recognized concepts,
 * relations, inherited limitations, evidence facts, and reasoned recipes.
 */
export function evaluateClaimSet(claimSet, challenge = {}, options = {}) {
  const normalized = normalizeClaimSet(claimSet);
  const mode = options.mode ?? challenge?.metadata?.difficulty ?? "practitioner";
  const preflight = options.preflight ??
    runPreflight(normalized, {
      challenge,
      claimBudget: options.claimBudget,
      mode,
    });
  const facts = evidenceFacts(challenge);
  const evaluatedClaims = sortClaims(normalized).map((claim) => {
    const match = matchClaimConcepts(normalized, claim, challenge);
    const claimBlockers = preflight.blockers.filter(
      (item) => item.claimId === claim.id || item.claimIds?.includes(claim.id),
    );
    return {
      claimId: claim.id,
      claimNumber: claim.number,
      kind: claim.kind,
      dependsOn: getDependencyRefs(claim),
      dependencyChain: match.dependencyChain,
      inheritedLimitationsCarried: match.inheritedConceptIds.length > 0,
      inheritedConceptIds: match.inheritedConceptIds,
      inheritedRelationIds: match.inheritedRelationIds,
      addedConceptIds: match.addedConceptIds,
      addedRelationIds: match.addedRelationIds,
      conceptIds: match.conceptIds,
      relationIds: match.relationIds,
      limitations: match.limitations,
      evidenceChart: evidenceChart(match, facts),
      disposition: dispositionForClaim(
        match,
        challenge,
        mode,
        claimBlockers,
      ),
    };
  });

  const byId = Object.fromEntries(
    evaluatedClaims.map((claim) => [claim.claimId, claim]),
  );
  for (const claim of evaluatedClaims) {
    const parentStatuses = claim.dependsOn
      .map((ref) => {
        const parent =
          byId[ref] ??
          evaluatedClaims.find((item) => String(item.claimNumber) === String(ref));
        return parent?.disposition.status;
      })
      .filter(Boolean);
    claim.disposition.parentStatuses = parentStatuses;
    claim.disposition.requiresIndependentRewrite =
      claim.disposition.status === "survives" &&
      parentStatuses.some((status) => status === "rejected");
  }

  const counts = evaluatedClaims.reduce(
    (result, claim) => {
      result[claim.disposition.status] =
        (result[claim.disposition.status] ?? 0) + 1;
      return result;
    },
    { rejected: 0, survives: 0, blocked: 0, uncertain: 0 },
  );

  return {
    challengeId:
      challenge?.challengeId ?? challenge?.metadata?.id ?? challenge?.id ?? null,
    mode,
    claimSet: normalized,
    preflight,
    claims: evaluatedClaims,
    byClaimId: byId,
    officeAction: {
      counts,
      rejections: evaluatedClaims.filter(
        (claim) => claim.disposition.status === "rejected",
      ),
      survivingClaims: evaluatedClaims.filter(
        (claim) => claim.disposition.status === "survives",
      ),
      uncertainClaims: evaluatedClaims.filter(
        (claim) => claim.disposition.status === "uncertain",
      ),
    },
    recordBoundary:
      challenge.educationalBoundary?.officeAction ??
      challenge.educationalBoundary?.full ??
      challenge.educationalBoundary ??
      RECORD_BOUNDARY,
  };
}

export const generateOfficeAction = evaluateClaimSet;

function competitorFeatures(competitor, challenge) {
  const limitations = [
    ...(Array.isArray(competitor?.limitations) ? competitor.limitations : []),
    ...(Array.isArray(competitor?.productFacts)
      ? competitor.productFacts.map((text, index) => ({
          id: `competitor-fact-${index + 1}`,
          text,
        }))
      : []),
  ];
  const aggregate = limitations.map((limitation) =>
    matchLimitationConcepts(limitation, challenge),
  );
  const descriptionMatch = matchLimitationConcepts(
    {
      id: "competitor-description",
      text:
        competitor?.description ??
        competitor?.summary ??
        competitor?.productDescription ??
        "",
      conceptIds: competitor?.conceptIds,
      relationIds: competitor?.relationIds,
    },
    challenge,
  );
  return {
    conceptIds: unique([
      ...descriptionMatch.conceptIds,
      ...aggregate.flatMap((item) => item.conceptIds),
    ]),
    relationIds: unique([
      ...descriptionMatch.relationIds,
      ...aggregate.flatMap((item) => item.relationIds),
    ]),
    uncertainConceptIds: unique(competitor?.uncertainConceptIds),
    uncertainRelationIds: unique(competitor?.uncertainRelationIds),
  };
}

function explicitCompetitorMapping(competitor, limitationId) {
  const mappings =
    competitor?.limitationMappings ??
    competitor?.mappingByLimitationId ??
    competitor?.mapping ??
    [];
  if (Array.isArray(mappings)) {
    return mappings.find(
      (entry) =>
        entry.limitationId === limitationId || entry.claimLimitationId === limitationId,
    );
  }
  return mappings?.[limitationId] ?? null;
}

function explicitMappingStillMatches(
  competitor,
  limitation,
  challenge,
) {
  if (!competitor?.targetClaimId) return true;
  for (const claims of fixtureClaimSets(challenge)) {
    const targetClaim = claims.find((claim) => claim.id === competitor.targetClaimId);
    if (!targetClaim) continue;
    const targetLimitation = targetClaim.limitations?.find(
      (item) => item.id === limitation.limitationId,
    );
    if (!targetLimitation) return false;
    const targetMatch = matchLimitationConcepts(targetLimitation, challenge);
    return (
      JSON.stringify([...targetMatch.conceptIds].sort()) ===
        JSON.stringify([...limitation.conceptIds].sort()) &&
      JSON.stringify([...targetMatch.relationIds].sort()) ===
        JSON.stringify([...limitation.relationIds].sort())
    );
  }
  return true;
}

/**
 * Map a structured competitor to each effective limitation. "Omitted" means
 * only that the supplied product model lacks a configured literal mapping.
 */
export function mapCompetitorToClaim(
  claimSet,
  claimOrRef,
  challenge = {},
  competitorOverride,
) {
  const normalized = normalizeClaimSet(claimSet);
  const claimMatch = matchClaimConcepts(normalized, claimOrRef, challenge);
  if (!claimMatch) return null;
  const competitor =
    competitorOverride ?? challenge.competitor ?? evaluatorConfig(challenge).competitor ?? {};
  const features = competitorFeatures(competitor, challenge);
  const limitationMappings = claimMatch.limitations.map((limitation) => {
    const explicit = explicitCompetitorMapping(competitor, limitation.limitationId);
    const configuredStatus =
      explicit?.status === "mapped"
        ? "mapped"
        : ["not-mapped", "omitted"].includes(explicit?.status)
          ? "omitted"
          : ["partial", "disputed", "uncertain"].includes(explicit?.status)
            ? "uncertain"
            : null;
    if (
      configuredStatus &&
      explicitMappingStillMatches(competitor, limitation, challenge)
    ) {
      return {
        limitationId: limitation.limitationId,
        text: limitation.text,
        inherited: limitation.inherited,
        status: configuredStatus,
        rationale:
          explicit.rationale ??
          explicit.explanation ??
          "Configured challenge mapping.",
        missingConceptIds: unique(explicit.missingConceptIds),
        missingRelationIds: unique(explicit.missingRelationIds),
      };
    }

    const missingConceptIds = limitation.conceptIds.filter(
      (id) => !features.conceptIds.includes(id),
    );
    const missingRelationIds = limitation.relationIds.filter(
      (id) => !features.relationIds.includes(id),
    );
    const uncertain =
      missingConceptIds.some((id) => features.uncertainConceptIds.includes(id)) ||
      missingRelationIds.some((id) => features.uncertainRelationIds.includes(id));
    const hasStructuredMaterial =
      limitation.conceptIds.length || limitation.relationIds.length;
    const status =
      !missingConceptIds.length && !missingRelationIds.length && hasStructuredMaterial
        ? "mapped"
        : uncertain || !hasStructuredMaterial
          ? "uncertain"
          : "omitted";
    return {
      limitationId: limitation.limitationId,
      text: limitation.text,
      inherited: limitation.inherited,
      status,
      missingConceptIds,
      missingRelationIds,
      rationale:
        status === "mapped"
          ? "The supplied product model contains every configured concept and relation for this limitation."
          : status === "omitted"
            ? "The supplied product model lacks at least one configured concept or relation for this limitation."
            : "The structured record is insufficient to classify this limitation as mapped or omitted.",
    };
  });
  const counts = limitationMappings.reduce(
    (result, mapping) => {
      result[mapping.status] += 1;
      return result;
    },
    { mapped: 0, omitted: 0, uncertain: 0 },
  );
  const completeLiteralMapping =
    limitationMappings.length > 0 &&
    limitationMappings.every((mapping) => mapping.status === "mapped");
  return {
    claimId: claimMatch.claim.id,
    claimNumber: claimMatch.claim.number,
    competitorId: competitor.id ?? null,
    limitations: limitationMappings,
    counts,
    completeLiteralMapping,
    conclusion: completeLiteralMapping
      ? "A complete literal mapping appears in the supplied product model; this is not an infringement opinion."
      : "No complete literal mapping was located in the supplied product model; this is not a noninfringement opinion.",
    recordBoundary: RECORD_BOUNDARY,
  };
}

export function mapCompetitorToClaimSet(
  claimSet,
  challenge = {},
  competitorOverride,
) {
  const normalized = normalizeClaimSet(claimSet);
  return sortClaims(normalized).map((claim) =>
    mapCompetitorToClaim(normalized, claim, challenge, competitorOverride),
  );
}
