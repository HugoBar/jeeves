import { describe, expect, it } from "vitest";
import {
  MalformedRequest,
  requireBoolean,
  requireDate,
  requireList,
  requireNumber,
  requireOneOf,
  requireText,
  requireUuid,
  requireUuidOrBlank,
} from "./index";

const ID = "3f2c8a9e-1b7d-4c5e-9a0f-2d6b8e4c1a7f";

describe("requireUuid", () => {
  it("takes a uuid", () => {
    expect(requireUuid(ID)).toBe(ID);
  });

  it.each([[""], ["not-an-id"], [`${ID}x`], [42], [null], [undefined], [[ID]], [{ id: ID }]])(
    "refuses anything else (%j)",
    (value) => {
      expect(() => requireUuid(value)).toThrow(MalformedRequest);
    },
  );
});

describe("requireUuidOrBlank", () => {
  it("takes a uuid, or blank for a field left unpicked", () => {
    expect(requireUuidOrBlank(ID)).toBe(ID);
    expect(requireUuidOrBlank("")).toBe("");
  });

  it("refuses anything else", () => {
    expect(() => requireUuidOrBlank("recipe:1")).toThrow(MalformedRequest);
  });
});

describe("requireDate", () => {
  it("takes a date", () => {
    expect(requireDate("2026-11-17")).toBe("2026-11-17");
  });

  it.each([["2026-02-30"], ["17/11/2026"], [""], [20261117], [null]])("refuses anything else (%j)", (value) => {
    expect(() => requireDate(value)).toThrow(MalformedRequest);
  });
});

describe("requireBoolean", () => {
  it("takes true or false", () => {
    expect(requireBoolean(true)).toBe(true);
    expect(requireBoolean(false)).toBe(false);
  });

  it.each([["true"], [1], [null], [undefined]])("refuses anything else (%j)", (value) => {
    expect(() => requireBoolean(value)).toThrow(MalformedRequest);
  });
});

describe("requireText", () => {
  it("takes text, and reads a field not sent as blank", () => {
    expect(requireText("Rice")).toBe("Rice");
    expect(requireText(null)).toBe("");
  });

  // A form field can send a file in place of text.
  it.each([[42], [{}], [new Blob(["x"])]])("refuses anything else (%j)", (value) => {
    expect(() => requireText(value)).toThrow(MalformedRequest);
  });
});

describe("requireOneOf", () => {
  it("takes one of the options", () => {
    expect(requireOneOf("following", ["this", "following"] as const)).toBe("following");
  });

  it("refuses anything else", () => {
    expect(() => requireOneOf("all", ["this", "following"] as const)).toThrow(MalformedRequest);
  });
});

describe("requireList", () => {
  it("checks each item", () => {
    expect(requireList([ID, ID], requireUuid)).toEqual([ID, ID]);
  });

  it("refuses something that is not a list, or holds a wrong item", () => {
    expect(() => requireList(ID, requireUuid)).toThrow(MalformedRequest);
    expect(() => requireList([ID, "x"], requireUuid)).toThrow(MalformedRequest);
  });
});

describe("requireNumber", () => {
  it("takes a number from 0 to the most it may be", () => {
    expect(requireNumber(2.5, { max: 10 })).toBe(2.5);
    expect(requireNumber(0, { max: 10 })).toBe(0);
  });

  it.each([[-1], [11], [Number.NaN], [Number.POSITIVE_INFINITY], ["2"], [null]])("refuses anything else (%j)", (value) => {
    expect(() => requireNumber(value, { max: 10 })).toThrow(MalformedRequest);
  });

  it("refuses a fraction where a whole number is due", () => {
    expect(requireNumber(3, { max: 10, whole: true })).toBe(3);
    expect(() => requireNumber(2.5, { max: 10, whole: true })).toThrow(MalformedRequest);
  });
});
