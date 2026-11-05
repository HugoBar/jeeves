import { describe, expect, it } from "vitest";
import { moveSlot } from "./index";

describe("moveSlot", () => {
  const slots = ["Starter", "Main Dish", "Dessert"];

  it("moves a slot up one place", () => {
    expect(moveSlot(slots, 1, -1)).toEqual(["Main Dish", "Starter", "Dessert"]);
  });

  it("moves a slot down one place", () => {
    expect(moveSlot(slots, 1, 1)).toEqual(["Starter", "Dessert", "Main Dish"]);
  });

  it.each([
    [0, -1],
    [2, 1],
  ] as const)("leaves the order alone when slot %i cannot move by %i", (index, move) => {
    expect(moveSlot(slots, index, move)).toEqual(slots);
  });
});
