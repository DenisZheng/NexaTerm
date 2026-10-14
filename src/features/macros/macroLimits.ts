export const MACRO_LIMITS = { steps: 20, targets: 20, commandBytes: 16384, totalBytes: 65536, delayMs: 60000, totalDelayMs: 300000, writeTimeoutMs: 30000 } as const;

export function macroCommandBytes(command: string): number | null {
  if (!command.trim() || /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/.test(command)) return null;
  const bytes = new TextEncoder().encode(command).length;
  return bytes <= MACRO_LIMITS.commandBytes ? bytes : null;
}
