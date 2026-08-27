import { X } from "@phosphor-icons/react";
import { useEffect, useId, useRef } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "object",
  "embed",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function focusableElements(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter((element) => {
    if (element.getAttribute("aria-hidden") === "true") return false;
    if (element.closest("[inert]")) return false;
    if (element.hidden || element.closest("[hidden]")) return false;
    const style = globalThis.getComputedStyle?.(element);
    if (style?.display === "none" || style?.visibility === "hidden") return false;
    return true;
  });
}

export function Modal({
  open,
  title,
  children,
  footer,
  onClose,
  closeLabel = "Close dialog",
  initialFocusRef,
  returnFocusRef,
  closeOnBackdrop = true,
  id,
  size = "medium",
}) {
  const generatedId = useId();
  const baseId = id ?? `modal-${generatedId.replaceAll(":", "")}`;
  const titleId = `${baseId}-title`;
  const bodyId = `${baseId}-body`;
  const dialogRef = useRef(null);
  const invokingElementRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;

    invokingElementRef.current = returnFocusRef?.current ?? document.activeElement;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const dialog = dialogRef.current;
    const preferredFocus = initialFocusRef?.current;
    const firstFocus = preferredFocus && dialog?.contains(preferredFocus)
      ? preferredFocus
      : focusableElements(dialog)[0] ?? dialog;
    firstFocus?.focus({ preventScroll: true });

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current?.("escape");
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = focusableElements(dialogRef.current);
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && (document.activeElement === first || !dialog?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey
        && (document.activeElement === last || !dialog?.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.body.style.overflow = priorOverflow;
      const invokingElement = returnFocusRef?.current ?? invokingElementRef.current;
      if (invokingElement?.isConnected && typeof invokingElement.focus === "function") {
        invokingElement.focus({ preventScroll: true });
      }
    };
  }, [initialFocusRef, open, returnFocusRef]);

  if (!open) return null;

  function handleBackdropClick(event) {
    if (closeOnBackdrop && event.target === event.currentTarget) {
      onCloseRef.current?.("backdrop");
    }
  }

  return (
    <div
      className="modal-backdrop"
      data-modal-open="true"
      onMouseDown={handleBackdropClick}
      role="presentation"
    >
      <section
        aria-describedby={bodyId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="modal"
        data-size={size}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button
            aria-label={closeLabel}
            className="icon-button"
            onClick={() => onCloseRef.current?.("close-button")}
            title={closeLabel}
            type="button"
          >
            <X aria-hidden="true" size={18} weight="bold" />
          </button>
        </div>
        <div className="modal-body" id={bodyId}>
          {children}
        </div>
        {footer === undefined || footer === null ? null : (
          <footer className="modal-footer">{footer}</footer>
        )}
      </section>
    </div>
  );
}
