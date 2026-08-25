import { Check, LockSimple } from "@phosphor-icons/react";

export const LIFECYCLE_STAGES = Object.freeze([
  { id: "disclosure", label: "Disclosure", phases: ["briefing"] },
  { id: "draft", label: "Draft", phases: ["drafting", "preflight"] },
  { id: "examination", label: "Examination", phases: ["office-action"] },
  { id: "amendment", label: "Amendment", phases: ["response", "final-action"] },
  {
    id: "design-around",
    label: "Design-around",
    phases: ["competitor-prediction", "competitor-result"],
  },
  { id: "debrief", label: "Debrief", phases: ["debrief"] },
]);

export function lifecycleStageForPhase(phase) {
  return LIFECYCLE_STAGES.find((stage) => stage.phases.includes(phase)) ?? null;
}

export function LifecycleStepper({
  currentPhase,
  onNavigate,
  allowCompletedNavigation = true,
  ariaLabel = "Challenge lifecycle",
}) {
  const activeStage = lifecycleStageForPhase(currentPhase);
  const activeIndex = activeStage
    ? LIFECYCLE_STAGES.findIndex((stage) => stage.id === activeStage.id)
    : 0;

  return (
    <nav aria-label={ariaLabel} className="lifecycle" data-current-phase={currentPhase}>
      <ol style={{ display: "contents" }}>
        {LIFECYCLE_STAGES.map((stage, index) => {
          const state = index < activeIndex ? "complete" : index === activeIndex ? "active" : "locked";
          const accessibleLabel = `${stage.label}, ${state}`;
          const marker = (
            <span aria-hidden="true" className="step-marker">
              {state === "complete" ? (
                <Check size={11} weight="bold" />
              ) : state === "locked" ? (
                <LockSimple size={9} weight="bold" />
              ) : (
                index + 1
              )}
            </span>
          );
          const contents = (
            <>
              {marker}
              <span aria-hidden="true">{stage.label}</span>
            </>
          );

          return (
            <li key={stage.id} style={{ display: "contents" }}>
              {state === "complete" && allowCompletedNavigation && onNavigate ? (
                <button
                  aria-label={accessibleLabel}
                  className="lifecycle-step"
                  data-stage={stage.id}
                  data-state={state}
                  onClick={() => onNavigate(stage.id, stage)}
                  title={`Review ${stage.label}`}
                  type="button"
                >
                  {contents}
                </button>
              ) : (
                <span
                  aria-current={state === "active" ? "step" : undefined}
                  aria-disabled={state === "locked" ? "true" : undefined}
                  aria-label={accessibleLabel}
                  className="lifecycle-step"
                  data-stage={stage.id}
                  data-state={state}
                  role="group"
                  title={state === "locked" ? `${stage.label} is locked` : stage.label}
                >
                  {contents}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
