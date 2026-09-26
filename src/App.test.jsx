// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App.jsx";
import { challenge01ContentDigest, challenge01PlayerFacing } from "./challenges/index.js";
import { createStarterClaimSet } from "./domain/sessionModel.js";
import { ACTION_TYPES, attemptReducer, createAttemptState } from "./domain/workflow.js";
import { engineCompatibility } from "./engine/generated/compatibility.generated.js";

const persistenceMocks = vi.hoisted(() => ({
  clearAttempts: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(true),
  list: vi.fn().mockResolvedValue([]),
  save: vi.fn().mockImplementation(async (attempt) => attempt),
}));

vi.mock("./persistence/attemptStore.js", () => ({
  createAttemptStore: () => ({
    backend: vi.fn().mockResolvedValue("memory"),
    clearAttempts: persistenceMocks.clearAttempts,
    delete: persistenceMocks.delete,
    list: persistenceMocks.list,
    save: persistenceMocks.save,
  }),
  exportAttemptState: vi.fn(() => "{}"),
}));

afterEach(() => {
  cleanup();
  globalThis.history.replaceState(null, "", "/");
  globalThis.localStorage?.clear?.();
  persistenceMocks.list.mockReset().mockResolvedValue([]);
  persistenceMocks.delete.mockReset().mockResolvedValue(true);
  persistenceMocks.clearAttempts.mockReset().mockResolvedValue(undefined);
  persistenceMocks.save.mockReset().mockImplementation(async (attempt) => attempt);
  vi.clearAllMocks();
});

