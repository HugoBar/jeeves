import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appDir = fileURLToPath(new URL(".", import.meta.url));
const css = readFileSync(join(appDir, "globals.css"), "utf8");
const phoneCss = css.replace(/@media[^{]*{(?:[^{}]*{[^{}]*})*[^{}]*}/g, "");

function componentFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return componentFiles(path);
    return entry.name.endsWith(".tsx") ? [path] : [];
  });
}

describe("button styles", () => {
  it("has each style on the Buttons screen; a plain button is Secondary", () => {
    for (const style of ["primary", "warning", "icon", "quiet", "danger", "soft", "list-add"]) {
      expect(css).toContain(`.button-${style}`);
    }
    expect(css).toMatch(/\.button-soft\[aria-pressed="true"\]/);
  });

  it("lets a style win on a link as it does on a button", () => {
    const baseSelector = /([^{}]*){\s*--button-bg: var\(--color-surface\)/.exec(css)?.[1];
    expect(baseSelector).toMatch(/\.button\b/);
    expect(baseSelector).not.toMatch(/a\.button/);
  });

  it("leaves a list row out of the hover tint every other button gets", () => {
    expect(css).toMatch(/button:hover:not\(:disabled, \.list-row\)/);
  });

  it("only uses styles that are defined", () => {
    const used = componentFiles(appDir).flatMap((path) =>
      [...readFileSync(path, "utf8").matchAll(/\bbutton(-[a-z-]+)?(?=[" ])/g)]
        .map(([name]) => name)
        .filter((name) => name.startsWith("button-")),
    );
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((name) => !css.includes(`.${name}`))).toEqual([]);
  });
});

describe("on phone", () => {
  it("keeps everything tappable at least 44 px tall", () => {
    const heights = [...phoneCss.matchAll(/min-height:\s*(\d+)px/g)].map(([, height]) => Number(height));
    expect(heights.length).toBeGreaterThan(0);
    expect(heights.filter((height) => height < 44)).toEqual([]);
  });

  it("fits the Planner's seven days on one line at 375 px, each at least 44 px wide", () => {
    const phoneWidth = 375;
    const tapTarget = 44;
    const space = Number(/--space: (\d+)px/.exec(css)?.[1]);
    const rule = (selector: string) => new RegExp(`(?:^|[}/])\\s*${selector} {([^}]*)}`).exec(phoneCss)?.[1] ?? "";
    const px = (value = "") => (value === "var(--space)" ? space : Number(value.replace("px", "")));
    // The left and right padding: the second value, or the only one.
    const sidePadding = (declarations: string) => {
      const values = /padding: ([^;]+);/.exec(declarations)?.[1]?.split(" ") ?? [];
      return px(values[1] ?? values[0]);
    };
    const page = sidePadding(rule("\\.app-main:has\\(\\.planner\\)"));
    const bar = rule("\\.planner-week-bar");
    const barBorder = px(/border: (\d+px)/.exec(bar)?.[1]);
    const strip = rule("\\.planner-strip");
    const reachIntoBar = -px(/margin: 0 (-?\d+px);/.exec(strip)?.[1] ?? "0px");
    const gap = px(/gap: (\d+px);/.exec(strip)?.[1]);

    // Equal shares that can shrink, so a narrower phone never scrolls sideways.
    expect(strip).toContain("grid-template-columns: repeat(7, minmax(0, 1fr));");
    const stripWidth = phoneWidth - 2 * (page + barBorder + sidePadding(bar) - reachIntoBar);
    expect(stripWidth - 6 * gap).toBeGreaterThanOrEqual(7 * tapTarget);
  });

  it("gives list rows 44 px too, on links and buttons alike", () => {
    const row = /\.list-row,\s*a\.list-row {[^}]*min-height: (\d+)px/.exec(phoneCss);
    expect(Number(row?.[1])).toBeGreaterThanOrEqual(44);
  });
});

describe("form fields", () => {
  it("gives a field in an open row its own line, so its text stays readable on phone", () => {
    expect(phoneCss).toMatch(/\.list-row-open \.item-form > input {[^}]*flex-basis: 100%/);
  });

  it("gives a field with an error the red border", () => {
    expect(css).toMatch(/\[aria-invalid="true"\][^{]*{[^}]*border: 1\.5px solid var\(--color-danger\)/);
  });
});
