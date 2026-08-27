import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CheckCircle,
  CloudCheck,
  Columns,
  DownloadSimple,
  FileText,
  FloppyDisk,
  Info,
  ListMagnifyingGlass,
  Printer,
  Scales,
  SidebarSimple,
  Sparkle,
  Warning,
} from "@phosphor-icons/react";

import {
  challengeCatalog,
  challenge01CompatibilityHash,
  challenge01EvaluatorData,
  challenge01PlayerFacing,
  getChallenge01ForMode,
} from "./challenges/index.js";
import { AppNavigation } from "./components/AppNavigation.jsx";
import { ClaimEditor } from "./components/ClaimEditor.jsx";
import { DisclosurePanel } from "./components/DisclosurePanel.jsx";
import { GuideLibrary } from "./components/GuideLibrary.jsx";
import { GuidedTourStep, QUICK_TOUR_STEPS } from "./components/GuidedTour.jsx";
import { InspectorPanel } from "./components/InspectorPanel.jsx";
import { LifecycleStepper } from "./components/LifecycleStepper.jsx";
import { Modal } from "./components/Modal.jsx";
import { PracticePrintPacket } from "./components/PracticePrintPacket.jsx";
import {
  BriefingScreen,
  CompetitorScreen,
  DebriefScreen,
  FinalActionScreen,
  OfficeActionScreen,
} from "./components/PhaseScreens.jsx";
import { ToastRegion } from "./components/ToastRegion.jsx";
import {
  buildIntroducedTermRegistry,
  normalizeClaimSet,
  renderClaimText,
  sortClaims,
} from "./domain/claims.js";
import {
  buildAssignmentLink,
  parseAssignmentLink,
} from "./domain/assignmentLink.js";
import {
  PRINT_PACKET_TYPES,
  availablePrintPacketTypes,
  buildPlayerPrintModel,
} from "./domain/playerPrintModel.js";
import {
  createEngineChallenge,
  createStarterClaimSet,
  promoteDependentLimitations,
  selectCompetitorTargetClaim,
} from "./domain/sessionModel.js";
import {
  ACTION_TYPES,
  attemptReducer,
  createAttemptState,
} from "./domain/workflow.js";
import { evaluateClaimSet, mapCompetitorToClaim } from "./engine/evaluator.js";
import { runPreflight } from "./engine/preflight.js";
import { scorePortfolio } from "./engine/scoring.js";
import { createAttemptStore, exportAttemptState } from "./persistence/attemptStore.js";
import {
  hasCompletedQuickTour,
  markQuickTourComplete,
} from "./persistence/tourPreference.js";

const CHALLENGE_HASH = challenge01CompatibilityHash;
const ENGINE_VERSION = "1.0.0";
const ENGINE_HASH = "sha256:scopecraft-engine-v1.0.0";

const MODE_LABELS = {
  guided: "Guided mode",
  practitioner: "Practitioner mode",
  examiner: "Examiner mode",
};

const STAGE_TITLES = {
  briefing: "Disclosure briefing",
  drafting: "Application draft",
  preflight: "Mechanical preflight",
  "office-action": "First examination",
  response: "Amendment and response",
  "final-action": "Response result",
  "competitor-prediction": "Design-around prediction",
  "competitor-result": "Design-around result",
  debrief: "Portfolio debrief",
};

function stageForPhase(phase) {
  if (phase === "office-action") return "office-action";
  if (["response", "final-action"].includes(phase)) return "amendment";
  if (["competitor-prediction", "competitor-result"].includes(phase)) return "competitor";
  if (phase === "debrief") return "debrief";
  return "drafting";
}

function createMappingChallenges() {
  return challenge01EvaluatorData.mappingChallengeRulings.map((ruling) => ({
    id: ruling.id,
    prompt: ruling.prompt,
    challengedFindingId: ruling.challengedFindingId,
  }));
}

function createAttempt(modeId = "practitioner") {
  return createAttemptState({
    challengeId: challenge01PlayerFacing.challengeId,
    challengeVersion: challenge01PlayerFacing.contentVersion,
    challengeHash: CHALLENGE_HASH,
    engineVersion: ENGINE_VERSION,
    engineHash: ENGINE_HASH,
    difficulty: modeId,
    mappingChallenges: createMappingChallenges(),
    initialDraft: { claims: createStarterClaimSet().claims, notes: "" },
  });
}

function claimSetFromDraft(draft) {
  return normalizeClaimSet({ id: "claim-set", claims: draft?.claims ?? [] });
}

function useToasts() {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Set());

  const announce = useCallback((message, tone = "neutral", title = null) => {
    const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    setToasts((current) => [...current, { id, message, tone, title }].slice(-4));
    const timer = globalThis.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
      timers.current.delete(timer);
    }, 4200);
    timers.current.add(timer);
  }, []);

  useEffect(() => () => timers.current.forEach((timer) => globalThis.clearTimeout(timer)), []);
  return { toasts, announce };
}

