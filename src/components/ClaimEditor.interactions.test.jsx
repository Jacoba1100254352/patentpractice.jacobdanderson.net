// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ClaimEditor } from "./ClaimEditor.jsx";

const INITIAL_CLAIM_SET = {
  id: "interaction-claims",
  claims: [
    {
      id: "claim-1",
      number: 1,
      kind: "independent",
      subject: "computer input system",
      transition: "comprising",
      limitations: [
        { id: "sensor", text: "a pressure sensor", depth: 0 },
        { id: "controller", text: "a controller", depth: 0 },
      ],
    },
  ],
};

function StatefulClaimEditor({ initialClaimSet = INITIAL_CLAIM_SET }) {
  const [claimSet, setClaimSet] = useState(initialClaimSet);
  const [selectedClaimId, setSelectedClaimId] = useState("claim-1");
  const [selectedLimitationId, setSelectedLimitationId] = useState("sensor");

  return (
    <>
      <ClaimEditor
        claimSet={claimSet}
        footer={<button type="button">Continue to preflight</button>}
        onChange={setClaimSet}
        onSelectClaim={setSelectedClaimId}
        onSelectLimitation={setSelectedLimitationId}
        selectedClaimId={selectedClaimId}
        selectedLimitationId={selectedLimitationId}
      />
      <output data-testid="claim-state">{JSON.stringify(claimSet)}</output>
    </>
  );
}

function currentClaimSet() {
  return JSON.parse(screen.getByTestId("claim-state").textContent);
}

function currentLimitations() {
  return currentClaimSet().claims[0].limitations;
}

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (callback) => setTimeout(callback, 0));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ClaimEditor clause interactions", () => {
  it("adds a sibling with Enter and moves focus into the new clause", async () => {
    const user = userEvent.setup();
    render(<StatefulClaimEditor />);

    const firstClause = screen.getByLabelText("Claim 1, limitation 1");
    await user.click(firstClause);
    await user.keyboard("{Enter}");

    await waitFor(() => expect(screen.getAllByRole("textbox")).toHaveLength(4));
    const newClause = screen.getByLabelText("Claim 1, limitation 2");
    await waitFor(() => expect(newClause).toHaveFocus());
    expect(currentLimitations()).toHaveLength(3);
    expect(currentLimitations()[1]).toMatchObject({ text: "", depth: 0 });
    expect(currentLimitations()[2].id).toBe("controller");
  });

  it("preserves a newline in the current clause when Enter is modified by Shift", async () => {
    const user = userEvent.setup();
    render(<StatefulClaimEditor />);

    const firstClause = screen.getByLabelText("Claim 1, limitation 1");
    await user.click(firstClause);
    firstClause.setSelectionRange(firstClause.value.length, firstClause.value.length);
    await user.type(firstClause, "{Shift>}{Enter}{/Shift}and a force signal", {
      skipClick: true,
    });

    expect(firstClause).toHaveValue("a pressure sensor\nand a force signal");
    expect(currentLimitations()[0].text).toBe("a pressure sensor\nand a force signal");
    expect(currentLimitations()).toHaveLength(2);
  });

  it("uses Tab and Shift Tab for depth only while clause-editing mode is active", async () => {
    const user = userEvent.setup();
    render(<StatefulClaimEditor />);

    const firstClause = screen.getByLabelText("Claim 1, limitation 1");
    await user.click(firstClause);
    await user.tab();
    expect(currentLimitations()[0].depth).toBe(1);
    expect(firstClause).toHaveFocus();

    await user.tab({ shift: true });
    expect(currentLimitations()[0].depth).toBe(0);
    expect(firstClause).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(firstClause).not.toHaveFocus();
    const depthAfterEscape = currentLimitations()[0].depth;

    await user.tab();
    expect(currentLimitations()[0].depth).toBe(depthAfterEscape);
    expect(document.activeElement).not.toBe(firstClause);
    expect(document.activeElement).toBeInstanceOf(HTMLButtonElement);
  });

  it("moves and deletes limitations through the visible row controls", async () => {
    const user = userEvent.setup();
    render(<StatefulClaimEditor />);

    const controllerRow = screen
      .getByDisplayValue("a controller")
      .closest(".limitation-row");
    const moveUp = within(controllerRow).getByRole("button", { name: "Move limitation up" });
    expect(moveUp).toBeEnabled();
    await user.click(moveUp);
    expect(currentLimitations().map((limitation) => limitation.id)).toEqual([
      "controller",
      "sensor",
    ]);

    const sensorRow = screen
      .getByDisplayValue("a pressure sensor")
      .closest(".limitation-row");
    await user.click(within(sensorRow).getByRole("button", { name: "Delete limitation" }));
    expect(currentLimitations().map((limitation) => limitation.id)).toEqual(["controller"]);
    expect(screen.queryByDisplayValue("a pressure sensor")).not.toBeInTheDocument();
  });
});
