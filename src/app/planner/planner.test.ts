import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MealMenuList, type PlannerMeal, type PlannerMealSlot, type SlotWarnings } from "./meal-card";
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

const text = (markup: string) =>
  markup.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();

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

describe("the Earlier this week row on phone", () => {
  const row = (html: string) => /<button [^>]*class="planner-earlier[^"]*"[^>]*>(.*?)<\/button>/.exec(html);

  it("names the days before today", () => {
    expect(text(/<strong>(.*?)<\/strong>/.exec(row(render())![1]!)![1]!)).toBe("Earlier this week · Mon 26 to Wed 28");
  });

  it("names the one day before today on Tuesday", () => {
    const html = render({ today: "2026-10-27" });
    expect(text(/<strong>(.*?)<\/strong>/.exec(row(html)![1]!)![1]!)).toBe("Earlier this week · Mon 26");
  });

  const counts = (html: string) => text(row(html)![1]!.replace(/<strong>.*?<\/strong>/, ""));
  const unconfirmed = (html: string) => /<span class="planner-earlier-unconfirmed">(.*?)<\/span>/.exec(row(html)![1]!);

  it("counts the Meals on those days, and only those", () => {
    const meals = [
      meal({ id: "mon", date: "2026-10-26", status: "confirmed" }),
      meal({ id: "wed", date: "2026-10-28", status: "skipped" }),
      meal({ id: "thu", date: "2026-10-29" }),
    ];
    expect(counts(render({ meals }))).toBe("2 Meals");
    expect(counts(render({ meals: meals.slice(0, 1) }))).toBe("1 Meal");
    expect(counts(render())).toBe("0 Meals");
    expect(unconfirmed(render({ meals }))).toBeNull();
  });

  it("adds how many are Unconfirmed, with the clock icon", () => {
    const meals = [
      meal({ id: "mon", date: "2026-10-26" }),
      meal({ id: "tue", date: "2026-10-27", untracked: true }),
      meal({ id: "wed", date: "2026-10-28", status: "confirmed" }),
    ];
    const html = render({ meals });
    expect(counts(html)).toBe("3 Meals · 2 Unconfirmed");
    expect(unconfirmed(html)![1]).toContain("<svg");
  });

  it("starts folded, folding away those days on phone only", () => {
    const html = render();
    expect(row(html)![0]).toContain('aria-expanded="false"');
    expect(row(html)![0]).toContain('class="planner-earlier phone-only"');
    const folded = [...html.matchAll(/<section id="planner-day-([^"]*)" class="([^"]*)"/g)]
      .filter((found) => found[2]!.split(" ").includes("planner-day-folded"))
      .map((found) => found[1]);
    expect(folded).toEqual(["2026-10-26", "2026-10-27", "2026-10-28"]);
  });

  it("is not shown on Monday, which has no earlier days", () => {
    expect(row(render({ today: "2026-10-26" }))).toBeNull();
  });

  it("is never shown in Next week", () => {
    expect(row(render({ week: "next" }))).toBeNull();
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

    it("takes Edit and Remove off the card itself", () => {
      const buttons = [...card()[2]!.matchAll(/<button [^>]*>(.*?)<\/button>/g)].map((button) => text(button[1]!));
      expect(buttons).not.toContain("Edit");
      expect(buttons).not.toContain("Remove");
    });
  });

  describe("its Reopen button", () => {
    const reopen = (html: string) => /<button [^>]*class="meal-card-reopen"[^>]*>(.*?)<\/button>/.exec(html)?.[1];

    it.each([
      ["a Confirmed Meal", { status: "confirmed" as const }],
      ["a Confirmed · Untracked Meal", { status: "confirmed" as const, untracked: true }],
      ["a Skipped Meal", { status: "skipped" as const }],
      ["a Confirmed Meal on an earlier day", { status: "confirmed" as const, date: "2026-10-27" }],
    ])("shows on %s, in the card's head", (_case, overrides) => {
      const html = card(overrides)[2]!;
      expect(text(reopen(html)!)).toBe("Reopen");
      expect(html).toMatch(/<div class="meal-card-head">.*class="meal-card-reopen"/);
    });

    it.each([
      ["a Planned Meal", {}],
      ["an Untracked Meal that is still Planned", { untracked: true }],
      ["an Unconfirmed Meal", { date: "2026-10-27" }],
      ["an Unconfirmed Untracked Meal", { date: "2026-10-27", untracked: true }],
    ])("isn't shown on %s", (_case, overrides) => {
      expect(reopen(card(overrides)[2]!)).toBeUndefined();
    });
  });
});

