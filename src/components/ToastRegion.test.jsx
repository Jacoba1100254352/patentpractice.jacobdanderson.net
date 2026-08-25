// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ToastRegion } from "./ToastRegion.jsx";

afterEach(cleanup);

describe("ToastRegion", () => {
  it("keeps a polite live region mounted and announces added messages", () => {
    const { rerender } = render(<ToastRegion toasts={[]} />);
    const region = screen.getByRole("status", { name: "Notifications" });
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveAttribute("data-toast-count", "0");

    rerender(
      <ToastRegion
        toasts={[{ id: "saved", title: "Saved", message: "Attempt saved locally.", tone: "success" }]}
      />,
    );
    expect(screen.getByText("Attempt saved locally.")).toBeInTheDocument();
    expect(region).toHaveAttribute("data-toast-count", "1");
  });
});
