// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { confirmMealAction, skipMealAction } from "./actions";
import { ConfirmMealSheet, type PlannerMeal, type PlannerMealSlot, type SlotPickers } from "./meal-card";

// React only flushes updates inside act() when told it runs in a test.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The server actions, so the sheet's answers can be chosen and what it sends
// read back. The rest are the slot picker's.
vi.mock("./actions", () => ({
  confirmMealAction: vi.fn(),
  skipMealAction: vi.fn(),
  fillMealSlotAction: vi.fn(),
  emptyMealSlotAction: vi.fn(),
  removeMealSlotAction: vi.fn(),
  setMealSlotCategoryAction: vi.fn(),
}));
const confirm = vi.mocked(confirmMealAction);
const skip = vi.mocked(skipMealAction);

const today = "2026-10-29";
const pickers: SlotPickers = { slotCategories: [], slotFoods: { recipes: [], products: [] } };

const slots: PlannerMealSlot[] = [
  {
    id: "main",
    slotCategoryId: "main",
    slotCategoryLabel: "Main Dish",
    slotCategoryArchived: false,
    food: { content: "recipe", id: "bowl", label: "Rice bowl", portions: 2, archived: false },
    warnings: null,
  },
];

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
  repeats: null,
  slots,
  addsBack: [],
  takes: { ok: true, products: [] },
  ...overrides,
});

let container: HTMLDivElement;
let root: Root;
let onClose: ReturnType<typeof vi.fn<() => void>>;

const open = (notYet = false, shown = meal()) =>
  act(() => root.render(createElement(ConfirmMealSheet, { meal: shown, today, notYet, pickers, onClose })));

