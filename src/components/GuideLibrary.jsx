import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckSquare,
  ClipboardText,
  DownloadSimple,
  MagnifyingGlass,
} from "@phosphor-icons/react";

import {
  getGuideBySlug,
  guideCategories,
  guideHref,
  guides,
} from "../guides/catalog.js";

const GUIDE_INDEX_PATH = "/guides/";
const DOWNLOAD_PATH = "/downloads/patent-drafting-practice-library-expanded.zip";

function normalizePathname(pathname) {
  const path = String(pathname || GUIDE_INDEX_PATH).split(/[?#]/u, 1)[0];
  if (path === "/" || !path) return path || "/";
  return path.replace(/\/+$/u, "") || "/";
}

function routeForPathname(pathname) {
  const path = normalizePathname(pathname);
  if (path === GUIDE_INDEX_PATH.slice(0, -1)) return { kind: "hub", slug: null };
  const match = path.match(/^\/guides\/([^/]+)$/u);
  if (!match) return { kind: "not-found", slug: null };

  try {
    return { kind: "article", slug: decodeURIComponent(match[1]) };
  } catch {
    return { kind: "not-found", slug: null };
  }
}

function categoryRecord(category) {
  if (typeof category === "string") {
    return { id: category, label: category, description: "" };
  }

  return {
    id: category?.id ?? category?.slug ?? category?.label ?? category?.title ?? "uncategorized",
    label: category?.label ?? category?.title ?? category?.id ?? "Other guides",
    description: category?.description ?? "",
  };
}

function normalizedCategories() {
  const source = Array.isArray(guideCategories)
    ? guideCategories
    : Object.entries(guideCategories ?? {}).map(([id, value]) => (
        typeof value === "string" ? { id, label: value } : { id, ...value }
      ));
  const records = source.map(categoryRecord);
  const known = new Set(records.map((category) => category.id));

  for (const guide of guides) {
    const category = categoryRecord(guide.category);
    if (!known.has(category.id)) {
      records.push(category);
      known.add(category.id);
    }
  }

  return records;
}

function guideCategoryId(guide) {
  return categoryRecord(guide.category).id;
}

function titleForCategory(categoryId, categories) {
  return categories.find((category) => category.id === categoryId)?.label ?? categoryId;
}

function hrefForGuide(guide) {
  return guideHref(guide.slug);
}

function AppLink({ href, onNavigate, onClick, children, ...props }) {
  const handleClick = (event) => {
    onClick?.(event);
    if (
      !onNavigate ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    onNavigate(href);
  };

  return (
    <a href={href} onClick={handleClick} {...props}>
      {children}
    </a>
  );
}

function BackToPracticeLink({ onBackToPractice, onNavigate, className = "guide-back-practice" }) {
  const handleClick = (event) => {
    if (!onBackToPractice) return;
    event.preventDefault();
    onBackToPractice();
  };

  return (
    <AppLink
      className={className}
      href="/"
      onClick={handleClick}
      onNavigate={onBackToPractice ? undefined : onNavigate}
    >
      <ArrowLeft aria-hidden="true" size={16} />
      Back to practice
    </AppLink>
  );
}

function itemText(item) {
  if (item == null) return "";
  if (["string", "number"].includes(typeof item)) return String(item);
  if (Array.isArray(item)) return item.map(itemText).filter(Boolean).join(" ");
  return item.text ?? item.body ?? item.description ?? item.explanation ?? item.value ?? item.label ?? item.title ?? item.prompt ?? "";
}

function ItemContent({ item }) {
  if (item == null || typeof item !== "object" || Array.isArray(item)) {
    return <>{itemText(item)}</>;
  }

  const heading = item.title ?? item.label ?? item.term;
  const body = item.text ?? item.body ?? item.description ?? item.explanation ?? item.value ?? item.prompt;
  return (
    <>
      {heading ? <strong>{heading}</strong> : null}
      {heading && body ? " " : null}
      {body ? <span>{body}</span> : null}
    </>
  );
}

function TextList({ items, ordered = false, className }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const List = ordered ? "ol" : "ul";
  return (
    <List className={className}>
      {items.map((item, index) => (
        <li key={item?.id ?? item?.title ?? item?.label ?? `${itemText(item)}-${index}`}>
          <ItemContent item={item} />
        </li>
      ))}
    </List>
  );
}

function Paragraphs({ items }) {
  const paragraphs = Array.isArray(items) ? items : items ? [items] : [];
  return paragraphs.map((paragraph, index) => (
    <p key={paragraph?.id ?? `${itemText(paragraph)}-${index}`}>
      <ItemContent item={paragraph} />
    </p>
  ));
}

function DetailBlock({ value, kind }) {
  if (!value) return null;
  const record = typeof value === "object" && !Array.isArray(value) ? value : {};
  const defaultTitle = kind === "example" ? "Example" : "Practice note";
  const title = record.title ?? record.label ?? defaultTitle;
  const body = record.paragraphs ?? record.body ?? record.text ?? (typeof value === "string" ? value : null);
  const before = record.before ?? record.avoid;
  const after = record.after ?? record.prefer;
  const list = record.bullets ?? record.items ?? record.notes;

  return (
    <aside className={`guide-detail guide-${kind}`} data-tone={record.tone}>
      <h3>{title}</h3>
      <Paragraphs items={body} />
      {before || after ? (
        <dl className="guide-comparison">
          {before ? (
            <div>
              <dt>{record.beforeLabel ?? "Before"}</dt>
              <dd>{itemText(before)}</dd>
            </div>
          ) : null}
          {after ? (
            <div>
              <dt>{record.afterLabel ?? "After"}</dt>
              <dd>{itemText(after)}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      <TextList items={list} />
    </aside>
  );
}

function TableBlock({ table }) {
  if (!table) return null;
  const record = Array.isArray(table) ? { rows: table } : table;
  const columns = record.columns ?? record.headers ?? [];
  const headers = columns.map((column) => (
    typeof column === "string" ? column : column.label ?? column.title ?? column.id
  ));
  const columnKeys = columns.map((column, index) => (
    typeof column === "string" ? column : column.id ?? column.key ?? index
  ));
  const rows = record.rows ?? [];

  return (
    <div className="guide-table-wrap" tabIndex="0" role="region" aria-label={record.caption ?? record.title ?? "Guide reference table"}>
      <table className="guide-table">
        <caption>{record.caption ?? record.title ?? "Guide reference table"}</caption>
        {headers.length ? (
          <thead>
            <tr>{headers.map((header, index) => <th key={`${header}-${index}`} scope="col">{header}</th>)}</tr>
          </thead>
        ) : null}
        <tbody>
          {rows.map((row, rowIndex) => {
            const cells = Array.isArray(row)
              ? row
              : columnKeys.length
                ? columnKeys.map((key) => row?.[key])
                : Object.values(row ?? {});
            return (
              <tr key={row?.id ?? `row-${rowIndex}`}>
                {cells.map((cell, cellIndex) => {
                  const Cell = cellIndex === 0 ? "th" : "td";
                  return (
                    <Cell key={`${itemText(cell)}-${cellIndex}`} scope={cellIndex === 0 ? "row" : undefined}>
                      <ItemContent item={cell} />
                    </Cell>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function WorksheetBlock({ worksheet, sectionId }) {
  if (!worksheet) return null;
  const record = typeof worksheet === "object" && !Array.isArray(worksheet)
    ? worksheet
    : { items: Array.isArray(worksheet) ? worksheet : [worksheet] };
  const prompts = record.prompts ?? record.fields ?? record.items ?? record.steps ?? [];

  return (
    <section className="guide-worksheet" aria-labelledby={`${sectionId}-worksheet-title`}>
      <h3 id={`${sectionId}-worksheet-title`}>{record.title ?? "Try it yourself"}</h3>
      <Paragraphs items={record.introduction ?? record.description ?? record.text} />
      <TextList items={prompts} ordered />
      {record.template ? <pre className="guide-template"><code>{itemText(record.template)}</code></pre> : null}
    </section>
  );
}

function GuideSection({ section }) {
  return (
    <section className="guide-article-section" aria-labelledby={section.id}>
      {section.label ? <p className="guide-section-label">{section.label}</p> : null}
      <h2 id={section.id}>{section.title}</h2>
      <Paragraphs items={section.paragraphs} />
      <TextList className="guide-steps" items={section.steps} ordered />
      <TextList className="guide-bullets" items={section.bullets} />
      <DetailBlock kind="example" value={section.example} />
      <TableBlock table={section.table} />
      <DetailBlock kind="callout" value={section.callout} />
      <WorksheetBlock sectionId={section.id} worksheet={section.worksheet} />
    </section>
  );
}

function GuideCard({ guide, categories, onNavigate }) {
  return (
    <article className="guide-card">
      <p className="guide-card-meta">
        {titleForCategory(guideCategoryId(guide), categories)} · {guide.readingTime}
      </p>
      <h3>
        <AppLink href={hrefForGuide(guide)} onNavigate={onNavigate}>{guide.title}</AppLink>
      </h3>
      <p>{guide.description}</p>
      <AppLink className="guide-card-link" href={hrefForGuide(guide)} onNavigate={onNavigate}>
        Open guide <ArrowRight aria-hidden="true" size={15} />
      </AppLink>
    </article>
  );
}

function GuideHub({ headingRef, onNavigate, onBackToPractice }) {
  const categories = useMemo(normalizedCategories, []);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const resultsHeadingRef = useRef(null);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredGuides = useMemo(() => guides.filter((guide) => {
    if (categoryId !== "all" && guideCategoryId(guide) !== categoryId) return false;
    if (!normalizedQuery) return true;
    const searchable = [
      guide.title,
      guide.shortTitle,
      guide.description,
      guide.takeaway,
      guide.useWhen?.map(itemText).join(" "),
      guide.checklist?.map(itemText).join(" "),
      JSON.stringify(guide.sections ?? []),
      titleForCategory(guideCategoryId(guide), categories),
    ].filter(Boolean).join(" ").toLocaleLowerCase();
    return searchable.includes(normalizedQuery);
  }), [categories, categoryId, normalizedQuery]);

  const selectTaskRoute = (event, nextCategoryId) => {
    setCategoryId(nextCategoryId);
    setQuery("");
    globalThis.requestAnimationFrame?.(() => resultsHeadingRef.current?.focus());
  };

  const clearFilters = () => {
    setCategoryId("all");
    setQuery("");
  };

  return (
    <div className="guide-library guide-hub-page">
      <a className="guide-skip-link" href="#guide-main">Skip to guide library</a>

      <div id="guide-main" className="guide-main guide-hub-main">
        <section className="guide-hero" aria-labelledby="guide-hub-title">
          <p className="guide-eyebrow"><BookOpen aria-hidden="true" size={18} /> Patent practice library</p>
          <h1 id="guide-hub-title" ref={headingRef} tabIndex="-1">Practical patent-drafting guides</h1>
          <p>Start with the task in front of you, get the short answer first, and open deeper explanations only when you need them.</p>
          <div className="guide-hero-actions">
            <a className="guide-download-button" href={DOWNLOAD_PATH} download>
              <DownloadSimple aria-hidden="true" size={17} />
              Download the expanded practice library
            </a>
            <BackToPracticeLink
              className="guide-back-practice guide-hero-back"
              onBackToPractice={onBackToPractice}
              onNavigate={onNavigate}
            />
          </div>
        </section>

        <aside className="guide-scope-note" aria-label="Guide scope">
          <strong>Scope: educational U.S. utility-patent practice</strong>
          <p>Official baselines, USPTO procedure, practice suggestions, cautions, and examples are labeled separately. These guides are not matter-specific legal advice.</p>
        </aside>

        <nav className="guide-task-routes" aria-labelledby="task-routes-title">
          <div className="guide-section-heading">
            <p className="guide-eyebrow">Choose a route</p>
            <h2 id="task-routes-title">What are you working on?</h2>
          </div>
          <div className="guide-task-grid">
            {categories.map((category) => {
              const count = guides.filter((guide) => guideCategoryId(guide) === category.id).length;
              return (
                <a
                  href="#guide-results"
                  key={category.id}
                  onClick={(event) => selectTaskRoute(event, category.id)}
                >
                  <strong>{category.label}</strong>
                  <span>{category.description || `${count} ${count === 1 ? "guide" : "guides"}`}</span>
                  <ArrowRight aria-hidden="true" size={15} />
                </a>
              );
            })}
          </div>
        </nav>

        <section className="guide-catalog" aria-labelledby="guide-results">
          <div className="guide-section-heading">
            <p className="guide-eyebrow">Browse and search</p>
            <h2 id="guide-results" ref={resultsHeadingRef} tabIndex="-1">Guide library</h2>
          </div>

          <div className="guide-search-controls">
            <label className="guide-search-field">
              <span>Search the guides</span>
              <span className="guide-search-input">
                <MagnifyingGlass aria-hidden="true" size={17} />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Try dependent claims, summary, or drafting language"
                />
              </span>
            </label>

            <div className="guide-category-filters" aria-label="Filter guides by category" role="group">
              <button type="button" aria-pressed={categoryId === "all"} onClick={() => setCategoryId("all")}>All guides</button>
              {categories.map((category) => (
                <button
                  type="button"
                  aria-pressed={categoryId === category.id}
                  key={category.id}
                  onClick={() => setCategoryId(category.id)}
                >
                  {category.label}
                </button>
              ))}
            </div>
          </div>

          <p className="guide-result-count" role="status" aria-live="polite">
            {filteredGuides.length} {filteredGuides.length === 1 ? "guide" : "guides"} shown
          </p>

          {filteredGuides.length ? (
            <div className="guide-card-grid">
              {filteredGuides.map((guide) => (
                <GuideCard categories={categories} guide={guide} key={guide.slug} onNavigate={onNavigate} />
              ))}
            </div>
          ) : (
            <div className="guide-empty-state" role="status">
              <h3>No guides match those filters</h3>
              <p>Try a broader search or return to the full library.</p>
              <button type="button" onClick={clearFilters}>Clear search and filters</button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function sourceRecord(source) {
  if (typeof source === "string") return { label: source, url: null, note: null };
  return {
    label: source?.label ?? source?.title ?? source?.url ?? "Official source",
    url: source?.url ?? source?.href ?? null,
    note: source?.note ?? source?.description ?? null,
  };
}

async function copyWithFallback(text) {
  try {
    if (globalThis.navigator?.clipboard?.writeText) {
      await globalThis.navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Continue to the local selection-based fallback.
  }

  if (!globalThis.document?.body) return false;
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.append(field);
  field.select();
  let copied = false;
  try {
    copied = Boolean(document.execCommand?.("copy"));
  } catch {
    copied = false;
  }
  field.remove();
  return copied;
}

function GuideArticle({ guide, headingRef, onNavigate, onBackToPractice }) {
  const [copyStatus, setCopyStatus] = useState("");
  const categories = useMemo(normalizedCategories, []);
  const relatedGuides = (guide.related ?? []).map((related) => (
    typeof related === "string" ? getGuideBySlug(related) : getGuideBySlug(related.slug)
  )).filter(Boolean);
  const checklistText = [
    `${guide.title} checklist`,
    ...(guide.checklist ?? []).map((item, index) => `${index + 1}. ${itemText(item)}`),
  ].join("\n");

  useEffect(() => {
    setCopyStatus("");
  }, [guide.slug]);

  const copyChecklist = async () => {
    const copied = await copyWithFallback(checklistText);
    setCopyStatus(copied
      ? "Checklist copied to the clipboard."
      : "Automatic copying is unavailable. Select the checklist below to copy it manually.");
  };

  return (
    <div className="guide-library guide-article-page">
      <a className="guide-skip-link" href="#guide-article">Skip to guide</a>

      <div id="guide-article" className="guide-main guide-article-layout">
        <article className="guide-article">
          <AppLink className="guide-back-link" href={GUIDE_INDEX_PATH} onNavigate={onNavigate}>
            <ArrowLeft aria-hidden="true" size={15} /> Back to all guides
          </AppLink>

          <header className="guide-article-header">
            <p className="guide-eyebrow">
              {titleForCategory(guideCategoryId(guide), categories)} · {guide.readingTime}
            </p>
            <h1 ref={headingRef} tabIndex="-1">{guide.title}</h1>
            <p className="guide-description">{guide.description}</p>
            <p className="guide-scope-inline">Educational U.S. utility-patent practice · Not matter-specific legal advice</p>
          </header>

          <section className="guide-takeaway" aria-labelledby="guide-takeaway-title">
            <p className="guide-section-label">30-second takeaway</p>
            <h2 id="guide-takeaway-title">The short answer</h2>
            <p>{guide.takeaway}</p>
          </section>

          <section className="guide-use-when" aria-labelledby="guide-use-when-title">
            <h2 id="guide-use-when-title">Use this guide when</h2>
            <TextList items={guide.useWhen} />
          </section>

          {guide.sections?.length ? (
            <nav className="guide-on-this-page" aria-labelledby="guide-toc-title">
              <h2 id="guide-toc-title">On this page</h2>
              <ol>
                {guide.sections.map((section) => (
                  <li key={section.id}><a href={`#${section.id}`}>{section.title}</a></li>
                ))}
              </ol>
            </nav>
          ) : null}

          <div className="guide-article-sections">
            {guide.sections?.map((section) => <GuideSection key={section.id} section={section} />)}
          </div>

          <section className="guide-checklist" aria-labelledby="guide-checklist-title">
            <div className="guide-checklist-heading">
              <div>
                <p className="guide-section-label">Quick reference</p>
                <h2 id="guide-checklist-title">Final checklist</h2>
              </div>
              <button type="button" onClick={copyChecklist} disabled={!guide.checklist?.length}>
                <ClipboardText aria-hidden="true" size={16} /> Copy checklist
              </button>
            </div>
            <TextList className="guide-checklist-list" items={guide.checklist} />
            <p className="guide-copy-status" role="status" aria-live="polite">{copyStatus}</p>
          </section>

          <section className="guide-sources" aria-labelledby="guide-sources-title">
            <h2 id="guide-sources-title">Official sources</h2>
            {guide.sources?.length ? (
              <ul>
                {guide.sources.map((source, index) => {
                  const record = sourceRecord(source);
                  return (
                    <li key={record.url ?? `${record.label}-${index}`}>
                      {record.url ? (
                        <a href={record.url} target="_blank" rel="noreferrer">{record.label}</a>
                      ) : <span>{record.label}</span>}
                      {record.note ? <p>{record.note}</p> : null}
                    </li>
                  );
                })}
              </ul>
            ) : <p>No external sources are listed for this guide.</p>}
          </section>

          {relatedGuides.length ? (
            <section className="guide-related" aria-labelledby="guide-related-title">
              <h2 id="guide-related-title">Related guides</h2>
              <div className="guide-related-grid">
                {relatedGuides.map((relatedGuide) => (
                  <GuideCard categories={categories} guide={relatedGuide} key={relatedGuide.slug} onNavigate={onNavigate} />
                ))}
              </div>
            </section>
          ) : null}

          <footer className="guide-article-footer">
            <CheckSquare aria-hidden="true" size={20} />
            <div>
              <strong>Ready to apply it?</strong>
              <p>Return to ScopeCraft and use the checklist while you draft.</p>
            </div>
            <BackToPracticeLink onBackToPractice={onBackToPractice} onNavigate={onNavigate} />
          </footer>
        </article>
      </div>
    </div>
  );
}

function GuideNotFound({ headingRef, onNavigate, onBackToPractice }) {
  return (
    <div className="guide-library guide-not-found-page">
      <section className="guide-main guide-not-found" id="guide-main" aria-labelledby="guide-not-found-title">
        <p className="guide-eyebrow">Guide library</p>
        <h1 id="guide-not-found-title" ref={headingRef} tabIndex="-1">Guide not found</h1>
        <p>The requested guide is not part of the current practice library.</p>
        <AppLink className="guide-primary-link" href={GUIDE_INDEX_PATH} onNavigate={onNavigate}>
          Browse all guides <ArrowRight aria-hidden="true" size={15} />
        </AppLink>
        <BackToPracticeLink onBackToPractice={onBackToPractice} onNavigate={onNavigate} />
      </section>
    </div>
  );
}

export function GuideLibrary({ pathname = GUIDE_INDEX_PATH, onNavigate, onBackToPractice }) {
  const headingRef = useRef(null);
  const route = useMemo(() => routeForPathname(pathname), [pathname]);
  const guide = route.kind === "article" ? getGuideBySlug(route.slug) : null;

  useEffect(() => {
    headingRef.current?.focus();
  }, [pathname]);

  if (route.kind === "hub") {
    return <GuideHub headingRef={headingRef} onBackToPractice={onBackToPractice} onNavigate={onNavigate} />;
  }
  if (route.kind === "article" && guide) {
    return <GuideArticle guide={guide} headingRef={headingRef} onBackToPractice={onBackToPractice} onNavigate={onNavigate} />;
  }
  return <GuideNotFound headingRef={headingRef} onBackToPractice={onBackToPractice} onNavigate={onNavigate} />;
}
