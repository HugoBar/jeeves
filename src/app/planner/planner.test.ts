import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlannerView } from "./planner";

type Props = ComponentProps<typeof PlannerView>;

// Thursday 29 Oct 2026: this week runs 26 Oct–1 Nov, next week 2–8 Nov.
const today = "2026-10-29";

const pickers: Props["pickers"] = {
  mealTypes: [],
  templates: [],
  slotCategories: [],
  slotFoods: { recipes: [], products: [] },
};

const render = (props: Partial<Props> = {}) =>
  renderToStaticMarkup(
    createElement(PlannerView, { today, week: "this", meals: [], pickers, onWeekChange: () => {}, ...props }),
  );

describe("the week tabs", () => {
  const tabs = (html: string) => [...html.matchAll(/<button [^>]*role="tab"[^>]*>(.*?)<\/button>/g)];

  it("offers This week and Next week as tabs", () => {
    const html = render();
    expect(html).toMatch(/role="tablist"/);
    expect(tabs(html).map((tab) => tab[1]!.replace(/<[^>]+>/g, ""))).toEqual(["This week", "Next week"]);
  });

  it("selects the week shown", () => {
    const selected = (html: string) => tabs(html).map((tab) => /aria-selected="true"/.test(tab[0]));
    expect(selected(render())).toEqual([true, false]);
    expect(selected(render({ week: "next" }))).toEqual([false, true]);
  });
});

describe("the week bar", () => {
  const label = (html: string) => /<p class="planner-week-label">(.*?)<\/p>/.exec(html)![1];

  it("names this week and its dates", () => {
    expect(label(render())).toBe("This week · 26 Oct–1 Nov");
  });

  it("names next week and its dates", () => {
    expect(label(render({ week: "next" }))).toBe("Next week · 2–8 Nov");
  });
});

describe("the day strip on phone", () => {
  const strip = (html: string) => /<nav [^>]*class="planner-strip"[^>]*>(.*?)<\/nav>/.exec(html)![1]!;
  const days = (html: string) => [...strip(html).matchAll(/<a ([^>]*)>(.*?)<\/a>/g)];
  const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  it("shows each weekday of the week shown and its date", () => {
    expect(days(render()).map((day) => text(day[2]!))).toEqual([
      "Mon 26",
      "Tue 27",
      "Wed 28",
      "Thu 29",
      "Fri 30",
      "Sat 31",
      "Sun 1",
    ]);
    expect(text(days(render({ week: "next" }))[0]![2]!)).toBe("Mon 2");
  });

  it("marks today", () => {
    const current = days(render()).filter((day) => /aria-current="date"/.test(day[1]!));
    expect(current.map((day) => text(day[2]!))).toEqual(["Thu 29"]);
  });

  it("marks no day in next week", () => {
    expect(days(render({ week: "next" })).some((day) => /aria-current/.test(day[1]!))).toBe(false);
  });

  it("links each day to its heading, so a tap scrolls to it", () => {
    const html = render();
    expect(days(html)[3]![1]).toContain('href="#planner-day-2026-10-29"');
    expect(html).toMatch(/<section [^>]*id="planner-day-2026-10-29"/);
  });
});

describe("each day", () => {
  const day = (html: string, date: string) =>
    new RegExp(`<section [^>]*id="planner-day-${date}"[^>]*>(.*?)</section>`).exec(html)!;
  const heading = (html: string, date: string) => /<h2[^>]*>(.*?)<\/h2>/.exec(day(html, date)[1]!)![1]!;

  it("shows the week's days in a panel of the selected tab", () => {
    expect(render()).toMatch(/<div [^>]*role="tabpanel"[^>]*aria-labelledby="planner-tab-this"/);
    expect(render({ week: "next" })).toMatch(/<div [^>]*role="tabpanel"[^>]*aria-labelledby="planner-tab-next"/);
    expect(render({ week: "next" })).toMatch(/id="planner-day-2026-11-08"/);
    expect(render({ week: "next" })).not.toMatch(/id="planner-day-2026-10-29"/);
  });

  it("is headed Friday 30 on phone and Fri 30 on desktop", () => {
    const html = heading(render(), "2026-10-30");
    expect(html).toContain('<span class="phone-only">Friday 30</span>');
    expect(html).toContain('<span class="desktop-only">Fri 30</span>');
  });

  it("says Today on today only", () => {
    const html = render();
    expect(day(html, "2026-10-29")[0]).toMatch(/aria-current="date"/);
    expect(heading(html, "2026-10-29")).toContain('<span class="planner-today">Today</span>');
    expect(day(html, "2026-10-30")[0]).not.toMatch(/aria-current/);
    expect(heading(html, "2026-10-30")).not.toContain("Today");
  });

  it("offers + Add Meal on phone and + on desktop, named for its day", () => {
    const add = /<button [^>]*>(.*?)<\/button>/.exec(day(render(), "2026-10-29")[1]!)!;
    expect(add[0]).toContain('aria-label="Add Meal on Thursday 29"');
    expect(add[1]).toContain('<span class="phone-only">+ Add Meal</span>');
    expect(add[1]).toContain('<span class="desktop-only" aria-hidden="true">+</span>');
  });

  it("says No Meals yet when it has none", () => {
    expect(day(render(), "2026-10-29")[1]).toContain('<p class="planner-empty">No Meals yet</p>');
  });
});
