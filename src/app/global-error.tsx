"use client";

import { t } from "@/strings";
import { appFont } from "./font";
import { errorDigest, noticeIcons, PageNotice } from "./page-notice";
import "./globals.css";

// Replaces the whole document when the layout itself fails, so it has no
// header or menu: a plain Jeeves page with a way to try again.
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = errorDigest(error);
  return (
    <html lang="en" className={appFont.className}>
      <body>
        <title>{t("app.name")}</title>
        <main className="app-main">
          <PageNotice
            warning
            icon={noticeIcons.error}
            title={t("error.title")}
            body={t("error.globalBody")}
            reference={digest ? t("error.reference", { digest }) : undefined}
          >
            <button type="button" className="button-primary" onClick={retry}>
              {t("error.tryAgain")}
            </button>
          </PageNotice>
        </main>
      </body>
    </html>
  );
}