function savedDraftingAttempt(modeId, attemptId, secretText = null) {
  const initialDraft = { claims: createStarterClaimSet().claims, notes: "" };
  if (secretText) initialDraft.claims[0].limitations[0].text = secretText;
  const created = createAttemptState({
    attemptId,
    challengeId: challenge01PlayerFacing.challengeId,
    challengeVersion: challenge01PlayerFacing.contentVersion,
    challengeHash: challenge01ContentDigest,
    engineVersion: engineCompatibility.version,
    engineHash: engineCompatibility.hash,
    difficulty: modeId,
    mappingChallenges: [],
    initialDraft,
    now: "2026-08-27T12:00:00.000Z",
  });
  return attemptReducer(created, {
    type: ACTION_TYPES.START_DRAFTING,
    meta: { now: "2026-08-27T12:01:00.000Z" },
  });
}

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
  }, 15_000);

  it("opens a guide directly and marks Guides as the active tool", async () => {
    globalThis.history.replaceState(null, "", "/guides/dependent-claims");
    const { container } = render(<App />);

    expect(
      await screen.findByRole("heading", { level: 1, name: /Dependent claims/iu }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guides" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("heading", { name: "Pressure-History Adaptive Mouse" })).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("returns from Guides without losing the active claim draft", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("Saved locally");
    await user.click(screen.getByRole("button", { name: "Start drafting" }));
    const limitation = await screen.findByLabelText("Claim 1, limitation 1");
    await user.clear(limitation);
    await user.type(limitation, "a pressure sensor producing a pressure signal");

    await user.click(screen.getAllByRole("button", { name: "Guides" })[0]);
    expect(globalThis.location.pathname).toBe("/guides/");
    expect(await screen.findByRole("heading", { level: 1, name: "Practical patent-drafting guides" })).toBeInTheDocument();

    await user.click(screen.getAllByRole("link", { name: "Back to practice" })[0]);
    expect(globalThis.location.pathname).toBe("/");
    expect(await screen.findByDisplayValue("a pressure sensor producing a pressure signal")).toBeInTheDocument();
  });

  it("never exposes or resumes a saved claim draft until the user explicitly selects it", async () => {
    const user = userEvent.setup();
    const confidentialClaimText = "a confidential unreleased pressure sensor arrangement";
    persistenceMocks.list.mockResolvedValue([
      savedDraftingAttempt("examiner", "saved-examiner"),
      savedDraftingAttempt("guided", "saved-guided", confidentialClaimText),
    ]);
    globalThis.history.replaceState(
      null,
      "",
      "/?challenge=pressure-history-adaptive-mouse&mode=guided",
    );

    render(<App />);

    expect(await screen.findByRole("button", { name: "Saved drafts (2)" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Structured claim editor" })).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue(confidentialClaimText)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Saved drafts (2)" }));
    const savedDrafts = await screen.findByRole("dialog", { name: "Saved drafts" });
    expect(within(savedDrafts).queryByText(confidentialClaimText)).not.toBeInTheDocument();
    expect(within(savedDrafts).getByRole("button", { name: "Resume saved-examiner" })).toBeDisabled();
    await user.click(within(savedDrafts).getByRole("button", { name: "Resume saved-guided" }));

    expect(await screen.findByRole("region", { name: "Structured claim editor" })).toBeInTheDocument();
    expect(screen.getByDisplayValue(confidentialClaimText)).toBeInTheDocument();
    expect(await screen.findByText(/selected saved draft is now open/iu)).toBeInTheDocument();
  });

  it("deletes saved browser drafts explicitly and switches an open deleted draft to session-only", async () => {
    const user = userEvent.setup();
    const saved = savedDraftingAttempt("practitioner", "saved-current");
    persistenceMocks.list.mockResolvedValue([saved]);
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Saved drafts (1)" }));
    let dialog = await screen.findByRole("dialog", { name: "Saved drafts" });
    await user.click(within(dialog).getByRole("button", { name: "Resume saved-current" }));
    await user.click(screen.getByRole("button", { name: "Saved drafts (1)" }));
    dialog = await screen.findByRole("dialog", { name: "Saved drafts" });
    await user.click(within(dialog).getByRole("button", { name: "Delete saved-current" }));
    const confirmation = await screen.findByRole("dialog", { name: "Delete saved draft?" });
    await user.click(within(confirmation).getByRole("button", { name: "Delete saved draft" }));

    await waitFor(() => expect(persistenceMocks.delete).toHaveBeenCalledWith("saved-current"));
    expect(await screen.findByText("Session only")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save attempt now" })).toBeDisabled();
  });

  it("surfaces an invalid assignment link instead of silently treating it as valid", async () => {
    persistenceMocks.list.mockResolvedValue([
      savedDraftingAttempt("examiner", "saved-examiner"),
    ]);
    globalThis.history.replaceState(
      null,
      "",
      "/?challenge=pressure-history-adaptive-mouse&mode=unknown",
    );

    render(<App />);

    const warning = await screen.findByRole("alert");
    expect(warning).toHaveTextContent(/mode that is not available/iu);
    expect(screen.getByRole("radio", { name: /Practitioner/u })).toBeChecked();
    expect(screen.queryByRole("region", { name: "Structured claim editor" })).not.toBeInTheDocument();
  });

  it("preserves a valid assignment while opening and leaving the guide library", async () => {
    const user = userEvent.setup();
    globalThis.history.replaceState(
      null,
      "",
      "/?challenge=pressure-history-adaptive-mouse&mode=guided",
    );
    render(<App />);

    await screen.findByText("Saved locally");
    await user.click(screen.getAllByRole("button", { name: "Guides" })[0]);
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Practical patent-drafting guides",
      }),
    ).toBeInTheDocument();
    expect(globalThis.location.search).toBe(
      "?challenge=pressure-history-adaptive-mouse&mode=guided",
    );

    await user.click(screen.getByRole("button", { name: "Return to practice" }));
    expect(await screen.findByRole("radio", { name: /Guided/u })).toBeChecked();
    expect(globalThis.location.search).toBe(
      "?challenge=pressure-history-adaptive-mouse&mode=guided",
    );
  });

  it("offers a dismissible first-use entry and replays the accessible tour from Help", async () => {
    const user = userEvent.setup();
    render(<App />);

    const firstUse = await screen.findByRole("region", { name: "New to ScopeCraft?" });
    await user.click(within(firstUse).getByRole("button", { name: "Take the 2-minute tour" }));

    let dialog = await screen.findByRole("dialog", { name: /Step 1 of 4/iu });
    await waitFor(() =>
      expect(within(dialog).getByRole("heading", { name: "Begin with the disclosure" })).toHaveFocus(),
    );
    for (let step = 2; step <= 4; step += 1) {
      await user.click(within(dialog).getByRole("button", { name: "Next" }));
      dialog = await screen.findByRole("dialog", { name: new RegExp(`Step ${step} of 4`, "iu") });
    }
    await user.click(within(dialog).getByRole("button", { name: "Finish tour" }));
    expect(screen.queryByRole("region", { name: "New to ScopeCraft?" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /Start drafting/iu })).toHaveFocus());

    await user.click(screen.getByRole("button", { name: "Help" }));
    const help = await screen.findByRole("dialog", { name: "ScopeCraft playbook" });
    await user.click(within(help).getByRole("button", { name: "Replay the quick tour" }));
    const replayedTour = await screen.findByRole("dialog", { name: /Step 1 of 4/iu });
    await expectNoAxeViolations(replayedTour);
  });

  it("builds the selected player packet before invoking the browser print dialog", async () => {
    const user = userEvent.setup();
    const print = vi.spyOn(globalThis, "print").mockImplementation(() => {});
    render(<App />);

    await screen.findByText("Saved locally");
    await user.click(screen.getByRole("button", { name: "Print player packet" }));
    const dialog = await screen.findByRole("dialog", { name: "Print player packet" });
    expect(within(dialog).getByRole("radio", { name: /Drafting packet/iu })).toBeChecked();
    expect(within(dialog).getByRole("radio", { name: /Amendment packet/iu })).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "Open print dialog" }));

    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    expect(document.querySelector(".app-root")).toHaveAttribute("data-print-ready", "true");
    const packet = document.querySelector(".player-print-packet");
    expect(packet).toHaveTextContent("Pressure-History Adaptive Mouse");
    expect(packet).toHaveTextContent("Claim-structure scaffold");
    expect(packet).not.toHaveTextContent("maintain-amended-claim-1-expert");
  });

  it("keeps the application printable when no generated packet is active", async () => {
    render(<App />);
    await screen.findByText("Saved locally");

    expect(document.querySelector(".app-root")).toHaveAttribute("data-print-ready", "false");
    expect(document.querySelector(".app-shell")).toBeInTheDocument();
    expect(document.querySelector(".player-print-packet")).not.toBeInTheDocument();
  });
});
