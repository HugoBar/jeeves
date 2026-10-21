import { describe, expect, it } from "vitest";
import { t } from "./index";

describe("t", () => {
  it("returns the UI string for a key", () => {
    expect(t("app.name")).toBe("Jeeves");
  });

  it("fills placeholders from params", () => {
    expect(t("planner.editingNext", { day: "Tuesday" })).toBe("Editing: next Tuesday");
  });
});
