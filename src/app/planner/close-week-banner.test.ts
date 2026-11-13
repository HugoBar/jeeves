// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { confirmMealsAsPlannedAction } from "./actions";
import { CloseWeekBanner } from "./close-week-banner";
import type { PlannerMeal } from "./meal-card";

// React only flushes updates inside act() when told it runs in a test.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The server action, so its answer can be chosen and what the banner sends
// read back.
vi.mock("./actions", () => ({ confirmMealsAsPlannedAction: vi.fn() }));
const confirmAll = vi.mocked(confirmMealsAsPlannedAction);

// Saturday 31 Oct 2026, for the viewer: this week runs 26 Oct-1 Nov.
const saturday = "2026-10-31";
vi.mock("../viewer-clock", () => ({ viewerToday: () => "2026-10-31" }));

const meal = (id: string, date: string, name: string | null, overrides: Partial<PlannerMeal> = {}): PlannerMeal => ({
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
  repeats: null,
  series: null,
  slots: [],
  addsBack: [],
  takes: { ok: true, products: [] },
  ...overrides,
});

const friedRice = meal("fried-rice", "2026-10-27", "Fried rice");
const paella = meal("paella", "2026-10-28", "Paella");
const fishFriday = meal("fish-friday", "2026-10-30", "Fish Friday");

let container: HTMLDivElement;
let root: Root;

const render = (meals: PlannerMeal[], today = saturday) =>
  act(() => root.render(createElement(CloseWeekBanner, { meals, today })));

const banner = () => container.querySelector("aside.banner");
const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
const button = (label: string) =>
  [...container.querySelectorAll("button, a")].find((element) => text(element) === label) as HTMLElement | undefined;

beforeEach(() => {
  confirmAll.mockReset().mockResolvedValue([]);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("the Close this week banner", () => {
  it("is not shown before Saturday", () => {
    render([friedRice, paella], "2026-10-30");
    expect(banner()).toBeNull();
  });

  it("shows from Saturday while this week has Unconfirmed Meals", () => {
    render([friedRice]);
    expect(text(banner()?.querySelector("h2"))).toBe("Close this week");
    render([friedRice], "2026-11-01");
    expect(text(banner()?.querySelector("h2"))).toBe("Close this week");
  });

  it("says how many are Unconfirmed", () => {
    render([fishFriday, friedRice, paella]);
    expect(text(banner()?.querySelector("p"))).toBe(
      "3 Meals this week are still Unconfirmed. Clear them before Monday.",
    );
  });

  it("says it of one Meal", () => {
    render([friedRice]);
    expect(text(banner()?.querySelector("p"))).toBe("1 Meal this week is still Unconfirmed. Clear it before Monday.");
  });

  // Each day's column: its date, then its Meals.
  const columns = () =>
    [...banner()!.querySelectorAll(".close-week-days > li")].map((column) => [
      text(column.querySelector("strong")),
      ...[...column.querySelectorAll("li")].map(text),
    ]);

  it("lists each Meal by Meal Type and name, in a column for its day, in day order", () => {
    render([fishFriday, friedRice, paella, meal("lunch", "2026-10-27", "Soup", { hour: "12:30", mealTypeLabel: "Lunch" })]);
    expect(columns()).toEqual([
      ["Tue 27", "Lunch · Soup", "Dinner · Fried rice"],
      ["Wed 28", "Dinner · Paella"],
      ["Fri 30", "Dinner · Fish Friday"],
    ]);
  });

  it("names a Meal with no name by its Meal Type only", () => {
    render([meal("dinner", "2026-10-27", null)]);
    expect(columns()).toEqual([["Tue 27", "Dinner"]]);
  });

  it("leaves out Confirmed and Skipped Meals, today's and last week's", () => {
    render([
      friedRice,
      meal("confirmed", "2026-10-28", "Paella", { status: "confirmed" }),
      meal("skipped", "2026-10-29", "Soup", { status: "skipped" }),
      meal("today", saturday, "Pizza"),
      meal("last-week", "2026-10-24", "Stew"),
    ]);
    expect(columns()).toEqual([["Tue 27", "Dinner · Fried rice"]]);
  });

  it("goes away once every Meal this week is Confirmed or Skipped", () => {
    render([
      meal("confirmed", "2026-10-27", "Fried rice", { status: "confirmed" }),
      meal("skipped", "2026-10-28", "Paella", { status: "skipped" }),
    ]);
    expect(banner()).toBeNull();
  });

  it("confirms every Meal it lists as planned, on the viewer's date", async () => {
    render([fishFriday, friedRice, paella]);
    await act(async () => button("Confirm all as planned")!.click());
    expect(confirmAll).toHaveBeenCalledTimes(1);
    expect(confirmAll.mock.calls[0]![0].toSorted()).toEqual(["fish-friday", "fried-rice", "paella"]);
    expect(confirmAll.mock.calls[0]![1]).toBe(saturday);
  });

  it("holds Confirm all while it runs, so no Meal is sent twice", async () => {
    let answer!: (refused: []) => void;
    confirmAll.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    render([friedRice]);
    await act(async () => button("Confirm all as planned")!.click());
    expect((button("Confirm all as planned") as HTMLButtonElement).disabled).toBe(true);
    await act(async () => answer([]));
    expect((button("Confirm all as planned") as HTMLButtonElement).disabled).toBe(false);
  });

  it("says why each Meal it could not Confirm was refused", async () => {
    confirmAll.mockResolvedValue([{ mealId: "paella", refusal: { ok: false, error: "notConfirmable" } }]);
    render([friedRice, paella]);
    await act(async () => button("Confirm all as planned")!.click());
    // The planner refreshes with Fried rice Confirmed.
    render([{ ...friedRice, status: "confirmed" }, paella]);
    expect(text(banner()!.querySelector('[role="alert"]'))).toMatch(/^Paella was not Confirmed: /);
  });

  it("opens Needs confirmation to review one by one", () => {
    render([friedRice]);
    expect(button("Review one by one")?.getAttribute("href")).toBe("/needs-confirmation");
  });
});
