/**
 * The guard for the application's single window-level keydown listener.
 *
 * Without it, ArrowLeft/ArrowRight switch tabs from anywhere — including from
 * inside a window's volume slider, so nudging the volume with the keyboard also
 * switches tabs and unmounts the panel under the control the user is holding.
 * anime's draggable already declines to grab `type="range"` targets, so the
 * slider is protected from the drag but not from the tab switch; both need the
 * same protection and this is the one place it lives.
 *
 * Only genuinely global keys consult this. ArrowUp/ArrowDown/Enter are local to
 * the explorer's row list and are handled by an onKeyDown there, so they need no
 * guard and no other surface can intercept them.
 */
const INTERACTIVE = 'input, textarea, select, option, [role="slider"], [role="textbox"], [contenteditable="true"]'

export function isInteractiveTarget(e: Event): boolean {
  const t = e.target
  // keydown on `window` can carry a non-Element target (document, window itself)
  if (!(t instanceof Element)) return false
  if (t instanceof HTMLElement && t.isContentEditable) return true
  return t.closest(INTERACTIVE) !== null
}
