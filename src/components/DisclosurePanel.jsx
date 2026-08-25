import { useMemo, useState } from "react";
import {
  CaretLeft,
  CaretRight,
  FileMagnifyingGlass,
  MagnifyingGlass,
} from "@phosphor-icons/react";

function textMatches(value, query) {
  return String(value ?? "").toLowerCase().includes(query.trim().toLowerCase());
}

export function DisclosurePanel({
  challenge,
  collapsed,
  onToggle,
  activeTab,
  onTabChange,
  selectedAnchorId,
  onSelectAnchor,
  onOpenReference,
}) {
  const [localTab, setLocalTab] = useState("disclosure");
  const tab = activeTab ?? localTab;
  const setTab = onTabChange ?? setLocalTab;
  const [query, setQuery] = useState("");
  const disclosure = challenge.disclosure;
  const anchors = disclosure?.anchors ?? [];
  const references = challenge.priorArt?.cards ?? [];
  const selectedAnchor =
    anchors.find((anchor) => anchor.id === selectedAnchorId) ?? anchors[0] ?? null;

  const filteredAnchors = useMemo(() => {
    if (!query.trim()) return anchors;
    return anchors.filter(
      (anchor) => textMatches(anchor.label, query) || textMatches(anchor.text, query),
    );
  }, [anchors, query]);

  const filteredReferences = useMemo(() => {
    if (!query.trim()) return references;
    return references.filter(
      (reference) =>
        textMatches(reference.publicationNumber, query) ||
        textMatches(reference.title, query) ||
        textMatches(reference.summary, query),
    );
  }, [query, references]);

  return (
    <aside className="evidence-panel" aria-label="Invention and prior-art evidence">
      <div className="panel-header">
        <h2 className="panel-title">Evidence</h2>
        <span className="panel-collapsed-label">Evidence</span>
        <button
          type="button"
          className="icon-button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Open evidence panel" : "Collapse evidence panel"}
          title={collapsed ? "Open evidence" : "Collapse evidence"}
        >
          {collapsed ? <CaretRight size={16} aria-hidden="true" /> : <CaretLeft size={16} aria-hidden="true" />}
        </button>
      </div>
      <div className="panel-body">
        <div className="panel-tabs" role="tablist" aria-label="Evidence sources">
          <button
            type="button"
            className="panel-tab"
            role="tab"
            aria-selected={tab === "disclosure"}
            onClick={() => setTab("disclosure")}
          >
            Disclosure
          </button>
          <button
            type="button"
            className="panel-tab"
            role="tab"
            aria-selected={tab === "prior-art"}
            onClick={() => setTab("prior-art")}
          >
            Prior art {challenge.priorArt?.locked ? "(locked)" : `(${references.length})`}
          </button>
        </div>
        <label className="search-field">
          <MagnifyingGlass size={15} aria-hidden="true" />
          <span className="sr-only">Search {tab === "disclosure" ? "disclosure" : "prior art"}</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tab === "disclosure" ? "Search disclosure" : "Search references"}
          />
        </label>

        {tab === "disclosure" ? (
          <>
            <nav className="disclosure-nav" aria-label="Disclosure passages">
              {filteredAnchors.map((anchor, index) => (
                <button
                  type="button"
                  className="disclosure-anchor"
                  key={anchor.id}
                  aria-current={anchor.id === selectedAnchor?.id ? "true" : undefined}
                  onClick={() => onSelectAnchor(anchor.id)}
                >
                  <span className="anchor-number">¶ {String(index + 31).padStart(4, "0")}</span>
                  <span>{anchor.label}</span>
                </button>
              ))}
              {!filteredAnchors.length && (
                <p className="rationale">No disclosure passages match that search.</p>
              )}
            </nav>
            {selectedAnchor && (
              <section className="excerpt" aria-labelledby="selected-disclosure-heading">
                <h3 id="selected-disclosure-heading">Selected disclosure</h3>
                <p className="excerpt-text">{selectedAnchor.text}</p>
                <div style={{ marginTop: 12 }}>
                  <span className="status-pill" data-tone="success">
                    {selectedAnchor.conceptIds?.length ?? 0} supported concepts
                  </span>
                </div>
              </section>
            )}
          </>
        ) : challenge.priorArt?.locked ? (
          <section className="excerpt">
            <FileMagnifyingGlass size={28} color="var(--ink-muted)" aria-hidden="true" />
            <h3 style={{ marginTop: 12 }}>References concealed</h3>
            <p className="excerpt-text">{challenge.priorArt.lockedMessage}</p>
          </section>
        ) : (
          <ul className="evidence-list">
            {filteredReferences.map((reference) => (
              <li className="reference-row" key={reference.id}>
                <button type="button" onClick={() => onOpenReference(reference)}>
                  <span className="reference-label">{reference.label}</span>
                  <span className="reference-title">{reference.title}</span>
                  <span className="reference-meta">
                    {reference.publicationNumber} · {reference.publicationDate}
                  </span>
                </button>
              </li>
            ))}
            {!filteredReferences.length && (
              <li><p className="rationale">No reference cards match that search.</p></li>
            )}
          </ul>
        )}
      </div>
    </aside>
  );
}
