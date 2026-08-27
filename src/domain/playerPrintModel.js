import { normalizeClaimSet, renderClaimText, sortClaims } from "./claims.js";

export const PRINT_PACKET_TYPES = Object.freeze({
  DRAFTING: "drafting",
  AMENDMENT: "amendment",
  DEBRIEF: "debrief",
});

const PACKET_LABELS = Object.freeze({
  [PRINT_PACKET_TYPES.DRAFTING]: "Drafting packet",
  [PRINT_PACKET_TYPES.AMENDMENT]: "Amendment packet",
  [PRINT_PACKET_TYPES.DEBRIEF]: "Debrief packet",
});

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function titleFromKey(value) {
  return String(value ?? "")
    .replaceAll(/([A-Z])/gu, " $1")
    .replaceAll(/[-_]+/gu, " ")
    .replace(/^./u, (letter) => letter.toUpperCase())
    .trim();
}

function printableClaims(draft) {
  const sourceClaims = Array.isArray(draft?.claims) ? draft.claims : [];
  if (!sourceClaims.length) return [];
  const claimSet = normalizeClaimSet({ id: "print-claim-set", claims: sourceClaims });
  const claims = sortClaims(claimSet);
  return claims.map((claim) => ({
    number: claim.number,
    kind: claim.kind,
    dependsOn: Array.isArray(claim.dependsOn)
      ? [...claim.dependsOn]
      : claim.dependsOn === null || claim.dependsOn === undefined
        ? []
        : [claim.dependsOn],
    text: renderClaimText(claim, claimSet),
  }));
}

function currentDraft(attempt) {
  if (attempt?.phase === "response" && attempt.response?.draft) {
    return attempt.response.draft;
  }
  return (
    attempt?.snapshots?.amended?.draft
    ?? attempt?.response?.draft
    ?? attempt?.snapshots?.submitted?.draft
    ?? attempt?.draft
    ?? null
  );
}

function playerHeader(playerChallenge, attempt, packetType) {
  const activeMode = playerChallenge?.activeMode
    ?? playerChallenge?.modes?.[attempt?.difficulty]
    ?? {};
  return {
    packetType,
    packetLabel: PACKET_LABELS[packetType],
    challengeTitle:
      cleanText(playerChallenge?.metadata?.title)
      || cleanText(playerChallenge?.disclosure?.title)
      || "ScopeCraft challenge",
    challengeNumber: playerChallenge?.metadata?.number ?? null,
    challengeId: cleanText(playerChallenge?.challengeId),
    contentVersion: cleanText(playerChallenge?.contentVersion),
    modeId: cleanText(activeMode.id) || cleanText(attempt?.difficulty),
    modeLabel: cleanText(activeMode.label) || titleFromKey(attempt?.difficulty),
  };
}

function disclosureModel(playerChallenge) {
  const disclosure = playerChallenge?.disclosure ?? {};
  return {
    sections: Array.isArray(disclosure.sections)
      ? disclosure.sections.map((section) => ({
          id: cleanText(section?.id),
          title: cleanText(section?.title),
          body: cleanText(section?.body),
        }))
      : [],
    supportedAlternatives: Array.isArray(disclosure.supportedAlternatives)
      ? disclosure.supportedAlternatives.map((alternative) => ({
          category: cleanText(alternative?.category),
          values: Array.isArray(alternative?.values)
            ? alternative.values.map(cleanText).filter(Boolean)
            : [],
        }))
      : [],
    targetEmbodiments: Array.isArray(disclosure.targetEmbodiments)
      ? disclosure.targetEmbodiments.map((target) => ({
          label: cleanText(target?.label),
          description: cleanText(target?.description),
        }))
      : [],
  };
}

function officeActionFindings(officeAction) {
  if (!Array.isArray(officeAction?.claims)) return [];
  return officeAction.claims.map((claim) => ({
    claimNumber: claim?.claimNumber ?? null,
    status: cleanText(claim?.disposition?.status),
    label: cleanText(claim?.disposition?.label),
    rationale: cleanText(claim?.disposition?.rationale),
    mappings: Array.isArray(claim?.evidenceChart)
      ? claim.evidenceChart.map((row) => ({
          limitation: cleanText(row?.text) || "Structured claim language",
          origin: row?.inherited
            ? `Inherited from claim ${row?.originClaimNumber}`
            : `Claim ${row?.originClaimNumber}`,
          citedFactCount: [
            ...(Array.isArray(row?.concepts) ? row.concepts : []),
            ...(Array.isArray(row?.relations) ? row.relations : []),
          ].reduce(
            (count, item) =>
              count + (Array.isArray(item?.evidence) ? item.evidence.length : 0),
            0,
          ),
        }))
      : [],
  }));
}

