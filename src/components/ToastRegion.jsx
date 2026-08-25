export function ToastRegion({ toasts = [], label = "Notifications" }) {
  return (
    <section
      aria-atomic="false"
      aria-label={label}
      aria-live="polite"
      aria-relevant="additions text"
      className="toast-region"
      data-toast-count={toasts.length}
      role="status"
    >
      {toasts.map((toast, index) => {
        const normalized = typeof toast === "string" ? { message: toast } : toast;
        if (!normalized?.message) return null;
        return (
          <div
            className="toast"
            data-tone={normalized.tone ?? "neutral"}
            key={normalized.id ?? `${normalized.message}-${index}`}
          >
            {normalized.title ? <strong>{normalized.title}</strong> : null}
            {normalized.title ? " " : null}
            <span>{normalized.message}</span>
          </div>
        );
      })}
    </section>
  );
}
