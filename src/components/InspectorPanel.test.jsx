// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InspectorPanel } from "./InspectorPanel.jsx";

afterEach(cleanup);

describe("InspectorPanel term registry", () => {
  it("sorts known first uses first and safely places incomplete entries last", () => {
    render(
      <InspectorPanel
        collapsed={false}
        onFocusFinding={vi.fn()}
        onSelectTerm={vi.fn()}
        onToggle={vi.fn()}
        registry={{
          terms: {
            unknown: { key: "unknown", label: "Unknown term" },
            second: {
              key: "second",
              label: "Second claim term",
              firstUse: { claimNumber: 2 },
              introductions: [{}],
            },
            first: {
              key: "first",
              label: "First claim term",
              firstUse: { claimNumber: 1, limitationIndex: 2 },
              references: [{}],
            },
          },
        }}
      />,
    );

    const section = screen.getByRole("heading", { name: "Introduced terms" }).closest("section");
    expect(within(section).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "First claim term",
      "Second claim term",
      "Unknown term",
    ]);
    expect(within(section).getAllByText(/uses$/u).map((item) => item.textContent)).toEqual([
      "1 uses",
      "1 uses",
      "0 uses",
    ]);
  });
});
