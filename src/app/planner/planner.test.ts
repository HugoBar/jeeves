import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MealMenuList, type PlannerMeal } from "./meal-card";
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

const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const meal = (overrides: Partial<PlannerMeal> = {}): PlannerMeal => ({
  id: "meal-1",
  date: today,
  hour: "12:30",
  createdAt: new Date("2026-10-20T10:00:00Z"),
  name: "Weekday Lunch",
  mealTypeLabel: "Lunch",
  mealTypeArchived: false,
  allowsLeftovers: true,
  status: "planned",
  untracked: false,
  slots: [],
  ...overrides,
});

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

describe("a Meal card", () => {
  const cards = (html: string) => [...html.matchAll(/<article [^>]*class="([^"]*meal-card[^"]*)"[^>]*>(.*?)<\/article>/g)];
  const card = (overrides: Partial<PlannerMeal> = {}) => cards(render({ meals: [meal(overrides)] }))[0]!;
  const part = (markup: string, className: string) =>
    new RegExp(`<[a-z0-9]+ [^>]*class="${className}"[^>]*>(.*?)</`).exec(markup)?.[1];

  it("shows its Meal Type and hour above its name", () => {
    const html = card()[2]!;
    expect(text(part(html, "meal-card-eyebrow")!)).toBe("Lunch · 12:30");
    expect(text(part(html, "meal-card-name")!)).toBe("Weekday Lunch");
  });

  it("shows its Meal Type as its name when it has none", () => {
    expect(text(part(card({ name: null })[2]!, "meal-card-name")!)).toBe("Lunch");
  });

  it("keeps showing an Archived Meal Type's name", () => {
    const html = card({ name: null, mealTypeArchived: true })[2]!;
    expect(text(part(html, "meal-card-eyebrow")!)).toBe("Lunch · 12:30");
    expect(text(part(html, "meal-card-name")!)).toBe("Lunch");
  });

  it("shows a day's Meals by hour, earliest first", () => {
    const html = render({
      meals: [
        meal({ id: "dinner", hour: "19:30", name: "Dinner" }),
        meal({ id: "breakfast", hour: "08:00", name: "Breakfast" }),
        meal({ id: "lunch", hour: "12:30", name: "Lunch" }),
      ],
    });
    expect(cards(html).map((found) => text(part(found[2]!, "meal-card-name")!))).toEqual(["Breakfast", "Lunch", "Dinner"]);
  });

  describe("its status", () => {
    const status = (overrides: Partial<PlannerMeal>) => {
      const found = /<p class="meal-status ([^"]*)">(.*?)<\/p>/.exec(card(overrides)[2]!);
      return found && { className: found[1], icon: found[2]!.includes("<svg"), text: text(found[2]!) };
    };

    it.each([
      [{ status: "confirmed" as const }, "Confirmed"],
      [{ status: "confirmed" as const, untracked: true }, "Confirmed · Untracked"],
      [{ untracked: true }, "Untracked"],
      [{ date: "2026-10-27" }, "Unconfirmed"],
      [{ date: "2026-10-27", untracked: true }, "Unconfirmed · Untracked"],
      [{ status: "skipped" as const }, "Skipped"],
    ])("shows %o as an icon and %s, never a pill", (overrides, expected) => {
      const shown = status(overrides)!;
      expect(shown.text).toBe(expected);
      expect(shown.icon).toBe(true);
      expect(shown.className).not.toMatch(/pill|tag/);
    });

    it("shows nothing for a Planned Meal", () => {
      expect(status({})).toBeNull();
    });
  });

  it("strikes through and greys a Skipped Meal's name", () => {
    expect(card({ status: "skipped" })[1]).toContain("meal-card-skipped");
    expect(card()[1]).not.toContain("meal-card-skipped");
  });

  it("tints an Unconfirmed Meal's card amber", () => {
    expect(card({ date: "2026-10-27" })[1]).toContain("meal-card-unconfirmed");
    expect(card({ date: "2026-10-27", untracked: true })[1]).toContain("meal-card-unconfirmed");
    expect(card()[1]).not.toContain("meal-card-unconfirmed");
  });

  it("doesn't say it came from a Meal Template", () => {
    expect(card()[2]).not.toMatch(/Template/);
  });

  describe("its foot", () => {
    const foot = (overrides: Partial<PlannerMeal>) => {
      const found = /<div class="meal-card-foot">(.*?)<\/div>/.exec(card(overrides)[2]!);
      return found && [...found[1]!.matchAll(/<button [^>]*>(.*?)<\/button>/g)].map((button) => text(button[1]!));
    };

    it("shows + Slot and Confirm on a Planned Meal dated today", () => {
      expect(foot({})).toEqual(["+ Slot", "Confirm"]);
    });

    it("shows only + Slot on a Meal dated after today", () => {
      expect(foot({ date: "2026-10-30" })).toEqual(["+ Slot"]);
    });

    it("shows Confirm or skip in place of Confirm on an Unconfirmed Meal", () => {
      expect(foot({ date: "2026-10-27" })).toEqual(["+ Slot", "Confirm or skip"]);
      expect(foot({ date: "2026-10-27", untracked: true })).toEqual(["+ Slot", "Confirm or skip"]);
    });

    it("isn't shown on a Confirmed or Skipped Meal", () => {
      expect(foot({ status: "confirmed" })).toBeNull();
      expect(foot({ status: "skipped" })).toBeNull();
    });
  });

  describe("its menu button", () => {
    const menuButton = (overrides: Partial<PlannerMeal>) =>
      /<button [^>]*aria-label="Meal options"[^>]*>/.exec(card(overrides)[2]!)?.[0];

    it.each([
      ["a Planned Meal dated today", {}],
      ["a Planned Meal dated after today", { date: "2026-10-30" }],
      ["an Untracked Meal that is still Planned", { untracked: true }],
    ])("shows on %s, closed", (_case, overrides) => {
      const button = menuButton(overrides)!;
      expect(button).toContain('aria-haspopup="menu"');
      expect(button).toContain('aria-expanded="false"');
    });

    it.each([
      ["a Confirmed Meal", { status: "confirmed" as const }],
      ["a Skipped Meal", { status: "skipped" as const }],
      ["an Unconfirmed Meal", { date: "2026-10-27" }],
      ["an Unconfirmed Untracked Meal", { date: "2026-10-27", untracked: true }],
    ])("isn't shown on %s", (_case, overrides) => {
      expect(menuButton(overrides)).toBeUndefined();
    });
  });
});

