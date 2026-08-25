// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LifecycleStepper, lifecycleStageForPhase } from "./LifecycleStepper.jsx";

afterEach(cleanup);

describe("LifecycleStepper", () => {
  it("maps all workflow phases onto the six visible lifecycle stages", () => {
    expect(lifecycleStageForPhase("briefing").id).toBe("disclosure");
    expect(lifecycleStageForPhase("preflight").id).toBe("draft");
    expect(lifecycleStageForPhase("office-action").id).toBe("examination");
    expect(lifecycleStageForPhase("final-action").id).toBe("amendment");
    expect(lifecycleStageForPhase("competitor-result").id).toBe("design-around");
    expect(lifecycleStageForPhase("debrief").id).toBe("debrief");
  });

  it("permits review of completed stages but never makes locked stages clickable", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<LifecycleStepper currentPhase="response" onNavigate={onNavigate} />);

    expect(screen.getByLabelText("Amendment, active")).toHaveAttribute("aria-current", "step");
    expect(screen.getByLabelText("Design-around, locked")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByLabelText("Debrief, locked").closest("button")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Draft, complete" }));
    expect(onNavigate).toHaveBeenCalledWith(
      "draft",
      expect.objectContaining({ label: "Draft" }),
    );
    expect(screen.queryByRole("button", { name: "Design-around, locked" })).not.toBeInTheDocument();
    expect(
      (await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })).violations,
    ).toEqual([]);
  });
});
