import { useLayoutEffect, useRef, type ReactNode, type KeyboardEvent } from "react";

/** Toolbar-local navigation only; never registers application shortcuts or handles portalled menus. */
export function RovingToolbar({ children, label, className }: {
  children: ReactNode; label: string; className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const focusedRef = useRef<HTMLButtonElement | null>(null);
  const controls = () => Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>("button[data-toolbar-control]") || []);
  function select(control: HTMLButtonElement, focus = false) {
    controls().forEach((button) => { button.tabIndex = button === control ? 0 : -1; });
    if (focus) control.focus();
  }
  useLayoutEffect(() => {
    const buttons = controls();
    const focused = focusedRef.current;
    const target = buttons.find((button) => button === focused) || buttons[0];
    if (!target) return;
    const lostFocus = focused !== null && !buttons.includes(focused) && document.activeElement === document.body;
    select(target, lostFocus);
  });
  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    if (!(event.target instanceof HTMLElement) || !rootRef.current?.contains(event.target) ||
        event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return;
    const buttons = controls();
    const current = buttons.findIndex((button) => button === event.target);
    if (current < 0 || !buttons.length) return;
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
      : event.key === "ArrowRight" ? (current + 1) % buttons.length
      : event.key === "ArrowLeft" ? (current + buttons.length - 1) % buttons.length : -1;
    if (next < 0) return;
    event.preventDefault(); event.stopPropagation(); select(buttons[next], true);
  }
  return (
    <div ref={rootRef} role="toolbar" aria-label={label} className={className} onKeyDown={navigate}
      onBlurCapture={(event) => {
        if (!(event.relatedTarget instanceof Node) || !rootRef.current?.contains(event.relatedTarget)) focusedRef.current = null;
      }}
      onFocusCapture={(event) => {
        if (event.target instanceof HTMLButtonElement && rootRef.current?.contains(event.target) &&
            event.target.hasAttribute("data-toolbar-control")) {
          focusedRef.current = event.target; select(event.target);
        }
      }}>
      {children}
    </div>
  );
}
