import Link from "next/link";
import { t } from "@/strings";
import { moreLinks } from "../menu-items";

export default function MorePage() {
  return (
    <section>
      <h1 className="more-title">{t("nav.more")}</h1>
      <ul className="more-list">
        {moreLinks.map(({ href, label, description }) => (
          <li key={href}>
            <Link href={href}>
              <span className="more-link-text">
                <strong>{t(label)}</strong>
                <span>{t(description)}</span>
              </span>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
