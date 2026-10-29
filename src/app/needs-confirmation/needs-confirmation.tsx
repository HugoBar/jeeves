"use client";

import Link from "next/link";
import { useActionState } from "react";
import { mustResolve, needingConfirmation, sortMealsByDay } from "@/core/meals";
import { formatMealDate, t } from "@/strings";
import { confirmMealsAsPlannedAction, type RefusedMeal } from "../planner/actions";
import { confirmOrSkipErrorMessage, MealCard, mealOnLabel, type Pickers, type PlannerMeal } from "../planner/meal-card";
import { useViewerNow, viewerToday } from "../viewer-clock";

// The "Needs confirmation" list (#1): each Meal with Confirm, slot editing
// and Skip, and "Confirm all as planned" on top. It can be left for later,
// except once a week has ended with Unconfirmed Meals: then it shows only
// those and stays until they are cleared, as every other page sends the
// viewer here. "Now" is the viewer's (spec "Platform"), so the server renders
// nothing and the browser fills the list in after hydration.
export function NeedsConfirmation({ meals, ...pickers }: { meals: PlannerMeal[] } & Pickers) {
  const now = useViewerNow();
  if (!now) return null;

  const overdue = mustResolve(meals, now);
  const resolving = overdue.length > 0;
  const shown = sortMealsByDay(resolving ? overdue : needingConfirmation(meals, now));

  return (
    <section className="needs-confirmation">
      <h1>{t(resolving ? "unconfirmed.resolveTitle" : "unconfirmed.title")}</h1>
      {shown.length === 0 ? (
        <p>{t("unconfirmed.none")}</p>
      ) : (
        <>
          <p>{t(resolving ? "unconfirmed.resolveBody" : "unconfirmed.body")}</p>
          <ConfirmAll meals={shown} />
          <ul className="planner-meals">
            {shown.map((meal) => (
              <li key={meal.id}>
                <p className="planner-editing">{formatMealDate(meal.date)}</p>
                <MealCard meal={meal} week={null} today={now.date} pickers={pickers} />
              </li>
            ))}
          </ul>
        </>
      )}
      {!resolving && (
        <p>
          <Link href="/planner">{t("unconfirmed.dismiss")}</Link>
        </p>
      )}
    </section>
  );
}

// Confirms every Meal shown as planned. Those that cannot be, such as one
// whose Ingredient no longer converts, stay listed with why.
function ConfirmAll({ meals }: { meals: PlannerMeal[] }) {
  const [refused, action, pending] = useActionState<RefusedMeal[]>(
    () => confirmMealsAsPlannedAction(meals.map((meal) => meal.id), viewerToday()),
    [],
  );
  const nameOf = (mealId: string) => {
    const meal = meals.find((candidate) => candidate.id === mealId);
    return meal ? mealOnLabel(meal) : "";
  };
  return (
    <form action={action} className="planner-confirm">
      <button type="submit" disabled={pending}>
        {t("unconfirmed.confirmAll")}
      </button>
      {refused.map(({ mealId, refusal }) => (
        <p key={mealId} className="form-error">
          {t("unconfirmed.confirmAllRefused", { name: nameOf(mealId), reason: confirmOrSkipErrorMessage(refusal) })}
        </p>
      ))}
    </form>
  );
}
