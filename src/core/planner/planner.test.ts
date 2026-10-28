import { describe, expect, it } from "vitest";
import { localDate, plannerRange, plannerWeeks } from "./index";

describe("plannerWeeks", () => {
  it("is this week and next week, Monday to Sunday", () => {
    expect(plannerWeeks("2026-10-22")).toEqual({
      thisWeek: ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"],
      nextWeek: ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"],
    });
  });

  it("starts this week on today when today is a Monday", () => {
    expect(plannerWeeks("2026-10-19").thisWeek[0]).toBe("2026-10-19");
  });

  it("still counts a Sunday as the end of this week", () => {
    const { thisWeek, nextWeek } = plannerWeeks("2026-10-25");
    expect(thisWeek).toEqual(expect.arrayContaining(["2026-10-25"]));
    expect(thisWeek[0]).toBe("2026-10-19");
    expect(nextWeek[0]).toBe("2026-10-26");
  });

  it("runs across a year end", () => {
    const { thisWeek, nextWeek } = plannerWeeks("2026-12-31");
    expect(thisWeek).toEqual(["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"]);
    expect(nextWeek[6]).toBe("2027-01-10");
  });

  it("counts 29 February in a leap year", () => {
    expect(plannerWeeks("2028-02-28").thisWeek).toEqual([
      "2028-02-28",
      "2028-02-29",
      "2028-03-01",
      "2028-03-02",
      "2028-03-03",
      "2028-03-04",
      "2028-03-05",
    ]);
  });
});

describe("plannerRange", () => {
  // Every time zone's date is within a day of the UTC date, so the range
  // covers both weeks for any viewer.
  it("covers both weeks of the day before and the day after", () => {
    // A Monday in UTC: a viewer behind UTC is still on Sunday, the week before.
    expect(plannerRange("2026-10-26")).toEqual({ from: "2026-10-19", to: "2026-11-08" });
    // A Sunday in UTC: a viewer ahead of UTC is already on Monday.
    expect(plannerRange("2026-10-25")).toEqual({ from: "2026-10-19", to: "2026-11-08" });
    // Midweek: both neighbours share its weeks.
    expect(plannerRange("2026-10-22")).toEqual({ from: "2026-10-19", to: "2026-11-01" });
  });
});

describe("localDate", () => {
  it("is the date of a moment where it is read, as YYYY-MM-DD", () => {
    expect(localDate(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(localDate(new Date(2026, 10, 30, 0, 0))).toBe("2026-11-30");
  });
});
