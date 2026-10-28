import { describe, expect, it } from "vitest";
import { currentWeek, parseTimeZone, today } from "./index";

describe("today", () => {
  it("is the HTZ's date, not UTC's, just after its midnight", () => {
    // 00:30 on 29 Oct in Paris (UTC+1) is still 28 Oct in UTC.
    expect(today(new Date("2026-10-28T23:30:00Z"), "Europe/Paris")).toBe("2026-10-29");
  });

  it("is still the HTZ's previous day just before its midnight", () => {
    // 23:59 on 28 Oct in New York (UTC-4) is already 29 Oct in UTC.
    expect(today(new Date("2026-10-29T03:59:00Z"), "America/New_York")).toBe("2026-10-28");
  });
});

describe("currentWeek", () => {
  it("runs Monday to Sunday around today", () => {
    // Wednesday 28 Oct 2026.
    expect(currentWeek(new Date("2026-10-28T12:00:00Z"), "Europe/Paris")).toEqual({
      monday: "2026-10-26",
      sunday: "2026-11-01",
    });
  });

  it("still includes Sunday just before the HTZ's midnight", () => {
    // 23:30 on Sunday 1 Nov in Paris.
    expect(currentWeek(new Date("2026-11-01T22:30:00Z"), "Europe/Paris")).toEqual({
      monday: "2026-10-26",
      sunday: "2026-11-01",
    });
  });

  it("moves to the next week at the HTZ's Monday midnight, while UTC is still on Sunday", () => {
    // 00:30 on Monday 2 Nov in Paris.
    expect(currentWeek(new Date("2026-11-01T23:30:00Z"), "Europe/Paris")).toEqual({
      monday: "2026-11-02",
      sunday: "2026-11-08",
    });
  });

  it("spans a month and year change", () => {
    // Wednesday 30 Dec 2026.
    expect(currentWeek(new Date("2026-12-30T12:00:00Z"), "Europe/Paris")).toEqual({
      monday: "2026-12-28",
      sunday: "2027-01-03",
    });
  });
});

describe("parseTimeZone", () => {
  it("accepts an IANA zone", () => {
    expect(parseTimeZone(" Asia/Tokyo ")).toEqual({ ok: true, zone: "Asia/Tokyo" });
  });

  it("stores a zone typed in the wrong case under its proper name", () => {
    expect(parseTimeZone("europe/paris")).toEqual({ ok: true, zone: "Europe/Paris" });
  });

  it.each([["Mars/Olympus_Mons"], [""], ["+01:00"]])("refuses %j as an unknown zone", (input) => {
    expect(parseTimeZone(input)).toEqual({ ok: false, error: "unknownZone" });
  });
});
