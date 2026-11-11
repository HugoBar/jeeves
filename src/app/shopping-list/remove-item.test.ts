// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ShoppingListItem } from "@/db/shopping-list";
import { removeShoppingListItemAction } from "./actions";
import { ShoppingListView } from "./shopping-list";

// React only flushes updates inside act() when told it runs in a test.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The server actions, so what the list sends can be read back.
vi.mock("./actions", () => ({
  removeShoppingListItemAction: vi.fn(),
  generateShoppingListAction: vi.fn(),
  setShoppingListItemTickedAction: vi.fn(),
  setAllShoppingListItemsTickedAction: vi.fn(),
  restockTickedItemsAction: vi.fn(),
}));
const remove = vi.mocked(removeShoppingListItemAction);

const item = (name: string, ticked: boolean): ShoppingListItem => ({
  id: `item-${name}`,
  quantity: 300,
  source: "shortfall",
  ticked,
  product: { id: `product-${name}`, name, defaultUnit: "g", packSize: null },
});

let container: HTMLDivElement;
let root: Root;

const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
const dialog = () => container.querySelector("dialog");
const press = (element: Element | null | undefined) =>
  act(async () => {
    (element as HTMLElement).click();
  });
const removeButton = (name: string) => container.querySelector(`button[aria-label="Remove ${name}"]`);
const dialogButton = (label: string) =>
  [...(dialog()?.querySelectorAll("button") ?? [])].find((button) => text(button) === label);

beforeEach(() => {
  remove.mockReset().mockResolvedValue();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root.render(
      createElement(ShoppingListView, { items: [item("Spinach", false), item("Ground beef", true)], today: "2026-11-11", products: [], candidates: [], shortfalls: [] }),
    ),
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("removing a Shopping List item", () => {
  it("takes an unticked item off the list at once, without asking", async () => {
    await press(removeButton("Spinach"));

    expect(dialog()).toBeNull();
    expect(remove).toHaveBeenCalledWith("item-Spinach");
  });

  it("asks first for a ticked item, saying Restock won't add it to Stock", async () => {
    await press(removeButton("Ground beef"));

    expect(remove).not.toHaveBeenCalled();
    expect(text(dialog())).toContain("Remove Ground beef?");
    expect(text(dialog())).toContain("It's ticked as bought. Removing it means Restock won't add it to Stock.");
  });

  it("removes the ticked item on Remove", async () => {
    await press(removeButton("Ground beef"));
    await press(dialogButton("Remove"));

    expect(remove).toHaveBeenCalledWith("item-Ground beef");
  });

  it("keeps the ticked item on Cancel", async () => {
    await press(removeButton("Ground beef"));
    await press(dialogButton("Cancel"));

    expect(remove).not.toHaveBeenCalled();
    expect(dialog()).toBeNull();
  });
});
