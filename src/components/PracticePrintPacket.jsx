import { PRINT_PACKET_TYPES } from "../domain/playerPrintModel.js";

function PacketHeader({ model }) {
  return (
    <header className="print-packet-header">
      <p>ScopeCraft · {model.packetLabel}</p>
      <h1>{model.challengeTitle}</h1>
      <dl className="print-metadata">
        <div><dt>Mode</dt><dd>{model.modeLabel}</dd></div>
        <div><dt>Content version</dt><dd>{model.contentVersion || "Current"}</dd></div>
        <div><dt>Generated</dt><dd><time dateTime={model.generatedAt}>{new Date(model.generatedAt).toLocaleString()}</time></dd></div>
      </dl>
      <p className="print-boundary">{model.educationalBoundary}</p>
    </header>
  );
}

function ClaimList({ title, claims, emptyMessage = "No claim text is available yet." }) {
  return (
    <section className="print-section">
      <h2>{title}</h2>
      {claims?.length ? (
        <div className="print-claim-list">
          {claims.map((claim) => (
            <article className="print-claim" key={`${title}-${claim.number}`}>
              <p className="print-claim-label">
                Claim {claim.number} · {claim.kind}
              </p>
              <pre>{claim.text}</pre>
            </article>
          ))}
        </div>
      ) : <p>{emptyMessage}</p>}
    </section>
  );
}

function ReflectionPrompts({ prompts }) {
  return (
    <section className="print-section print-reflection">
      <h2>Reflection notes</h2>
      <ol>
        {prompts.map((prompt) => <li key={prompt}>{prompt}<span aria-hidden="true" /></li>)}
      </ol>
    </section>
  );
}

