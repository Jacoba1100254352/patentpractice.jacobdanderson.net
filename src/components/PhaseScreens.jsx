import {
  ArrowRight,
  CheckCircle,
  ClipboardText,
  Circle,
  FileText,
  Flag,
  Lightbulb,
  Scales,
  ShieldCheck,
  Warning,
  XCircle,
} from "@phosphor-icons/react";

import { normalizeClaimSet, sortClaims } from "../domain/claims.js";
import { FirstUseGuide } from "./GuidedTour.jsx";

export function BriefingScreen({
  challenge,
  modeId,
  onModeChange,
  onStart,
  assignmentNotice,
  onCopyAssignment,
  showFirstUseGuide = false,
  onStartTour,
  onDismissFirstUse,
}) {
  const modes = Object.values(challenge.modes);
  return (
    <div className="phase-screen">
      <div className="phase-content">
        {showFirstUseGuide ? (
          <FirstUseGuide onStartTour={onStartTour} onDismiss={onDismissFirstUse} />
        ) : null}
        {assignmentNotice ? (
          <section
            className="assignment-notice"
            data-tone={assignmentNotice.tone}
            role={assignmentNotice.tone === "warning" ? "alert" : "status"}
          >
            <strong>{assignmentNotice.title}</strong>
            <p>{assignmentNotice.message}</p>
          </section>
        ) : null}
        <header className="phase-hero">
          <div>
            <p className="stage-kicker">Challenge 01 · U.S. system drafting</p>
            <h2>{challenge.metadata.title}</h2>
            <p>{challenge.disclosure.sections.find((section) => section.id === "claim-task")?.body}</p>
          </div>
          <button type="button" className="primary-button" data-briefing-start onClick={onStart}>
            Start drafting <ArrowRight size={16} aria-hidden="true" />
          </button>
        </header>
        <div className="briefing-grid">
          <section className="section-surface">
            <div className="section-surface-header">
              <Lightbulb size={17} color="var(--accent)" aria-hidden="true" />
              <h2>Invention packet</h2>
            </div>
            <div className="section-surface-body prose">
              {challenge.disclosure.sections.slice(0, 4).map((section) => (
                <section key={section.id}>
                  <h3>{section.title}</h3>
                  <p>{section.body}</p>
                </section>
              ))}
              {challenge.disclosure.targetEmbodiments?.length ? (
                <section>
                  <h3>Must-cover embodiments</h3>
                  <ul className="objective-list">
                    {challenge.disclosure.targetEmbodiments.map((target) => (
                      <li key={target.id}>{target.description}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          </section>
          <aside>
            <section className="section-surface">
              <div className="section-surface-header">
                <Flag size={17} color="var(--accent)" aria-hidden="true" />
                <h2>Choose difficulty</h2>
              </div>
              <div className="section-surface-body mode-picker">
                {modes.map((mode) => (
                  <label className="mode-option" key={mode.id}>
                    <input
                      type="radio"
                      name="difficulty"
                      value={mode.id}
                      checked={modeId === mode.id}
                      onChange={() => onModeChange(mode.id)}
                    />
                    <span>
                      <strong>{mode.label}</strong>
                      <span>{mode.description}</span>
                    </span>
                  </label>
                ))}
                <button
                  type="button"
                  className="secondary-button assignment-link-button"
                  onClick={onCopyAssignment}
                >
                  <ClipboardText size={15} aria-hidden="true" /> Copy assignment link
                </button>
              </div>
            </section>
            <section className="section-surface" style={{ marginTop: 18 }}>
              <div className="section-surface-header">
                <ShieldCheck size={17} color="var(--success)" aria-hidden="true" />
                <h2>Exercise boundary</h2>
              </div>
              <div className="section-surface-body">
                <p className="rationale">{challenge.educationalBoundary.full}</p>
                <p className="rationale">{challenge.metadata.priorArtStipulation}</p>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

function DispositionPill({ disposition }) {
  const tone =
    disposition.status === "rejected"
      ? "danger"
      : disposition.status === "survives"
        ? "success"
        : "warning";
  return <span className="status-pill" data-tone={tone}>{disposition.label}</span>;
}

export function OfficeActionScreen({ officeAction, challenge, onOpenResponse, onOpenEvidence }) {
  const claims = officeAction?.claims ?? [];
  return (
    <div className="phase-screen">
      <div className="phase-content">
        <header className="phase-hero">
          <div>
            <p className="stage-kicker">Examiner simulation · Core record</p>
            <h2>First examination</h2>
            <p>{challenge.educationalBoundary.officeAction}</p>
          </div>
          <button type="button" className="primary-button" onClick={onOpenResponse}>
            Prepare response <ArrowRight size={16} aria-hidden="true" />
          </button>
        </header>
        <div className="result-grid">
          <main>
            <div className="office-action-summary">
              The simulation evaluated the claims actually submitted, carried every inherited limitation into dependent-claim review, and identified {officeAction?.officeAction?.counts?.rejected ?? 0} simulated rejections.
            </div>
            <div style={{ marginTop: 16 }}>
              {claims.map((claim) => (
                <article className="result-card" key={claim.claimId}>
                  <header className="result-card-header">
                    <h3>Claim {claim.claimNumber}{claim.dependsOn.length ? ` · depends on ${claim.dependsOn.join(", ")}` : " · independent"}</h3>
                    <DispositionPill disposition={claim.disposition} />
                  </header>
                  <div className="result-card-body">
                    <p className="rationale">{claim.disposition.rationale}</p>
                    <div className="mapping-table-wrap">
                      <table className="mapping-table">
                        <caption className="sr-only">Evidence chart for claim {claim.claimNumber}</caption>
                        <thead>
                          <tr><th scope="col">Limitation</th><th scope="col">Origin</th><th scope="col">Record mapping</th></tr>
                        </thead>
                        <tbody>
                          {claim.evidenceChart.map((row) => {
                            const evidence = [...row.concepts, ...row.relations].flatMap((item) => item.evidence);
                            return (
                              <tr key={row.limitationId}>
                                <td>{row.text || "Structured claim language"}</td>
                                <td>{row.inherited ? `Inherited from claim ${row.originClaimNumber}` : `Claim ${row.originClaimNumber}`}</td>
                                <td>
                                  {evidence.length ? (
                                    <button type="button" className="evidence-link" onClick={() => onOpenEvidence(evidence[0])}>
                                      {evidence.length} cited fact{evidence.length === 1 ? "" : "s"}
                                    </button>
                                  ) : (
                                    <span>No complete mapping located</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </main>
          <aside>
            <section className="section-surface">
              <div className="section-surface-header"><Scales size={17} color="var(--accent)" aria-hidden="true" /><h2>Portfolio signal</h2></div>
              <div className="section-surface-body">
                <ul className="feature-list">
                  <li>Look for relational substance in claims identified as amendment targets.</li>
                  <li>Application-specific profiles and force-sensing hardware do not overcome this record.</li>
                  <li>A missing complete mapping is not the same thing as an allowance.</li>
                </ul>
              </div>
            </section>
            <section className="section-surface" style={{ marginTop: 18 }}>
              <div className="section-surface-header"><FileText size={17} aria-hidden="true" /><h2>Record boundary</h2></div>
              <div className="section-surface-body"><p className="rationale">{officeAction?.recordBoundary}</p></div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

export function FinalActionScreen({ result, challenge, onContinue }) {
  const independent = result?.claims?.find((claim) => claim.kind === "independent");
  const survives = independent?.disposition.status === "survives";
  return (
    <div className="phase-screen">
      <div className="phase-content">
        <header className="phase-hero">
          <div>
            <p className="stage-kicker">Response result · One round used</p>
            <h2>{survives ? "The amended claim survives this record" : "The record still presents a challenge"}</h2>
            <p>{challenge.educationalBoundary.officeAction}</p>
          </div>
          <button type="button" className="primary-button" onClick={onContinue}>
            Test a design-around <ArrowRight size={16} aria-hidden="true" />
          </button>
        </header>
        <section className="section-surface">
          <div className="section-surface-header">
            {survives ? <CheckCircle size={18} color="var(--success)" aria-hidden="true" /> : <Warning size={18} color="var(--warning)" aria-hidden="true" />}
            <h2>Bounded examiner result</h2>
            <DispositionPill disposition={independent?.disposition ?? { status: "uncertain", label: "Review required" }} />
          </div>
          <div className="section-surface-body prose">
            <p>{independent?.disposition.rationale}</p>
            <p>Another examiner could articulate a different combination rationale, particularly when the expert pressure-range reference is included. This simulation reports only the configured outcome for the submitted language and selected mode.</p>
          </div>
        </section>
      </div>
    </div>
  );
}

export function CompetitorScreen({
  challenge,
  claim,
  prediction,
  result,
  onPredict,
  onSubmit,
  onDebrief,
}) {
  const claimSet = normalizeClaimSet({ claims: claim ? [claim] : [] });
  const limitations = claim ? sortClaims(claimSet)[0]?.limitations ?? [] : [];
  const revealed = Boolean(result);
  const competitor = challenge?.competitor ?? challenge?.evaluator?.competitor ?? {};
  const productFacts = Array.isArray(competitor.productFacts)
    ? competitor.productFacts
    : Array.isArray(competitor.features)
      ? competitor.features
      : Array.isArray(competitor.limitations)
        ? competitor.limitations
        : [];
  const resultMappings = Array.isArray(result?.limitations) ? result.limitations : [];
  const resultRationales = result?.rationales ?? result?.rationaleByLimitationId ?? {};

  const mappingRationale = (mapping, limitationId) => {
    const configuredRationale = Array.isArray(resultRationales)
      ? resultRationales.find((item) => item?.limitationId === limitationId)
      : resultRationales?.[limitationId];
    return (
      mapping?.rationale
      ?? mapping?.explanation
      ?? (typeof configuredRationale === "string"
        ? configuredRationale
        : configuredRationale?.rationale ?? configuredRationale?.explanation)
      ?? "The supplied result does not include a limitation-specific rationale."
    );
  };
  return (
    <div className="phase-screen">
      <div className="phase-content">
        <header className="phase-hero">
          <div>
            <p className="stage-kicker">Competitor attack · Literal mapping exercise</p>
            <h2>{revealed ? "Compare your prediction" : "Can the competitor avoid the claim?"}</h2>
            <p>{challenge.educationalBoundary.competitor}</p>
          </div>
          {revealed ? (
            <button type="button" className="primary-button" onClick={onDebrief}>Open debrief <ArrowRight size={16} aria-hidden="true" /></button>
          ) : (
            <button type="button" className="primary-button" onClick={onSubmit}>Reveal mapping <ArrowRight size={16} aria-hidden="true" /></button>
          )}
        </header>
        <div className="competitor-grid">
          <section className="section-surface">
            <div className="section-surface-header"><Flag size={17} color="var(--accent)" aria-hidden="true" /><h2>{competitor.name ?? competitor.label ?? "Stipulated competitor product"}</h2></div>
            <div className="section-surface-body">
              {productFacts.map((feature, index) => (
                <div className="competitor-feature" key={feature?.id ?? index}>
                  <Circle size={10} weight="fill" color="var(--accent)" aria-hidden="true" />
                  <span>
                    {typeof feature === "string"
                      ? feature
                      : feature?.text ?? feature?.description ?? "Product fact unavailable"}
                  </span>
                </div>
              ))}
            </div>
          </section>
          <section className="section-surface">
            <div className="section-surface-header"><Scales size={17} aria-hidden="true" /><h2>Claim {claim?.number ?? 1} mapping</h2></div>
            <div className="section-surface-body prediction-grid">
              {limitations.map((limitation) => {
                const mapping = resultMappings.find((item) => item?.limitationId === limitation.id);
                return (
                  <div className="prediction-row" key={limitation.id}>
                    <div className="prediction-limitation">
                      {limitation.text}
                      {revealed && mapping ? (
                        <p className="rationale"><strong>{mapping.status ?? "uncertain"}:</strong> {mappingRationale(mapping, limitation.id)}</p>
                      ) : null}
                    </div>
                    {(["mapped", "omitted", "uncertain"]).map((status) => (
                      <button
                        key={status}
                        type="button"
                        className="prediction-choice"
                        aria-pressed={prediction?.[limitation.id] === status}
                        disabled={revealed}
                        onClick={() => onPredict(limitation.id, status)}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                );
              })}
              {revealed ? (
                <div className="office-action-summary">
                  {result?.conclusion ?? competitor.result?.explanation ?? "Review the limitation-by-limitation mapping above."}
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

const CATEGORY_LABELS = {
  scope: "Scope and embodiment coverage",
  supportClarity: "Support and clarity",
  priorArtResilience: "Prior-art resilience",
  dependentLadder: "Dependent-claim ladder",
  designAroundResistance: "Design-around resistance",
  efficiency: "Claim and prosecution efficiency",
};

export function DebriefScreen({ score, challenge, onRestart, onExport }) {
  return (
    <div className="phase-screen">
      <div className="phase-content">
        <header className="phase-hero">
          <div>
            <p className="stage-kicker">Portfolio debrief · Attempt complete</p>
            <h2>Your claim strategy, explained</h2>
            <p>{challenge.educationalBoundary.final}</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="secondary-button" onClick={onExport}>Export attempt</button>
            <button type="button" className="primary-button" onClick={onRestart}>Try again</button>
          </div>
        </header>
        <div className="debrief-grid">
          <main>
            <section className="section-surface">
              <div className="section-surface-header"><Scales size={17} color="var(--accent)" aria-hidden="true" /><h2>Threshold gates</h2></div>
              <div className="section-surface-body">
                {Object.entries(score.gates).map(([key, gate]) => (
                  <div className="gate-row" key={key}>
                    {gate.pass ? <CheckCircle size={18} color="var(--success)" aria-hidden="true" /> : <XCircle size={18} color="var(--danger)" aria-hidden="true" />}
                    <div className="gate-copy"><strong>{key.replaceAll(/([A-Z])/g, " $1")}</strong><span>{gate.detail}</span></div>
                    <span className="gate-pill" data-pass={gate.pass}>{gate.pass ? "Pass" : "Not met"}</span>
                  </div>
                ))}
              </div>
            </section>
            <section className="section-surface" style={{ marginTop: 18 }}>
              <div className="section-surface-header"><FileText size={17} aria-hidden="true" /><h2>Category breakdown</h2></div>
              <div className="section-surface-body">
                <table className="score-table">
                  <thead><tr><th scope="col">Category</th><th scope="col">Score</th><th scope="col">Maximum</th></tr></thead>
                  <tbody>
                    {Object.entries(score.categories).map(([key, category]) => (
                      <tr key={key}><td>{CATEGORY_LABELS[key] ?? key}</td><td>{category.score}</td><td>{category.maximum}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </main>
          <aside>
            <section className="section-surface">
              <div className="section-surface-header"><Flag size={17} color="var(--accent)" aria-hidden="true" /><h2>Portfolio score</h2></div>
              <div className="section-surface-body">
                <div className="score-total"><strong>{score.total}</strong><span>/ {score.possibleTotal}</span></div>
                <p className="rationale">{score.eligible ? "All threshold gates passed before category points were applied." : "One or more threshold gates remain unmet, so the numerical subtotal is not characterized as a successful portfolio."}</p>
              </div>
            </section>
            <section className="section-surface" style={{ marginTop: 18 }}>
              <div className="section-surface-header"><Lightbulb size={17} color="var(--warning)" aria-hidden="true" /><h2>Drafting lesson</h2></div>
              <div className="section-surface-body">
                <ul className="rubric-list">
                  <li>Build fallback positions from nouns and relationships introduced in the independent claim.</li>
                  <li>Relational limitations can distinguish the supplied record while still creating visible design-arounds.</li>
                  <li>A broad hardware category can preserve coverage across different sensors and processor placements.</li>
                </ul>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
