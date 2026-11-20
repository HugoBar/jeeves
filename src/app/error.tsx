"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { t } from "@/strings";
import { isDatabaseReachable } from "./database-status";
import { errorDigest, noticeIcons, PageNotice } from "./page-notice";

// Shown inside the app's layout, so the header and menu stay, when a page
// fails to load or a save fails unexpectedly. In production the error carries
// no message, only a digest that matches the server log, so the page asks the
// server whether the database is the cause.
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const [database, setDatabase] = useState<"unknown" | "reachable" | "unreachable">("unknown");

  useEffect(() => {
    let current = true;
    isDatabaseReachable().then(
      (reachable) => current && setDatabase(reachable ? "reachable" : "unreachable"),
      () => current && setDatabase("unknown"),
    );
    return () => {
      current = false;
    };
  }, [error]);

  const unreachable = database === "unreachable";
  const digest = errorDigest(error);
  return (
    <PageNotice
      warning
      icon={unreachable ? noticeIcons.database : noticeIcons.error}
      title={t(unreachable ? "error.databaseTitle" : "error.title")}
      body={t(unreachable ? "error.databaseBody" : "error.body")}
      reference={digest ? t("error.reference", { digest }) : undefined}
    >
      <button type="button" className="button-primary" onClick={retry}>
        {t("error.tryAgain")}
      </button>
      <Link href="/planner" className="button">
        {t("error.backToPlanner")}
      </Link>
    </PageNotice>
  );
}