function DraftingPacket({ model }) {
  return (
    <>
      <section className="print-section">
        <h2>Invention and drafting task</h2>
        {model.disclosure.sections.map((section) => (
          <article key={section.id || section.title} className="print-prose-block">
            <h3>{section.title}</h3>
            <p>{section.body}</p>
          </article>
        ))}
      </section>
      {model.disclosure.supportedAlternatives.length ? (
        <section className="print-section">
          <h2>Expressly disclosed alternatives</h2>
          <dl className="print-alternatives">
            {model.disclosure.supportedAlternatives.map((alternative) => (
              <div key={alternative.category}>
                <dt>{alternative.category}</dt>
                <dd>{alternative.values.join(", ")}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
      {model.disclosure.targetEmbodiments.length ? (
        <section className="print-section">
          <h2>Visible target embodiments</h2>
          <ul>{model.disclosure.targetEmbodiments.map((target) => <li key={target.label}>{target.description}</li>)}</ul>
        </section>
      ) : null}
      {model.scaffold ? (
        <section className="print-section">
          <h2>Claim-structure scaffold</h2>
          <pre className="print-scaffold">{model.scaffold.independent}</pre>
          <pre className="print-scaffold">{model.scaffold.dependent}</pre>
        </section>
      ) : (
        <ClaimList title="Current player claim set" claims={model.claims} />
      )}
      {model.notes ? <section className="print-section"><h2>Player notes</h2><p>{model.notes}</p></section> : null}
      <ReflectionPrompts prompts={[
        "What is the inventive relationship the independent claim should preserve?",
        "Which supported fallback positions have commercial or prosecution value?",
        "Which incidental details should remain outside the independent claim?",
      ]} />
    </>
  );
}

function FindingsTable({ findings }) {
  return (
    <section className="print-section">
      <h2>Revealed simulated findings</h2>
      {findings.length ? (
        <table className="print-table">
          <thead><tr><th scope="col">Claim</th><th scope="col">Result</th><th scope="col">Rationale</th></tr></thead>
          <tbody>
            {findings.map((finding) => (
              <tr key={finding.claimNumber}>
                <th scope="row">{finding.claimNumber}</th>
                <td>{finding.label || finding.status}</td>
                <td>{finding.rationale}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p>No simulated findings are available in the current player record.</p>}
    </section>
  );
}

function AmendmentPacket({ model }) {
  return (
    <>
      <p className="print-record-boundary">{model.recordBoundary}</p>
      <ClaimList title="Submitted claim set" claims={model.submittedClaims} />
      <FindingsTable findings={model.findings} />
      <ClaimList
        title="Current proposed response"
        claims={model.proposedClaims}
        emptyMessage="No amended claim text has been entered yet."
      />
      <section className="print-section">
        <h2>Response argument</h2>
        <p>{model.responseArgument || "No response argument has been entered yet."}</p>
      </section>
      <ReflectionPrompts prompts={[
        "Which finding requires an amendment, an argument, or both?",
        "What disclosed relationship can be added without relying on incidental hardware?",
        "How does the proposed response preserve useful commercial scope?",
      ]} />
    </>
  );
}

function ScoreTable({ score }) {
  return (
    <section className="print-section">
      <h2>Portfolio debrief</h2>
      <p className="print-score"><strong>{score.total ?? "Not scored"}</strong>{score.possibleTotal === null ? null : ` / ${score.possibleTotal}`}</p>
      <h3>Threshold gates</h3>
      <ul className="print-gates">
        {score.gates.map((gate) => (
          <li key={gate.id}><strong>{gate.label}: {gate.pass ? "Pass" : "Not met"}</strong><span>{gate.detail}</span></li>
        ))}
      </ul>
      <h3>Category breakdown</h3>
      <table className="print-table">
        <thead><tr><th scope="col">Category</th><th scope="col">Score</th><th scope="col">Maximum</th></tr></thead>
        <tbody>{score.categories.map((category) => <tr key={category.id}><th scope="row">{category.label}</th><td>{category.score}</td><td>{category.maximum}</td></tr>)}</tbody>
      </table>
    </section>
  );
}

function CompetitorReview({ competitor }) {
  return (
    <section className="print-section">
      <h2>Design-around prediction review</h2>
      {competitor.rows.length ? (
        <table className="print-table">
          <thead><tr><th scope="col">Limitation</th><th scope="col">Prediction</th><th scope="col">Configured result</th></tr></thead>
          <tbody>
            {competitor.rows.map((row, index) => (
              <tr key={`${row.limitation}-${index}`}>
                <th scope="row">{row.limitation}</th>
                <td>{row.predictedStatus || "No prediction recorded"}</td>
                <td><strong>{row.configuredStatus}</strong>{row.rationale ? <span className="print-cell-detail">{row.rationale}</span> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p>No limitation-by-limitation prediction record is available.</p>}
      {competitor.conclusion ? <p>{competitor.conclusion}</p> : null}
      {competitor.recordBoundary ? <p className="print-record-boundary">{competitor.recordBoundary}</p> : null}
    </section>
  );
}

function DebriefPacket({ model }) {
  return (
    <>
      <ClaimList title="Submitted claim set" claims={model.submittedClaims} />
      <ClaimList title="Amended claim set" claims={model.amendedClaims} />
      <section className="print-section"><h2>Submitted response argument</h2><p>{model.responseArgument || "No response argument was recorded."}</p></section>
      <CompetitorReview competitor={model.competitor} />
      <ScoreTable score={model.score} />
      <ReflectionPrompts prompts={[
        "What choice most improved the claim portfolio?",
        "What did the prior-art and design-around rounds expose?",
        "What will you do differently before drafting the next claim set?",
      ]} />
    </>
  );
}

export function PracticePrintPacket({ model }) {
  if (!model) return null;
  return (
    <article className="player-print-packet" data-packet-type={model.packetType}>
      <PacketHeader model={model} />
      {model.packetType === PRINT_PACKET_TYPES.DRAFTING ? <DraftingPacket model={model} /> : null}
      {model.packetType === PRINT_PACKET_TYPES.AMENDMENT ? <AmendmentPacket model={model} /> : null}
      {model.packetType === PRINT_PACKET_TYPES.DEBRIEF ? <DebriefPacket model={model} /> : null}
    </article>
  );
}
