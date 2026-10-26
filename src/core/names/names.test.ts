import { describe, expect, it } from "vitest";
import { sortByName } from "./index";

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
