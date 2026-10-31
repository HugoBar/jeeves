import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ArchiveSheet, ConfirmSheet, DeleteSheet, Sheet } from "./sheet";

const appDir = fileURLToPath(new URL(".", import.meta.url));
const css = readFileSync(join(appDir, "globals.css"), "utf8");
const phoneCss = css.replace(/@media[^{]*{(?:[^{}]*{[^{}]*})*[^{}]*}/g, "");
const noop = () => {};

function componentFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return componentFiles(path);
    return entry.name.endsWith(".tsx") ? [path] : [];
  });
}

describe("a confirmation sheet", () => {
  const html = renderToStaticMarkup(
    createElement(ConfirmSheet, {
      eyebrow: "Remove",
      title: "Remove Fish?",
      body: "If it is in use, it is Archived instead.",
      confirmLabel: "Remove",
      destructive: true,
      onConfirm: noop,
      onClose: noop,
    }),
  );

  it("is a dialog named by its title", () => {
    const labelledBy = /<dialog[^>]*aria-labelledby="([^"]+)"/.exec(html)?.[1];
    expect(html).toContain(`<h2 id="${labelledBy}">Remove Fish?</h2>`);
  });

  it("shows its wording, a Close button and Cancel", () => {
    expect(html).toContain("If it is in use, it is Archived instead.");
    expect(html).toContain('aria-label="Close"');
    expect(html).toContain(">Cancel</button>");
  });

  it("makes a destructive action the solid red button", () => {
    expect(html).toMatch(/<button[^>]*class="button-delete"[^>]*>Remove<\/button>/);
  });

  it("makes any other action Primary", () => {
    const other = renderToStaticMarkup(
      createElement(ConfirmSheet, { title: "Confirm Dinner", confirmLabel: "Confirm anyway", onConfirm: noop, onClose: noop }),
    );
    expect(other).toMatch(/<button[^>]*class="button-primary"[^>]*>Confirm anyway<\/button>/);
  });
});

describe("a sheet with its action running", () => {
  it("can't be closed, as closing would look like cancelling", () => {
    const html = renderToStaticMarkup(createElement(Sheet, { title: "Remove Fish?", busy: true, onClose: noop }));
    expect(html).toMatch(/<button[^>]*class="sheet-close"[^>]*disabled=""/);
  });
});

describe("the delete sheet", () => {
  it("says what deleting means, with a destructive Delete", () => {
    const html = renderToStaticMarkup(createElement(DeleteSheet, { name: "Chickpeas", onDelete: noop, onClose: noop }));
    expect(html).toContain("Delete Chickpeas?");
    expect(html).toContain("This can&#x27;t be undone.");
    expect(html).toMatch(/<button[^>]*class="button-delete"[^>]*>Delete<\/button>/);
  });
});

describe("the Archive sheet", () => {
  const html = renderToStaticMarkup(
    createElement(ArchiveSheet, {
      name: "Basmati rice",
      effects: [
        { tone: "gone", text: "It leaves" },
        { tone: "warn", text: "Meals change" },
        { tone: "kept", text: "History stays" },
      ],
      onArchive: noop,
      onClose: noop,
    }),
  );

  it("asks about Archiving and says why it can't be deleted", () => {
    expect(html).toContain("Archive Basmati rice?");
    expect(html).toContain("Basmati rice is in use, so it can&#x27;t be deleted. Archiving keeps your history intact:");
  });

  it("lists what happens, each with its own marker", () => {
    expect(html).toContain('<li class="sheet-effect-gone">It leaves</li>');
    expect(html).toContain('<li class="sheet-effect-warn">Meals change</li>');
    expect(html).toContain('<li class="sheet-effect-kept">History stays</li>');
  });

  it("has a destructive Archive and a Cancel", () => {
    expect(html).toMatch(/<button[^>]*class="button-delete"[^>]*>Archive<\/button>/);
    expect(html).toContain(">Cancel</button>");
  });
});

describe("the sheet's layout", () => {
  it("keeps its own title inside the Remove card, which styles only its direct children", () => {
    expect(css).not.toMatch(/\.product-remove [a-z]/);
  });

  it("sits at the bottom on phone, with no Close button", () => {
    expect(phoneCss).toMatch(/\.sheet {[^}]*bottom: 0/);
    expect(phoneCss).toMatch(/\.sheet-close {[^}]*display: none/);
  });

  it("is a centered dialog with the Close button on desktop", () => {
    const desktop = css.slice(css.indexOf("/* Sheet on desktop */"));
    expect(desktop).toMatch(/\.sheet {[^}]*margin: auto/);
    expect(desktop).toMatch(/\.sheet-close {[^}]*display: flex/);
  });
});

describe("browser popups", () => {
  it("are gone: nothing calls confirm or alert", () => {
    const used = componentFiles(appDir).filter((path) => /\b(confirm|alert)\(/.test(readFileSync(path, "utf8")));
    expect(used).toEqual([]);
  });
});
