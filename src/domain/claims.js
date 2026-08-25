/**
 * Pure claim-set utilities used by both the editor and the deterministic judge.
 *
 * The engine deliberately keeps these helpers free of React and persistence so
 * a saved claim set, a challenge fixture, and an editor draft all behave alike.
 */

const INTRODUCING_DETERMINERS = new Set([
  "a",
  "an",
  "another",
  "at least one",
  "one or more",
]);

const REFERENCE_DETERMINERS = new Set([
  "the",
  "said",
  "each",
  "respective",
  "first",
  "second",
  "third",
  "fourth",
]);

const NOUN_PHRASE_STOP_WORDS = new Set([
  "adapted",
  "after",
  "assign",
  "assigned",
  "assigns",
  "and",
  "are",
  "as",
  "associated",
  "associate",
  "associates",
  "at",
  "based",
  "before",
  "being",
  "by",
  "comprising",
  "comprises",
  "cause",
  "causes",
  "communicate",
  "communicates",
  "configured",
  "containing",
  "contains",
  "corresponding",
  "determine",
  "determined",
  "determines",
  "executing",
  "exceed",
  "exceeds",
  "exclude",
  "excludes",
  "for",
  "from",
  "generated",
  "generating",
  "has",
  "have",
  "having",
  "if",
  "in",
  "include",
  "includes",
  "including",
  "indicating",
  "identify",
  "identifies",
  "into",
  "is",
  "of",
  "on",
  "onto",
  "operable",
  "operative",
  "or",
  "produced",
  "receive",
  "receives",
  "reduce",
  "reduces",
  "refrain",
  "retain",
  "retaining",
  "retains",
  "responsive",
  "selected",
  "specifying",
  "store",
  "stores",
  "than",
  "that",
  "through",
  "to",
  "used",
  "using",
  "until",
  "update",
  "updates",
  "when",
  "whereby",
  "wherein",
  "which",
  "while",
  "whose",
  "with",
  "within",
  "without",
]);

const ORDINAL_OR_QUANTIFIER = new Set([
  "a",
  "an",
  "another",
  "at",
  "least",
  "one",
  "or",
  "more",
  "first",
  "second",
  "third",
  "fourth",
  "respective",
  "each",
  "said",
  "the",
]);

export function slugifyId(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";
}

/** Create a deterministic, collision-safe ID. */
export function createStableId(prefix, seed, usedIds = new Set()) {
  const base = `${slugifyId(prefix)}-${slugifyId(seed)}`;
  let candidate = base;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(candidate);
  return candidate;
}

function asClaims(input) {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input?.claims)) return input.claims;
  return [];
}

function dependencyRefs(claim) {
  const raw = claim?.dependsOn ?? claim?.dependsOnClaimId ?? claim?.parentId;
  if (raw === null || raw === undefined || raw === "") return [];
  return (Array.isArray(raw) ? raw : [raw]).filter(
    (value) => value !== null && value !== undefined && value !== "",
  );
}

export function getDependencyRefs(claim) {
  return dependencyRefs(claim);
}

/**
 * Add IDs without replacing IDs already owned by editor or persisted data.
 * Re-running normalization over the same ID-less input yields the same IDs.
 */
export function normalizeClaimSet(input = []) {
  const sourceClaims = asClaims(input);
  const claimIds = new Set();
  const claims = sourceClaims.map((source, index) => {
    const number = Number.isFinite(Number(source?.number))
      ? Number(source.number)
      : index + 1;
    const id = source?.id
      ? createStableIdFromExisting(source.id, claimIds)
      : createStableId("claim", number, claimIds);
    const limitationIds = new Set();
    const limitations = (Array.isArray(source?.limitations)
      ? source.limitations
      : []
    ).map((limitation, limitationIndex) => ({
      ...limitation,
      id: limitation?.id
        ? createStableIdFromExisting(limitation.id, limitationIds)
        : createStableId(
            "limitation",
            `${id}-${limitationIndex + 1}`,
            limitationIds,
          ),
      text: String(limitation?.text ?? ""),
      conceptIds: uniqueStrings(limitation?.conceptIds),
      relationIds: uniqueStrings(limitation?.relationIds),
      supportAnchorIds: uniqueStrings(limitation?.supportAnchorIds),
    }));
    const refs = dependencyRefs(source);
    return {
      ...source,
      id,
      number,
      dependsOn: refs.length <= 1 ? (refs[0] ?? null) : refs,
      kind: source?.kind ?? (refs.length ? "dependent" : "independent"),
      text: String(source?.text ?? ""),
      preamble: String(source?.preamble ?? ""),
      subject: String(source?.subject ?? ""),
      transition: String(source?.transition ?? ""),
      conceptIds: uniqueStrings(source?.conceptIds),
      relationIds: uniqueStrings(source?.relationIds),
      limitations,
    };
  });

  return {
    ...(Array.isArray(input) ? {} : input),
    id: Array.isArray(input) ? "claim-set" : (input?.id ?? "claim-set"),
    claims,
  };
}

