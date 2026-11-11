import { describe, expect, it } from "vitest";
import { matchesName, sortByName } from "./index";

describe("sortByName", () => {
  it("sorts alphabetically, ignoring case", () => {
    const items = [{ name: "rice" }, { name: "Apple" }, { name: "Olive Oil" }];
    expect(sortByName(items).map((item) => item.name)).toEqual(["Apple", "Olive Oil", "rice"]);
  });

  it("leaves the list it was given unchanged", () => {
    const items = [{ name: "b" }, { name: "a" }];
    sortByName(items);
    expect(items.map((item) => item.name)).toEqual(["b", "a"]);
  });
});

describe("matchesName", () => {
  it("finds a name containing what was typed, ignoring case", () => {
    expect(matchesName("Coconut milk", "co")).toBe(true);
    expect(matchesName("Corn flakes", "FLAKES")).toBe(true);
    expect(matchesName("Spinach", "co")).toBe(false);
  });

  it("ignores accents, both in the name and in what was typed", () => {
    expect(matchesName("Café", "cafe")).toBe(true);
    expect(matchesName("Cafe", "café")).toBe(true);
  });

  it("ignores spaces at the ends of what was typed", () => {
    expect(matchesName("Cod fillet", "  cod ")).toBe(true);
    expect(matchesName("Cod fillet", "d f")).toBe(true);
  });

  it("matches every name when nothing is typed", () => {
    expect(matchesName("Apple", "   ")).toBe(true);
  });
});
