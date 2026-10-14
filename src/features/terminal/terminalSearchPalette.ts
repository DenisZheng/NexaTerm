export function getTerminalSearchDecorations(element: HTMLElement | null) {
  const primary = readHexToken("--mx-primary", "#2374c6", element);
  const panel = readHexToken("--mx-panel", "#ffffff", element);
  const text = readHexToken("--mx-text", "#20242a", element);

  return {
    activeMatchBackground: mixHexColors(primary, panel, 0.18),
    activeMatchBorder: mixHexColors(primary, text, 0.58),
    activeMatchColorOverviewRuler: primary,
    matchBackground: mixHexColors(primary, panel, 0.1),
    matchBorder: mixHexColors(primary, text, 0.42),
    matchOverviewRuler: primary,
  };
}

function readHexToken(tokenName: string, fallback: string, element: HTMLElement | null) {
  if (typeof window === "undefined") {
    return fallback;
  }

  const styles = window.getComputedStyle(element || document.body);
  return resolveHexToken(styles, tokenName, fallback, new Set());
}

function resolveHexToken(styles: CSSStyleDeclaration, tokenName: string, fallback: string, visited: Set<string>) {
  if (visited.has(tokenName)) {
    return fallback;
  }
  visited.add(tokenName);

  const rawValue = styles.getPropertyValue(tokenName).trim();
  const normalized = normalizeHexColor(rawValue);
  if (normalized) {
    return normalized;
  }

  const variable = rawValue.match(/^var\(\s*(--[\w-]+)(?:\s*,\s*([^)]*))?\)$/);
  if (!variable) {
    return fallback;
  }
  const variableFallback = normalizeHexColor(variable[2]?.trim() || "") || fallback;
  return resolveHexToken(styles, variable[1], variableFallback, visited);
}

export function normalizeHexColor(value: string) {
  const hex = value.match(/^#([\da-f]{3}|[\da-f]{6})$/i);
  if (hex) {
    const digits = hex[1];
    if (digits.length === 6) {
      return `#${digits.toLowerCase()}`;
    }
    return `#${digits
      .split("")
      .map((digit) => digit + digit)
      .join("")
      .toLowerCase()}`;
  }

  const rgb = value.match(/^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/i);
  if (!rgb) {
    return null;
  }
  return rgbToHex(Number(rgb[1]), Number(rgb[2]), Number(rgb[3]));
}

export function mixHexColors(foreground: string, background: string, foregroundWeight: number) {
  const fg = hexToRgb(foreground);
  const bg = hexToRgb(background);
  const weight = Math.max(0, Math.min(1, foregroundWeight));
  return rgbToHex(
    Math.round(fg.r * weight + bg.r * (1 - weight)),
    Math.round(fg.g * weight + bg.g * (1 - weight)),
    Math.round(fg.b * weight + bg.b * (1 - weight)),
  );
}

function hexToRgb(value: string) {
  const hex = value.replace("#", "");
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b]
    .map((channel) => Math.max(0, Math.min(255, channel)).toString(16).padStart(2, "0"))
    .join("")}`;
}

// Observe the same scopes that own the global tokens; system mode can also
// change via the media query without a React settings update.
export function observeTerminalSearchPalette(element: HTMLElement, refresh: () => void) {
  const observer = new MutationObserver(refresh);
  const scopes = new Set<Element>([document.documentElement, document.body]);
  const shell = element.closest(".app-shell");
  if (shell) scopes.add(shell);
  scopes.forEach((scope) => observer.observe(scope, { attributes: true,
    attributeFilter: ["style", "class", "data-theme-mode", "data-window-material", "data-platform"] }));
  const systemTheme = window.matchMedia?.("(prefers-color-scheme: dark)");
  systemTheme?.addEventListener("change", refresh);
  return () => { observer.disconnect(); systemTheme?.removeEventListener("change", refresh); };
}
