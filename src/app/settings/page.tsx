import { connection } from "next/server";
import { getDb } from "@/db";
import { getHouseholdTimeZone } from "@/db/settings";
import { t } from "@/strings";
import { HouseholdTimeZoneForm } from "./household-time-zone-form";

export default async function SettingsPage() {
  // Read from the database on every request, never at build time.
  await connection();
  const zone = await getHouseholdTimeZone(getDb());

  return (
    <section>
      <h1>{t("settings.title")}</h1>
      {/* Keyed on the saved zone, so the form shows a zone saved after it
          mounted: the first browser's, or one changed elsewhere. */}
      <HouseholdTimeZoneForm key={zone} zone={zone} knownZones={Intl.supportedValuesOf("timeZone")} />
      <p>{t("settings.householdTimeZoneHelp")}</p>
    </section>
  );
}
