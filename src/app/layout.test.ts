import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listPlannedMealsBefore } from "@/db/meals";
import RootLayout from "./layout";
import { NeedsConfirmationBadge } from "./unconfirmed-alerts";

// The layout's database read, chosen per test; everything else stands still.
vi.mock("@/db", () => ({ getDb: () => ({}) }));
vi.mock("@/db/meals", () => ({ listPlannedMealsBefore: vi.fn() }));
const listMeals = vi.mocked(listPlannedMealsBefore);
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => createElement("a", { href }, children),
}));
vi.mock("./menus", () => ({ TopMenu: () => createElement("nav"), BottomMenu: () => null }));
vi.mock("./service-worker-registration", () => ({ ServiceWorkerRegistration: () => null }));
vi.mock("./unconfirmed-alerts", () => ({
  NeedsConfirmationBadge: vi.fn(() => null),
  ResolutionGate: ({ children }: { children: React.ReactNode }) => children,
}));
const badge = vi.mocked(NeedsConfirmationBadge);
vi.mock("./globals.css", () => ({}));
vi.mock("./font", () => ({ appFont: { className: "app-font" } }));

// A Drizzle query error whose driver could not connect.
const unreachable = new Error("Failed query", { cause: Object.assign(new Error("connect"), { code: "ECONNREFUSED" }) });
// A Drizzle query error Postgres ran and rejected.
const rejected = new Error("Failed query", { cause: Object.assign(new Error("missing"), { code: "42P01" }) });

const render = async () => renderToStaticMarkup(await RootLayout({ children: createElement("p", null, "the page") }));

beforeEach(() => {
  listMeals.mockReset();
  badge.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the layout when the database can't be reached", () => {
  it("still shows the header, menu and page, with no badge", async () => {
    listMeals.mockRejectedValue(unreachable);
    const markup = await render();
    expect(markup).toContain("<nav>");
    expect(markup).toContain("<p>the page</p>");
    expect(badge.mock.calls[0]?.[0]).toEqual({ meals: [] });
  });

  it("logs why to the server", async () => {
    listMeals.mockRejectedValue(unreachable);
    await render();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Database unreachable"), unreachable);
  });
});

describe("the layout when the database is there", () => {
  it("throws any other error, for the layout's error page", async () => {
    listMeals.mockRejectedValue(rejected);
    await expect(render()).rejects.toBe(rejected);
  });

  it("passes the Unconfirmed candidates to the badge", async () => {
    listMeals.mockResolvedValue([{ status: "planned", date: "2026-11-20" }] as never);
    await render();
    expect(badge.mock.calls[0]?.[0]).toEqual({ meals: [{ status: "planned", date: "2026-11-20" }] });
  });
});
