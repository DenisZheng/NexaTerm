export type RloginTerminalErrorCode = "rlogin_terminal_encoding_invalid" | "rlogin_terminal_decode_failed"
  | "rlogin_terminal_input_invalid" | "rlogin_terminal_input_full" | "rlogin_terminal_input_failed"
  | "rlogin_terminal_closed" | "rlogin_terminal_renderer_busy" | "rlogin_terminal_renderer_failed"
  | "rlogin_terminal_resize_failed" | "rlogin_terminal_read_failed";
export class RloginTerminalError extends Error {
  constructor(readonly code: RloginTerminalErrorCode) { super(code); this.name="RloginTerminalError"; }
}
