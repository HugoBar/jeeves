import { describe, expect, it } from "vitest";
import { dueRepeatDates, parseRepeatOn, repeatOnChange } from "./index";

// 2026-11-12 is a Thursday.
const TODAY = "2026-11-12";

describe("parseRepeatOn", () => {
  it("is the ticked weekdays, Monday first, each once", () => {
    expect(parseRepeatOn(["5", "1", "3", "1"], TODAY, TODAY)).toEqual({ ok: true, weekdays: [1, 3, 5] });
  });

  it("is no repeat when nothing is ticked, even on a past Meal", () => {
    expect(parseRepeatOn([], "2026-11-10", TODAY)).toEqual({ ok: true, weekdays: [] });
  });

  it("lets a Meal later than today repeat", () => {
    expect(parseRepeatOn(["7"], "2026-11-20", TODAY)).toEqual({ ok: true, weekdays: [7] });
  });

  it("refuses ticks on a Meal dated before today", () => {
    expect(parseRepeatOn(["1"], "2026-11-11", TODAY)).toEqual({ ok: false, error: "pastMealRepeat" });
  });

  it("refuses a tick that is not a weekday", () => {
    for (const tick of ["0", "8", "mon", "1.5", ""]) {
      expect(parseRepeatOn([tick], TODAY, TODAY)).toEqual({ ok: false, error: "invalidWeekday" });
    }
  });
});

describe("dueRepeatDates", () => {
  it("is each ticked day after the starting Meal up to the end of next week", () => {
    // Started on Thursday the 12th, repeating Mon, Wed, Fri.
    expect(dueRepeatDates({ weekdays: [1, 3, 5], generatedThrough: TODAY }, TODAY)).toEqual({
      dates: ["2026-11-13", "2026-11-16", "2026-11-18", "2026-11-20"],
      through: "2026-11-22",
    });
  });

  it("never repeats on the starting Meal's own day, even when it is ticked", () => {
    expect(dueRepeatDates({ weekdays: [4], generatedThrough: TODAY }, TODAY).dates).toEqual(["2026-11-19"]);
  });

  it("starts after a starting Meal later than today", () => {
    expect(dueRepeatDates({ weekdays: [1, 2, 3, 4, 5, 6, 7], generatedThrough: "2026-11-20" }, TODAY)).toEqual({
      dates: ["2026-11-21", "2026-11-22"],
      through: "2026-11-22",
    });
  });

  it("is nothing more once the two weeks are already created", () => {
    expect(dueRepeatDates({ weekdays: [1, 3, 5], generatedThrough: "2026-11-22" }, TODAY)).toEqual({
      dates: [],
      through: "2026-11-22",
    });
  });

  it("adds a new week's repeats when it comes into view", () => {
    // Monday the 23rd: the planner now runs to Sunday 6 December.
    expect(dueRepeatDates({ weekdays: [1], generatedThrough: "2026-11-22" }, "2026-11-23")).toEqual({
      dates: ["2026-11-23", "2026-11-30"],
      through: "2026-12-06",
    });
  });

  it("never fills in days missed while the app wasn't opened", () => {
    // Created through the 22nd, then not opened until Wednesday 2 December.
    expect(dueRepeatDates({ weekdays: [1, 3], generatedThrough: "2026-11-22" }, "2026-12-02")).toEqual({
      dates: ["2026-12-02", "2026-12-07", "2026-12-09"],
      through: "2026-12-13",
    });
  });

  it("never moves back, for a viewer whose date is behind", () => {
    expect(dueRepeatDates({ weekdays: [1], generatedThrough: "2026-12-06" }, TODAY)).toEqual({
      dates: [],
      through: "2026-12-06",
    });
  });
});

describe("repeatOnChange", () => {
  // Mon to Fri, with repeats created through Sunday the 22nd.
  const series = { weekdays: [1, 2, 3, 4, 5] as const, generatedThrough: "2026-11-22" };

  it("adds repeats only on a newly ticked day, after this Meal, through the repeats already created", () => {
    expect(repeatOnChange(series, [1, 2, 3, 4, 5, 6], "2026-11-13", TODAY)).toEqual({
      kind: "change",
      removed: [],
      addedDates: ["2026-11-14", "2026-11-21"],
    });
  });

  it("removes repeats only on a newly unticked day, adding none for the days kept", () => {
    expect(repeatOnChange(series, [1, 3, 5], "2026-11-13", TODAY)).toEqual({
      kind: "change",
      removed: [2, 4],
      addedDates: [],
    });
  });

  it("never adds a repeat before today, even for a Meal of the series dated earlier", () => {
    // Sunday the 15th is before Monday the 16th.
    expect(repeatOnChange(series, [1, 2, 3, 4, 5, 7], "2026-11-09", "2026-11-16")).toEqual({
      kind: "change",
      removed: [],
      addedDates: ["2026-11-22"],
    });
  });

  it("ends the series when every day is unticked", () => {
    expect(repeatOnChange(series, [], "2026-11-13", TODAY)).toEqual({ kind: "end" });
  });

  it("changes nothing when the same days are ticked", () => {
    expect(repeatOnChange(series, [1, 2, 3, 4, 5], "2026-11-13", TODAY)).toEqual({ kind: "unchanged" });
  });
});
