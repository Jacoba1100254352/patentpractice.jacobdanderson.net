import {
  BookBookmark,
  BookOpen,
  ChartBar,
  Gear,
  MagnifyingGlass,
  PencilSimpleLine,
  Question,
  SidebarSimple,
  Sparkle,
  Stack,
  UserCircle,
} from "@phosphor-icons/react";

export const DEFAULT_NAV_ITEMS = Object.freeze([
  { id: "draft", label: "Draft", Icon: PencilSimpleLine },
  { id: "disclosure", label: "Disclosure", Icon: BookOpen },
  { id: "prior-art", label: "Prior Art", Icon: Stack },
  { id: "search", label: "Search", Icon: MagnifyingGlass },
  { id: "playbook", label: "Playbook", Icon: BookBookmark, mobileHidden: true },
  { id: "examiner", label: "Examiner simulation", Icon: Sparkle },
  { id: "reports", label: "Reports", Icon: ChartBar, mobileHidden: true },
]);

export const DEFAULT_NAV_FOOTER_ITEMS = Object.freeze([
  { id: "settings", label: "Settings", Icon: Gear },
  { id: "help", label: "Help", Icon: Question },
  { id: "collapse", label: "Collapse", Icon: SidebarSimple },
]);

function NavigationButton({ item, active, onNavigate, position }) {
  const Icon = item.Icon;
  const label = item.tooltip ?? item.label;
  return (
    <button
      aria-controls={item.controls}
      aria-current={active ? "page" : undefined}
      aria-label={label}
      className="nav-item"
      data-active={active ? "true" : "false"}
      data-mobile-hidden={item.mobileHidden ? "true" : "false"}
      data-nav-id={item.id}
      data-nav-position={position}
      data-responsive-label="collapse-to-icon"
      disabled={item.disabled}
      onClick={() => onNavigate?.(item.id, item)}
      title={label}
      type="button"
    >
      {Icon ? <Icon aria-hidden="true" size={18} weight={active ? "duotone" : "regular"} /> : null}
      <span>{item.label}</span>
      {item.badge ? <span className="sr-only">, {item.badge}</span> : null}
    </button>
  );
}

export function AppNavigation({
  activeId = "draft",
  onNavigate,
  items = DEFAULT_NAV_ITEMS,
  footerItems = DEFAULT_NAV_FOOTER_ITEMS,
  modeLabel = "Practitioner mode",
  ariaLabel = "ScopeCraft tools",
}) {
  return (
    <nav aria-label={ariaLabel} className="primary-nav" data-active-nav={activeId}>
      <div className="mode-block" data-mode-label={modeLabel} title={modeLabel}>
        <UserCircle aria-hidden="true" size={18} weight="duotone" />
        <span>{modeLabel}</span>
      </div>
      <ul className="nav-list">
        {items.map((item) => (
          <li key={item.id}>
            <NavigationButton
              active={item.id === activeId}
              item={item}
              onNavigate={onNavigate}
              position="primary"
            />
          </li>
        ))}
      </ul>
      <div aria-hidden="true" className="nav-spacer" />
      <div className="nav-footer">
        <ul className="nav-list">
          {footerItems.map((item) => (
            <li key={item.id}>
              <NavigationButton
                active={item.id === activeId}
                item={item}
                onNavigate={onNavigate}
                position="footer"
              />
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
