// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Modal } from "./Modal.jsx";

afterEach(cleanup);

function ModalHarness({ onCloseReason = () => {} }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const firstActionRef = useRef(null);
  return (
    <>
      <button onClick={() => setOpen(true)} ref={triggerRef} type="button">
        Open review
      </button>
      <Modal
        footer={<button type="button">Submit</button>}
        initialFocusRef={firstActionRef}
        onClose={(reason) => {
          onCloseReason(reason);
          setOpen(false);
        }}
        open={open}
        returnFocusRef={triggerRef}
        title="Review submission"
      >
        <p>Submitting freezes the original claim snapshot.</p>
        <button ref={firstActionRef} type="button">Review claim 1</button>
      </Modal>
    </>
  );
}

describe("Modal", () => {
  it("labels the dialog and restores the invoking focus after Escape", async () => {
    const user = userEvent.setup();
    const onCloseReason = vi.fn();
    render(<ModalHarness onCloseReason={onCloseReason} />);

    const trigger = screen.getByRole("button", { name: "Open review" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Review submission" });
    expect(dialog).toHaveAccessibleDescription("Submitting freezes the original claim snapshot. Review claim 1");
    await waitFor(() => expect(screen.getByRole("button", { name: "Review claim 1" })).toHaveFocus());
    expect((await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);

    await user.keyboard("{Escape}");
    expect(onCloseReason).toHaveBeenCalledWith("escape");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("cycles focus from the last control to the first control", async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);
    await user.click(screen.getByRole("button", { name: "Open review" }));

    const submit = screen.getByRole("button", { name: "Submit" });
    submit.focus();
    expect(submit).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Close dialog" })).toHaveFocus();
  });

  it("closes only when the backdrop itself is selected", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal onClose={onClose} open title="Backdrop test">
        <p>Body</p>
      </Modal>,
    );

    fireEvent.mouseDown(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByRole("presentation"));
    expect(onClose).toHaveBeenCalledWith("backdrop");
    await user.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(onClose).toHaveBeenCalledWith("close-button");
  });
});
