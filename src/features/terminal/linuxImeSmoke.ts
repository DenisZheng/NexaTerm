import { Unicode11Addon } from "@xterm/addon-unicode11";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

interface ImeSmokeEvent {
  kind: string;
  data?: string | null;
  inputType?: string | null;
  isComposing?: boolean;
  value?: string;
}

function report(event: ImeSmokeEvent) {
  void fetch("/__nexaterm_ime_capture", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event),
  }).catch(() => {});
}

export function mountLinuxImeSmoke() {
  document.title = "NexaTerm IME Smoke";
  document.documentElement.style.height = "100%";
  document.body.style.height = "100%";
  document.body.style.margin = "0";
  document.body.style.background = "#111";
  const root = document.getElementById("root");
  if (!root) {
    throw new Error("IME smoke root is missing");
  }
  root.style.height = "100%";
  root.innerHTML = "";

  const terminalHost = document.createElement("div");
  terminalHost.id = "ime-smoke-terminal";
  terminalHost.style.height = "100%";
  terminalHost.style.padding = "12px";
  terminalHost.style.boxSizing = "border-box";
  root.appendChild(terminalHost);

  const terminal = new Terminal({
    allowProposedApi: true,
    cols: 80,
    rows: 24,
    cursorBlink: true,
    fontFamily: "monospace",
    fontSize: 16,
    scrollback: 100,
  });
  const unicode11 = new Unicode11Addon();
  terminal.loadAddon(unicode11);
  terminal.unicode.activeVersion = "11";
  terminal.open(terminalHost);
  terminal.write("Linux IME smoke — type with the active input method\r\n> ");

  let allData = "";
  terminal.onData((data) => {
    allData += data;
    report({ kind: "data", data, value: allData });
  });

  const textarea = terminalHost.querySelector<HTMLTextAreaElement>(".xterm-helper-textarea");
  if (!textarea) {
    throw new Error("xterm helper textarea is missing");
  }

  textarea.addEventListener("compositionstart", (event) => {
    report({ kind: "compositionstart", data: event.data, isComposing: true });
  });
  textarea.addEventListener("compositionupdate", (event) => {
    report({ kind: "compositionupdate", data: event.data, isComposing: true });
  });
  textarea.addEventListener("compositionend", (event) => {
    report({ kind: "compositionend", data: event.data, isComposing: false });
  });
  textarea.addEventListener("beforeinput", (event) => {
    report({
      kind: "beforeinput",
      data: event.data,
      inputType: event.inputType,
      isComposing: event.isComposing,
      value: textarea.value,
    });
  });
  textarea.addEventListener("input", (event) => {
    const inputEvent = event as InputEvent;
    report({
      kind: "input",
      data: inputEvent.data,
      inputType: inputEvent.inputType,
      isComposing: inputEvent.isComposing,
      value: textarea.value,
    });
  });

  terminal.focus();
  window.setTimeout(() => terminal.focus(), 100);
  report({ kind: "ready" });
}