function createStableIdFromExisting(id, usedIds) {
  const preferred = String(id);
  if (!usedIds.has(preferred)) {
    usedIds.add(preferred);
    return preferred;
  }
  return createStableId("item", preferred, usedIds);
}

function uniqueStrings(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(Boolean).map(String))];
}

export function createClaim(partial = {}, claimSet = []) {
  const normalized = normalizeClaimSet(claimSet);
  const used = new Set(normalized.claims.map((claim) => claim.id));
  const maxNumber = normalized.claims.reduce(
    (maximum, claim) => Math.max(maximum, claim.number),
    0,
  );
  const number = Number(partial.number) || maxNumber + 1;
  return normalizeClaimSet([
    {
      ...partial,
      id: partial.id ?? createStableId("claim", number, used),
      number,
    },
  ]).claims[0];
}

export function createLimitation(partial = {}, claim) {
  const used = new Set((claim?.limitations ?? []).map((item) => item.id));
  const ordinal = (claim?.limitations?.length ?? 0) + 1;
  return {
    ...partial,
    id:
      partial.id ??
      createStableId("limitation", `${claim?.id ?? "claim"}-${ordinal}`, used),
    text: String(partial.text ?? ""),
    conceptIds: uniqueStrings(partial.conceptIds),
    relationIds: uniqueStrings(partial.relationIds),
    supportAnchorIds: uniqueStrings(partial.supportAnchorIds),
  };
}

export function getClaimByRef(claimSet, ref) {
  const claims = normalizeClaimSet(claimSet).claims;
  const reference = String(ref ?? "");
  return (
    claims.find((claim) => claim.id === ref || claim.id === reference) ??
    claims.find((claim) => String(claim.number) === reference) ??
    null
  );
}

export function sortClaims(claimSet) {
  return [...normalizeClaimSet(claimSet).claims].sort(
    (left, right) => left.number - right.number || left.id.localeCompare(right.id),
  );
}

/** Return root-to-parent dependency chain. Multiple dependencies are supported. */
export function getDependencyChain(claimSet, claimOrRef) {
  const normalized = normalizeClaimSet(claimSet);
  const target =
    typeof claimOrRef === "object"
      ? getClaimByRef(normalized, claimOrRef.id ?? claimOrRef.number)
      : getClaimByRef(normalized, claimOrRef);
  if (!target) return [];

  const ordered = [];
  const emitted = new Set();
  const visiting = new Set();

  function visit(claim) {
    if (visiting.has(claim.id)) return;
    visiting.add(claim.id);
    for (const ref of dependencyRefs(claim)) {
      const parent = getClaimByRef(normalized, ref);
      if (!parent) continue;
      visit(parent);
      if (!emitted.has(parent.id)) {
        emitted.add(parent.id);
        ordered.push(parent);
      }
    }
    visiting.delete(claim.id);
  }

  visit(target);
  return ordered;
}

/**
 * Analyze missing parents, forward references, and cycles without throwing.
 */
