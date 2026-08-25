// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App.jsx";

vi.mock("./persistence/attemptStore.js", () => ({
  createAttemptStore: () => ({
    backend: vi.fn().mockResolvedValue("memory"),
    list: vi.fn().mockResolvedValue([]),
    save: vi.fn().mockImplementation(async (attempt) => attempt),
  }),
  exportAttemptState: vi.fn(() => "{}"),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function expectNoAxeViolations(container) {
  const result = await axe.run(container, {
    rules: {
      "color-contrast": { enabled: false },
    },
  });
  expect(result.violations).toEqual([]);
}

describe("ScopeCraft playable application", () => {
  it("completes the Practitioner prosecution and competitor loop without leaking hidden data", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await screen.findByText("Saved locally");
    expect(screen.getByRole("heading", { name: "Pressure-History Adaptive Mouse" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Practitioner/u })).toBeChecked();

    // The Practitioner briefing uses only the player-facing challenge export.
    expect(screen.queryByRole("heading", { name: "Must-cover embodiments" })).not.toBeInTheDocument();
    expect(screen.queryByText(/strain-gauged scroll wheel and on-device learning/iu)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/while retaining a second mapping value associated with a second pressure interval/iu),
    ).not.toBeInTheDocument();
    await expectNoAxeViolations(container);

    await user.click(screen.getByRole("button", { name: "Start drafting" }));

    const editor = await screen.findByRole("region", { name: "Structured claim editor" });
    const evidenceRail = screen.getByRole("complementary", {
      name: "Invention and prior-art evidence",
    });
    const inspectorRail = screen.getByRole("complementary", {
      name: "Claim inspector and preflight",
    });
    expect(within(editor).getByRole("button", { name: /Claim 1.*Independent/iu })).toBeInTheDocument();
    expect(within(evidenceRail).getByRole("tab", { name: "Disclosure" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(within(inspectorRail).getByRole("heading", { name: /Preflight/iu })).toBeInTheDocument();
    expect(screen.queryByText(/strain-gauged scroll wheel and on-device learning/iu)).not.toBeInTheDocument();
    await expectNoAxeViolations(container);

    await user.click(screen.getByRole("button", { name: /Run preflight/iu }));
    const submitApplication = await screen.findByRole("button", {
      name: /Submit for examination/iu,
    });
    await waitFor(() => expect(submitApplication).toBeEnabled());
    expect(screen.getAllByText(/0 blockers/iu).length).toBeGreaterThan(0);

    await user.click(submitApplication);
    expect(
      await screen.findByRole("heading", { level: 1, name: "First examination" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(/simulated Office Action based only on the frozen challenge record/iu)
        .length,
    ).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Challenge mapping" }));
    const mappingDialog = await screen.findByRole("dialog", { name: "Challenge a mapping" });
    await user.click(
      within(mappingDialog).getByRole("radio", {
        name: /configured mapping should be withdrawn/iu,
      }),
    );
    await user.click(within(mappingDialog).getByRole("button", { name: "Submit challenge" }));
    expect(
      within(mappingDialog).getByText(/challenge matches the configured ruling/iu),
    ).toBeInTheDocument();
    await user.click(within(mappingDialog).getByRole("button", { name: "Return to the record" }));

    await user.click(screen.getByRole("button", { name: /Prepare response/iu }));
    expect(await screen.findByRole("heading", { name: "Amendment and response" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Promote claims 3 and 4" }));
    expect(
      await screen.findByText(/limitations already written in claims 3 and 4 were copied into claim 1/iu),
    ).toBeInTheDocument();

    const reviewResponse = screen.getByRole("button", { name: /Review response/iu });
    await waitFor(() => expect(reviewResponse).toBeEnabled());
    await user.click(reviewResponse);
    const reviewDialog = await screen.findByRole("dialog", {
      name: "Review the amended claim set",
    });
    expect(within(reviewDialog).getByRole("heading", { name: "Submitted claims" })).toBeInTheDocument();
    expect(within(reviewDialog).getByRole("heading", { name: "Proposed response" })).toBeInTheDocument();
    await user.click(within(reviewDialog).getByRole("button", { name: "Submit one response" }));

    expect(
      await screen.findByRole("heading", {
        name: /The amended claim survives this record|The record still presents a challenge/iu,
      }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Test a design-around" }));

    expect(
      await screen.findByRole("heading", { name: "Can the competitor avoid the claim?" }),
    ).toBeInTheDocument();
    const firstMappedPrediction = screen.getAllByRole("button", { name: "mapped" })[0];
    await user.click(firstMappedPrediction);
    expect(firstMappedPrediction).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Reveal mapping" }));

    expect(await screen.findByRole("heading", { name: "Compare your prediction" })).toBeInTheDocument();
    expect(screen.getAllByText(/not a noninfringement opinion/iu).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Open debrief" }));

    expect(
      await screen.findByRole("heading", { name: "Your claim strategy, explained" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/limited to the ScopeCraft challenge record/iu)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Portfolio score" })).toBeInTheDocument();
  });
});
