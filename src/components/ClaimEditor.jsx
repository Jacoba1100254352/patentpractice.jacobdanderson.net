import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  DotsSixVertical,
  Plus,
  TextIndent,
  TextOutdent,
  Trash,
} from "@phosphor-icons/react";

import {
  createClaim,
  createLimitation,
  normalizeClaimSet,
  renderClaimText,
  sortClaims,
} from "../domain/claims.js";

function claimSubject(claim) {
  if (claim.subject?.trim()) return claim.subject.trim();
  const match = claim.text?.match(/^\s*\d*\.?\s*(?:A|An)\s+(.+?)\s+comprising\s*:/iu);
  return match?.[1]?.trim() || "computer input system";
}

function isPreambleLimitation(limitation) {
  return (
    /preamble$/iu.test(limitation.id ?? "") ||
    limitation.conceptIds?.includes("computer-input-system")
  );
}

function visibleLimitations(claim) {
  if (claim.kind === "independent") {
    const filtered = claim.limitations.filter((item) => !isPreambleLimitation(item));
    return filtered.length ? filtered : claim.limitations;
  }
  return claim.limitations;
}

function punctuationFor(index, length) {
  if (index === length - 1) return ".";
  if (index === length - 2) return "; and";
  return ";";
}

function rowsFor(text) {
  return Math.max(2, Math.min(8, Math.ceil(String(text ?? "").length / 62)));
}

function editableLimitationText(value) {
  const text = String(value ?? "");
  const terminalPunctuation = text.match(/^([\s\S]*?)[;,.]+(\s*)$/u);
  return terminalPunctuation
    ? `${terminalPunctuation[1]}${terminalPunctuation[2]}`
    : text;
}

function replaceClaim(claimSet, replacement) {
  const normalized = normalizeClaimSet(claimSet);
  const claims = normalized.claims.map((claim) =>
    claim.id === replacement.id ? replacement : claim,
  );
  return { ...normalized, claims };
}

function rebuildClaimText(claim, claimSet) {
  return {
    ...claim,
    text: renderClaimText(claim, replaceClaim(claimSet, claim)),
  };
}

