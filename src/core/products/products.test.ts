import { describe, expect, it } from "vitest";
import { parseProductFields } from "./index";

const filled = { name: " Rice ", density: "0.85", packSizeName: " bag ", packSizeAmount: "1000" };

describe("parseProductFields", () => {
  it("reads a fully filled-in form, trimming text", () => {
    expect(parseProductFields(filled)).toEqual({
      ok: true,
      fields: { name: "Rice", density: 0.85, packSize: { name: "bag", amount: 1000 } },
    });
  });

  it("leaves Density and Pack Size unset when their fields are empty", () => {
    expect(
      parseProductFields({ name: "Apple", density: " ", packSizeName: "", packSizeAmount: "" }),
    ).toEqual({ ok: true, fields: { name: "Apple", density: null, packSize: null } });
  });

  it.each([[""], ["   "]])("rejects a blank name (%j)", (name) => {
    expect(parseProductFields({ ...filled, name })).toEqual({ ok: false, errors: ["blankName"] });
  });

  // Density is stored with 4 decimals (data-model T2): 0.00004 would be saved as 0.
  it.each([["abc"], ["0"], ["-1"], ["Infinity"], ["0.00004"], ["100000000"]])(
    "rejects a Density that is not a positive amount (%j)",
    (density) => {
      expect(parseProductFields({ ...filled, density })).toEqual({
        ok: false,
        errors: ["invalidDensity"],
      });
    },
  );

  it.each([
    ["a name without an amount", { packSizeName: "bag", packSizeAmount: "" }],
    ["an amount without a name", { packSizeName: " ", packSizeAmount: "1000" }],
  ])("rejects a Pack Size with %s", (_, packSize) => {
    expect(parseProductFields({ ...filled, ...packSize })).toEqual({
      ok: false,
      errors: ["incompletePackSize"],
    });
  });

  it.each([["0"], ["-5"], ["lots"]])("rejects a Pack Size amount that is not positive (%j)", (amount) => {
    expect(parseProductFields({ ...filled, packSizeAmount: amount })).toEqual({
      ok: false,
      errors: ["invalidPackSizeAmount"],
    });
  });

  it("rounds Density to 4 decimals and the Pack Size amount to 2, as stored", () => {
    expect(parseProductFields({ ...filled, density: "1.03456", packSizeAmount: "330.256" })).toMatchObject({
      ok: true,
      fields: { density: 1.0346, packSize: { amount: 330.26 } },
    });
  });

  it("reports every problem at once", () => {
    expect(
      parseProductFields({ name: "", density: "-1", packSizeName: "", packSizeAmount: "500" }),
    ).toEqual({ ok: false, errors: ["blankName", "invalidDensity", "incompletePackSize"] });
  });
});
