import { t } from "@/strings";
import { DueRepeats } from "./due-repeats";

export default function HomePage() {
  return (
    <section>
      <DueRepeats />
      <h1>{t("home.title")}</h1>
      <p>{t("home.body")}</p>
    </section>
  );
}
