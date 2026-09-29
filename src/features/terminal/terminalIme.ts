export interface TerminalKeyboardCompositionLike {
  isComposing?: boolean;
  keyCode?: number;
}

export function isTerminalImeKeyboardEvent(
  event: TerminalKeyboardCompositionLike,
): boolean {
  return event.isComposing === true || event.keyCode === 229;
}
