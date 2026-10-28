"use client";

import { useActionState } from "react";
import { t } from "@/strings";
import { changeHouseholdTimeZoneAction, type HouseholdTimeZoneFormState } from "./actions";

export function HouseholdTimeZoneForm({ zone, knownZones }: { zone: string | null; knownZones: string[] }) {
  const [state, action, pending] = useActionState<HouseholdTimeZoneFormState, FormData>(
    changeHouseholdTimeZoneAction,
    { error: null, zone: zone ?? "" },
  );
  return (
    <form action={action} className="item-form">
      <label htmlFor="householdTimeZone">{t("settings.householdTimeZone")}</label>
      {/* React resets the form after a submit; keyed on what was sent, the
          input remounts with it, so a refused zone stays to be corrected. */}
      <input
        key={state.zone}
        id="householdTimeZone"
        name="householdTimeZone"
        list="knownTimeZones"
        defaultValue={state.zone}
        placeholder={t("settings.householdTimeZonePlaceholder")}
        autoComplete="off"
      />
      <datalist id="knownTimeZones">
        {knownZones.map((known) => (
          <option key={known} value={known} />
        ))}
      </datalist>
      <button type="submit" disabled={pending}>
        {t("settings.save")}
      </button>
      {state.error && <p className="form-error">{t(`settings.error.${state.error}`)}</p>}
    </form>
  );
}
