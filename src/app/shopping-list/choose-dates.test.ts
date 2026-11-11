import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DatesChoice } from "@/core/shopping-list";
import { ChooseDates, datesLabel } from "./choose-dates";

// Wednesday 11 Nov 2026, for the viewer: the Planner covers 9-22 Nov.
const today = "2026-11-11";
const render = (choice: DatesChoice) =>
  renderToStaticMarkup(createElement(ChooseDates, { today, choice, onUse: () => {}, onClose: () => {} }));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
// The option picked in the select named `name`.
const picked = (html: string, name: string) =>
  new RegExp(`<select[^>]*name="${name}"[^>]*>.*?</select>`).exec(html)![0].match(/<option[^>]*selected=""[^>]*>([^<]*)</)![1];
const radio = (html: string, value: string) => new RegExp(`<input[^>]*type="radio"[^>]*value="${value}"[^>]*>`).exec(html)![0];

describe("Choose dates", () => {
  const html = render({ preset: "planned" });

  it("is titled Choose dates, under From Shortfalls", () => {
    expect(text(html)).toContain("From Shortfalls Choose dates");
  });

  it("offers Planned week, Next week and Both weeks, each with its dates", () => {
    expect(text(html)).toContain("Planned week 9–15 Nov");
    expect(text(html)).toContain("Next week 16–22 Nov");
    expect(text(html)).toContain("Both weeks 9–22 Nov");
  });

  it("picks the chosen preset and fills From and To with its dates", () => {
    expect(radio(html, "planned")).toContain('checked=""');
    expect(radio(html, "next")).not.toContain("checked");
    expect(picked(html, "from")).toBe("Mon 9 Nov");
    expect(picked(html, "to")).toBe("Sun 15 Nov");
    const both = render({ preset: "both" });
    expect(picked(both, "from")).toBe("Mon 9 Nov");
    expect(picked(both, "to")).toBe("Sun 22 Nov");
  });

  it("offers only the 14 days the Planner covers in From and To", () => {
    const from = /<select[^>]*name="from"[^>]*>.*?<\/select>/.exec(html)![0];
    const options = [...from.matchAll(/<option[^>]*>([^<]*)</g)].map((match) => match[1]);
    expect(options).toHaveLength(14);
    expect(options[0]).toBe("Mon 9 Nov");
    expect(options.at(-1)).toBe("Sun 22 Nov");
  });

  it("picks no preset for dates of your own", () => {
    const own = render({ preset: null, range: { from: "2026-11-12", to: "2026-11-17" } });
    expect(own).not.toMatch(/type="radio"[^>]*checked/);
    expect(picked(own, "from")).toBe("Thu 12 Nov");
    expect(picked(own, "to")).toBe("Tue 17 Nov");
  });

  it("says which dates it takes, under the fields", () => {
    expect(text(html)).toContain("Pick any dates in the two weeks the Planner covers. Cancel Use these dates");
  });

  it("asks for From on or before To, and won't use the dates until then", () => {
    const backwards = render({ preset: null, range: { from: "2026-11-18", to: "2026-11-17" } });
    expect(text(backwards)).toContain("Pick any dates in the two weeks the Planner covers. From must be on or before To.");
    expect(backwards).toMatch(/<button[^>]*disabled=""[^>]*>Use these dates<\/button>/);
    expect(html).not.toContain("From must be on or before To.");
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Use these dates/);
  });
});

describe("the dates button", () => {
  it("names the preset and its dates", () => {
    expect(datesLabel({ preset: "planned" }, today)).toBe("Planned week · 9–15 Nov");
    expect(datesLabel({ preset: "next" }, today)).toBe("Next week · 16–22 Nov");
    expect(datesLabel({ preset: "both" }, today)).toBe("Both weeks · 9–22 Nov");
  });

  it("shows only the dates of your own", () => {
    expect(datesLabel({ preset: null, range: { from: "2026-11-12", to: "2026-11-17" } }, today)).toBe("12–17 Nov");
  });

  it("names the preset alone until the viewer's date is known", () => {
    expect(datesLabel({ preset: "planned" }, null)).toBe("Planned week");
  });
});