function responseArgument(attempt) {
  return (
    cleanText(attempt?.snapshots?.amended?.argument)
    || cleanText(attempt?.response?.argument)
  );
}

function scoreModel(debrief) {
  return {
    total: Number.isFinite(debrief?.total) ? debrief.total : null,
    possibleTotal: Number.isFinite(debrief?.possibleTotal)
      ? debrief.possibleTotal
      : null,
    eligible: Boolean(debrief?.eligible),
    gates: debrief?.gates && typeof debrief.gates === "object"
      ? Object.entries(debrief.gates).map(([key, gate]) => ({
          id: key,
          label: titleFromKey(key),
          pass: Boolean(gate?.pass),
          detail: cleanText(gate?.detail),
        }))
      : [],
    categories: debrief?.categories && typeof debrief.categories === "object"
      ? Object.entries(debrief.categories).map(([key, category]) => ({
          id: key,
          label: titleFromKey(key),
          score: Number.isFinite(category?.score) ? category.score : null,
          maximum: Number.isFinite(category?.maximum) ? category.maximum : null,
        }))
      : [],
  };
}

function competitorReview(attempt) {
  const prediction = attempt?.competitor?.prediction ?? {};
  const result = attempt?.competitor?.result ?? {};
  return {
    conclusion: cleanText(result.conclusion),
    recordBoundary: cleanText(result.recordBoundary),
    rows: Array.isArray(result.limitations)
      ? result.limitations.map((limitation) => ({
          limitation: cleanText(limitation?.text) || "Structured claim limitation",
          predictedStatus: cleanText(prediction?.[limitation?.limitationId]),
          configuredStatus: cleanText(limitation?.status),
          rationale: cleanText(limitation?.rationale),
        }))
      : [],
  };
}

export function availablePrintPacketTypes(attempt = {}) {
  const available = [PRINT_PACKET_TYPES.DRAFTING];
  if (attempt?.snapshots?.submitted) available.push(PRINT_PACKET_TYPES.AMENDMENT);
  if (attempt?.debrief) available.push(PRINT_PACKET_TYPES.DEBRIEF);
  return available;
}

export function buildPlayerPrintModel({ playerChallenge, attempt, packetType } = {}) {
  if (!playerChallenge || typeof playerChallenge !== "object") {
    throw new TypeError("A player-facing challenge is required.");
  }
  if (!attempt || typeof attempt !== "object") {
    throw new TypeError("A current attempt is required.");
  }
  if (!Object.values(PRINT_PACKET_TYPES).includes(packetType)) {
    throw new RangeError("Unknown print packet type.");
  }
  if (!availablePrintPacketTypes(attempt).includes(packetType)) {
    throw new RangeError("That print packet has not been unlocked in this attempt.");
  }

  const base = {
    ...playerHeader(playerChallenge, attempt, packetType),
    generatedAt: new Date().toISOString(),
    educationalBoundary:
      cleanText(
        packetType === PRINT_PACKET_TYPES.DEBRIEF
          ? playerChallenge?.educationalBoundary?.final
          : playerChallenge?.educationalBoundary?.full,
      ) || "This is an educational simulation, not legal advice.",
  };

  if (packetType === PRINT_PACKET_TYPES.DRAFTING) {
    return {
      ...base,
      disclosure: disclosureModel(playerChallenge),
      claims: attempt.phase === "briefing" ? [] : printableClaims(currentDraft(attempt)),
      scaffold: attempt.phase === "briefing"
        ? {
            independent: cleanText(playerChallenge?.editorScaffold?.independent),
            dependent: cleanText(playerChallenge?.editorScaffold?.dependent),
          }
        : null,
      notes: cleanText(currentDraft(attempt)?.notes),
    };
  }

  if (packetType === PRINT_PACKET_TYPES.AMENDMENT) {
    return {
      ...base,
      submittedClaims: printableClaims(attempt.snapshots.submitted?.draft),
      proposedClaims: attempt.response?.draft || attempt.snapshots?.amended?.draft
        ? printableClaims(
            attempt.snapshots?.amended?.draft ?? attempt.response?.draft,
          )
        : [],
      responseArgument: responseArgument(attempt),
      findings: officeActionFindings(attempt.officeAction),
      recordBoundary:
        cleanText(attempt.officeAction?.recordBoundary)
        || cleanText(playerChallenge?.educationalBoundary?.officeAction),
    };
  }

  return {
    ...base,
    submittedClaims: printableClaims(attempt.snapshots.submitted?.draft),
    amendedClaims: printableClaims(
      attempt.snapshots?.amended?.draft ?? attempt.response?.draft,
    ),
    responseArgument: responseArgument(attempt),
    score: scoreModel(attempt.debrief),
    competitor: competitorReview(attempt),
  };
}
