export function validateChallengeBundle(bundle) {
  const errors = [];
  const add = (path, message) => errors.push(`${path}: ${message}`);
  const requiredObject = (value, path) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      add(path, "must be an object");
      return false;
    }
    return true;
  };
  const requiredArray = (value, path, minimum = 1) => {
    if (!Array.isArray(value) || value.length < minimum) {
      add(path, `must be an array with at least ${minimum} item(s)`);
      return false;
    }
    return true;
  };
  const requireString = (value, path) => {
    if (typeof value !== "string" || value.trim() === "") {
      add(path, "must be a non-empty string");
      return false;
    }
    return true;
  };
  const ensureUnique = (values, path) => {
    const duplicate = values.find((value, index) => values.indexOf(value) !== index);
    if (duplicate !== undefined) add(path, `contains duplicate value ${duplicate}`);
  };

  if (!requiredObject(bundle, "bundle")) return { valid: false, errors };
  if (!/^\d+\.\d+\.\d+$/.test(bundle.schemaVersion ?? "")) {
    add("schemaVersion", "must be semantic version text");
  }
  if (!/^\d+\.\d+\.\d+$/.test(bundle.contentVersion ?? "")) {
    add("contentVersion", "must be semantic version text");
  }
  requireString(bundle.challengeId, "challengeId");

  if (requiredObject(bundle.metadata, "metadata")) {
    for (const field of [
      "title",
      "jurisdiction",
      "bundleDate",
      "stipulatedEffectiveFilingDate",
      "priorArtStipulation",
    ]) {
      requireString(bundle.metadata[field], `metadata.${field}`);
    }
    for (const field of ["bundleDate", "stipulatedEffectiveFilingDate"]) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(bundle.metadata[field] ?? "")) {
        add(`metadata.${field}`, "must use YYYY-MM-DD");
      }
    }
  }

  if (requiredObject(bundle.modes, "modes")) {
    for (const modeId of ["guided", "practitioner", "examiner"]) {
      const mode = bundle.modes[modeId];
      if (!requiredObject(mode, `modes.${modeId}`)) continue;
      if (mode.id !== modeId) add(`modes.${modeId}.id`, `must equal ${modeId}`);
      if (!Number.isInteger(mode.claimBudget?.total) || mode.claimBudget.total < 1) {
        add(`modes.${modeId}.claimBudget.total`, "must be a positive integer");
      }
      if (!Array.isArray(mode.visibleReferenceIdsAtDrafting)) {
        add(`modes.${modeId}.visibleReferenceIdsAtDrafting`, "must be an array");
      }
      if (!Array.isArray(mode.visibleReferenceIdsAfterSubmission)) {
        add(`modes.${modeId}.visibleReferenceIdsAfterSubmission`, "must be an array");
      }
    }
  }

  const anchors = bundle.disclosure?.anchors ?? [];
  const alternatives = bundle.disclosure?.supportedAlternatives ?? [];
  const sections = bundle.disclosure?.sections ?? [];
  requiredArray(sections, "disclosure.sections", 5);
  requiredArray(anchors, "disclosure.anchors", 1);
  requiredArray(alternatives, "disclosure.supportedAlternatives", 10);
  const anchorIds = anchors.map((anchor) => anchor.id);
  ensureUnique(anchorIds, "disclosure.anchors[].id");
  for (const [index, anchor] of anchors.entries()) {
    requireString(anchor.id, `disclosure.anchors[${index}].id`);
    requireString(anchor.text, `disclosure.anchors[${index}].text`);
    if (!sections.some((section) => section.id === anchor.sectionId)) {
      add(`disclosure.anchors[${index}].sectionId`, `unknown section ${anchor.sectionId}`);
    }
  }
  for (const [index, alternative] of alternatives.entries()) {
    if (!anchorIds.includes(alternative.supportAnchorId)) {
      add(
        `disclosure.supportedAlternatives[${index}].supportAnchorId`,
        `unknown anchor ${alternative.supportAnchorId}`,
      );
    }
    requiredArray(alternative.values, `disclosure.supportedAlternatives[${index}].values`, 1);
  }

  const concepts = bundle.lexicon?.concepts ?? [];
  const relations = bundle.lexicon?.relations ?? [];
  requiredArray(concepts, "lexicon.concepts", 1);
  requiredArray(relations, "lexicon.relations", 1);
  const conceptIds = concepts.map((concept) => concept.id);
  ensureUnique(conceptIds, "lexicon.concepts[].id");
  for (const [index, relation] of relations.entries()) {
    for (const [field, value] of [
      ["subjectId", relation.subjectId],
      ["objectId", relation.objectId],
    ]) {
      if (!conceptIds.includes(value)) {
        add(`lexicon.relations[${index}].${field}`, `unknown concept ${value}`);
      }
    }
  }

  const coreReferences = bundle.priorArt?.cards ?? [];
  requiredArray(coreReferences, "priorArt.cards", 4);
  const evaluator = bundle.evaluator;
  if (!requiredObject(evaluator, "evaluator")) {
    return { valid: false, errors };
  }
  if (evaluator.visibility !== "evaluator-only") {
    add("evaluator.visibility", "must be evaluator-only");
  }
  const allReferences = [
    ...coreReferences,
    ...(evaluator.expertReference ? [evaluator.expertReference] : []),
  ];
  const referenceIds = allReferences.map((reference) => reference.id);
  ensureUnique(referenceIds, "references[].id");
  for (const [modeId, mode] of Object.entries(bundle.modes ?? {})) {
    for (const referenceId of [
      ...(mode.visibleReferenceIdsAtDrafting ?? []),
      ...(mode.visibleReferenceIdsAfterSubmission ?? []),
    ]) {
      if (!referenceIds.includes(referenceId)) {
        add(`modes.${modeId}.visibleReferenceIds`, `unknown reference ${referenceId}`);
      }
    }
  }
  for (const [index, reference] of allReferences.entries()) {
    const path = `references[${index}]`;
    for (const field of ["id", "publicationNumber", "title", "publicationDate", "sourceUrl"]) {
      requireString(reference[field], `${path}.${field}`);
    }
    if (!reference.sourceUrl?.startsWith("https://")) {
      add(`${path}.sourceUrl`, "must be an HTTPS source URL");
    }
    if (/\.pdf(?:$|\?)/i.test(reference.sourceUrl ?? "")) {
      add(`${path}.sourceUrl`, "must not embed or directly target a patent PDF");
    }
    requiredArray(reference.pinpoints, `${path}.pinpoints`, 1);
    const snapshot = reference.frozenEvidenceManifest;
    if (!requiredObject(snapshot, `${path}.frozenEvidenceManifest`)) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshot.retrievalDate ?? "")) {
      add(`${path}.frozenEvidenceManifest.retrievalDate`, "must use YYYY-MM-DD");
    }
    if (!/^[a-f0-9]{64}$/.test(snapshot.contentHash ?? "")) {
      add(`${path}.frozenEvidenceManifest.contentHash`, "must be a 64-character SHA-256 digest");
    }
  }

  for (const [setName, claims] of Object.entries(bundle.fixtures ?? {})) {
    if (!setName.endsWith("Claims")) continue;
    if (!requiredArray(claims, `fixtures.${setName}`, 6)) continue;
    if (claims.length !== 6) add(`fixtures.${setName}`, "must contain exactly six claims");
    const numbers = claims.map((item) => item.number);
    if (numbers.some((number, index) => number !== index + 1)) {
      add(`fixtures.${setName}[].number`, "must be sequential from 1 through 6");
    }
    const limitationIds = [];
    for (const [index, item] of claims.entries()) {
      requireString(item.id, `fixtures.${setName}[${index}].id`);
      requireString(item.text, `fixtures.${setName}[${index}].text`);
      requiredArray(item.limitations, `fixtures.${setName}[${index}].limitations`, 1);
      if (item.number === 1 && item.dependsOn !== null) {
        add(`fixtures.${setName}[${index}].dependsOn`, "independent claim must not depend on another claim");
      }
      if (item.number > 1 && (!Number.isInteger(item.dependsOn) || item.dependsOn >= item.number)) {
        add(`fixtures.${setName}[${index}].dependsOn`, "must identify an earlier claim number");
      }
      for (const [limitationIndex, limitation] of (item.limitations ?? []).entries()) {
        limitationIds.push(limitation.id);
        for (const conceptId of limitation.conceptIds ?? []) {
          if (!conceptIds.includes(conceptId)) {
            add(
              `fixtures.${setName}[${index}].limitations[${limitationIndex}].conceptIds`,
              `unknown concept ${conceptId}`,
            );
          }
        }
        for (const anchorId of limitation.supportAnchorIds ?? []) {
          if (!anchorIds.includes(anchorId)) {
            add(
              `fixtures.${setName}[${index}].limitations[${limitationIndex}].supportAnchorIds`,
              `unknown anchor ${anchorId}`,
            );
          }
        }
      }
    }
    ensureUnique(limitationIds, `fixtures.${setName}[].limitations[].id`);
  }

  const evidenceFacts = evaluator.evidenceFacts ?? [];
  requiredArray(evidenceFacts, "evaluator.evidenceFacts", 1);
  const evidenceFactIds = evidenceFacts.map((fact) => fact.id);
  ensureUnique(evidenceFactIds, "evaluator.evidenceFacts[].id");
  const pinpointIds = allReferences.flatMap((reference) =>
    reference.pinpoints.map((pinpoint) => pinpoint.id),
  );
  for (const [index, fact] of evidenceFacts.entries()) {
    if (!referenceIds.includes(fact.referenceId)) {
      add(`evaluator.evidenceFacts[${index}].referenceId`, `unknown reference ${fact.referenceId}`);
    }
    for (const pinpointId of fact.pinpointIds ?? []) {
      if (!pinpointIds.includes(pinpointId)) {
        add(`evaluator.evidenceFacts[${index}].pinpointIds`, `unknown pinpoint ${pinpointId}`);
      }
    }
    for (const conceptId of fact.conceptIds ?? []) {
      if (!conceptIds.includes(conceptId)) {
        add(`evaluator.evidenceFacts[${index}].conceptIds`, `unknown concept ${conceptId}`);
      }
    }
  }

  const allClaimIds = [
    ...(bundle.fixtures?.initialClaims ?? []),
    ...(bundle.fixtures?.amendedClaims ?? []),
  ].map((item) => item.id);
  const recipes = evaluator.rejectionRecipes ?? [];
  requiredArray(recipes, "evaluator.rejectionRecipes", 1);
  const recipeIds = recipes.map((recipe) => recipe.id);
  ensureUnique(recipeIds, "evaluator.rejectionRecipes[].id");
  for (const [index, recipe] of recipes.entries()) {
    for (const claimId of recipe.claimIds ?? []) {
      if (!allClaimIds.includes(claimId)) {
        add(`evaluator.rejectionRecipes[${index}].claimIds`, `unknown claim ${claimId}`);
      }
    }
    for (const referenceId of [
      ...(recipe.referenceIds ?? []),
      ...(recipe.corroboratingReferenceIds ?? []),
    ]) {
      if (!referenceIds.includes(referenceId)) {
        add(`evaluator.rejectionRecipes[${index}].referenceIds`, `unknown reference ${referenceId}`);
      }
    }
    for (const factId of recipe.evidenceFactIds ?? []) {
      if (!evidenceFactIds.includes(factId)) {
        add(`evaluator.rejectionRecipes[${index}].evidenceFactIds`, `unknown fact ${factId}`);
      }
    }
    if (recipe.inheritedFromRecipeId && !recipeIds.includes(recipe.inheritedFromRecipeId)) {
      add(
        `evaluator.rejectionRecipes[${index}].inheritedFromRecipeId`,
        `unknown recipe ${recipe.inheritedFromRecipeId}`,
      );
    }
  }

  requiredArray(evaluator.mappingChallengeRulings, "evaluator.mappingChallengeRulings", 1);
  const competitor = evaluator.competitor;
  if (requiredObject(competitor, "evaluator.competitor")) {
    const target = (bundle.fixtures?.amendedClaims ?? []).find(
      (item) => item.id === competitor.targetClaimId,
    );
    if (!target) add("evaluator.competitor.targetClaimId", "must identify an amended claim");
    const mappedIds = (competitor.limitationMappings ?? []).map((mapping) => mapping.limitationId);
    const targetIds = target?.limitations.map((limitation) => limitation.id) ?? [];
    if (targetIds.some((id) => !mappedIds.includes(id))) {
      add("evaluator.competitor.limitationMappings", "must address every target-claim limitation");
    }
    if (mappedIds.some((id) => !targetIds.includes(id))) {
      add("evaluator.competitor.limitationMappings", "contains an unknown target-claim limitation");
    }
    if (!/not a noninfringement opinion/i.test(competitor.result?.boundary ?? "")) {
      add("evaluator.competitor.result.boundary", "must preserve the noninfringement boundary");
    }
  }

  const scoring = evaluator.scoring;
  if (requiredObject(scoring, "evaluator.scoring")) {
    const totalWeight = (scoring.weights ?? []).reduce((sum, item) => sum + item.weight, 0);
    if (totalWeight !== 100) add("evaluator.scoring.weights", "must sum to 100");
    const workedTotal = Object.values(scoring.workedResult?.categoryScores ?? {}).reduce(
      (sum, value) => sum + value,
      0,
    );
    if (workedTotal !== scoring.workedResult?.total) {
      add("evaluator.scoring.workedResult.total", "must equal the category-score sum");
    }
  }

  if (!requiredArray(evaluator.hiddenTargetEmbodiments, "evaluator.hiddenTargetEmbodiments", 3)) {
    add("evaluator.hiddenTargetEmbodiments", "must preserve all target embodiments");
  }
  for (const [index, target] of (evaluator.hiddenTargetEmbodiments ?? []).entries()) {
    for (const conceptId of target.requiredConceptIds ?? []) {
      if (!conceptIds.includes(conceptId)) {
        add(
          `evaluator.hiddenTargetEmbodiments[${index}].requiredConceptIds`,
          `unknown concept ${conceptId}`,
        );
      }
    }
  }
  if (Object.hasOwn(bundle.disclosure ?? {}, "targetEmbodiments")) {
    add("disclosure.targetEmbodiments", "must remain outside the base player-facing disclosure");
  }

  const boundaryText = [
    bundle.educationalBoundary?.full,
    bundle.educationalBoundary?.final,
    bundle.priorArt?.statusNotice,
  ]
    .filter(Boolean)
    .join(" ");
  if (!/not legal advice/i.test(boundaryText)) add("educationalBoundary", "must say it is not legal advice");
  if (!/not.*patentability/i.test(boundaryText)) {
    add("educationalBoundary", "must disclaim a real patentability conclusion");
  }
  if (!/not.*infringement|not.*noninfringement/i.test(boundaryText)) {
    add("educationalBoundary", "must disclaim a real infringement or noninfringement conclusion");
  }

  return { valid: errors.length === 0, errors };
}

export function assertValidChallengeBundle(bundle) {
  const result = validateChallengeBundle(bundle);
  if (!result.valid) {
    throw new Error(`Invalid ScopeCraft challenge bundle:\n${result.errors.join("\n")}`);
  }
  return bundle;
}