export function analyzeDependencies(claimSet) {
  const normalized = normalizeClaimSet(claimSet);
  const missing = [];
  const forwardRefs = [];
  const adjacency = new Map();

  for (const claim of normalized.claims) {
    const parents = [];
    for (const ref of dependencyRefs(claim)) {
      const parent = getClaimByRef(normalized, ref);
      if (!parent) {
        missing.push({ claimId: claim.id, claimNumber: claim.number, ref });
        continue;
      }
      parents.push(parent.id);
      if (parent.number >= claim.number) {
        forwardRefs.push({
          claimId: claim.id,
          claimNumber: claim.number,
          parentId: parent.id,
          parentNumber: parent.number,
        });
      }
    }
    adjacency.set(claim.id, parents);
  }

  const cycles = [];
  const state = new Map();
  const stack = [];
  const seenCycleKeys = new Set();

  function visit(id) {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) {
      const cycleStart = stack.indexOf(id);
      const cycle = [...stack.slice(cycleStart), id];
      const key = [...new Set(cycle)].sort().join("|");
      if (!seenCycleKeys.has(key)) {
        seenCycleKeys.add(key);
        cycles.push(cycle);
      }
      return;
    }
    state.set(id, 1);
    stack.push(id);
    for (const parentId of adjacency.get(id) ?? []) visit(parentId);
    stack.pop();
    state.set(id, 2);
  }

  for (const claim of normalized.claims) visit(claim.id);

  return { missing, forwardRefs, cycles };
}

/**
 * Flatten a claim to inherited and added limitations in dependency order.
 */
export function flattenClaim(claimSet, claimOrRef) {
  const normalized = normalizeClaimSet(claimSet);
  const claim =
    typeof claimOrRef === "object"
      ? getClaimByRef(normalized, claimOrRef.id ?? claimOrRef.number)
      : getClaimByRef(normalized, claimOrRef);
  if (!claim) return null;
  const ancestors = getDependencyChain(normalized, claim);
  const chain = [...ancestors, claim];
  const limitations = chain.flatMap((origin) => {
    const structured = origin.limitations.length
      ? origin.limitations
      : origin.text.trim()
        ? [
            {
              id: `${origin.id}-text`,
              text: origin.text,
              conceptIds: origin.conceptIds,
              relationIds: origin.relationIds,
              supportAnchorIds: [],
            },
          ]
        : [];
    return structured.map((limitation) => ({
      ...limitation,
      originClaimId: origin.id,
      originClaimNumber: origin.number,
      inherited: origin.id !== claim.id,
    }));
  });

  return {
    claim,
    ancestors,
    chain,
    limitations,
    inheritedLimitations: limitations.filter((item) => item.inherited),
    addedLimitations: limitations.filter((item) => !item.inherited),
  };
}

export function flattenClaimSet(claimSet) {
  const normalized = normalizeClaimSet(claimSet);
  return normalized.claims.map((claim) => flattenClaim(normalized, claim));
}

export function stripTerminalPunctuation(value) {
  return String(value ?? "").trim().replace(/[;,.]+\s*$/u, "");
}

export function ensureTerminalPunctuation(value, punctuation = ".") {
  const body = stripTerminalPunctuation(value);
  return body ? `${body}${punctuation}` : "";
}

export function punctuateLimitations(limitations = []) {
  const fragments = limitations
    .map((item) => (typeof item === "string" ? item : item?.text))
    .map(stripTerminalPunctuation)
    .filter(Boolean);
  return fragments.map((fragment, index) => {
    if (index === fragments.length - 1) return `${fragment}.`;
    if (index === fragments.length - 2) return `${fragment}; and`;
    return `${fragment};`;
  });
}

function stripLeadingClaimNumber(text) {
  return String(text ?? "").trim().replace(/^\d+\s*\.\s*/u, "");
}

export function renderClaimBody(claim, claimSet = [claim]) {
  const normalized = normalizeClaimSet(claimSet);
  const current = getClaimByRef(normalized, claim?.id ?? claim?.number) ?? claim;
  const hasStructuredBody =
    Boolean(current?.preamble || current?.subject || current?.transition) ||
    Boolean(current?.limitations?.length);
  if (!hasStructuredBody && current?.text?.trim()) {
    return ensureTerminalPunctuation(stripLeadingClaimNumber(current.text));
  }

  const refs = dependencyRefs(current);
  const parent = refs.length ? getClaimByRef(normalized, refs[0]) : null;
  const subject =
    current?.subject || parent?.subject || normalized.claims[0]?.subject || "system";
  const article = current?.article || (/^[aeiou]/iu.test(subject.trim()) ? "An" : "A");
  const defaultPreamble = refs.length
    ? `The ${subject} of claim ${parent?.number ?? refs[0]}, wherein`
    : `${article} ${subject} comprising:`;
  const preamble = stripTerminalPunctuation(
    current?.preamble ||
      [defaultPreamble, current?.transition].filter(Boolean).join(" "),
  );
  const limitations = punctuateLimitations(current?.limitations);
  if (!limitations.length) return ensureTerminalPunctuation(preamble);
  if (refs.length && limitations.length === 1) {
    return `${preamble} ${limitations[0]}`;
  }
  return `${preamble}${preamble.endsWith(":") ? "" : ":"}\n${limitations
    .map((item) => `    ${item}`)
    .join("\n")}`;
}

