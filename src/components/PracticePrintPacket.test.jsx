// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PracticePrintPacket } from "./PracticePrintPacket.jsx";

afterEach(cleanup);

describe("PracticePrintPacket", () => {
  it("renders a semantic drafting packet without HTML interpolation", () => {
    const { container } = render(
      <PracticePrintPacket
        model={{
          packetType: "drafting",
          packetLabel: "Drafting packet",
          challengeTitle: "Player challenge",
          modeLabel: "Practitioner",
          contentVersion: "1.0.0",
          generatedAt: "2026-08-27T12:00:00.000Z",
          educationalBoundary: "Educational only.",
          disclosure: {
            sections: [{ id: "facts", title: "Facts", body: "<strong>Player text</strong>" }],
            supportedAlternatives: [],
            targetEmbodiments: [],
          },
          claims: [],
          scaffold: { independent: "A system comprising: [work].", dependent: "The system of claim 1..." },
          notes: "",
        }}
      />,
    );

    expect(container.querySelector(".player-print-packet")).toHaveAttribute(
      "data-packet-type",
      "drafting",
    );
    expect(screen.getByRole("heading", { name: "Player challenge" })).toBeInTheDocument();
    expect(screen.getByText("<strong>Player text</strong>")).toBeInTheDocument();
    expect(document.querySelector("strong")?.textContent).not.toBe("Player text");
  });
});
