import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { theme } from "./theme";

const appDir = fileURLToPath(new URL(".", import.meta.url));
const srcDir = join(appDir, "..");
const css = readFileSync(join(appDir, "globals.css"), "utf8");

const rootBlock = /:root\s*{([^}]*)}/.exec(css)?.[1] ?? "";
const tokens = Object.fromEntries(
  [...rootBlock.matchAll(/--color-([a-z-]+):\s*(#[0-9a-fA-F]{6});/g)].map(([, name, hex = ""]) => [
    name,
    hex.toUpperCase(),
  ]),
);

// The Color tokens screen of the design system, copied from the board.
const boardTokens: Record<string, string> = {
  ground: "#F2F3EF",
  surface: "#FFFFFF",
  inset: "#F7F8F5",
  "line-soft": "#EEF0EC",
  border: "#E4E6E1",
  track: "#E7E9E4",
  "line-field": "#D5D9D2",
  "line-disabled": "#DCDFD9",
  "line-strong": "#C9CDC6",
  "control-off": "#B9BEB6",
  "icon-muted": "#8A908B",
  "ink-nav": "#4F5550",
  "ink-soft": "#3F4541",
  "ink-muted": "#5C625D",
  ink: "#1A1D1B",
  accent: "#0D8457",
  link: "#0B7A50",
  "link-hover": "#075C3C",
  confirmed: "#0B6B45",
  "accent-ink": "#0B5E3E",
  "accent-soft": "#EAF5EF",
  "accent-pressed": "#D3EBDD",
  "accent-line": "#CDE8DA",
  "open-row": "#F9FCFA",
  selected: "#F6FBF8",
  "toast-green": "#8FD9B3",
  next: "#2F6FD6",
  "next-ink": "#1F4E9C",
  "next-soft": "#E6EEFB",
  "next-selected": "#F6F9FE",
  "warning-ink": "#8A4B00",
  "warning-deep": "#6B3A00",
  "warning-deeper": "#5E3500",
  "warning-bar": "#C77A12",
  warning: "#FDEBD3",
  "warning-soft": "#FFF6E8",
  "warning-card": "#FFFBF4",
  "warning-line": "#F6DDB3",
  "warning-line-strong": "#F0D3A6",
  "warning-track": "#F6E6CC",
  danger: "#B3361A",
  "danger-deep": "#6E2508",
  "danger-soft": "#FDEDE6",
  "danger-line": "#F3CBBC",
  "danger-outline": "#F0C9BB",
  "danger-track": "#F6D9CF",
  "danger-card": "#FFFAF8",
  amber: "#FDF0D2",
  "amber-ink": "#7A4F00",
  blue: "#DCEBFD",
  "blue-ink": "#1C5590",
  terracotta: "#FDE4D8",
  "terracotta-ink": "#96360F",
  green: "#DDF3E6",
  "green-ink": "#1B6A43",
  violet: "#EAE5FC",
  "violet-ink": "#4F3AA0",
  pink: "#FDE3E6",
  "pink-ink": "#9C2440",
  teal: "#D6F1EF",
  "teal-ink": "#145E5A",
  sand: "#F1EADF",
  "sand-ink": "#6A4E2A",
  "tweak-violet": "#7B4FD8",
  "tweak-orange": "#D2601A",
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|css)$/.test(entry.name) && !/\.test\.ts$/.test(entry.name) ? [path] : [];
  });
}

describe("color tokens", () => {
  it("names all 65 colors on the Color tokens screen", () => {
    expect(Object.keys(boardTokens)).toHaveLength(65);
    expect(tokens).toEqual(boardTokens);
  });

  it("keeps every color literal in the token block or theme.ts", () => {
    const literal = /#[0-9a-fA-F]{3,8}\b|\b(rgb|hsl)a?\(/;
    const offenders = sourceFiles(srcDir).filter((path) => {
      if (path === join(appDir, "theme.ts")) return false;
      const source = readFileSync(path, "utf8");
      return literal.test(path === join(appDir, "globals.css") ? source.replace(rootBlock, "") : source);
    });
    expect(offenders).toEqual([]);
  });

  it("never names a color in CSS", () => {
    const named = /:[^;{}]*(?<![-\w])(white|black|gr[ae]y|red|green|blue|orange|yellow|purple|pink)\b/;
    expect(css.replace(rootBlock, "").replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(named);
  });

  it("only uses tokens that are defined", () => {
    const used = [...css.matchAll(/var\(--color-([a-z-]+)\)/g)].map(([, name]) => name);
    const defined = new Set([...rootBlock.matchAll(/--color-([a-z-]+):/g)].map(([, name]) => name));
    expect(used.filter((name) => !defined.has(name))).toEqual([]);
  });
});

describe("browser chrome and installed app", () => {
  it("match the tokens", () => {
    expect(theme.accent.toUpperCase()).toBe(tokens.accent);
    expect(theme.background.toUpperCase()).toBe(tokens.ground);
  });
});

describe("light mode only", () => {
  it("does not follow the device's dark mode", () => {
    expect(css).not.toContain("prefers-color-scheme");
    expect(rootBlock).toMatch(/color-scheme:\s*light;/);
  });
});
