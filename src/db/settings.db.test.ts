import { beforeEach, describe, expect, it } from "vitest";
import { changeHouseholdTimeZone, getHouseholdTimeZone, saveFirstHouseholdTimeZone } from "./settings";
import { settings } from "./schema";
import { createTestDb } from "./test-database";

let db: Awaited<ReturnType<typeof createTestDb>>;

// Each test starts before any browser has opened the app.
beforeEach(async () => {
  db = await createTestDb();
});

describe("getHouseholdTimeZone", () => {
  it("has no zone before any browser opens the app", async () => {
    expect(await getHouseholdTimeZone(db)).toBeNull();
  });
});

describe("saveFirstHouseholdTimeZone", () => {
  it("saves the first browser's zone", async () => {
    expect(await saveFirstHouseholdTimeZone(db, "Europe/Lisbon")).toBe(true);

    expect(await getHouseholdTimeZone(db)).toBe("Europe/Lisbon");
  });

  it("never overwrites a saved zone", async () => {
    await saveFirstHouseholdTimeZone(db, "Europe/Lisbon");

    expect(await saveFirstHouseholdTimeZone(db, "America/Chicago")).toBe(false);

    expect(await getHouseholdTimeZone(db)).toBe("Europe/Lisbon");
  });
});

describe("changeHouseholdTimeZone", () => {
  it("replaces the saved zone", async () => {
    await saveFirstHouseholdTimeZone(db, "Europe/Lisbon");

    await changeHouseholdTimeZone(db, "Asia/Tokyo");

    expect(await getHouseholdTimeZone(db)).toBe("Asia/Tokyo");
  });

  it("sets a zone when none was saved yet", async () => {
    await changeHouseholdTimeZone(db, "Asia/Tokyo");

    expect(await getHouseholdTimeZone(db)).toBe("Asia/Tokyo");
  });

  it("is not overwritten by a later first visit", async () => {
    await changeHouseholdTimeZone(db, "Asia/Tokyo");

    await saveFirstHouseholdTimeZone(db, "Europe/Lisbon");

    expect(await getHouseholdTimeZone(db)).toBe("Asia/Tokyo");
  });
});

describe("settings table", () => {
  it("holds a single row", async () => {
    await saveFirstHouseholdTimeZone(db, "Europe/Lisbon");

    await expect(db.insert(settings).values({ householdTimeZone: "Asia/Tokyo" })).rejects.toThrow();
  });
});