export function ClaimEditor({
  claimSet,
  onChange,
  selectedClaimId,
  onSelectClaim,
  selectedLimitationId,
  onSelectLimitation,
  claimBudget = 6,
  ghostTextEnabled = true,
  readOnly = false,
  onAnnounce = () => {},
  footer = null,
}) {
  const normalized = useMemo(() => normalizeClaimSet(claimSet), [claimSet]);
  const claims = useMemo(() => sortClaims(normalized), [normalized]);
  const currentClaim =
    claims.find((claim) => claim.id === selectedClaimId) ?? claims[0] ?? null;
  const [editingLimitationId, setEditingLimitationId] = useState(null);
  const editorRef = useRef(null);

  useEffect(() => {
    if (currentClaim && currentClaim.id !== selectedClaimId) {
      onSelectClaim(currentClaim.id);
    }
  }, [currentClaim, onSelectClaim, selectedClaimId]);

  if (!currentClaim) {
    return (
      <section className="claim-workspace" aria-label="Structured claim editor">
        <div className="claim-set-strip" aria-label="Claim set">
          <span className="rationale">No claims yet</span>
        </div>
        <div className="claim-editor-scroll">
          <div className="claim-document">
            <h2>No claim has been started</h2>
            <button
              type="button"
              className="primary-button"
              disabled={readOnly}
              onClick={() => {
                const claim = createClaim({
                  kind: "independent",
                  subject: "computer input system",
                  transition: "comprising",
                  limitations: [],
                });
                onChange({ id: "claim-set", claims: [claim] });
                onSelectClaim(claim.id);
              }}
            >
              <Plus size={16} aria-hidden="true" />
              Start claim 1
            </button>
          </div>
        </div>
        {footer === null || footer === undefined ? null : (
          <footer className="claim-actionbar">{footer}</footer>
        )}
      </section>
    );
  }

  const updateCurrent = (patch) => {
    const next = rebuildClaimText({ ...currentClaim, ...patch }, normalized);
    onChange(replaceClaim(normalized, next));
  };

  const updateLimitation = (limitationId, patch) => {
    const limitations = currentClaim.limitations.map((limitation) => {
      if (limitation.id !== limitationId) return limitation;
      const textChanged = patch.text !== undefined && patch.text !== limitation.text;
      return {
        ...limitation,
        ...patch,
        ...(textChanged
          ? { conceptIds: [], relationIds: [], supportAnchorIds: limitation.supportAnchorIds ?? [] }
          : {}),
      };
    });
    updateCurrent({ limitations });
  };

  const insertLimitation = (afterId = null) => {
    if (readOnly) return;
    const all = [...currentClaim.limitations];
    const afterIndex = all.findIndex((item) => item.id === afterId);
    const inheritedDepth = afterIndex >= 0 ? Number(all[afterIndex].depth ?? 0) : 0;
    const limitation = createLimitation({ text: "", depth: inheritedDepth }, currentClaim);
    all.splice(afterIndex >= 0 ? afterIndex + 1 : all.length, 0, limitation);
    updateCurrent({ limitations: all });
    onSelectLimitation(limitation.id);
    setEditingLimitationId(limitation.id);
    onAnnounce("New limitation added. Start typing, or press Escape to leave clause editing mode.");
    requestAnimationFrame(() => {
      editorRef.current?.querySelector(`[data-limitation-id="${limitation.id}"] textarea`)?.focus();
    });
  };

  const moveLimitation = (limitationId, delta) => {
    const all = [...currentClaim.limitations];
    const from = all.findIndex((item) => item.id === limitationId);
    const to = Math.max(0, Math.min(all.length - 1, from + delta));
    if (from < 0 || from === to) return;
    const [item] = all.splice(from, 1);
    all.splice(to, 0, item);
    updateCurrent({ limitations: all });
    onAnnounce(`Limitation moved ${delta < 0 ? "up" : "down"}.`);
  };

  const changeDepth = (limitationId, delta) => {
    const limitation = currentClaim.limitations.find((item) => item.id === limitationId);
    if (!limitation) return;
    const depth = Math.max(0, Math.min(2, Number(limitation.depth ?? 0) + delta));
    updateLimitation(limitationId, { depth });
    onAnnounce(`Limitation nesting level ${depth + 1}.`);
  };

  const removeLimitation = (limitationId) => {
    if (readOnly) return;
    const limitations = currentClaim.limitations.filter((item) => item.id !== limitationId);
    updateCurrent({ limitations });
    if (selectedLimitationId === limitationId) onSelectLimitation(limitations[0]?.id ?? null);
    onAnnounce("Limitation removed.");
  };

  const addDependentClaim = () => {
    if (readOnly || claims.length >= claimBudget) return;
    const claim = createClaim(
      {
        kind: "dependent",
        dependsOn: currentClaim.id,
        subject: claimSubject(currentClaim),
        limitations: [
          {
            text: "",
            depth: 0,
            conceptIds: [],
            relationIds: [],
            supportAnchorIds: [],
          },
        ],
      },
      normalized,
    );
    const next = { ...normalized, claims: [...normalized.claims, claim] };
    onChange(next);
    onSelectClaim(claim.id);
    onSelectLimitation(claim.limitations[0]?.id ?? null);
    onAnnounce(`Dependent claim ${claim.number} added from claim ${currentClaim.number}.`);
  };

  const removeClaim = (claimId) => {
    if (readOnly || claims.length === 1) return;
    const children = normalized.claims.filter((claim) => claim.dependsOn === claimId);
    if (children.length) {
      onAnnounce("Reparent dependent claims before deleting their parent claim.");
      return;
    }
    const remaining = normalized.claims.filter((claim) => claim.id !== claimId);
    onChange({ ...normalized, claims: remaining });
    onSelectClaim(remaining[0]?.id ?? null);
    onSelectLimitation(null);
  };

  const bodyLimitations = visibleLimitations(currentClaim);
  const parentClaim = claims.find(
    (claim) => claim.id === currentClaim.dependsOn || claim.number === Number(currentClaim.dependsOn),
  );

  return (
    <section className="claim-workspace" aria-label="Structured claim editor" ref={editorRef}>
      <div className="claim-set-strip" aria-label="Claim set">
        {claims.map((claim) => (
          <button
            key={claim.id}
            type="button"
            className="claim-chip"
            aria-current={claim.id === currentClaim.id ? "true" : undefined}
            onClick={() => {
              onSelectClaim(claim.id);
              onSelectLimitation(visibleLimitations(claim)[0]?.id ?? null);
            }}
          >
            <span className="claim-chip-number">{claim.number}</span>
            <span className="claim-chip-copy">
              <strong>Claim {claim.number}</strong>
              <small>{claim.kind === "independent" ? "Independent" : `Depends on ${claims.find((candidate) => candidate.id === claim.dependsOn || candidate.number === Number(claim.dependsOn))?.number ?? claim.dependsOn}`}</small>
            </span>
          </button>
        ))}
        <button
          type="button"
          className="add-claim-button"
          disabled={readOnly || claims.length >= claimBudget}
          onClick={addDependentClaim}
          title={claims.length >= claimBudget ? "Claim budget reached" : "Add a dependent claim"}
        >
          <Plus size={15} aria-hidden="true" />
          Add claim
        </button>
      </div>

      <div className="claim-editor-scroll">
        <article className="claim-document" aria-labelledby={`claim-heading-${currentClaim.id}`}>
          <div className="claim-heading">
            <h2 id={`claim-heading-${currentClaim.id}`}>Claim {currentClaim.number}</h2>
            <span className="claim-kind">({currentClaim.kind})</span>
            {claims.length > 1 && (
              <button
                type="button"
                className="icon-button"
                onClick={() => removeClaim(currentClaim.id)}
                aria-label={`Delete claim ${currentClaim.number}`}
                title="Delete claim"
              >
                <Trash size={16} aria-hidden="true" />
              </button>
            )}
          </div>
          <div className="claim-block">
            <div className="preamble-row">
              <span className="clause-gutter">{currentClaim.number}.</span>
              <div className="clause-box" data-selected={selectedLimitationId === `${currentClaim.id}-preamble`}>
                <textarea
                  className="clause-input"
                  rows={2}
                  value={
                    currentClaim.kind === "independent"
                      ? `A ${claimSubject(currentClaim)} ${currentClaim.transition || "comprising"}:`
                      : `The ${claimSubject(parentClaim ?? currentClaim)} of claim ${parentClaim?.number ?? currentClaim.dependsOn}, wherein:`
                  }
                  readOnly={currentClaim.kind === "dependent" || readOnly}
                  aria-label={`Claim ${currentClaim.number} preamble`}
                  onFocus={() => onSelectLimitation(`${currentClaim.id}-preamble`)}
                  onChange={(event) => {
                    const match = event.target.value.match(/^\s*(?:A|An)\s+(.+?)\s+(comprising|consisting essentially of|consisting of)\s*:?\s*$/iu);
                    updateCurrent({
                      subject: match?.[1] ?? event.target.value,
                      transition: match?.[2] ?? currentClaim.transition ?? "comprising",
                    });
                  }}
                />
              </div>
            </div>

            {bodyLimitations.map((limitation, index) => (
              <div
                key={limitation.id}
                className="limitation-row"
                data-depth={Math.max(0, Math.min(2, Number(limitation.depth ?? 0)))}
                data-limitation-id={limitation.id}
              >
                <span className="clause-gutter">{currentClaim.number}.{index + 1}</span>
                <div className="clause-box" data-selected={selectedLimitationId === limitation.id}>
                  <span className="drag-handle" aria-hidden="true"><DotsSixVertical size={14} /></span>
                  <textarea
                    className="clause-input"
                    rows={rowsFor(limitation.text)}
                    value={editableLimitationText(limitation.text)}
                    readOnly={readOnly}
                    aria-label={`Claim ${currentClaim.number}, limitation ${index + 1}`}
                    aria-describedby={editingLimitationId === limitation.id ? "claim-editor-mode-help" : undefined}
                    onFocus={() => {
                      onSelectLimitation(limitation.id);
                      setEditingLimitationId(limitation.id);
                    }}
                    onChange={(event) => updateLimitation(limitation.id, { text: event.target.value })}
                    onKeyDown={(event) => {
                      if (readOnly) return;
                      if (event.key === "Escape") {
                        setEditingLimitationId(null);
                        event.currentTarget.blur();
                        onAnnounce("Clause editing mode closed. Tab now moves between controls.");
                        return;
                      }
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        insertLimitation(limitation.id);
                        return;
                      }
                      if (event.key === "Tab" && editingLimitationId === limitation.id) {
                        event.preventDefault();
                        changeDepth(limitation.id, event.shiftKey ? -1 : 1);
                      }
                    }}
                  />
                  <span className="clause-punctuation" aria-hidden="true">
                    {punctuationFor(index, bodyLimitations.length)}
                  </span>
                </div>
                <div className="clause-controls" aria-label={`Actions for limitation ${index + 1}`}>
                  <button type="button" className="icon-button" onClick={() => moveLimitation(limitation.id, -1)} disabled={index === 0} aria-label="Move limitation up" title="Move up"><ArrowUp size={14} aria-hidden="true" /></button>
                  <button type="button" className="icon-button" onClick={() => moveLimitation(limitation.id, 1)} disabled={index === bodyLimitations.length - 1} aria-label="Move limitation down" title="Move down"><ArrowDown size={14} aria-hidden="true" /></button>
                  <button type="button" className="icon-button" onClick={() => changeDepth(limitation.id, -1)} aria-label="Outdent limitation" title="Outdent"><TextOutdent size={14} aria-hidden="true" /></button>
                  <button type="button" className="icon-button" onClick={() => changeDepth(limitation.id, 1)} aria-label="Indent limitation" title="Indent"><TextIndent size={14} aria-hidden="true" /></button>
                  <button type="button" className="icon-button" onClick={() => removeLimitation(limitation.id)} aria-label="Delete limitation" title="Delete"><Trash size={14} aria-hidden="true" /></button>
                </div>
              </div>
            ))}

            {ghostTextEnabled && !readOnly && (
              <div className="ghost-row">
                <span className="clause-gutter" aria-hidden="true">+</span>
                <button type="button" className="ghost-button" onClick={() => insertLimitation(bodyLimitations.at(-1)?.id)}>
                  Add a supported limitation or relationship…
                </button>
              </div>
            )}
          </div>
          <p id="claim-editor-mode-help" className="sr-only">
            Clause editing mode. Enter adds a sibling limitation. Shift Enter adds a line break. Tab indents. Shift Tab outdents. Escape returns Tab to ordinary focus navigation.
          </p>
        </article>
      </div>
      {footer === null || footer === undefined ? null : (
        <footer className="claim-actionbar">{footer}</footer>
      )}
    </section>
  );
}
