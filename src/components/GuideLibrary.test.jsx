// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GuideLibrary } from "./GuideLibrary.jsx";

afterEach(cleanup);

async function expectNoAxeViolations(container) {
  const result = await axe.run(container, {
    rules: { "color-contrast": { enabled: false } },
  });
  expect(result.violations).toEqual([]);
}

describe("Drafting guide library", () => {
  it("renders a searchable, accessible hub and narrows its guide cards", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <GuideLibrary pathname="/guides" onNavigate={vi.fn()} onBackToPractice={vi.fn()} />,
    );

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("link", { name: /Download the expanded practice library/iu })).toHaveAttribute(
      "href",
      "/downloads/patent-drafting-practice-library-expanded.zip",
    );
    expect(screen.getByRole("status")).toHaveTextContent("8 guides shown");

    await user.type(screen.getByRole("searchbox", { name: "Search the guides" }), "dependent claims");
    expect(screen.getByRole("status")).toHaveTextContent(/guides? shown/iu);
    expect(screen.getByRole("heading", { name: "Building Useful Dependent Claims" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Figure narratives/iu })).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("renders a direct article with layered guidance and official sources", async () => {
    const { container } = render(
      <GuideLibrary pathname="/guides/dependent-claims" onNavigate={vi.fn()} onBackToPractice={vi.fn()} />,
    );

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: /Dependent claims/iu })).toBeInTheDocument();
    expect(screen.getByText("30-second takeaway")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Official sources" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy checklist" })).toBeEnabled();
    await expectNoAxeViolations(container);
  });

  it("provides an accessible recovery path for an unknown guide", async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <GuideLibrary pathname="/guides/not-a-guide" onNavigate={onNavigate} onBackToPractice={vi.fn()} />,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Guide not found" })).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: /Browse all guides/iu }));
    expect(onNavigate).toHaveBeenCalledWith("/guides");
    await expectNoAxeViolations(container);
  });
});