function downloadJson(filename, serialized) {
  const blob = new Blob([serialized], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function ReferenceContent({ reference, evidence }) {
  if (!reference) {
    return <p>The cited record card could not be resolved in this challenge version.</p>;
  }
  return (
    <div className="modal-prose">
      <p className="stage-kicker">{reference.label} · {reference.publicationNumber}</p>
      <h3>{reference.title}</h3>
      <p>{reference.summary}</p>
      {evidence ? (
        <section className="modal-callout">
          <strong>Configured proposition</strong>
          <p>{evidence.proposition}</p>
          <small>{evidence.pinpoint ?? evidence.pinpointIds?.join(", ")}</small>
        </section>
      ) : null}
      <p className="rationale">This card is a frozen exercise summary. The linked publication remains the source record.</p>
      {reference.sourceUrl ? (
        <a href={reference.sourceUrl} target="_blank" rel="noreferrer">Open the public patent record</a>
      ) : null}
    </div>
  );
}

function HelpContent({ challenge, onOpenGuides, onOpenTour }) {
  return (
    <div className="modal-prose">
      <p>{challenge.educationalBoundary.full}</p>
      {Object.entries(challenge.help).map(([section, items]) => (
        <section key={section}>
          <h3>{section.replaceAll(/([A-Z])/g, " $1")}</h3>
          <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>
      ))}
      <div className="modal-action-row">
        <button type="button" className="secondary-button" onClick={onOpenTour}>
          Replay the quick tour
        </button>
        <button type="button" className="secondary-button" onClick={onOpenGuides}>
          <BookOpen size={15} aria-hidden="true" /> Open full drafting guides
        </button>
      </div>
    </div>
  );
}

function currentPathname() {
  return globalThis.location?.pathname ?? "/";
}

function canonicalAssignmentSearch(assignment) {
  if (!assignment?.valid) return "";
  const params = new URLSearchParams({
    challenge: assignment.challengeSlug,
    mode: assignment.modeId,
  });
  return `?${params.toString()}`;
}

function focusBriefingStart() {
  const focus = () => document.querySelector("[data-briefing-start]")?.focus();
  if (typeof globalThis.requestAnimationFrame === "function") {
    globalThis.requestAnimationFrame(focus);
  } else {
    globalThis.setTimeout(focus, 0);
  }
}

function ClaimReview({ original, amended }) {
  const oldClaims = sortClaims(claimSetFromDraft(original));
  const newClaims = sortClaims(claimSetFromDraft(amended));
  return (
    <div className="claim-review-grid">
      <section>
        <h3>Submitted claims</h3>
        {oldClaims.map((claim) => <pre key={claim.id}>{renderClaimText(claim, { claims: oldClaims })}</pre>)}
      </section>
      <section>
        <h3>Proposed response</h3>
        {newClaims.map((claim) => <pre key={claim.id}>{renderClaimText(claim, { claims: newClaims })}</pre>)}
      </section>
    </div>
  );
}

export function App() {
  const [initialAssignment] = useState(() =>
    parseAssignmentLink(globalThis.location?.search ?? "", challengeCatalog),
  );
  const assignmentRef = useRef(initialAssignment);
  const initialMode = initialAssignment.valid ? initialAssignment.modeId : "practitioner";
  const [modeId, setModeId] = useState(initialMode);
  const [attempt, setAttempt] = useState(() => createAttempt(initialMode));
  const [selectedClaimId, setSelectedClaimId] = useState(null);
  const [selectedLimitationId, setSelectedLimitationId] = useState(null);
  const [selectedAnchorId, setSelectedAnchorId] = useState(null);
  const [evidenceTab, setEvidenceTab] = useState("disclosure");
  const [evidenceCollapsed, setEvidenceCollapsed] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [ghostTextEnabled, setGhostTextEnabled] = useState(true);
  const [modal, setModal] = useState(null);
  const [pathname, setPathname] = useState(currentPathname);
  const [mappingChoice, setMappingChoice] = useState("");
  const [activeNavId, setActiveNavId] = useState("draft");
  const [storageState, setStorageState] = useState({ ready: false, backend: null });
  const [showFirstUseGuide, setShowFirstUseGuide] = useState(
    () => !hasCompletedQuickTour(),
  );
  const [tourStep, setTourStep] = useState(0);
  const [printPacketType, setPrintPacketType] = useState(PRINT_PACKET_TYPES.DRAFTING);
  const [printModel, setPrintModel] = useState(null);
  const { toasts, announce } = useToasts();
  const hasHydrated = useRef(false);
  const freshRequestedRef = useRef(
    new URLSearchParams(globalThis.location?.search ?? "").has("fresh"),
  );
  const isGuideRoute = pathname === "/guides" || pathname.startsWith("/guides/");

  const navigate = useCallback((nextPath, { replace = false } = {}) => {
    const nextSearch = canonicalAssignmentSearch(assignmentRef.current);
    if (
      globalThis.history &&
      (currentPathname() !== nextPath || (globalThis.location?.search ?? "") !== nextSearch)
    ) {
      const method = replace ? "replaceState" : "pushState";
      globalThis.history[method](
        globalThis.history.state,
        "",
        `${nextPath}${nextSearch}`,
      );
    }
    setPathname(nextPath);
    setModal(null);
  }, []);

  useEffect(() => {
    const handlePopState = () => setPathname(currentPathname());
    globalThis.addEventListener?.("popstate", handlePopState);
    return () => globalThis.removeEventListener?.("popstate", handlePopState);
  }, []);

  const store = useMemo(
    () => createAttemptStore({
      compatibility: {
        challengeId: challenge01PlayerFacing.challengeId,
        challengeHash: CHALLENGE_HASH,
        engineVersion: ENGINE_VERSION,
        engineHash: ENGINE_HASH,
      },
    }),
    [],
  );

  const stage = stageForPhase(attempt.phase);
  const playerChallenge = useMemo(
    () => getChallenge01ForMode(modeId, { stage }),
    [modeId, stage],
  );
  const engineChallenge = useMemo(
    () => createEngineChallenge(playerChallenge, challenge01EvaluatorData, modeId),
    [modeId, playerChallenge],
  );
  const claimBudgetTotal = playerChallenge.activeMode.claimBudget.total;
  const availablePrintPackets = useMemo(
    () => availablePrintPacketTypes(attempt),
    [attempt],
  );
  const assignmentNotice = useMemo(() => {
    if (initialAssignment.status === "invalid") {
      return {
        tone: "warning",
        title: "Assignment link needs attention",
        message: initialAssignment.errors.join(" "),
      };
    }
    if (initialAssignment.valid) {
      return {
        tone: "neutral",
        title: "Assignment link loaded",
        message: `${playerChallenge.metadata.title} is selected in ${MODE_LABELS[modeId]}.`,
      };
    }
    return null;
  }, [initialAssignment, modeId, playerChallenge.metadata.title]);

  const activeDraft = attempt.phase === "response" ? attempt.response.draft : attempt.draft;
  const activeClaimSet = useMemo(() => claimSetFromDraft(activeDraft), [activeDraft]);
  const activeClaims = useMemo(() => sortClaims(activeClaimSet), [activeClaimSet]);
  const selectedClaim = activeClaims.find((claim) => claim.id === selectedClaimId) ?? activeClaims[0] ?? null;
  const selectedLimitation = selectedClaim?.limitations.find((item) => item.id === selectedLimitationId) ?? null;
  const selectedAnchor = playerChallenge.disclosure.anchors.find((item) => item.id === selectedAnchorId) ?? playerChallenge.disclosure.anchors[0] ?? null;
  const registry = useMemo(() => buildIntroducedTermRegistry(activeClaimSet), [activeClaimSet]);
  const livePreflight = useMemo(
    () => runPreflight(activeClaimSet, {
      challenge: engineChallenge,
      claimBudget: playerChallenge.activeMode.claimBudget,
      mode: modeId,
    }),
    [activeClaimSet, engineChallenge, modeId, playerChallenge.activeMode.claimBudget],
  );

  useEffect(() => {
    if (!selectedClaimId && activeClaims[0]) setSelectedClaimId(activeClaims[0].id);
    if (!selectedAnchorId && playerChallenge.disclosure.anchors[0]) {
      setSelectedAnchorId(playerChallenge.disclosure.anchors[0].id);
    }
  }, [activeClaims, playerChallenge.disclosure.anchors, selectedAnchorId, selectedClaimId]);

  useEffect(() => {
    if (typeof globalThis.matchMedia !== "function") return undefined;
    const compact = globalThis.matchMedia("(max-width: 1040px)");
    const collapseDrawers = () => {
      if (compact.matches) {
        setEvidenceCollapsed(true);
        setInspectorCollapsed(true);
      }
    };
    collapseDrawers();
    compact.addEventListener?.("change", collapseDrawers);
    return () => compact.removeEventListener?.("change", collapseDrawers);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      try {
        const backend = await store.backend();
        const assignment = assignmentRef.current;
        const searchParams = new URLSearchParams(globalThis.location?.search ?? "");
        const freshRequested = freshRequestedRef.current;
        if (freshRequested && searchParams.has("fresh") && globalThis.history?.replaceState && globalThis.location) {
          searchParams.delete("fresh");
          const nextSearch = searchParams.toString();
          globalThis.history.replaceState(
            globalThis.history.state,
            "",
            `${globalThis.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${globalThis.location.hash ?? ""}`,
          );
        }
        const saved = freshRequested ? [] : await store.list();
        if (!cancelled && freshRequested) {
          const freshMode = assignment.valid ? assignment.modeId : initialMode;
          setAttempt(createAttempt(freshMode));
          setModeId(freshMode);
          setSelectedClaimId(null);
          setSelectedLimitationId(null);
          setActiveNavId("draft");
        }
        const resumable = saved.find((candidate) => {
          if (candidate.readOnly) return false;
          if (assignment.status === "invalid") return false;
          if (!assignment.valid) return true;
          return (
            candidate.challenge?.id === assignment.challengeId
            && candidate.difficulty === assignment.modeId
          );
        });
        if (!cancelled && resumable) {
          setAttempt(resumable);
          setModeId(resumable.difficulty);
          announce(
            assignment.valid
              ? "Your most recent attempt for this assigned challenge and mode was restored."
              : "Your most recent compatible attempt was restored from this browser.",
            "success",
            "Attempt resumed",
          );
        }
        if (!cancelled) setStorageState({ ready: true, backend });
      } catch {
        if (!cancelled) {
          setStorageState({ ready: true, backend: "memory" });
          announce("Drafting will continue in this tab, but durable browser storage is unavailable.", "warning", "Local save fallback");
        }
      } finally {
        hasHydrated.current = true;
      }
    }
    hydrate();
    return () => { cancelled = true; };
  }, [announce, store]);

  useEffect(() => {
    if (!hasHydrated.current || !attempt.persistence.dirty) return undefined;
    const revision = attempt.revision;
    const attemptId = attempt.attemptId;
    const timer = globalThis.setTimeout(async () => {
      try {
        await store.save(attempt);
        setAttempt((current) => {
          if (current.attemptId !== attemptId || current.revision !== revision) return current;
          return attemptReducer(current, {
            type: ACTION_TYPES.MARK_SAVED,
            payload: { savedAt: new Date().toISOString() },
          });
        });
      } catch {
        announce("The latest edit remains open, but the browser could not save it yet.", "warning", "Autosave delayed");
      }
    }, 650);
    return () => globalThis.clearTimeout(timer);
  }, [announce, attempt, store]);

  useEffect(() => {
    if (!printModel) return undefined;
    const clearPrintModel = () => setPrintModel(null);
    globalThis.addEventListener?.("afterprint", clearPrintModel, { once: true });
    const invokePrint = () => {
      try {
        if (typeof globalThis.print !== "function") {
          announce("Printing is unavailable in this browser.", "warning", "Print unavailable");
          clearPrintModel();
          return;
        }
        globalThis.print();
      } catch {
        announce("The browser could not open its print dialog.", "warning", "Print unavailable");
        clearPrintModel();
      }
    };
    const frame = typeof globalThis.requestAnimationFrame === "function"
      ? globalThis.requestAnimationFrame(invokePrint)
      : globalThis.setTimeout(invokePrint, 0);
    return () => {
      globalThis.removeEventListener?.("afterprint", clearPrintModel);
      if (typeof globalThis.cancelAnimationFrame === "function") {
        globalThis.cancelAnimationFrame(frame);
      } else {
        globalThis.clearTimeout(frame);
      }
    };
  }, [announce, printModel]);

  const dispatch = useCallback((action) => {
    setAttempt((current) => {
      try {
        return attemptReducer(current, action);
      } catch (error) {
        announce(error.message, "warning", "Action unavailable");
        return current;
      }
    });
  }, [announce]);

  const compactRails = () => typeof globalThis.matchMedia === "function" &&
    globalThis.matchMedia("(max-width: 1040px)").matches;
  const toggleEvidence = () => {
    setEvidenceCollapsed((current) => {
      const next = !current;
      if (!next && compactRails()) setInspectorCollapsed(true);
      return next;
    });
  };
  const toggleInspector = () => {
    setInspectorCollapsed((current) => {
      const next = !current;
      if (!next && compactRails()) setEvidenceCollapsed(true);
      return next;
    });
  };

  const changeMode = (nextMode) => {
    setModeId(nextMode);
    if (!assignmentRef.current.valid || !globalThis.location || !globalThis.history) return;
    assignmentRef.current = { ...assignmentRef.current, modeId: nextMode };
    const challengeEntry = challengeCatalog.find(
      (entry) => entry.id === assignmentRef.current.challengeId,
    );
    const assignmentUrl = new URL(buildAssignmentLink({
      baseUrl: globalThis.location.href,
      challenge: challengeEntry,
      modeId: nextMode,
    }));
    globalThis.history.replaceState(
      globalThis.history.state,
      "",
      `${assignmentUrl.pathname}${assignmentUrl.search}${globalThis.location.hash ?? ""}`,
    );
  };

  const openQuickTour = () => {
    setTourStep(0);
    setModal({ type: "tour" });
  };

  const dismissFirstUseGuide = () => {
    markQuickTourComplete();
    setShowFirstUseGuide(false);
    focusBriefingStart();
    announce("The quick tour remains available from Help.");
  };

  const finishQuickTour = () => {
    markQuickTourComplete();
    setShowFirstUseGuide(false);
    setModal(null);
    focusBriefingStart();
    announce("Quick tour complete. You can replay it from Help.", "success");
  };

  const copyAssignment = async () => {
    const challengeEntry = challengeCatalog.find(
      (entry) => entry.id === challenge01PlayerFacing.challengeId,
    );
    const url = buildAssignmentLink({
      baseUrl: globalThis.location?.href,
      challenge: challengeEntry,
      modeId,
    });
    try {
      if (typeof globalThis.navigator?.clipboard?.writeText !== "function") {
        throw new Error("Clipboard unavailable");
      }
      await globalThis.navigator.clipboard.writeText(url);
      announce("Assignment link copied. It selects this challenge and mode without carrying attempt data.", "success");
    } catch {
      setModal({ type: "assignment-link", url });
    }
  };

  const openPrintDialog = () => {
    setPrintPacketType(availablePrintPackets.at(-1) ?? PRINT_PACKET_TYPES.DRAFTING);
    setModal({ type: "print" });
  };

  const confirmPrintPacket = () => {
    try {
      setPrintModel(buildPlayerPrintModel({ playerChallenge, attempt, packetType: printPacketType }));
      setModal(null);
    } catch (error) {
      announce(error.message, "warning", "Print packet unavailable");
    }
  };

  const startDrafting = () => {
    setAttempt((current) => {
      const starting = current.phase === "briefing" && current.difficulty === modeId
        ? current
        : createAttempt(modeId);
      return attemptReducer(starting, { type: ACTION_TYPES.START_DRAFTING });
    });
    setActiveNavId("draft");
    announce("Drafting opened. The ghost prompt teaches structure only and does not contain a hidden solution.", "success");
  };

  const updateClaimSet = (nextClaimSet) => {
    const draft = { ...(activeDraft ?? {}), claims: nextClaimSet.claims };
    dispatch({
      type: attempt.phase === "response" ? ACTION_TYPES.UPDATE_RESPONSE : ACTION_TYPES.UPDATE_DRAFT,
      payload: { draft },
    });
  };

  const runMechanicalPreflight = () => {
    if (attempt.phase !== "drafting") return;
    setAttempt((current) => {
      try {
        let next = attemptReducer(current, { type: ACTION_TYPES.REQUEST_PREFLIGHT });
        next = attemptReducer(next, { type: ACTION_TYPES.SET_PREFLIGHT_RESULT, payload: livePreflight });
        return next;
      } catch (error) {
        announce(error.message, "warning", "Preflight unavailable");
        return current;
      }
    });
    announce(
      livePreflight.canSubmit
        ? "Mechanical checks are clear. Review any warnings, then submit when ready."
        : `${livePreflight.counts.blocker} blocking issue${livePreflight.counts.blocker === 1 ? "" : "s"} must be resolved before submission.`,
      livePreflight.canSubmit ? "success" : "warning",
      "Preflight complete",
    );
  };

  const submitApplication = () => {
    if (!livePreflight.canSubmit) {
      announce("Resolve the blocking mechanical findings in the inspector before submission.", "warning", "Submission blocked");
      return;
    }
    const evaluation = evaluateClaimSet(activeClaimSet, engineChallenge, {
      preflight: livePreflight,
      mode: modeId,
      claimBudget: playerChallenge.activeMode.claimBudget,
    });
    dispatch({ type: ACTION_TYPES.SUBMIT_APPLICATION, payload: { officeAction: evaluation } });
    setActiveNavId("examiner");
    announce("The submitted snapshot is locked. The examiner simulation is ready.", "success");
  };

  const openResponse = () => {
    dispatch({ type: ACTION_TYPES.OPEN_RESPONSE });
    setActiveNavId("draft");
  };

  const promoteFallbacks = () => {
    const promoted = promoteDependentLimitations(activeClaimSet, 1, [3, 4]);
    const changed = JSON.stringify(promoted) !== JSON.stringify(activeClaimSet);
    if (!changed) {
      announce("Claims 3 and 4 have no additional player-authored limitations available to promote.", "warning", "Nothing promoted");
      return;
    }
    const amended = {
      ...promoted,
      claims: promoted.claims.filter((claim) => ![3, 4].includes(claim.number)),
    };
    updateClaimSet(amended);
    setSelectedClaimId(amended.claims.find((claim) => claim.number === 1)?.id ?? null);
    announce("The limitations already written in claims 3 and 4 were copied into claim 1, and the now-redundant source claims were canceled.", "success", "Player-authored fallback promoted");
  };

  const prepareResponseSubmission = () => {
    if (!livePreflight.canSubmit) {
      announce("Resolve the response draft's blocking mechanical findings first.", "warning", "Response blocked");
      return;
    }
    setModal({ type: "response-review" });
  };

  const confirmResponseSubmission = () => {
    const evaluation = evaluateClaimSet(activeClaimSet, engineChallenge, {
      preflight: livePreflight,
      mode: modeId,
      claimBudget: playerChallenge.activeMode.claimBudget,
    });
    dispatch({ type: ACTION_TYPES.SUBMIT_RESPONSE, payload: { finalAction: evaluation } });
    setModal(null);
    announce("The amended snapshot and response were submitted for the final bounded result.", "success");
  };

  const startCompetitor = () => {
    dispatch({ type: ACTION_TYPES.START_COMPETITOR_PREDICTION });
    setActiveNavId("examiner");
  };

  const amendedClaimSet = useMemo(
    () => claimSetFromDraft(attempt.snapshots.amended?.draft ?? attempt.response.draft ?? attempt.draft),
    [attempt.draft, attempt.response.draft, attempt.snapshots.amended],
  );
  const competitorClaim = useMemo(
    () => selectCompetitorTargetClaim(amendedClaimSet, attempt.finalAction),
    [amendedClaimSet, attempt.finalAction],
  );

  const updatePrediction = (limitationId, status) => {
    dispatch({
      type: ACTION_TYPES.UPDATE_COMPETITOR_PREDICTION,
      payload: { ...(attempt.competitor.prediction ?? {}), [limitationId]: status },
    });
  };

  const submitPrediction = () => {
    if (!competitorClaim) {
      announce("No claim is available for the design-around comparison.", "warning");
      return;
    }
    const result = mapCompetitorToClaim(
      amendedClaimSet,
      competitorClaim,
      engineChallenge,
      engineChallenge.competitor,
    );
    dispatch({
      type: ACTION_TYPES.SUBMIT_COMPETITOR_PREDICTION,
      payload: { prediction: attempt.competitor.prediction ?? {}, result },
    });
  };

  const openDebrief = () => {
    const score = scorePortfolio({
      claimSet: amendedClaimSet,
      challenge: engineChallenge,
      evaluation: attempt.finalAction,
      competitorMappings: attempt.competitor.result ? [attempt.competitor.result] : [],
      preflight: runPreflight(amendedClaimSet, {
        challenge: engineChallenge,
        claimBudget: playerChallenge.activeMode.claimBudget,
        mode: modeId,
      }),
    });
    dispatch({ type: ACTION_TYPES.OPEN_DEBRIEF, payload: { debrief: score } });
    setActiveNavId("reports");
  };

  const restart = () => setModal({ type: "restart" });
  const confirmRestart = () => {
    const replacement = createAttempt(modeId);
    setAttempt(replacement);
    setSelectedClaimId(null);
    setSelectedLimitationId(null);
    setModal(null);
    setActiveNavId("draft");
    announce("A fresh attempt is ready. Your completed attempt remains in local history.", "success");
  };

  const exportAttempt = () => {
    downloadJson(`scopecraft-${attempt.attemptId}.json`, exportAttemptState(attempt));
    announce("Attempt JSON exported without account data or telemetry identifiers.", "success");
  };

  const saveNow = async () => {
    const revision = attempt.revision;
    const attemptId = attempt.attemptId;
    try {
      await store.save(attempt);
      setAttempt((current) => current.attemptId === attemptId && current.revision === revision
        ? attemptReducer(current, {
          type: ACTION_TYPES.MARK_SAVED,
          payload: { savedAt: new Date().toISOString() },
        })
        : current);
      announce("Attempt saved in this browser.", "success");
    } catch {
      announce("The browser could not save this attempt yet.", "warning", "Save delayed");
    }
  };

  const openEvidence = (evidenceOrReference) => {
    const referenceId = evidenceOrReference?.referenceId ?? evidenceOrReference?.id;
    const allReferences = [
      ...(engineChallenge.priorArt?.cards ?? []),
      ...(challenge01EvaluatorData.expertReference ? [challenge01EvaluatorData.expertReference] : []),
    ];
    const reference = allReferences.find((item) => item.id === referenceId) ??
      allReferences.find((item) => item.id === evidenceOrReference?.id) ?? evidenceOrReference;
    setModal({ type: "reference", reference, evidence: evidenceOrReference?.referenceId ? evidenceOrReference : null });
  };

  const openMappingChallenge = () => {
    const unanswered = challenge01EvaluatorData.mappingChallengeRulings.find(
      (ruling) => !attempt.mappingResponses[ruling.id],
    ) ?? challenge01EvaluatorData.mappingChallengeRulings[0];
    setMappingChoice("");
    setModal({ type: "mapping", ruling: unanswered });
  };

  const submitMappingChallenge = () => {
    if (!mappingChoice) return;
    const ruling = modal.ruling;
    const correctChoice = ruling.ruling === "challenge-sustained" ? "withdraw" : "stand";
    dispatch({
      type: ACTION_TYPES.SET_MAPPING_RESPONSE,
      payload: {
        mappingId: ruling.id,
        response: {
          choice: mappingChoice,
          correct: mappingChoice === correctChoice,
          ruling: ruling.ruling,
          explanation: ruling.explanation,
        },
      },
    });
    setModal({ ...modal, revealed: true, correctChoice });
  };

  const handleNav = (id) => {
    if (id === "playbook") {
      setActiveNavId(id);
      navigate("/guides/");
      return;
    }
    if (isGuideRoute) navigate("/");
    setActiveNavId(id);
    if (id === "draft") {
      if (attempt.phase === "briefing") startDrafting();
      else announce("The current drafting stage is already open.");
      return;
    }
    if (id === "disclosure") {
      if (["drafting", "preflight", "response"].includes(attempt.phase)) {
        setEvidenceTab("disclosure");
        setEvidenceCollapsed(false);
        if (compactRails()) setInspectorCollapsed(true);
        announce("The disclosure rail is open on the left.");
      } else setModal({ type: "disclosure" });
      return;
    }
    if (id === "prior-art" || id === "search") {
      if (["drafting", "preflight", "response"].includes(attempt.phase)) {
        if (id === "prior-art") setEvidenceTab("prior-art");
        setEvidenceCollapsed(false);
        if (compactRails()) setInspectorCollapsed(true);
        if (id === "search") {
          globalThis.requestAnimationFrame?.(() => document.querySelector(".evidence-panel input[type='search']")?.focus());
          announce("The evidence search field is ready.");
        } else {
          announce(playerChallenge.priorArt.locked ? "Prior art remains concealed in this mode until submission." : "The Prior art tab is open in the evidence rail.");
        }
      } else setModal({ type: "references" });
      return;
    }
    if (id === "help") {
      setModal({ type: "help" });
      return;
    }
    if (id === "examiner") {
      if (attempt.officeAction) setModal({ type: "examiner-summary" });
      else setModal({ type: "boundary" });
      return;
    }
    if (id === "reports") {
      if (attempt.debrief) announce(`Current portfolio score: ${attempt.debrief.total} of ${attempt.debrief.possibleTotal}.`, "success");
      else announce("Complete the prosecution and design-around rounds to unlock the debrief.");
      return;
    }
    if (id === "settings") {
      setModal({ type: "settings" });
      return;
    }
    if (id === "collapse") setNavCollapsed((value) => !value);
  };

  const reviewLifecycleStage = (stageId) => {
    if (stageId === "disclosure") {
      setModal({ type: "disclosure" });
      return;
    }
    if (stageId === "draft" || stageId === "amendment") {
      setModal({ type: "claim-history" });
      return;
    }
    if (stageId === "examination" && attempt.officeAction) {
      setModal({ type: "examiner-summary" });
      return;
    }
    if (stageId === "design-around" && attempt.competitor.result) {
      setModal({ type: "competitor-summary" });
      return;
    }
    announce(`${stageId.replaceAll("-", " ")} is preserved in this attempt's local record.`, "neutral", "Lifecycle history");
  };

  const footer = (
    <>
      <div className="preflight-summary" role="status">
        {livePreflight.canSubmit ? <CheckCircle size={16} color="var(--success)" aria-hidden="true" /> : <Warning size={16} color="var(--warning)" aria-hidden="true" />}
        <span>{livePreflight.counts.blocker} blockers · {livePreflight.counts.warning} warnings · {activeClaims.length}/{claimBudgetTotal} claims</span>
      </div>
      {attempt.phase === "response" ? (
        <>
          <button type="button" className="secondary-button" onClick={() => setModal({ type: "argument" })}>
            <FileText size={15} aria-hidden="true" /> Response argument
          </button>
          <button type="button" className="secondary-button" onClick={promoteFallbacks}>
            <Sparkle size={15} aria-hidden="true" /> Promote claims 3 and 4
          </button>
          <button type="button" className="primary-button" onClick={prepareResponseSubmission} disabled={!livePreflight.canSubmit}>
            Review response <ArrowRight size={15} aria-hidden="true" />
          </button>
        </>
      ) : attempt.phase === "drafting" ? (
        <button type="button" className="primary-button" onClick={runMechanicalPreflight}>
          Run preflight <ArrowRight size={15} aria-hidden="true" />
        </button>
      ) : (
        <button type="button" className="primary-button" onClick={submitApplication} disabled={!livePreflight.canSubmit}>
          Submit for examination <ArrowRight size={15} aria-hidden="true" />
        </button>
      )}
    </>
  );

  let stageContent;
  if (isGuideRoute) {
    stageContent = (
      <GuideLibrary
        pathname={pathname}
        onNavigate={navigate}
        onBackToPractice={() => navigate("/")}
      />
    );
  } else if (attempt.phase === "briefing") {
    stageContent = (
      <BriefingScreen
        challenge={playerChallenge}
        modeId={modeId}
        onModeChange={changeMode}
        onStart={startDrafting}
        assignmentNotice={assignmentNotice}
        onCopyAssignment={copyAssignment}
        showFirstUseGuide={showFirstUseGuide}
        onStartTour={openQuickTour}
        onDismissFirstUse={dismissFirstUseGuide}
      />
    );
  } else if (["drafting", "preflight", "response"].includes(attempt.phase)) {
    stageContent = (
      <div className="draft-layout" data-evidence-collapsed={evidenceCollapsed} data-inspector-collapsed={inspectorCollapsed}>
        <DisclosurePanel
          challenge={playerChallenge}
          collapsed={evidenceCollapsed}
          onToggle={toggleEvidence}
          activeTab={evidenceTab}
          onTabChange={setEvidenceTab}
          selectedAnchorId={selectedAnchor?.id}
          onSelectAnchor={setSelectedAnchorId}
          onOpenReference={openEvidence}
        />
        <ClaimEditor
          claimSet={activeClaimSet}
          onChange={updateClaimSet}
          selectedClaimId={selectedClaim?.id}
          onSelectClaim={setSelectedClaimId}
          selectedLimitationId={selectedLimitationId}
          onSelectLimitation={setSelectedLimitationId}
          claimBudget={claimBudgetTotal}
          ghostTextEnabled={ghostTextEnabled}
          readOnly={attempt.readOnly}
          onAnnounce={announce}
          footer={footer}
        />
        <InspectorPanel
          collapsed={inspectorCollapsed}
          onToggle={toggleInspector}
          selectedClaim={selectedClaim}
          selectedLimitation={selectedLimitation}
          selectedAnchor={selectedAnchor}
          registry={registry}
          preflight={livePreflight}
          onSelectTerm={(entry) => {
            setSelectedClaimId(entry.firstUse?.claimId ?? selectedClaim?.id);
            setSelectedLimitationId(entry.firstUse?.limitationId ?? null);
          }}
          onFocusFinding={(finding) => {
            setSelectedClaimId(finding.claimId);
            if (finding.limitationId) setSelectedLimitationId(finding.limitationId);
          }}
        />
      </div>
    );
  } else if (attempt.phase === "office-action") {
    stageContent = <OfficeActionScreen officeAction={attempt.officeAction} challenge={playerChallenge} onOpenResponse={openResponse} onOpenEvidence={openEvidence} />;
  } else if (attempt.phase === "final-action") {
    stageContent = <FinalActionScreen result={attempt.finalAction} challenge={playerChallenge} onContinue={startCompetitor} />;
  } else if (["competitor-prediction", "competitor-result"].includes(attempt.phase)) {
    stageContent = (
      <CompetitorScreen
        challenge={engineChallenge}
        claim={competitorClaim}
        prediction={attempt.competitor.prediction ?? {}}
        result={attempt.phase === "competitor-result" ? attempt.competitor.result : null}
        onPredict={updatePrediction}
        onSubmit={submitPrediction}
        onDebrief={openDebrief}
      />
    );
  } else if (attempt.phase === "debrief") {
    stageContent = <DebriefScreen score={attempt.debrief} challenge={playerChallenge} onRestart={restart} onExport={exportAttempt} />;
  }

  const modalFooter = (() => {
    if (modal?.type === "tour") {
      return (
        <>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setTourStep((current) => Math.max(0, current - 1))}
            disabled={tourStep === 0}
          >
            Back
          </button>
          {tourStep < QUICK_TOUR_STEPS.length - 1 ? (
            <button
              type="button"
              className="primary-button"
              onClick={() => setTourStep((current) => Math.min(QUICK_TOUR_STEPS.length - 1, current + 1))}
            >
              Next
            </button>
          ) : (
            <button type="button" className="primary-button" onClick={finishQuickTour}>
              Finish tour
            </button>
          )}
        </>
      );
    }
    if (modal?.type === "print") {
      return (
        <>
          <button type="button" className="secondary-button" onClick={() => setModal(null)}>Cancel</button>
          <button type="button" className="primary-button" onClick={confirmPrintPacket}>Open print dialog</button>
        </>
      );
    }
    if (modal?.type === "mapping" && !modal.revealed) return <button type="button" className="primary-button" onClick={submitMappingChallenge} disabled={!mappingChoice}>Submit challenge</button>;
    if (modal?.type === "mapping" && modal.revealed) return <button type="button" className="primary-button" onClick={() => setModal(null)}>Return to the record</button>;
    if (modal?.type === "response-review") {
      return <><button type="button" className="secondary-button" onClick={() => setModal(null)}>Continue editing</button><button type="button" className="primary-button" onClick={confirmResponseSubmission}>Submit one response</button></>;
    }
    if (modal?.type === "restart") {
      return <><button type="button" className="secondary-button" onClick={() => setModal(null)}>Keep this attempt</button><button type="button" className="danger-button" onClick={confirmRestart}>Start fresh</button></>;
    }
    return null;
  })();

  const modalBody = (() => {
    if (!modal) return null;
    if (modal.type === "reference") return <ReferenceContent reference={modal.reference} evidence={modal.evidence} />;
    if (modal.type === "help") {
      return (
        <HelpContent
          challenge={playerChallenge}
          onOpenGuides={() => navigate("/guides/")}
          onOpenTour={openQuickTour}
        />
      );
    }
    if (modal.type === "tour") return <GuidedTourStep step={tourStep} />;
    if (modal.type === "assignment-link") {
      return (
        <label className="assignment-link-field">
          <span>Shareable challenge and mode link</span>
          <input
            type="text"
            value={modal.url}
            readOnly
            onFocus={(event) => event.currentTarget.select()}
          />
          <small>This link contains no claim text, score, answer, or attempt identifier.</small>
        </label>
      );
    }
    if (modal.type === "print") {
      const options = [
        {
          id: PRINT_PACKET_TYPES.DRAFTING,
          label: "Drafting packet",
          detail: "Player-facing disclosure, current claims or briefing scaffold, and reflection prompts.",
        },
        {
          id: PRINT_PACKET_TYPES.AMENDMENT,
          label: "Amendment packet",
          detail: "Submitted claims, revealed simulated findings, current response draft, and argument.",
        },
        {
          id: PRINT_PACKET_TYPES.DEBRIEF,
          label: "Debrief packet",
          detail: "Submitted and amended claims, prediction review, and the visible score breakdown.",
        },
      ];
      return (
        <fieldset className="print-options">
          <legend>Choose a player-facing packet</legend>
          <p>Packets unlock with the exercise and include only material already available in your attempt.</p>
          {options.map((option) => {
            const available = availablePrintPackets.includes(option.id);
            return (
              <label key={option.id}>
                <input
                  type="radio"
                  name="print-packet"
                  value={option.id}
                  checked={printPacketType === option.id}
                  disabled={!available}
                  onChange={() => setPrintPacketType(option.id)}
                />
                <span>
                  <strong>{option.label}</strong>
                  <small>{available ? option.detail : `${option.detail} Not unlocked yet.`}</small>
                </span>
              </label>
            );
          })}
        </fieldset>
      );
    }
    if (modal.type === "boundary") return <p>{playerChallenge.educationalBoundary.full}</p>;
    if (modal.type === "disclosure") return <div className="modal-prose">{playerChallenge.disclosure.sections.map((section) => <section key={section.id}><h3>{section.title}</h3><p>{section.body}</p></section>)}</div>;
    if (modal.type === "references") return <ul className="modal-reference-list">{playerChallenge.priorArt.cards.map((reference) => <li key={reference.id}><button type="button" onClick={() => openEvidence(reference)}><strong>{reference.label}: {reference.title}</strong><span>{reference.publicationNumber}</span></button></li>)}</ul>;
    if (modal.type === "examiner-summary") return <div className="modal-prose"><p>{attempt.officeAction.recordBoundary}</p><p><strong>{attempt.officeAction.officeAction.counts.rejected}</strong> simulated rejections, <strong>{attempt.officeAction.officeAction.counts.survives}</strong> record survivors, and <strong>{attempt.officeAction.officeAction.counts.uncertain}</strong> uncertain claims.</p></div>;
    if (modal.type === "mapping") return (
      <div className="mapping-challenge">
        <p>{modal.ruling.prompt}</p>
        {!modal.revealed ? (
          <div className="mapping-options">
            <label><input type="radio" name="mapping-choice" value="stand" checked={mappingChoice === "stand"} onChange={(event) => setMappingChoice(event.target.value)} /> The configured mapping should stand</label>
            <label><input type="radio" name="mapping-choice" value="withdraw" checked={mappingChoice === "withdraw"} onChange={(event) => setMappingChoice(event.target.value)} /> The configured mapping should be withdrawn</label>
          </div>
        ) : (
          <section className="modal-callout" data-tone={mappingChoice === modal.correctChoice ? "success" : "warning"}>
            <strong>{mappingChoice === modal.correctChoice ? "Your challenge matches the configured ruling" : "The configured ruling differs"}</strong>
            <p>{modal.ruling.explanation}</p>
            <small>{modal.ruling.ruling.replaceAll("-", " ")}</small>
          </section>
        )}
      </div>
    );
    if (modal.type === "argument") return <label className="argument-label"><span>Concise response argument</span><textarea className="argument-field" value={attempt.response.argument} onChange={(event) => dispatch({ type: ACTION_TYPES.UPDATE_RESPONSE, payload: { argument: event.target.value } })} placeholder="Explain why the cited combination does not completely map the amended relationship within this record." /></label>;
    if (modal.type === "response-review") return <ClaimReview original={attempt.snapshots.submitted?.draft} amended={attempt.response.draft} />;
    if (modal.type === "claim-history") return <ClaimReview original={attempt.snapshots.submitted?.draft ?? attempt.draft} amended={attempt.snapshots.amended?.draft ?? attempt.response.draft ?? attempt.draft} />;
    if (modal.type === "competitor-summary") return <div className="modal-prose"><p>{attempt.competitor.result?.conclusion}</p><p>{attempt.competitor.result?.recordBoundary}</p></div>;
    if (modal.type === "restart") return <p>This starts a new local attempt. The completed attempt remains saved and can still be exported.</p>;
    if (modal.type === "settings") return (
      <div className="settings-list">
        <label><input type="checkbox" checked={ghostTextEnabled} onChange={(event) => setGhostTextEnabled(event.target.checked)} /><span><strong>Mechanical ghost prompt</strong><small>Shows only structural drafting guidance, never a hidden substantive answer.</small></span></label>
        <label><input type="checkbox" checked={!evidenceCollapsed} onChange={(event) => setEvidenceCollapsed(!event.target.checked)} /><span><strong>Evidence rail</strong><small>Keep the disclosure and prior-art rail open while drafting.</small></span></label>
        <label><input type="checkbox" checked={!inspectorCollapsed} onChange={(event) => setInspectorCollapsed(!event.target.checked)} /><span><strong>Inspector rail</strong><small>Keep terms, support, and preflight findings visible.</small></span></label>
      </div>
    );
    return null;
  })();

  const modalTitle = {
    reference: modal?.reference?.label ?? "Evidence record",
    help: "ScopeCraft playbook",
    tour: `ScopeCraft quick tour · Step ${tourStep + 1} of ${QUICK_TOUR_STEPS.length}`,
    "assignment-link": "Copy assignment link",
    print: "Print player packet",
    boundary: "Examiner simulation boundary",
    disclosure: "Invention disclosure",
    references: "Prior-art reference cards",
    "examiner-summary": "Examiner simulation summary",
    mapping: "Challenge a mapping",
    argument: "Response argument",
    "response-review": "Review the amended claim set",
    "claim-history": "Claim-set history",
    "competitor-summary": "Design-around record",
    restart: "Start a new attempt?",
    settings: "Workspace settings",
  }[modal?.type] ?? "ScopeCraft";

  return (
    <div className="app-root" data-print-ready={printModel ? "true" : "false"}>
      <div className="app-shell" data-nav-collapsed={navCollapsed} data-view={isGuideRoute ? "guides" : "practice"}>
      <header className="topbar">
        <div className="brand">ScopeCraft</div>
        <div className="challenge-title">
          <Scales size={17} color="var(--accent)" aria-hidden="true" />
          <span>{isGuideRoute ? "Drafting Guides · U.S. utility practice" : `Challenge 01 · ${challenge01PlayerFacing.metadata.title}`}</span>
        </div>
        {isGuideRoute ? <span /> : <LifecycleStepper currentPhase={attempt.phase} onNavigate={reviewLifecycleStage} />}
        <div className="top-actions">
          {isGuideRoute ? (
            <button type="button" className="quiet-button" onClick={() => navigate("/")}>
              Return to practice
            </button>
          ) : (
            <>
              <span className="autosave-status" title={`Storage: ${storageState.backend ?? "initializing"}`}>
                {attempt.persistence.dirty ? <FloppyDisk size={14} aria-hidden="true" /> : <CloudCheck size={14} aria-hidden="true" />}
                {attempt.persistence.dirty ? "Saving locally" : storageState.ready ? "Saved locally" : "Opening local save"}
              </span>
              <button type="button" className="icon-button" onClick={saveNow} aria-label="Save attempt now" title="Save now"><FloppyDisk size={17} aria-hidden="true" /></button>
              <button type="button" className="icon-button" onClick={exportAttempt} aria-label="Export attempt" title="Export attempt"><DownloadSimple size={17} aria-hidden="true" /></button>
            </>
          )}
        </div>
      </header>

      <div className="application-body">
        <AppNavigation activeId={isGuideRoute ? "playbook" : activeNavId} onNavigate={handleNav} modeLabel={MODE_LABELS[modeId]} />
        <main className="main-stage">
          <div className="stage-topline">
            <p className="stage-kicker">{isGuideRoute ? "resources" : attempt.phase.replaceAll("-", " ")}</p>
            {isGuideRoute ? <p className="stage-title">Drafting guides</p> : <h1 className="stage-title">{STAGE_TITLES[attempt.phase]}</h1>}
            <span className="spacer" />
            {!isGuideRoute && attempt.phase === "office-action" ? <button type="button" className="quiet-button" onClick={openMappingChallenge}><ListMagnifyingGlass size={15} aria-hidden="true" /> Challenge mapping</button> : null}
            {!isGuideRoute && ["drafting", "preflight", "response"].includes(attempt.phase) ? (
              <>
                <button type="button" className="quiet-button rail-toggle" onClick={toggleEvidence} aria-pressed={!evidenceCollapsed}><Columns size={15} aria-hidden="true" /> Evidence</button>
                <button type="button" className="quiet-button rail-toggle" onClick={toggleInspector} aria-pressed={!inspectorCollapsed}><SidebarSimple size={15} aria-hidden="true" /> Inspector</button>
              </>
            ) : null}
            {!isGuideRoute ? (
              <button
                type="button"
                className="quiet-button print-packet-entry"
                onClick={openPrintDialog}
                aria-label="Print player packet"
              >
                <Printer size={15} aria-hidden="true" /> <span>Print packet</span>
              </button>
            ) : null}
            {!isGuideRoute ? (
              <button type="button" className="quiet-button guide-mobile-entry" onClick={() => navigate("/guides/")}>
                <BookOpen size={15} aria-hidden="true" /> Guides
              </button>
            ) : null}
            <span className="legal-boundary"><Info size={13} aria-hidden="true" /> Educational simulation, not legal advice</span>
          </div>
          {stageContent}
        </main>
      </div>

        <Modal open={Boolean(modal)} title={modalTitle} onClose={() => setModal(null)} footer={modalFooter} size={["response-review", "claim-history"].includes(modal?.type) ? "large" : "medium"}>{modalBody}</Modal>
        <ToastRegion toasts={toasts} />
      </div>
      <PracticePrintPacket model={printModel} />
    </div>
  );
}
