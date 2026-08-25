// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ClaimEditor } from "./ClaimEditor.jsx";

afterEach(cleanup);

const callbacks = {
  onChange: vi.fn(),
  onSelectClaim: vi.fn(),
  onSelectLimitation: vi.fn(),
};

describe("ClaimEditor integration", () => {
  it("keeps an optional footer in the third actionbar row for an empty claim set", () => {
    const { container } = render(
      <ClaimEditor
        {...callbacks}
        claimSet={{ id: "empty", claims: [] }}
        footer={<button type="button">Continue to preflight</button>}
      />,
    );

    const workspace = container.querySelector(".claim-workspace");
    expect(Array.from(workspace.children).map((child) => child.className)).toEqual([
      "claim-set-strip",
      "claim-editor-scroll",
      "claim-actionbar",
    ]);
    expect(screen.getByRole("button", { name: "Continue to preflight" })).toBeInTheDocument();
  });

  it("renders the footer after the claim scroll area for an active claim", () => {
    const { container } = render(
      <ClaimEditor
        {...callbacks}
        claimSet={{
          id: "claims",
          claims: [
            {
              id: "claim-1",
              number: 1,
              kind: "independent",
              subject: "input device",
              transition: "comprising",
              limitations: [{ id: "sensor", text: "a pressure sensor", depth: 0 }],
            },
          ],
        }}
        footer={<span>Draft saved locally</span>}
        selectedClaimId="claim-1"
      />,
    );

    const workspace = container.querySelector(".claim-workspace");
    expect(workspace.lastElementChild).toHaveClass("claim-actionbar");
    expect(screen.getByText("Draft saved locally")).toBeInTheDocument();
  });
});
