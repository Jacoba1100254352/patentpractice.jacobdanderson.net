import {
  CaretLeft,
  CaretRight,
  CheckCircle,
  Info,
  Warning,
  XCircle,
} from "@phosphor-icons/react";

function findingIcon(severity) {
  if (severity === "blocker") return <XCircle size={16} color="var(--danger)" aria-hidden="true" />;
  if (severity === "warning") return <Warning size={16} color="var(--warning)" aria-hidden="true" />;
  return <Info size={16} color="var(--focus)" aria-hidden="true" />;
}

function firstUseSortKey(entry) {
  const firstUse = entry?.firstUse ?? entry?.introductions?.[0] ?? {};
  const numeric = (value) => {
    if (value === null || value === undefined || value === "") return Number.POSITIVE_INFINITY;
    const number = Number(value);
    return Number.isFinite(number) ? number : Number.POSITIVE_INFINITY;
  };
  return {
    claimNumber: numeric(firstUse.claimNumber),
    limitationNumber: numeric(
      firstUse.limitationNumber ?? firstUse.limitationIndex ?? firstUse.index,
    ),
    label: String(entry?.label ?? entry?.key ?? ""),
  };
}

function compareTermEntries(left, right) {
  const leftKey = firstUseSortKey(left);
  const rightKey = firstUseSortKey(right);
  return (
    leftKey.claimNumber - rightKey.claimNumber
    || leftKey.limitationNumber - rightKey.limitationNumber
    || leftKey.label.localeCompare(rightKey.label)
  );
}

export function InspectorPanel({
  collapsed,
  onToggle,
  selectedClaim,
  selectedLimitation,
  selectedAnchor,
  registry,
  preflight,
  onSelectTerm,
  onFocusFinding,
}) {
  const termEntries = Object.values(registry?.terms ?? {})
    .sort(compareTermEntries)
    .slice(0, 10);
  const findings = (preflight?.items ?? []).filter(
    (item) =>
      !selectedClaim ||
      item.claimId === selectedClaim.id ||
      item.claimIds?.includes(selectedClaim.id) ||
      item.severity === "blocker",
  );
  const selectedLimitationNumber = selectedClaim && selectedLimitation
    ? selectedClaim.limitations.findIndex((item) => item.id === selectedLimitation.id) + 1
    : 0;

  return (
    <aside className="inspector-panel" aria-label="Claim inspector and preflight">
      <div className="panel-header">
        <button
          type="button"
          className="icon-button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Open claim inspector" : "Collapse claim inspector"}
          title={collapsed ? "Open inspector" : "Collapse inspector"}
        >
          {collapsed ? <CaretLeft size={16} aria-hidden="true" /> : <CaretRight size={16} aria-hidden="true" />}
        </button>
        <h2 className="panel-title">Inspector</h2>
        <span className="panel-collapsed-label">Inspector</span>
      </div>
      <div className="panel-body">
        <section className="inspector-section">
          <h3>Selected clause</h3>
          <p className="selected-clause-label">
            {selectedClaim
              ? `Claim ${selectedClaim.number}${selectedLimitationNumber > 0 ? ` · Limitation ${selectedLimitationNumber}` : ""}`
              : "No claim selected"}
          </p>
          <p className="selected-clause-copy">
            {selectedLimitation?.text || "Select a limitation to inspect its terms, support, and mechanical findings."}
          </p>
        </section>

        <section className="inspector-section">
          <h3>Introduced terms</h3>
          {termEntries.length ? (
            <ul className="term-list">
              {termEntries.map((entry) => (
                <li className="term-row" key={entry.key}>
                  <button type="button" onClick={() => onSelectTerm(entry)}>
                    {entry.label}
                  </button>
                  <span className="count-pill">
                    {(entry.introductions?.length ?? 0) + (entry.references?.length ?? 0)} uses
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rationale">Terms appear here as the structured claim is drafted.</p>
          )}
        </section>

        <section className="inspector-section">
          <h3>Disclosure support</h3>
          {selectedAnchor ? (
            <div className="support-card">
              <strong><CheckCircle size={13} aria-hidden="true" /> {selectedAnchor.label}</strong>
              <span>{selectedAnchor.text}</span>
            </div>
          ) : (
            <p className="rationale">Select a disclosure passage to compare it with the active clause.</p>
          )}
        </section>

        <section className="inspector-section" aria-labelledby="preflight-findings-heading">
          <h3 id="preflight-findings-heading">
            Preflight · {preflight?.counts?.blocker ?? 0} blockers · {preflight?.counts?.warning ?? 0} warnings
          </h3>
          {findings.length ? (
            <ul className="finding-list">
              {findings.slice(0, 8).map((finding) => (
                <li className="finding-row" key={finding.id}>
                  <span className="finding-icon">{findingIcon(finding.severity)}</span>
                  <div className="finding-copy">
                    <strong>{finding.code.replaceAll("_", " ")}</strong>
                    <span>{finding.message}</span>
                    {finding.claimId && (
                      <button
                        type="button"
                        className="evidence-link"
                        onClick={() => onFocusFinding(finding)}
                      >
                        Go to claim {finding.claimNumber}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rationale">No mechanical findings for the current draft.</p>
          )}
        </section>
      </div>
    </aside>
  );
}
