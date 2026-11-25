// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "@/strings";
import { isDatabaseReachable } from "./database-status";
import ErrorPage from "./error";

// React only flushes updates inside act() when told it runs in a test.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The server's answer to "is the database there?", chosen per test.
vi.mock("./database-status", () => ({ isDatabaseReachable: vi.fn() }));
const reachable = vi.mocked(isDatabaseReachable);

// Outside Next.js there is no router for Link, and only its address matters here.
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    createElement("a", { href, ...props }, children),
}));

const serverError = Object.assign(new Error(""), { digest: "1234567890" });

let container: HTMLDivElement;
let root: Root;
let retry: ReturnType<typeof vi.fn<() => void>>;

// Renders the page, then lets the database check answer.
const render = async () => {
  await act(async () => root.render(createElement(ErrorPage, { error: serverError, retry })));
};
const heading = () => container.querySelector("h1")?.textContent;
const body = () => container.querySelector(".page-notice > p")?.textContent;

beforeEach(() => {
  reachable.mockReset();
  retry = vi.fn<() => void>();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("the error page, once it has asked about the database", () => {
  it("says the database can't be reached when it can't", async () => {
    reachable.mockResolvedValue(false);
    await render();
    expect(heading()).toBe(t("error.databaseTitle"));
    expect(body()).toBe(t("error.databaseBody"));
  });

  it("says something went wrong when the database is there", async () => {
    reachable.mockResolvedValue(true);
    await render();
    expect(heading()).toBe(t("error.title"));
    expect(body()).toBe(t("error.body"));
  });

  it("says something went wrong when the check itself fails", async () => {
    reachable.mockRejectedValue(new Error("network"));
    await render();
    expect(heading()).toBe(t("error.title"));
  });

  it("keeps Try again, Back to the Planner and the reference when the database is down", async () => {
    reachable.mockResolvedValue(false);
    await render();
    const tryAgain = [...container.querySelectorAll("button")].find((b) => b.textContent === t("error.tryAgain"));
    act(() => tryAgain?.click());
    expect(retry).toHaveBeenCalledOnce();
    expect(container.querySelector('a[href="/planner"]')?.textContent).toBe(t("error.backToPlanner"));
    expect(container.textContent).toContain(t("error.reference", { digest: "1234567890" }));
  });
});