describe("a slot on a Meal card", () => {
  const slot = (overrides: Partial<PlannerMealSlot> = {}): PlannerMealSlot => ({
    id: "slot-1",
    slotCategoryId: "main",
    slotCategoryLabel: "Main Dish",
    slotCategoryArchived: false,
    food: { content: "recipe", id: "salmon", label: "Grilled salmon", portions: 2, archived: false },
    warnings: null,
    ...overrides,
  });
  const rows = (mealOverrides: Partial<PlannerMeal>, ...slots: PlannerMealSlot[]) =>
    [...render({ meals: [meal({ ...mealOverrides, slots })] }).matchAll(/<li class="(slot-row[^"]*)"[^>]*>(.*?)<\/li>/g)];
  const row = (overrides: Partial<PlannerMealSlot> = {}, mealOverrides: Partial<PlannerMeal> = {}) => {
    const found = rows(mealOverrides, slot(overrides))[0]!;
    return { className: found[1]!, html: found[2]! };
  };
  const part = (markup: string, className: string) =>
    new RegExp(`<[a-z0-9]+ [^>]*class="${className}"[^>]*>(.*?)</(span|p|div)>`).exec(markup)?.[1];

  it("shows its Slot Category pill, its food, its Portions and a chevron", () => {
    const { html } = row();
    expect(text(part(html, "pill")!)).toBe("Main Dish");
    expect(text(part(html, "slot-row-food")!)).toBe("Grilled salmon");
    expect(text(part(html, "slot-row-amount")!)).toBe("2 portions");
    expect(html).toContain("slot-row-chevron");
  });

  it.each([
    [1, "1 portion"],
    [1800, "1,800 portions"],
  ])("shows %i Portions as %s", (portions, expected) => {
    const { html } = row({ food: { content: "recipe", id: "salmon", label: "Grilled salmon", portions, archived: false } });
    expect(text(part(html, "slot-row-amount")!)).toBe(expected);
  });

  it.each([
    [250, "g" as const, "250 g"],
    [1800, "g" as const, "1,800 g"],
    [2, "pc" as const, "2 pc"],
  ])("shows a Product's quantity %i %s as %s", (quantity, defaultUnit, expected) => {
    const { html } = row({ food: { content: "product", id: "spinach", label: "Spinach", quantity, defaultUnit, archived: false } });
    expect(text(part(html, "slot-row-food")!)).toBe("Spinach");
    expect(text(part(html, "slot-row-amount")!)).toBe(expected);
  });

  it("shows Leftovers and that it deducts nothing", () => {
    const { html } = row({ food: { content: "leftovers" } });
    expect(text(part(html, "slot-row-food")!)).toBe("Leftovers");
    expect(text(part(html, "slot-row-amount")!)).toBe("Deducts nothing");
  });

  it("dashes an empty slot and says Not chosen yet", () => {
    const { className, html } = row({ food: { content: "empty" } });
    expect(className).toContain("slot-row-dashed");
    expect(text(part(html, "slot-row-amount")!)).toBe("Not chosen yet");
    expect(part(html, "slot-row-food")).toBeUndefined();
    expect(row().className).not.toContain("slot-row-dashed");
  });

  describe("its warnings", () => {
    const strips = (warnings: SlotWarnings, date = today) =>
      [...row({ warnings }, { date }).html.matchAll(/<div class="slot-strip ([^"]*)"[^>]*>(.*?)<\/div>/g)].map(
        (strip) => ({ tone: strip[1], text: text(strip[2]!) }),
      );
    const spinach = { name: "Spinach", amount: 100, defaultUnit: "g" as const };

    it.each([
      ["today", today, "slot-strip-urgent"],
      ["a day away", "2026-10-30", "slot-strip-urgent"],
      ["two days away", "2026-10-31", "slot-strip-upcoming"],
    ])("shows a Shortfall at the foot of the slot, for a Meal %s", (_case, date, tone) => {
      expect(strips({ shortfalls: [spinach], unprojectable: [] }, date)).toEqual([{ tone, text: "Short 100 g Spinach" }]);
    });

    it("shows each Product short of, with numbers as 1,800 g", () => {
      const rice = { name: "Basmati rice", amount: 1800, defaultUnit: "g" as const };
      expect(strips({ shortfalls: [spinach, rice], unprojectable: [] })[0]!.text).toBe(
        "Short 100 g Spinach Short 1,800 g Basmati rice",
      );
    });

    it("shows a Product that can't be projected as a grey strip", () => {
      expect(strips({ shortfalls: [], unprojectable: ["Olive oil"] })).toEqual([
        { tone: "slot-strip-neutral", text: "Can't project Olive oil: its unit does not convert" },
      ]);
    });

    it("shows a Shortfall and a Product that can't be projected as two strips", () => {
      expect(strips({ shortfalls: [spinach], unprojectable: ["Olive oil"] }).map((strip) => strip.tone)).toEqual([
        "slot-strip-urgent",
        "slot-strip-neutral",
      ]);
    });
  });

  describe("with an Archived Slot Category", () => {
    const archived = { slotCategoryLabel: "Red Meat", slotCategoryArchived: true };
    const buttons = (html: string) => [...html.matchAll(/<button [^>]*>(.*?)<\/button>/g)].map((button) => text(button[1]!));

    it("strikes through and dashes its pill, and asks to pick another category", () => {
      const { className, html } = row(archived);
      expect(html).toMatch(/<span class="pill pill-archived">Red Meat<\/span>/);
      expect(className).toContain("slot-row-dashed");
      expect(text(part(html, "slot-row-archived-note")!)).toBe("Category archived - pick another");
      expect(buttons(html)).toEqual(["Pick another category"]);
    });

    it("shows its pill struck through on a Confirmed Meal, with nothing to pick", () => {
      const { html } = row(archived, { status: "confirmed" });
      expect(html).toContain("pill-archived");
      expect(html).not.toContain("slot-row-archived-note");
      expect(buttons(html)).toEqual([]);
    });
  });

  it("opens the slot picker on a tap, on a Planned Meal", () => {
    const button = /<button [^>]*class="slot-row-main"[^>]*>/.exec(row().html)?.[0];
    expect(button).toContain('aria-expanded="false"');
  });

  it.each([
    ["a Confirmed Meal", { status: "confirmed" as const }],
    ["a Skipped Meal", { status: "skipped" as const }],
  ])("shows a slot on %s as it was, with nothing to tap", (_case, mealOverrides) => {
    const { html } = row({}, mealOverrides);
    expect(text(part(html, "pill")!)).toBe("Main Dish");
    expect(text(part(html, "slot-row-food")!)).toBe("Grilled salmon");
    expect(text(part(html, "slot-row-amount")!)).toBe("2 portions");
    expect(html).not.toMatch(/<button/);
    expect(html).not.toContain("slot-row-chevron");
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
