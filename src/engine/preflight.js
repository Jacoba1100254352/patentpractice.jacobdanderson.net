import {
  analyzeDependencies,
  buildIntroducedTermRegistry,
  flattenClaim,
  getDependencyRefs,
  normalizeClaimSet,
  sortClaims,
  stripTerminalPunctuation,
} from "../domain/claims.js";

const SEVERITY_ORDER = { blocker: 0, warning: 1, info: 2 };

function makeItem(severity, code, message, details = {}) {
  return {
    id: [
      code.toLowerCase(),
      details.claimId,
      details.limitationId,
      details.parentId,
      details.term,
      details.ref,
      details.occurrence,
    ]
      .filter(Boolean)
      .join(":"),
    severity,
    code,
    message,
    ...details,
  };
}

function parseBudget(challenge, override, mode = "practitioner") {
  const configured =
    override ??
    challenge?.metadata?.claimBudget ??
    challenge?.claimBudget ??
    challenge?.rules?.claimBudget ??
    challenge?.modes?.[mode]?.claimBudget ??
    challenge?.modes?.practitioner?.claimBudget ??
    null;
  if (
    configured !== null &&
    configured !== undefined &&
    configured !== "" &&
    Number.isFinite(Number(configured))
  ) {
    return { total: Number(configured), independent: null, dependent: null };
  }
  if (typeof configured === "string") {
    const total = configured.match(/(?:up to\s+)?(\d+)\s+(?:total\s+)?claims?/iu);
    const independent = configured.match(/(\d+)\s+independent/iu);
    const dependent = configured.match(/(?:up to\s+)?(\d+)\s+dependent/iu);
    return {
      total: total ? Number(total[1]) : null,
      independent: independent ? Number(independent[1]) : null,
      dependent: dependent ? Number(dependent[1]) : null,
    };
  }
  if (configured && typeof configured === "object") {
    return {
      total: finiteOrNull(
        configured.total ?? configured.maxClaims ?? configured.maximum,
      ),
      independent: finiteOrNull(
        configured.independent ?? configured.maxIndependent,
      ),
      dependent: finiteOrNull(configured.dependent ?? configured.maxDependent),
    };
  }
  return { total: null, independent: null, dependent: null };
}

function finiteOrNull(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function isClaimEmpty(claim) {
  if (claim.limitations.some((limitation) => limitation.text.trim())) return false;
  if (!claim.text.trim()) return true;
  const body = claim.text
    .replace(/^\s*\d+\s*\.\s*/u, "")
    .replace(
      /^\s*the\s+.+?\s+of\s+claim\s+\d+(?:\s*(?:,|;)?\s*(?:wherein|comprising))?\s*/iu,
      "",
    )
    .replace(/^\s*a[n]?\s+.+?\s+comprising\s*:?\s*/iu, "")
    .trim();
  return stripTerminalPunctuation(body).length === 0;
}

function ownSubstance(claim) {
  const limitationText = claim.limitations
    .map((limitation) => stripTerminalPunctuation(limitation.text))
    .filter(Boolean);
  if (limitationText.length) return limitationText;
  const text = claim.text
    .replace(/^\s*\d+\s*\.\s*/u, "")
    .replace(
      /^\s*the\s+.+?\s+of\s+claim\s+\d+(?:\s*(?:,|;)?\s*(?:wherein|comprising))?\s*/iu,
      "",
    )
    .trim();
  return stripTerminalPunctuation(text) ? [stripTerminalPunctuation(text)] : [];
}

function hasAddedLimitation(claimSet, claim) {
  const own = ownSubstance(claim).map((text) => text.toLowerCase());
  if (!own.length) return false;
  const flattened = flattenClaim(claimSet, claim);
  const inherited = new Set(
    (flattened?.inheritedLimitations ?? []).map((limitation) =>
      stripTerminalPunctuation(limitation.text).toLowerCase(),
    ),
  );
  return own.some((text) => text && !inherited.has(text));
}

function sortItems(items) {
  return [...items].sort(
    (left, right) =>
      SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity] ||
      (left.claimNumber ?? Number.MAX_SAFE_INTEGER) -
        (right.claimNumber ?? Number.MAX_SAFE_INTEGER) ||
      left.code.localeCompare(right.code),
  );
}

/**
 * Deterministic submission preflight. A warning invites review; it does not
 * assert that an examiner would necessarily find a defect.
 */
