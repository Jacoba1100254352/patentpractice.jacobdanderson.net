import { useEffect, useRef } from "react";

export const QUICK_TOUR_STEPS = Object.freeze([
  Object.freeze({
    title: "Begin with the disclosure",
    body:
      "Read the technical problem, disclosed improvement, supported alternatives, and commercial objective before deciding what belongs in the independent claim.",
    detail:
      "The selected mode controls how much guidance and prior-art information is visible. It does not change the educational boundary.",
  }),
  Object.freeze({
    title: "Draft from the center workspace",
    body:
      "Use the evidence rail to inspect disclosure support and available references. Use the inspector to review introduced terms, support anchors, and mechanical findings.",
    detail:
      "Ghost prompts teach claim structure only. They do not contain the hidden model answer.",
  }),
  Object.freeze({
    title: "Commit before seeing the result",
    body:
      "Run mechanical preflight, resolve blockers, and submit the claim set you are prepared to defend. The submitted snapshot is then preserved for comparison.",
    detail:
      "You receive one bounded amendment or argument round after the simulated Office Action.",
  }),
  Object.freeze({
    title: "Predict, then debrief",
    body:
      "Map the fictional competitor to your amended claim before revealing the configured result. The debrief then evaluates the portfolio within this fixed challenge record.",
    detail:
      "Your attempt saves in this browser. You can export it as JSON or print the player-facing packets unlocked so far.",
  }),
]);

export function FirstUseGuide({ onStartTour, onDismiss }) {
  return (
    <section className="first-use-guide" aria-labelledby="first-use-guide-title">
      <div>
        <p className="stage-kicker">First visit</p>
        <h2 id="first-use-guide-title">New to ScopeCraft?</h2>
        <p>Take a short tour of the drafting, prosecution, prediction, and debrief flow.</p>
      </div>
      <div className="first-use-actions">
        <button type="button" className="secondary-button" onClick={onStartTour}>
          Take the 2-minute tour
        </button>
        <button type="button" className="quiet-button" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </section>
  );
}

export function GuidedTourStep({ step = 0 }) {
  const safeStep = Math.min(Math.max(Number(step) || 0, 0), QUICK_TOUR_STEPS.length - 1);
  const record = QUICK_TOUR_STEPS[safeStep];
  const headingRef = useRef(null);

  useEffect(() => {
    const focusHeading = () => headingRef.current?.focus({ preventScroll: true });
    const frame = typeof globalThis.requestAnimationFrame === "function"
      ? globalThis.requestAnimationFrame(focusHeading)
      : globalThis.setTimeout(focusHeading, 0);
    return () => {
      if (typeof globalThis.cancelAnimationFrame === "function") {
        globalThis.cancelAnimationFrame(frame);
      } else {
        globalThis.clearTimeout(frame);
      }
    };
  }, [safeStep]);

  return (
    <section className="guided-tour-step" aria-labelledby="guided-tour-step-title">
      <p className="tour-progress" aria-live="polite">
        Step {safeStep + 1} of {QUICK_TOUR_STEPS.length}
      </p>
      <h3 id="guided-tour-step-title" ref={headingRef} tabIndex={-1}>
        {record.title}
      </h3>
      <p>{record.body}</p>
      <div className="modal-callout">
        <strong>Keep in mind</strong>
        <p>{record.detail}</p>
      </div>
    </section>
  );
}
