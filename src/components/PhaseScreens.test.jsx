// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CompetitorScreen } from "./PhaseScreens.jsx";

afterEach(cleanup);

describe("CompetitorScreen", () => {
  it("renders the configured competitor name, product facts, and safe result rationales", () => {
    render(
      <CompetitorScreen
        challenge={{
          educationalBoundary: { competitor: "Bounded fictional-product exercise." },
          competitor: {
            name: "GlobalGain Mouse",
            productFacts: [
              "uses one global gain multiplier",
              { id: "fact-two", text: "does not calculate separate interval measures" },
            ],
          },
        }}
        claim={{
          id: "claim-1",
          number: 1,
          kind: "independent",
          subject: "input device",
          limitations: [
            { id: "limitation-1", text: "separate interval correction measures" },
          ],
        }}
        onDebrief={vi.fn()}
        onPredict={vi.fn()}
        onSubmit={vi.fn()}
        prediction={{}}
        result={{
          limitations: [{ limitationId: "limitation-1", status: "omitted" }],
          rationales: {
            "limitation-1": "The supplied product uses only one global measure.",
          },
          conclusion: "No complete mapping in the stipulated model.",
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "GlobalGain Mouse" })).toBeInTheDocument();
    expect(screen.getByText("uses one global gain multiplier")).toBeInTheDocument();
    expect(screen.getByText("does not calculate separate interval measures")).toBeInTheDocument();
    expect(screen.getByText(/The supplied product uses only one global measure/u)).toBeInTheDocument();
    expect(screen.getByText("No complete mapping in the stipulated model.")).toBeInTheDocument();
  });
});