export function runPreflight(claimSet, options = {}) {
  const normalized = normalizeClaimSet(claimSet);
  const items = [];
  const claims = sortClaims(normalized);
  const budget = parseBudget(options.challenge, options.claimBudget, options.mode);
  const independent = claims.filter(
    (claim) => !getDependencyRefs(claim).length || claim.kind === "independent",
  );
  const dependent = claims.filter(
    (claim) => getDependencyRefs(claim).length || claim.kind === "dependent",
  );

  const numberOwners = new Map();
  for (const claim of claims) {
    const owners = numberOwners.get(claim.number) ?? [];
    owners.push(claim.id);
    numberOwners.set(claim.number, owners);
    if (isClaimEmpty(claim)) {
      items.push(
        makeItem(
          "blocker",
          "EMPTY_CLAIM",
          `Claim ${claim.number} does not contain a substantive limitation.`,
          { claimId: claim.id, claimNumber: claim.number },
        ),
      );
    }
  }

  for (const [number, owners] of numberOwners) {
    if (owners.length > 1) {
      items.push(
        makeItem(
          "blocker",
          "DUPLICATE_CLAIM_NUMBER",
          `Claim number ${number} is used more than once.`,
          { claimNumber: number, claimIds: owners },
        ),
      );
    }
  }

  if (budget.total !== null && claims.length > budget.total) {
    items.push(
      makeItem(
        "blocker",
        "CLAIM_BUDGET_EXCEEDED",
        `The draft uses ${claims.length} claims, exceeding the ${budget.total}-claim challenge budget.`,
        { actual: claims.length, allowed: budget.total },
      ),
    );
  } else if (budget.total !== null) {
    items.push(
      makeItem(
        "info",
        "CLAIM_BUDGET_REMAINING",
        `${budget.total - claims.length} of ${budget.total} claim slots remain.`,
        { actual: claims.length, allowed: budget.total },
      ),
    );
  }

  if (budget.independent !== null && independent.length > budget.independent) {
    items.push(
      makeItem(
        "blocker",
        "INDEPENDENT_BUDGET_EXCEEDED",
        `The draft uses ${independent.length} independent claims, exceeding the ${budget.independent}-claim limit.`,
        { actual: independent.length, allowed: budget.independent },
      ),
    );
  }
  if (budget.dependent !== null && dependent.length > budget.dependent) {
    items.push(
      makeItem(
        "blocker",
        "DEPENDENT_BUDGET_EXCEEDED",
        `The draft uses ${dependent.length} dependent claims, exceeding the ${budget.dependent}-claim limit.`,
        { actual: dependent.length, allowed: budget.dependent },
      ),
    );
  }

  const dependencies = analyzeDependencies(normalized);
  for (const issue of dependencies.missing) {
    items.push(
      makeItem(
        "blocker",
        "MISSING_DEPENDENCY",
        `Claim ${issue.claimNumber} refers to a claim that is not in this draft.`,
        issue,
      ),
    );
  }
  for (const issue of dependencies.forwardRefs) {
    items.push(
      makeItem(
        "blocker",
        "FORWARD_DEPENDENCY",
        `Claim ${issue.claimNumber} refers forward to claim ${issue.parentNumber}.`,
        issue,
      ),
    );
  }
  for (const cycle of dependencies.cycles) {
    const cycleClaims = cycle
      .map((id) => normalized.claims.find((claim) => claim.id === id)?.number)
      .filter((value) => value !== undefined);
    items.push(
      makeItem(
        "blocker",
        "DEPENDENCY_CYCLE",
        `The claim dependency chain contains a cycle (${cycleClaims.join(" → ")}).`,
        { claimIds: cycle, claimNumbers: cycleClaims },
      ),
    );
  }

  for (const claim of claims) {
    const refs = getDependencyRefs(claim);
    if (claim.kind === "independent" && refs.length) {
      items.push(
        makeItem(
          "warning",
          "INDEPENDENT_WITH_DEPENDENCY",
          `Claim ${claim.number} is labeled independent but refers to another claim.`,
          { claimId: claim.id, claimNumber: claim.number },
        ),
      );
    }
    if (claim.kind === "dependent" && !refs.length) {
      items.push(
        makeItem(
          "blocker",
          "DEPENDENT_WITHOUT_PARENT",
          `Claim ${claim.number} is labeled dependent but does not identify a parent claim.`,
          { claimId: claim.id, claimNumber: claim.number },
        ),
      );
    }
    if (refs.length && !dependencies.cycles.some((cycle) => cycle.includes(claim.id))) {
      if (hasAddedLimitation(normalized, claim)) {
        items.push(
          makeItem(
            "info",
            "DEPENDENT_ADDS_LIMITATION",
            `Claim ${claim.number} adds material beyond its inherited limitations.`,
            { claimId: claim.id, claimNumber: claim.number },
          ),
        );
      } else {
        items.push(
          makeItem(
            "blocker",
            "DEPENDENT_NO_ADDED_LIMITATION",
            `Claim ${claim.number} does not appear to add a limitation to its parent.`,
            { claimId: claim.id, claimNumber: claim.number },
          ),
        );
      }
    }
  }

  const registry = buildIntroducedTermRegistry(normalized);
  for (const [occurrence, issue] of registry.issues.entries()) {
    items.push(
      makeItem("warning", issue.code, issue.message, {
        claimId: issue.claimId,
        claimNumber: issue.claimNumber,
        limitationId: issue.limitationId,
        term: issue.term,
        occurrence: occurrence + 1,
      }),
    );
  }

  const ordered = sortItems(items);
  const blockers = ordered.filter((item) => item.severity === "blocker");
  const warnings = ordered.filter((item) => item.severity === "warning");
  const info = ordered.filter((item) => item.severity === "info");

  return {
    claimSet: normalized,
    budget,
    dependencies,
    registry,
    items: ordered,
    blockers,
    warnings,
    info,
    counts: {
      blocker: blockers.length,
      warning: warnings.length,
      info: info.length,
    },
    canSubmit: blockers.length === 0,
  };
}

export const preflightClaimSet = runPreflight;
