import { t } from "@/strings";
import { LinkRow } from "../list-row";
import { inTopMenu, moreLinks } from "../menu-items";

export default function MorePage() {
  return (
    <section>
      <h1 className="more-title">{t("nav.more")}</h1>
      <ul className="list">
        {moreLinks.map(({ href, label, description }) => (
          <li key={href} className={inTopMenu(href) ? "more-phone-only" : undefined}>
            <LinkRow href={href}>
              <span className="list-row-text">
                <span className="list-row-title">{t(label)}</span>
                <span className="list-row-meta">{t(description)}</span>
              </span>
            </LinkRow>
          </li>
        ))}
      </ul>
    </section>
  );
}
