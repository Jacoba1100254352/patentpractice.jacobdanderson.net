// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppNavigation } from "./AppNavigation.jsx";

afterEach(cleanup);

describe("AppNavigation", () => {
  it("uses labelled semantic buttons with responsive state attributes", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<AppNavigation activeId="draft" onNavigate={onNavigate} />);

    const navigation = screen.getByRole("navigation", { name: "ScopeCraft tools" });
    const draft = screen.getByRole("button", { name: "Draft" });
    const playbook = screen.getByRole("button", { name: "Guides" });
    expect(screen.getByRole("button", { name: "Examiner simulation" })).toBeInTheDocument();
    expect(navigation).toHaveAttribute("data-active-nav", "draft");
    expect(draft).toHaveAttribute("aria-current", "page");
    expect(draft).toHaveAttribute("title", "Draft");
    expect(draft).toHaveAttribute("data-responsive-label", "collapse-to-icon");
    expect(playbook).toHaveAttribute("data-mobile-hidden", "true");
    expect((await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);

    await user.click(screen.getByRole("button", { name: "Prior Art" }));
    expect(onNavigate).toHaveBeenCalledWith(
      "prior-art",
      expect.objectContaining({ label: "Prior Art" }),
    );
  });

  it("does not activate disabled navigation items", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(
      <AppNavigation
        items={[{ id: "locked", label: "Locked tool", disabled: true }]}
        footerItems={[]}
        onNavigate={onNavigate}
      />,
    );

    const locked = screen.getByRole("button", { name: "Locked tool" });
    expect(locked).toBeDisabled();
    await user.click(locked);
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
