// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { confirmMealsAsPlannedAction, skipMealAction } from "../planner/actions";
import type { PlannerMeal, PlannerMealSlot, SlotPickers } from "../planner/meal-card";
import { NeedsConfirmation } from "./needs-confirmation";

// React only flushes updates inside act() when told it runs in a test.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The server actions, so their answers can be chosen and what the page sends
// read back. The rest are the Confirm sheet's and the slot picker's.
vi.mock("../planner/actions", () => ({
  confirmMealsAsPlannedAction: vi.fn(),
  confirmMealAction: vi.fn(),
  skipMealAction: vi.fn(),
  fillMealSlotAction: vi.fn(),
  emptyMealSlotAction: vi.fn(),
  removeMealSlotAction: vi.fn(),
  setMealSlotCategoryAction: vi.fn(),
}));
const confirmAll = vi.mocked(confirmMealsAsPlannedAction);
const skip = vi.mocked(skipMealAction);

// Thursday 29 Oct 2026, mid-morning, for the viewer.
const today = "2026-10-29";
vi.mock("../viewer-clock", () => ({
  useViewerNow: () => ({ date: "2026-10-29", hour: "10:00" }),
  viewerToday: () => "2026-10-29",
}));

const pickers: SlotPickers = { slotCategories: [], slotFoods: { recipes: [], products: [] } };

const slot = (label: string, portions: number): PlannerMealSlot => ({
  id: `slot-${label}`,
  slotCategoryId: "main",
  slotCategoryLabel: "Main Dish",
  slotCategoryArchived: false,
  food: { content: "recipe", id: label, label, portions, archived: false },
  warnings: null,
});

const meal = (id: string, date: string, name: string, overrides: Partial<PlannerMeal> = {}): PlannerMeal => ({
  id,
  date,
  hour: "19:30",
  createdAt: new Date("2026-10-20T10:00:00Z"),
  name,
  mealTypeLabel: "Dinner",
  mealTypeArchived: false,
  allowsLeftovers: true,
  status: "planned",
  untracked: false,
  slots: [slot(name, 4)],
  addsBack: [],
  takes: { ok: true, products: [] },
  ...overrides,
});

const friedRice = meal("fried-rice", "2026-10-27", "Fried rice");
const paella = meal("paella", "2026-10-28", "Paella");

let container: HTMLDivElement;
let root: Root;

const render = (meals: PlannerMeal[]) =>
  act(() => root.render(createElement(NeedsConfirmation, { meals, mealTypes: [], templates: [], archivedSlotCategories: [], ...pickers })));

beforeEach(() => {
  confirmAll.mockReset().mockResolvedValue([]);
  skip.mockReset().mockResolvedValue(null);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const text = (selector: string) => [...container.querySelectorAll(selector)].map((found) => found.textContent);
const cards = () => [...container.querySelectorAll<HTMLElement>("article.meal-card")];
const buttonIn = (scope: Element, name: string) =>
  [...scope.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === name)!;
const press = async (button: HTMLButtonElement) => {
  await act(async () => button.click());
};

describe("the Needs confirmation page", () => {
  it("lists each Unconfirmed Meal under Confirm all, with its day and buttons", () => {
    render([paella, friedRice]);
    expect(container.textContent).not.toContain("Since 03:00");
    expect(text("h1")).toEqual(["Needs confirmation"]);
    expect(buttonIn(container, "Confirm all 2 as planned")).toBeDefined();
    expect(container.textContent).toContain("Takes their food from Stock, as planned.");
    expect(text(".meal-card-eyebrow")).toEqual(["Tue 27 Oct · Dinner · 19:30", "Wed 28 Oct · Dinner · 19:30"]);
    expect(text(".meal-card-name")).toEqual(["Fried rice", "Paella"]);
    for (const card of cards()) {
      expect(card.textContent).toContain("Unconfirmed");
      expect(card.querySelector(".slot-row-amount")!.textContent).toBe("4 portions");
      expect([...card.querySelectorAll(".meal-card-foot button")].map((button) => button.textContent)).toEqual([
        "Confirm as planned",
        "Edit",
        "Skip",
      ]);
    }
  });

  it("Confirms one Meal as planned, or Skips it, on its own", async () => {
    render([friedRice, paella]);
    await press(buttonIn(cards()[0]!, "Confirm as planned")!);
    expect(confirmAll).toHaveBeenCalledWith(["fried-rice"], today);
    await press(buttonIn(cards()[1]!, "Skip")!);
    expect(skip).toHaveBeenCalledWith("paella", today);
  });

  it("opens the Confirm sheet from Edit, to change the slots first", async () => {
    render([friedRice]);
    await press(buttonIn(cards()[0]!, "Edit")!);
    const sheet = container.querySelector("dialog.confirm-sheet")!;
    expect(sheet.querySelector(".confirm-slot-list")!.textContent).toContain("Fried rice");
  });

  it("says all is caught up once nothing is left", () => {
    render([meal("done", "2026-10-27", "Fried rice", { status: "confirmed" })]);
    expect(text("h1")).toEqual(["Needs confirmation"]);
    expect(text(".caught-up strong")).toEqual(["All caught up"]);
    expect(container.textContent).toContain(
      "Every past Meal is Confirmed or Skipped. The badge is gone until tomorrow at 03:00.",
    );
    expect(container.querySelector<HTMLAnchorElement>(".caught-up a")!.textContent).toBe("Back to the Planner");
    expect(cards()).toEqual([]);
  });

  it("after Confirm all refuses one, shows how many it Confirmed and only the refused Meal", async () => {
    const riceBowl = meal("rice-bowl", "2026-10-27", "Rice bowl");
    confirmAll.mockResolvedValue([{ mealId: "rice-bowl", refusal: { ok: false, error: "notConfirmable" } }]);
    render([riceBowl, friedRice, paella]);
    await press(buttonIn(container, "Confirm all 3 as planned")!);
    expect(confirmAll.mock.calls[0]![0].toSorted()).toEqual(["fried-rice", "paella", "rice-bowl"]);
    // The server would drop the two Confirmed ones; the page keeps the result either way.
    render([riceBowl]);
    expect(container.textContent).toContain("This Meal was not Confirmed. The others were.");
    expect(text(".needs-confirmation-done")).toEqual(["2 Meals Confirmed"]);
    expect(text(".banner-error")).toEqual([
      "Rice bowl was not Confirmed: This Meal can no longer be Confirmed. Reload the planner and try again.",
    ]);
    expect(text(".meal-card-name")).toEqual(["Rice bowl"]);
    expect(buttonIn(container, "Confirm all 1 as planned")).toBeUndefined();
  });
});