export function renderClaimText(claim, claimSet = [claim]) {
  return `${claim?.number ?? 1}. ${renderClaimBody(claim, claimSet)}`;
}

export function canonicalizeTerm(value) {
  const tokens = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, " ")
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .filter((token) => !ORDINAL_OR_QUANTIFIER.has(token));
  if (!tokens.length) return "";
  const lastIndex = tokens.length - 1;
  tokens[lastIndex] = singularize(tokens[lastIndex]);
  return tokens.join(" ");
}

function singularize(word) {
  if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith("ses") && !word.endsWith("sses") && word.length > 4) {
    return word.slice(0, -2);
  }
  if (word.endsWith("s") && !word.endsWith("ss") && word.length > 3) {
    return word.slice(0, -1);
  }
  return word;
}

function trimNounPhrase(value) {
  const words = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, " ")
    .trim()
    .split(/\s+/u)
    .filter(Boolean);
  const kept = [];
  for (const word of words) {
    if (NOUN_PHRASE_STOP_WORDS.has(word)) break;
    kept.push(word);
  }
  return kept.slice(0, 6).join(" ");
}

/**
 * Extract high-confidence article-led noun mentions. Results are intentionally
 * called possible references because claim language can make noun parsing
 * ambiguous without a full legal or linguistic construction.
 */
export function extractTermMentions(text) {
  const source = String(text ?? "");
  const tokens = [...source.matchAll(/[a-z][a-z0-9-]*/giu)].map((match) => ({
    value: match[0].toLowerCase(),
    start: match.index,
    end: match.index + match[0].length,
  }));
  const mentions = [];
  for (let index = 0; index < tokens.length; index += 1) {
    let determiner = tokens[index].value;
    let determinerLength = 1;
    if (
      tokens[index].value === "at" &&
      tokens[index + 1]?.value === "least" &&
      tokens[index + 2]?.value === "one"
    ) {
      determiner = "at least one";
      determinerLength = 3;
    } else if (
      tokens[index].value === "one" &&
      tokens[index + 1]?.value === "or" &&
      tokens[index + 2]?.value === "more"
    ) {
      determiner = "one or more";
      determinerLength = 3;
    }
    if (
      !INTRODUCING_DETERMINERS.has(determiner) &&
      !REFERENCE_DETERMINERS.has(determiner)
    ) {
      continue;
    }

    const phraseTokens = [];
    let cursor = index + determinerLength;
    while (cursor < tokens.length && phraseTokens.length < 8) {
      const token = tokens[cursor].value;
      const previousEnd =
        cursor === index + determinerLength
          ? tokens[index + determinerLength - 1].end
          : tokens[cursor - 1].end;
      const gap = source.slice(previousEnd, tokens[cursor].start);
      if (/[;:.,\n]/u.test(gap)) break;
      if (NOUN_PHRASE_STOP_WORDS.has(token)) break;
      phraseTokens.push(tokens[cursor]);
      cursor += 1;
    }
    const label = trimNounPhrase(
      phraseTokens.map((token) => token.value).join(" "),
    );
    const key = canonicalizeTerm(label);
    if (!key || !phraseTokens.length) continue;
    const matchedEnd = phraseTokens.at(-1).end;
    mentions.push({
      determiner,
      label,
      key,
      kind: INTRODUCING_DETERMINERS.has(determiner)
        ? "introduction"
        : REFERENCE_DETERMINERS.has(determiner)
          ? "reference"
          : "reference",
      index: tokens[index].start,
      matchedText: source.slice(tokens[index].start, matchedEnd),
    });
    index = cursor - 1;
  }
  return mentions;
}

