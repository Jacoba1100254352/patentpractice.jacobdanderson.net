// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { FirstUseGuide, GuidedTourStep } from "./GuidedTour.jsx";

afterEach(cleanup);

describe("quick-tour components", () => {
  it("provides an explicitly labelled first-use entry", () => {
    render(<FirstUseGuide />);
    expect(screen.getByRole("region", { name: "New to ScopeCraft?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Take the 2-minute tour" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
  });

  it("moves focus to the current step heading when the step changes", async () => {
    const { rerender } = render(<GuidedTourStep step={0} />);
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Begin with the disclosure" })).toHaveFocus(),
    );
    rerender(<GuidedTourStep step={1} />);
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Draft from the center workspace" })).toHaveFocus(),
    );
    expect(screen.getByText("Step 2 of 4")).toHaveAttribute("aria-live", "polite");
  });
});
