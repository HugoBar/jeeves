import { describe, expect, it } from "vitest";
import { parseCategoryKind, parseCategoryName, sortCategories } from "./index";

describe("parseCategoryName", () => {
  it("keeps the name the user typed, without surrounding spaces", () => {
    expect(parseCategoryName("  Poultry ")).toEqual({ ok: true, name: "Poultry" });
  });

  it.each([[""], ["   "]])("rejects a blank name (%j)", (input) => {
    expect(parseCategoryName(input)).toEqual({ ok: false, error: "blank" });
  });
});

describe("parseCategoryKind", () => {
  it.each([["role"], ["kind"]])("accepts %s", (input) => {
    expect(parseCategoryKind(input)).toBe(input);
  });

  it.each([["Role"], [""], [null]])("rejects anything else (%j)", (input) => {
    expect(parseCategoryKind(input)).toBeNull();
  });
});

describe("sortCategories", () => {
  it("lists Roles before Kinds, each alphabetical by the label shown", () => {
    const categories = [
      { label: "Fish", kind: "kind" },
      { label: "Soup", kind: "role" },
      { label: "dairy", kind: "kind" },
      { label: "Main Dish", kind: "role" },
    ] as const;
    expect(sortCategories(categories, (c) => c.label).map((c) => c.label)).toEqual([
      "Main Dish",
      "Soup",
      "dairy",
      "Fish",
    ]);
  });
});
