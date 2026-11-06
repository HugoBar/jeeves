import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EditMealPanel, EditMealPanelView, MealFormFields, MealMenuList, NewMealSlotsCard, ReopenSheet, type PlannerMeal, type PlannerMealSlot, type SlotWarnings } from "./meal-card";
import { AddMealPanel, AddMealPanelView, PlannerView } from "./planner";

type Props = ComponentProps<typeof PlannerView>;

// Thursday 29 Oct 2026: this week runs 26 Oct–1 Nov, next week 2–8 Nov.
const today = "2026-10-29";

const pickers: Props["pickers"] = {
  mealTypes: [],
  templates: [],
  slotCategories: [],
  archivedSlotCategories: [],
  slotFoods: { recipes: [], products: [] },
};

const render = (props: Partial<Props> = {}) =>
  renderToStaticMarkup(
    createElement(PlannerView, { today, week: "this", meals: [], pickers, onWeekChange: () => {}, ...props }),
  );

const text = (markup: string) =>
  markup.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();

// Each ▲ or ▼ on a Meal form's slots, in order, by its name.
const moveButtons = (html: string) =>
  [...html.matchAll(/<button type="button"[^>]*aria-label="(Move [^"]*)"[^>]*>/g)].map((m) => ({
    label: m[1],
    disabled: /\sdisabled=""/.test(m[0]),
  }));

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
  addsBack: [],
  takes: { ok: true, products: [] },
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

  // Untracked is set on the Meal form.
  it.each([[false], [true]])("has no Mark or Unmark Untracked button (untracked: %s)", (untracked) => {
    expect(text(card({ untracked })[2]!)).not.toMatch(/Mark Untracked|Unmark Untracked/);
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

describe("the Reopen sheet", () => {
  const sheet = (overrides: Partial<PlannerMeal> = {}, sheetToday = today) =>
    renderToStaticMarkup(
      createElement(ReopenSheet, {
        meal: meal({ status: "confirmed", hour: "08:00", name: "Overnight oats", ...overrides }),
        today: sheetToday,
        onClose: () => {},
      }),
    );
  const effects = (html: string) => [...html.matchAll(/<li class="([^"]*)">(.*?)<\/li>/g)].map((li) => [li[1], text(li[2]!)]);
  const addsBack = (html: string) =>
    [...html.matchAll(/<div class="reopen-adds-back-row"><dt>(.*?)<\/dt><dd>(.*?)<\/dd><\/div>/g)].map((row) => [
      text(row[1]!),
      text(row[2]!),
    ]);

  it("is headed with the Meal's day and hour, and Reopen {Meal}?", () => {
    const html = sheet({ date: "2026-10-27" });
    expect(text(/<span class="sheet-eyebrow">(.*?)<\/span>/.exec(html)![1]!)).toBe("Tue 27 Oct · 08:00");
    expect(text(/<h2 [^>]*>(.*?)<\/h2>/.exec(html)![1]!)).toBe("Reopen Overnight oats?");
  });

  it("says Today in the heading of a Meal dated today", () => {
    expect(text(/<span class="sheet-eyebrow">(.*?)<\/span>/.exec(sheet())![1]!)).toBe("Today · Thu 29 Oct · 08:00");
  });

  it("names a Meal with no name by its Meal Type", () => {
    expect(text(/<h2 [^>]*>(.*?)<\/h2>/.exec(sheet({ name: null }))![1]!)).toBe("Reopen Lunch?");
  });

  it.each([
    [{}, "Confirmed"],
    [{ untracked: true }, "Confirmed · Untracked"],
    [{ status: "skipped" as const }, "Skipped"],
  ])("shows %o's current status as %s", (overrides, expected) => {
    const status = /<p class="meal-status ([^"]*)">(.*?)<\/p>/.exec(sheet(overrides))!;
    expect(text(status[2]!)).toBe(expected);
    expect(status[2]).toContain("<svg");
  });

  it("says a Meal dated today or later goes back to Planned", () => {
    expect(effects(sheet({ date: "2026-10-30" }))[0]).toEqual([
      "sheet-effect-back",
      "It goes back to Planned, so you can change it and confirm again.",
    ]);
    expect(effects(sheet())[0]![1]).toBe("It goes back to Planned, so you can change it and confirm again.");
  });

  it("says a Meal whose day has passed goes back to Unconfirmed", () => {
    expect(effects(sheet({ date: "2026-10-27" }))[0]).toEqual([
      "sheet-effect-back",
      "It goes back to Unconfirmed, because its day has passed.",
    ]);
  });

  it("lists what the Confirmation took in an Adds back to Stock box", () => {
    const html = sheet({
      addsBack: [
        { name: "Milk", defaultUnit: "ml", quantity: 200 },
        { name: "Oat flakes", defaultUnit: "g", quantity: 1800 },
      ],
    });
    expect(effects(html)[1]).toEqual([
      "sheet-effect-add",
      "Exactly what confirming took is added back, as Stock Movements linked to this Meal.",
    ]);
    expect(text(/<p class="reopen-adds-back-label">(.*?)<\/p>/.exec(html)![1]!)).toBe("Adds back to Stock");
    expect(addsBack(html)).toEqual([
      ["Milk", "+ 200 ml"],
      ["Oat flakes", "+ 1,800 g"],
    ]);
  });

  it.each([
    [{ status: "skipped" as const }, "Nothing was taken when it was Skipped, so nothing is added back."],
    [{ untracked: true }, "Nothing was taken when it was Confirmed as Untracked, so nothing is added back."],
    [{}, "Nothing was taken when it was Confirmed, so nothing is added back."],
  ])("says nothing is added back for %o, with no box", (overrides, expected) => {
    const html = sheet(overrides);
    expect(effects(html)[1]).toEqual(["sheet-effect-kept", expected]);
    expect(html).not.toContain("reopen-adds-back");
  });

  it("has Cancel and Reopen at its foot", () => {
    const foot = /<div class="sheet-actions">(.*?)<\/div>/.exec(sheet())![1]!;
    expect([...foot.matchAll(/<button [^>]*>(.*?)<\/button>/g)].map((button) => text(button[1]!))).toEqual([
      "Cancel",
      "Reopen",
    ]);
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

  describe("with an Archived Recipe or Product", () => {
    const product = { food: { content: "product" as const, id: "spinach", label: "Spinach", quantity: 250, defaultUnit: "g" as const, archived: true } };
    const recipe = { food: { content: "recipe" as const, id: "salmon", label: "Grilled salmon", portions: 2, archived: true } };

    it.each([
      ["today", today],
      ["on a later day", "2026-10-31"],
    ])("asks to pick another Product in a Meal %s, still opening the picker on a tap", (_case, date) => {
      const { className, html } = row(product, { date });
      expect(className).toContain("slot-row-dashed");
      expect(text(part(html, "slot-row-food")!)).toBe("Spinach");
      expect(text(part(html, "slot-row-archived-note")!)).toBe("Product archived - pick another");
      expect(/<button [^>]*class="slot-row-main"[^>]*>/.exec(html)?.[0]).toContain('aria-expanded="false"');
    });

    it("asks to pick another Recipe in a Meal today", () => {
      expect(text(part(row(recipe).html, "slot-row-archived-note")!)).toBe("Recipe archived - pick another");
    });

    it("keeps it, tagged Archived, in a Meal whose day has passed", () => {
      const { className, html } = row(product, { date: "2026-10-28" });
      expect(className).not.toContain("slot-row-dashed");
      expect(text(part(html, "slot-row-food")!)).toBe("Spinach Archived");
      expect(html).not.toContain("slot-row-archived-note");
    });

    it("asks for another category first when that is Archived too", () => {
      const { html } = row({ ...recipe, slotCategoryLabel: "Red Meat", slotCategoryArchived: true });
      expect(text(part(html, "slot-row-archived-note")!)).toBe("Category archived - pick another");
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

describe("the Meal panel", () => {
  const renderAdd = (date: string, week: "this" | "next") =>
    renderToStaticMarkup(createElement(AddMealPanel, { date, week, pickers, onClose: () => {} }));
  const renderEdit = (week: "this" | "next") =>
    renderToStaticMarkup(
      createElement(EditMealPanel, { meal: meal({ date: "2026-11-03" }), week, pickers, onClose: () => {} }),
    );
  const label = (html: string) => text(/<p class="side-panel-label">(.*?)<\/p>/.exec(html)![1]!);
  const title = (html: string) => text(/<h2 [^>]*>(.*?)<\/h2>/.exec(html)![1]!);
  const buttons = (html: string) => [...html.matchAll(/<button [^>]*>(.*?)<\/button>/g)].map((b) => text(b[1]!));

  it("says which day a New Meal is added to, and is titled New Meal", () => {
    const html = renderAdd("2026-10-30", "this");
    expect(label(html)).toBe("Adding to: this Friday · 30 Oct");
    expect(title(html)).toBe("New Meal");
  });

  it("says which day a Meal is edited on, and is titled with its name", () => {
    const html = renderEdit("next");
    expect(label(html)).toBe("Editing: next Tuesday · 3 Nov");
    expect(title(html)).toBe("Edit Weekday Lunch");
  });

  it("takes the week's accent", () => {
    expect(renderAdd("2026-10-30", "this")).not.toMatch(/side-panel[^"]*meal-panel-next/);
    expect(renderEdit("next")).toMatch(/class="side-panel[^"]*meal-panel-next/);
  });

  it("can be closed by its close button or by Cancel", () => {
    for (const html of [renderAdd("2026-10-30", "this"), renderEdit("this")]) {
      expect(html).toMatch(/<button [^>]*aria-label="Close"/);
      expect(buttons(html)).toContain("Cancel");
    }
  });

  it("ends Edit Meal with a Delete card, and New Meal without one", () => {
    const edit = renderEdit("this");
    expect(text(/<section class="card meal-panel-delete">(.*?)<\/section>/.exec(edit)![1]!)).toMatch(/^Delete .*Delete this Meal$/);
    expect(renderAdd("2026-10-30", "this")).not.toContain("meal-panel-delete");
  });

  it("names its main button for what it does", () => {
    expect(buttons(renderAdd("2026-10-30", "this"))).toContain("Add Meal");
    expect(buttons(renderEdit("this"))).toContain("Save");
  });
});

describe("the Meal panel with a slot picked", () => {
  const main: PlannerMealSlot = {
    id: "slot-1",
    slotCategoryId: "main",
    slotCategoryLabel: "Main Dish",
    slotCategoryArchived: false,
    food: { content: "empty" },
    warnings: null,
  };
  const panelPickers = { ...pickers, slotCategories: [{ id: "main", label: "Main Dish", kind: "role" as const }] };
  const renderView = (picking: ComponentProps<typeof EditMealPanelView>["picking"]) =>
    renderToStaticMarkup(
      createElement(EditMealPanelView, {
        meal: meal({ date: "2026-11-03", slots: [main] }),
        week: "next",
        pickers: panelPickers,
        picking,
        onPicking: () => {},
        onClose: () => {},
      }),
    );

  it("taps a slot on Edit Meal to pick for it", () => {
    const html = renderView(null);
    expect(html).toMatch(/<button type="button" class="slot-row-main"[^>]*>.*?Main Dish/);
  });

  it("offers ▲ and ▼ on each slot on Edit Meal, with the first's ▲ and the last's ▼ disabled", () => {
    const side = { ...main, id: "slot-2", slotCategoryId: "side", slotCategoryLabel: "Side Dish" };
    const html = renderToStaticMarkup(
      createElement(EditMealPanelView, {
        meal: meal({ slots: [main, side] }),
        week: "this",
        pickers: panelPickers,
        picking: null,
        onPicking: () => {},
        onClose: () => {},
      }),
    );
    expect(moveButtons(html)).toEqual([
      { label: "Move Main Dish up", disabled: true },
      { label: "Move Main Dish down", disabled: false },
      { label: "Move Side Dish up", disabled: false },
      { label: "Move Side Dish down", disabled: true },
    ]);
  });

  it("disables both on a Meal's only slot", () => {
    expect(moveButtons(renderView(null)).map((button) => button.disabled)).toEqual([true, true]);
  });

  it("replaces the panel's content with the picker, headed Back to the Meal", () => {
    const html = renderView({ slotId: "slot-1", screen: { kind: "pick" } });
    expect(text(/<button [^>]*class="side-panel-back"[^>]*>(.*?)<\/button>/.exec(html)![1]!)).toBe("Back to Weekday Lunch");
    expect(html).not.toContain("side-panel-label");
    expect(text(/<p class="side-panel-eyebrow">(.*?)<\/p>/.exec(html)![1]!)).toBe("Weekday Lunch · Tue 3 Nov · 12:30");
    expect(text(/<h2 [^>]*>(.*?)<\/h2>/.exec(html)![1]!)).toBe("Pick for Main Dish");
    expect(html).toContain("slot-picker-scope");
  });

  it("stacks nothing on top, and keeps the unsaved form hidden behind", () => {
    const html = renderView({ slotId: "slot-1", screen: { kind: "category", fromPick: true } });
    expect(html).not.toContain("<dialog");
    expect(text(/<h2 [^>]*>(.*?)<\/h2>/.exec(html)![1]!)).toBe("Change Slot Category");
    expect(html).toMatch(/<div class="meal-panel-content" hidden="">.*<input [^>]*name="hour"/);
  });

  it("goes back to the Meal once the slot is gone", () => {
    const html = renderView({ slotId: "removed", screen: { kind: "pick" } });
    expect(text(/<h2 [^>]*>(.*?)<\/h2>/.exec(html)![1]!)).toBe("Edit Weekday Lunch");
    expect(html).not.toMatch(/meal-panel-content" hidden/);
  });
});

describe("Add a Meal", () => {
  type ViewProps = ComponentProps<typeof AddMealPanelView>;
  const lunch = { id: "lunch", label: "Lunch", archived: false };
  const slot = (slotCategoryId: string, label: string, archived = false) => ({ slotCategoryId, label, archived });
  const weekdayLunch = {
    id: "weekday-lunch",
    label: "Weekday Lunch",
    hour: "12:30",
    mealType: lunch,
    slots: [slot("main", "Main Dish"), slot("veg", "Vegetables"), slot("fruit", "Fruit")],
  };
  const familyLunch = {
    id: "family-lunch",
    label: "Family Lunch",
    hour: "13:00",
    mealType: lunch,
    slots: [slot("main", "Main Dish"), slot("side", "Side Dish")],
  };
  const oats = {
    id: "oats",
    label: "Overnight oats",
    hour: "08:00",
    mealType: { id: "breakfast", label: "Breakfast", archived: false },
    slots: [slot("grains", "Grains")],
  };
  const withTemplates: ViewProps["pickers"] = {
    ...pickers,
    mealTypes: [
      { id: "dinner", label: "Dinner" },
      { id: "lunch", label: "Lunch" },
      { id: "breakfast", label: "Breakfast" },
    ],
    templates: [weekdayLunch, familyLunch, oats],
    slotCategories: [
      { id: "main", label: "Main Dish", kind: "role" },
      { id: "side", label: "Side Dish", kind: "role" },
    ],
  };
  const renderView = (step: ViewProps["step"], props: Partial<ViewProps> = {}) =>
    renderToStaticMarkup(
      createElement(AddMealPanelView, {
        date: "2026-10-30",
        week: "this",
        pickers: withTemplates,
        step,
        onStep: () => {},
        addingSlot: null,
        onAddingSlot: () => {},
        onClose: () => {},
        ...props,
      }),
    );
  const title = (html: string) => text(/<h2 [^>]*>(.*?)<\/h2>/.exec(html)![1]!);

  describe("its first screen", () => {
    const groups = (html: string) =>
      [...html.matchAll(/<h4 class="meal-start-group">(.*?)<\/h4>\s*<ul[^>]*>(.*?)<\/ul>/gs)].map((group) => [
        text(group[1]!),
        [...group[2]!.matchAll(/<li>(.*?)<\/li>/gs)].map((row) => text(row[1]!)),
      ]);

    it("is where adding a Meal starts when there are Meal Templates", () => {
      const html = renderToStaticMarkup(
        createElement(AddMealPanel, { date: "2026-10-30", week: "this", pickers: withTemplates, onClose: () => {} }),
      );
      expect(title(html)).toBe("Add a Meal");
      expect(html).not.toContain('name="hour"');
    });

    it("lists the Meal Templates by Meal Type, each with its hour, slot count and slot categories", () => {
      expect(groups(renderView("start"))).toEqual([
        [
          "Lunch",
          [
            "Weekday Lunch 12:30 · 3 slots Main Dish Vegetables Fruit",
            "Family Lunch 13:00 · 2 slots Main Dish Side Dish",
          ],
        ],
        ["Breakfast", ["Overnight oats 08:00 · 1 slot Grains"]],
      ]);
    });

    it("says what a template copies, and that the Meal keeps no link to it", () => {
      expect(text(renderView("start"))).toContain(
        "From a Meal Template Copies its name, Meal Type, hour and empty slots. The Meal keeps no link to it.",
      );
    });

    it("offers each template, and Start from scratch below them, as buttons", () => {
      const html = renderView("start");
      const buttons = [...html.matchAll(/<button type="button"[^>]*>(.*?)<\/button>/gs)].map((b) => text(b[1]!));
      expect(buttons.slice(1)).toEqual([
        expect.stringMatching(/^Weekday Lunch /),
        expect.stringMatching(/^Family Lunch /),
        expect.stringMatching(/^Overnight oats /),
        "Start from scratch Pick a Meal Type and an hour. Add slots if you want them.",
      ]);
    });
  });

  describe("New Meal from a template", () => {
    const fromFamilyLunch = () => renderView({ template: familyLunch });
    const input = (html: string, name: string) => new RegExp(`<input [^>]*name="${name}"[^>]*>`).exec(html)?.[0] ?? "";
    const sent = (html: string, name: string) =>
      [...html.matchAll(new RegExp(`<input type="hidden" name="${name}" value="([^"]*)"`, "g"))].map((m) => m[1]);

    it("is titled with the template", () => {
      expect(title(fromFamilyLunch())).toBe("New Meal from Family Lunch");
    });

    it("picks the template's Meal Type, saying it can still be changed now", () => {
      const html = fromFamilyLunch();
      expect(/<input type="radio" name="mealTypeId"[^>]*value="lunch"[^>]*>/.exec(html)![0]).toContain('checked=""');
      expect(/<input type="radio" name="mealTypeId"[^>]*value="dinner"[^>]*>/.exec(html)![0]).not.toContain("checked");
      expect(text(html)).toContain("Copied from Family Lunch. You can change it now, not after the Meal is added.");
    });

    it("fills in the template's hour and name", () => {
      const html = fromFamilyLunch();
      expect(input(html, "hour")).toContain('value="13:00"');
      expect(input(html, "name")).toContain('value="Family Lunch"');
    });

    it("has the template's slots, all empty and in order, saying so", () => {
      const html = fromFamilyLunch();
      const rows = [...html.matchAll(/<li class="slot-row[^"]*"[^>]*>(.*?)<\/li>/gs)].map((row) => text(row[1]!));
      expect(rows).toEqual(["Main Dish Not chosen yet", "Side Dish Not chosen yet"]);
      expect(sent(html, "slotFood")).toEqual(["", ""]);
      expect(sent(html, "slotCategoryId")).toEqual(["main", "side"]);
      expect(text(html)).toContain("Copied from Family Lunch, all empty.");
    });

    // The Meal keeps it, as the template does, unless it is changed now.
    it("offers the template's Meal Type even when it is Archived", () => {
      const brunch = { ...familyLunch, mealType: { id: "brunch", label: "Brunch", archived: true } };
      const html = renderView({ template: brunch });
      expect(/<input type="radio" name="mealTypeId"[^>]*value="brunch"[^>]*>/.exec(html)![0]).toContain('checked=""');
    });

    it("shows a slot with an Archived Slot Category by its name", () => {
      const sauces = { ...familyLunch, slots: [slot("sauces", "Sauces", true)] };
      const html = renderView(
        { template: sauces },
        { pickers: { ...withTemplates, templates: [sauces], archivedSlotCategories: [{ id: "sauces", label: "Sauces" }] } },
      );
      expect(text(html)).toContain("Sauces Not chosen yet");
    });
  });

  it("opens New Meal from scratch, with its own hints", () => {
    const html = renderView("scratch");
    expect(title(html)).toBe("New Meal");
    expect(text(html)).toContain("It can't be changed after the Meal is added.");
    expect(text(html)).toContain("Add slots now, or later from the Planner.");
  });

  it("shows Add a slot in New Meal's place, with a way back to it, keeping New Meal hidden", () => {
    const html = renderView("scratch", { addingSlot: { screen: { kind: "food" }, deliver: () => {} } });
    expect(title(html)).toBe("Add a slot");
    expect(html).toMatch(/<button [^>]*>.*?Back to New Meal<\/button>/s);
    expect(html).toMatch(/meal-panel-content" hidden/);
    expect(html).toContain('name="hour"');
  });
});

describe("the Meal form", () => {
  const mealTypes = [
    { id: "dinner", label: "Dinner" },
    { id: "lunch", label: "Lunch" },
  ];
  type FormProps = ComponentProps<typeof MealFormFields>;
  const renderForm = (props: Partial<FormProps> = {}) =>
    renderToStaticMarkup(
      createElement(MealFormFields, { errors: [], values: { mealTypeId: "", hour: "", name: "", untracked: false }, mealTypes, ...props }),
    );
  const renderEditForm = (props: Partial<FormProps> = {}) =>
    renderForm({ mealTypes: [], editing: meal(), values: { hour: "12:30", name: "Weekday Lunch", untracked: false }, ...props });
  const banner = (html: string) => text(/<div role="alert" class="banner banner-error">(.*?)<\/div>/.exec(html)?.[1] ?? "");
  const errorTexts = (html: string) => [...html.matchAll(/<p class="form-error">(.*?)<\/p>/g)].map((m) => text(m[1]!));
  const input = (html: string, name: string) => new RegExp(`<input [^>]*name="${name}"[^>]*>`).exec(html)?.[0] ?? "";

  it("offers the Meal Types as chips when adding, saying it can't be changed after", () => {
    const html = renderForm();
    const chips = [...html.matchAll(/<label class="chip meal-type-chip">(.*?)<\/label>/g)].map((m) => text(m[1]!));
    expect(chips).toEqual(["Dinner", "Lunch"]);
    expect(html).toMatch(/<input type="radio" name="mealTypeId" value="dinner"/);
    expect(text(html)).toContain("It can't be changed after the Meal is added.");
  });

  it("shows the Meal Type locked when editing, saying it can't be changed", () => {
    const html = renderEditForm();
    expect(html).not.toContain('name="mealTypeId"');
    expect(text(/<span class="field-locked">(.*?)<\/span>/.exec(html)![1]!)).toBe("Lunch");
    expect(text(html)).toContain("A Meal's type can't be changed.");
  });

  it("takes the hour as typed 24-hour text, like 19:30", () => {
    const hour = input(renderEditForm(), "hour");
    expect(hour).not.toContain('type="time"');
    expect(hour).toContain('placeholder="19:30"');
    expect(hour).toContain('value="12:30"');
  });

  it("marks the name optional, and says what an empty one shows", () => {
    expect(text(renderForm())).toContain("Name · optional");
    expect(input(renderForm(), "name")).toContain('placeholder="Leave empty to show the Meal Type"');
    expect(input(renderForm({ values: { mealTypeId: "dinner", hour: "", name: "", untracked: false } }), "name")).toContain(
      "placeholder=\"Leave empty to show &quot;Dinner&quot;\"",
    );
    expect(input(renderEditForm(), "name")).toContain("placeholder=\"Leave empty to show &quot;Lunch&quot;\"");
  });

  it("shows no banner before a submit is rejected", () => {
    expect(renderForm()).not.toContain('role="alert"');
  });

  it("counts the real errors in its banner, and shows each under its field", () => {
    const two = renderForm({ errors: ["invalidHour", "noMealType"] });
    expect(banner(two)).toBe("Fix 2 things to add this Meal. They're marked in red below.");
    expect(errorTexts(two)).toEqual(["Pick a Meal Type. It can't be changed later.", "Enter an hour, like 19:30."]);
    expect(input(two, "hour")).toContain('aria-invalid="true"');
    // The error takes the hint's place.
    expect(text(two)).not.toContain("It can't be changed after the Meal is added.");

    const one = renderEditForm({ errors: ["invalidHour"] });
    expect(banner(one)).toBe("Fix 1 thing to save this Meal. It's marked in red below.");
    expect(errorTexts(one)).toEqual(["Enter an hour, like 19:30."]);
  });

  describe("its Slots card when adding", () => {
    type CardProps = ComponentProps<typeof NewMealSlotsCard>;
    const slotPickers: CardProps["pickers"] = {
      slotCategories: [
        { id: "main", label: "Main Dish", kind: "role" },
        { id: "side", label: "Side Dish", kind: "role" },
      ],
      slotFoods: {
        recipes: [{ id: "curry", label: "Chicken curry", portions: 4, categoryIds: ["main"] }],
        products: [{ id: "rice", label: "Basmati rice", defaultUnit: "g", categoryIds: ["side"] }],
      },
    };
    const added = [
      { food: "recipe:curry", amount: "4", slotCategoryId: "main" },
      { food: "product:rice", amount: "150", slotCategoryId: "side" },
    ];
    const renderCard = (props: Partial<CardProps> = {}) =>
      renderToStaticMarkup(createElement(NewMealSlotsCard, { pickers: slotPickers, initial: added, onAddSlot: () => {}, ...props }));
    const slotRows = (html: string) => [...html.matchAll(/<li class="(slot-row[^"]*)"[^>]*>(.*?)<\/li>/g)];

    it("is the Slots card of a New Meal", () => {
      const html = renderForm({ slotsCard: createElement(NewMealSlotsCard, { pickers: slotPickers, onAddSlot: () => {} }) });
      expect(html).toMatch(/<h2>Slots<\/h2><p class="field-hint">Add slots now, or later from the Planner.<\/p>/);
    });

    it("says slots can be added now or later, and offers Add slot", () => {
      const html = renderCard({ initial: [] });
      expect(text(html)).toContain("Add slots now, or later from the Planner.");
      expect(text(html)).not.toContain("No slots yet");
      expect(html).toMatch(/<button type="button"[^>]*>.*?Add slot<\/button>/s);
    });

    it("shows each added slot's pill, Portions or quantity and food, with × to remove it", () => {
      const rows = slotRows(renderCard());
      expect(rows.map((row) => text(row[2]!))).toEqual(["Main Dish 4 portions Chicken curry", "Side Dish 150 g Basmati rice"]);
      expect(rows[0]![2]).toMatch(/<button type="button"[^>]*aria-label="Remove Main Dish slot"/);
    });

    it("offers ▲ and ▼ on each added slot, named for it, with the first's ▲ and the last's ▼ disabled", () => {
      expect(moveButtons(renderCard())).toEqual([
        { label: "Move Main Dish up", disabled: true },
        { label: "Move Main Dish down", disabled: false },
        { label: "Move Side Dish up", disabled: false },
        { label: "Move Side Dish down", disabled: true },
      ]);
    });

    it("shows a chevron on each added slot, as the Planner's slots have", () => {
      const rows = slotRows(renderCard());
      expect(rows.every((row) => row[2]!.includes("slot-row-chevron"))).toBe(true);
    });

    it("sends the added slots with the form, in the order shown", () => {
      const html = renderCard();
      const sent = (name: string) => [...html.matchAll(new RegExp(`<input type="hidden" name="${name}" value="([^"]*)"`, "g"))].map((m) => m[1]);
      expect(sent("slotFood")).toEqual(["recipe:curry", "product:rice"]);
      expect(sent("slotAmount")).toEqual(["4", "150"]);
      expect(sent("slotCategoryId")).toEqual(["main", "side"]);
    });

    it("says which slot was refused and why, under it", () => {
      const rows = slotRows(renderCard({ errors: [{ row: 2, code: "unavailableFood" }] }));
      expect(rows[0]![2]).not.toContain("form-error");
      expect(text(rows[1]![2]!)).toContain(
        "Slot 2 (Basmati rice): That was removed or no longer fits this slot. Pick another.",
      );
    });

    // Removed since, say, so its label is gone too.
    it("names a refused slot by its row alone when its food is no longer offered", () => {
      const html = renderCard({
        initial: [{ food: "product:gone", amount: "1", slotCategoryId: "side" }],
        errors: [{ row: 1, code: "unavailableFood" }],
      });
      expect(text(html)).toContain("Slot 1: That was removed or no longer fits this slot. Pick another.");
    });

    it("counts refused slots in the form's banner", () => {
      const html = renderForm({ slotErrors: [{ row: 2, code: "unavailableFood" }] });
      expect(banner(html)).toBe("Fix 1 thing to add this Meal. It's marked in red below.");
    });
  });

  it("lists the Meal's slots when editing, or says No slots yet", () => {
    expect(text(renderEditForm())).toContain("No slots yet");
    const slot: PlannerMealSlot = {
      id: "slot-1",
      slotCategoryId: "main",
      slotCategoryLabel: "Main Dish",
      slotCategoryArchived: false,
      food: { content: "recipe", id: "r1", label: "Chicken curry", portions: 4, archived: false },
      warnings: null,
    };
    const html = renderEditForm({ editing: meal({ slots: [slot] }) });
    expect(text(html)).not.toContain("No slots yet");
    expect(text(html)).toMatch(/Main Dish 4 portions Chicken curry/);
  });

  describe("its Tracking and repeat card", () => {
    const card = (html: string) => /<section class="card form-card ?">\s*<div><h2>Tracking and repeat<\/h2>.*?<\/section>/s.exec(html)?.[0] ?? "";
    const untracked = (html: string) => /<input [^>]*name="untracked"[^>]*>/.exec(html)?.[0] ?? "";

    it("has an Untracked switch saying what it means", () => {
      const html = card(renderForm());
      expect(text(html)).toContain("Untracked Eating out or food from outside. Nothing is deducted from Stock.");
    });

    // A real checkbox with its label around it, so a tap on the words flips it.
    it("is a checkbox with a label", () => {
      const html = card(renderForm());
      expect(untracked(html)).toMatch(/type="checkbox"/);
      const label = /<label [^>]*>(.*?)<\/label>/s.exec(html)?.[1] ?? "";
      expect(label).toContain('name="untracked"');
      expect(text(label)).toMatch(/^Untracked /);
    });

    it("starts off for a New Meal, and shows an edited Meal's setting", () => {
      expect(untracked(renderForm())).not.toContain("checked");
      expect(untracked(renderEditForm({ values: { hour: "12:30", name: "", untracked: true } }))).toContain('checked=""');
    });
  });
});
