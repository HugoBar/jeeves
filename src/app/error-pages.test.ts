import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { t } from "@/strings";
import ErrorPage from "./error";
import GlobalError from "./global-error";
import NotFound from "./not-found";

vi.mock("./database-status", () => ({ isDatabaseReachable: vi.fn(async () => true) }));
vi.mock("./globals.css", () => ({}));
vi.mock("./font", () => ({ appFont: { className: "app-font" } }));

// A server error as the browser gets it in production: a generic message and a
// digest. The original text must never reach the page.
const serverError = Object.assign(new Error("relation \"products\" does not exist at select * from secret"), {
  digest: "1234567890",
});
const html = (text: string) => text.replaceAll("'", "&#x27;").replaceAll('"', "&quot;");

describe("the error page", () => {
  const markup = renderToStaticMarkup(createElement(ErrorPage, { error: serverError, retry: () => {} }));

  it("says something went wrong, and offers Try again and Back to the Planner", () => {
    expect(markup).toContain(t("error.title"));
    expect(markup).toContain(html(t("error.body")));
    expect(markup).toContain(t("error.tryAgain"));
    expect(markup).toMatch(new RegExp(`<a[^>]*href="/planner"[^>]*>${t("error.backToPlanner")}</a>`));
  });

  it("shows the digest, which matches the server log, but nothing of the error itself", () => {
    expect(markup).toContain(t("error.reference", { digest: "1234567890" }));
    expect(markup).not.toContain("products");
    expect(markup).not.toContain("secret");
  });

  it("shows no reference for an error without a digest", () => {
    const plain = renderToStaticMarkup(createElement(ErrorPage, { error: "thrown", retry: () => {} }));
    expect(plain).not.toContain("Reference");
  });
});

describe("the page for an error in the layout", () => {
  const markup = renderToStaticMarkup(createElement(GlobalError, { error: serverError, retry: () => {} }));

  it("is a whole Jeeves document with Try again, and no menu", () => {
    expect(markup).toMatch(/^<html lang="en" class="app-font">/);
    expect(markup).toContain(`<title>${t("app.name")}</title>`);
    expect(markup).toContain(t("error.tryAgain"));
    expect(markup).not.toContain("<nav");
    expect(markup).not.toContain("secret");
  });
});

describe("the not-found page", () => {
  const markup = renderToStaticMarkup(NotFound());

  it("says Page not found and links to the Planner", () => {
    expect(markup).toContain(`<h1>${t("notFound.title")}</h1>`);
    expect(markup).toMatch(new RegExp(`<a[^>]*href="/planner"[^>]*>${t("notFound.backToPlanner")}</a>`));
  });
});