describe("the Meal menu", () => {
  const renderMenu = () =>
    renderToStaticMarkup(
      createElement(MealMenuList, {
        meal: meal(),
        label: "Weekday Lunch",
        onEdit: () => {},
        onAddSlot: () => {},
        onDelete: () => {},
      }),
    );
  const items = (html: string) => [...html.matchAll(/<button ([^>]*role="menuitem"[^>]*)>(.*?)<\/button>/g)];

  it("shows the Meal's day, Meal Type and hour, and its name", () => {
    const html = renderMenu();
    expect(text(/<p class="meal-menu-eyebrow">(.*?)<\/p>/.exec(html)![1]!)).toBe("Thu 29 · Lunch · 12:30");
    expect(text(/<p class="meal-menu-name">(.*?)<\/p>/.exec(html)![1]!)).toBe("Weekday Lunch");
  });

  it("offers Edit Meal, Add slot and Delete this Meal, with Delete in red", () => {
    const found = items(renderMenu());
    expect(found.map((item) => text(item[2]!))).toEqual(["Edit Meal", "Add slot", "Delete this Meal"]);
    expect(found[2]![1]).toContain("meal-menu-delete");
    expect(found[0]![1]).not.toContain("meal-menu-delete");
  });

  it("is a menu", () => {
    expect(renderMenu()).toMatch(/^<div [^>]*role="menu"/);
  });
});