beforeEach(() => {
  confirm.mockReset().mockResolvedValue(null);
  skip.mockReset().mockResolvedValue(null);
  onClose = vi.fn<() => void>();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const sheet = () => container.querySelector<HTMLDialogElement>("dialog.confirm-sheet")!;
const pick = (name: string) =>
  act(() => {
    const label = [...sheet().querySelectorAll("label.confirm-outcome")].find((found) =>
      found.textContent!.startsWith(name),
    );
    label!.querySelector("input")!.click();
  });
const actionButtons = () => [...sheet().querySelectorAll<HTMLButtonElement>(".sheet-actions button")];
const mainButton = () => actionButtons().at(-1)!;
const press = async (button: HTMLButtonElement) => {
  await act(async () => button.click());
};
const slotList = () => sheet().querySelector(".confirm-slot-list");
const banners = () => [...sheet().querySelectorAll(".banner")].map((banner) => banner.textContent);

describe("picking what happened on the Confirm sheet", () => {
  it("names the button for the outcome picked", () => {
    open();
    expect(mainButton().textContent).toBe("Confirm");
    pick("Eaten, but not from the Pantry");
    expect(mainButton().textContent).toBe("Confirm as Untracked");
    pick("Skipped");
    expect(mainButton().textContent).toBe("Skip Meal");
  });

  it("hides what you ate once Skipped is picked", () => {
    open();
    expect(slotList()).not.toBeNull();
    pick("Skipped");
    expect(slotList()).toBeNull();
    expect(sheet().textContent).not.toContain("What you ate");
  });

  it("asks the same before Skipping a Meal later today", () => {
    open(true);
    pick("Skipped");
    expect(banners()).toEqual(["This Meal hasn't happened yet. Skip it anyway?"]);
    expect(mainButton().textContent).toBe("Skip anyway");
  });
});

describe("pressing the Confirm sheet's button", () => {
  it("Confirms as planned, then closes", async () => {
    open();
    await press(mainButton());
    expect(confirm).toHaveBeenCalledWith("meal-1", false, expect.any(String));
    expect(skip).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("Confirms as Untracked", async () => {
    open();
    pick("Eaten, but not from the Pantry");
    await press(mainButton());
    expect(confirm).toHaveBeenCalledWith("meal-1", true, expect.any(String));
  });

  it("Skips", async () => {
    open();
    pick("Skipped");
    await press(mainButton());
    expect(skip).toHaveBeenCalledWith("meal-1", expect.any(String));
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe("a refused Confirm", () => {
  beforeEach(() => {
    confirm.mockResolvedValue({
      ok: false,
      error: "unconvertible",
      code: "noDensity",
      product: { name: "Honey", defaultUnit: "g" },
      amount: 2,
      unit: "tbsp",
    });
  });

  it("says why and that nothing left Stock in one red message, keeps the sheet open and turns its button off", async () => {
    open();
    await press(mainButton());
    expect([...sheet().querySelectorAll(".banner-error")].map((banner) => banner.textContent)).toEqual([
      "Can't confirm: Honey has no Density, so 2 tbsp can't be converted to g. Add its Density or change the Ingredient's unit. Nothing has left Stock.",
    ]);
    expect(mainButton().disabled).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("clears once another outcome is picked", async () => {
    open();
    await press(mainButton());
    pick("Eaten, but not from the Pantry");
    expect(sheet().querySelector(".banner-error")).toBeNull();
    expect(mainButton().disabled).toBe(false);
  });

  it("clears once a slot has been edited", async () => {
    open();
    await press(mainButton());
    act(() => sheet().querySelector<HTMLButtonElement>('button[aria-label="Edit Main Dish"]')!.click());
    act(() => container.querySelectorAll("dialog")[1]!.querySelector<HTMLButtonElement>(".sheet-close")!.click());
    expect(sheet().querySelector(".banner-error")).toBeNull();
    expect(mainButton().disabled).toBe(false);
  });

  it("stays when the page refreshes with the same slots", async () => {
    open();
    await press(mainButton());
    open(false, meal({ slots: [...slots] }));
    expect(sheet().querySelector(".banner-error")).not.toBeNull();
    expect(mainButton().disabled).toBe(true);
  });
});

describe("the Confirm sheet's other buttons", () => {
  it("Cancel closes it and sends nothing", async () => {
    open();
    await press(actionButtons()[0]!);
    expect(onClose).toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    expect(skip).not.toHaveBeenCalled();
  });

  it("Edit opens the slot picker over the sheet, which stays open", () => {
    open();
    act(() => sheet().querySelector<HTMLButtonElement>('button[aria-label="Edit Main Dish"]')!.click());
    const dialogs = [...container.querySelectorAll("dialog")];
    expect(dialogs).toHaveLength(2);
    expect(dialogs[1]!.querySelector("h2")!.textContent).toBe("Pick for Main Dish");
  });
});

describe("a Meal with an Archived Recipe or Product", () => {
  const archivedSlots: PlannerMealSlot[] = [
    { ...slots[0]!, food: { content: "product", id: "honey", label: "Honey", quantity: 20, defaultUnit: "g", archived: true } },
  ];
  const blocked = (overrides: Partial<PlannerMeal> = {}) => meal({ slots: archivedSlots, ...overrides });

  it("asks to pick another on its slot and turns off both Confirm outcomes, saying why", () => {
    open(false, blocked());
    expect(sheet().querySelector(".confirm-slot-note")!.textContent).toBe("Product archived - pick another");
    expect(banners()).toEqual(["Change the archived Product with Edit to confirm this Meal, or skip it."]);
    expect(mainButton().disabled).toBe(true);
    pick("Eaten, but not from the Pantry");
    expect(mainButton().disabled).toBe(true);
  });

  it("still Skips", async () => {
    open(false, blocked());
    pick("Skipped");
    expect(banners()).toEqual([]);
    expect(mainButton().disabled).toBe(false);
    await press(mainButton());
    expect(skip).toHaveBeenCalledWith("meal-1", expect.any(String));
  });

  it("Confirms once the slot is changed and the page refreshes", async () => {
    open(false, blocked());
    open(false, meal());
    expect(mainButton().disabled).toBe(false);
    await press(mainButton());
    expect(confirm).toHaveBeenCalledWith("meal-1", false, expect.any(String));
  });

  it("Confirms as it is on a Meal whose day has passed", () => {
    open(false, blocked({ date: "2026-10-28" }));
    expect(sheet().querySelector(".confirm-slot-note")).toBeNull();
    expect(mainButton().disabled).toBe(false);
  });

  it("says why when the server refuses it from a stale page", async () => {
    confirm.mockResolvedValue({ ok: false, error: "archivedFood" });
    open();
    await press(mainButton());
    expect([...sheet().querySelectorAll(".banner-error")].map((banner) => banner.textContent)).toEqual([
      "Can't confirm: a Recipe or Product in this Meal was archived. Pick another for it first. Nothing has left Stock.",
    ]);
  });
});

describe("a Meal later today with an Archived Recipe or Product", () => {
  const blocked = meal({
    slots: [{ ...slots[0]!, food: { content: "product", id: "honey", label: "Honey", quantity: 20, defaultUnit: "g", archived: true } }],
  });

  it("only says why it can't be confirmed, not to confirm it anyway", () => {
    open(true, blocked);
    expect(banners()).toEqual(["Change the archived Product with Edit to confirm this Meal, or skip it."]);
  });

  it("still asks first before Skipping it", () => {
    open(true, blocked);
    pick("Skipped");
    expect(banners()).toEqual(["This Meal hasn't happened yet. Skip it anyway?"]);
  });
});
