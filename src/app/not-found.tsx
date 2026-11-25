import Link from "next/link";
import { t } from "@/strings";
import { noticeIcons, PageNotice } from "./page-notice";

// A wrong address, or a Product or Recipe that no longer exists. Shown inside
// the app's layout, so the header and menu stay.
export default function NotFound() {
  return (
    <PageNotice icon={noticeIcons.notFound} title={t("notFound.title")} body={t("notFound.body")}>
      <Link href="/planner" className="button button-primary">
        {t("notFound.backToPlanner")}
      </Link>
    </PageNotice>
  );
}
