import { t } from "@/strings";

export default function HomePage() {
  return (
    <section>
      <h1>{t("home.title")}</h1>
      <p>{t("home.body")}</p>
    </section>
  );
}