function claimSegments(claim) {
  if (claim.text.trim()) {
    return [{ id: `${claim.id}-text`, text: stripLeadingClaimNumber(claim.text) }];
  }
  return [
    ...(claim.preamble.trim()
      ? [{ id: `${claim.id}-preamble`, text: claim.preamble }]
      : []),
    ...claim.limitations.map((limitation) => ({
      id: limitation.id,
      text: limitation.text,
    })),
  ];
}

function introducedTermsForClaim(claim) {
  const explicit = uniqueStrings(claim.introducedTerms).map((label) => ({
    determiner: "structured",
    label,
    key: canonicalizeTerm(label),
    kind: "introduction",
    index: -1,
    matchedText: label,
    segmentId: `${claim.id}-introduced-terms`,
  }));
  const extracted = claimSegments(claim).flatMap((segment) =>
    extractTermMentions(segment.text)
      .filter((mention) => mention.kind === "introduction")
      .map((mention) => ({ ...mention, segmentId: segment.id })),
  );
  return [...explicit, ...extracted].filter((mention) => mention.key);
}

function resolveAvailableTerm(key, available) {
  if (available.has(key)) return available.get(key);
  const head = key.split(" ").at(-1);
  const candidates = [...available.values()].filter(
    (entry) => entry.key.split(" ").at(-1) === head,
  );
  return candidates.length === 1 ? candidates[0] : null;
}

/**
 * Build a per-claim registry. A dependent claim begins with introductions made
 * by every ancestor, so references inherited through dependency are resolved.
 */
export function buildIntroducedTermRegistry(claimSet) {
  const normalized = normalizeClaimSet(claimSet);
  const terms = new Map();
  const byClaimId = {};
  const allIssues = [];

  for (const claim of sortClaims(normalized)) {
    const available = new Map();
    for (const ancestor of getDependencyChain(normalized, claim)) {
      for (const mention of introducedTermsForClaim(ancestor)) {
        if (!available.has(mention.key)) {
          available.set(mention.key, {
            ...mention,
            claimId: ancestor.id,
            claimNumber: ancestor.number,
            inherited: true,
          });
        }
      }
    }

    const introduced = [];
    const references = [];
    const issues = [];
    for (const mention of introducedTermsForClaim(claim).filter(
      (item) => item.determiner === "structured",
    )) {
      const location = {
        ...mention,
        claimId: claim.id,
        claimNumber: claim.number,
        limitationId: mention.segmentId,
        text: mention.label,
      };
      const entry = terms.get(mention.key) ?? {
        key: mention.key,
        label: mention.label,
        firstUse: location,
        introductions: [],
        references: [],
      };
      entry.introductions.push(location);
      terms.set(mention.key, entry);
      available.set(mention.key, location);
      introduced.push(location);
    }
    for (const segment of claimSegments(claim)) {
      for (const mention of extractTermMentions(segment.text)) {
        const location = {
          ...mention,
          claimId: claim.id,
          claimNumber: claim.number,
          limitationId: segment.id,
          text: segment.text,
        };
        if (mention.kind === "introduction") {
          const entry = terms.get(mention.key) ?? {
            key: mention.key,
            label: mention.label,
            firstUse: location,
            introductions: [],
            references: [],
          };
          entry.introductions.push(location);
          terms.set(mention.key, entry);
          if (!available.has(mention.key)) available.set(mention.key, location);
          introduced.push(location);
          continue;
        }

        const antecedent = resolveAvailableTerm(mention.key, available);
        const reference = { ...location, antecedent: antecedent ?? null };
        references.push(reference);
        if (antecedent) {
          const entry = terms.get(antecedent.key ?? mention.key);
          if (entry) entry.references.push(reference);
        } else {
          const issue = {
            code: "POSSIBLE_ANTECEDENT",
            severity: "warning",
            claimId: claim.id,
            claimNumber: claim.number,
            limitationId: segment.id,
            term: mention.label,
            key: mention.key,
            message: `Possible missing or ambiguous antecedent for “${mention.matchedText}.”`,
          };
          issues.push(issue);
          allIssues.push(issue);
        }
      }
    }

    byClaimId[claim.id] = {
      claimId: claim.id,
      claimNumber: claim.number,
      availableTerms: [...available.keys()],
      introduced,
      references,
      issues,
    };
  }

  return {
    terms: Object.fromEntries(
      [...terms.entries()].map(([key, entry]) => [key, entry]),
    ),
    byClaimId,
    issues: allIssues,
  };
}
