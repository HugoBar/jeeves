"use client";

import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { sortMealsByDay, weekToClose } from "@/core/meals";
import { formatDayHeading, t } from "@/strings";
import { FormBanner } from "../form-error";
import { NEEDS_CONFIRMATION_PATH } from "../unconfirmed-alerts";
import { viewerToday } from "../viewer-clock";
import { confirmMealsAsPlannedAction, type RefusedMeal } from "./actions";
import { confirmOrSkipErrorMessage, type PlannerMeal } from "./meal-card";

// From Saturday, this week's Unconfirmed Meals, so the week can be closed
// before the next starts (#1): all at once as planned, or one by one on
// Needs confirmation. Gone once each is Confirmed or Skipped. `today` is the
// viewer's date.
export function CloseWeekBanner({ meals, today }: { meals: PlannerMeal[]; today: string }) {
  const [refused, setRefused] = useState<RefusedMeal[]>([]);
  // While Confirm all runs, it waits, so no Meal is sent twice.
  const [pending, startTransition] = useTransition();
  const titleId = useId();
  const listed = sortMealsByDay(weekToClose(meals, today));
  if (listed.length === 0) return null;
  // Refusals for Meals still listed, with their Meal: one settled since drops
  // out.
  const stillRefused = refused.flatMap(({ mealId, refusal }) => {
    const meal = listed.find((candidate) => candidate.id === mealId);
    return meal ? [{ meal, refusal }] : [];
  });

  const confirmAll = () =>
    startTransition(async () => {
      setRefused(await confirmMealsAsPlannedAction(listed.map((meal) => meal.id), viewerToday()));
    });

  return (
    // A landmark, not a live region: it holds buttons, and its refusals are
    // alerts of their own.
    <aside className="banner close-week" aria-labelledby={titleId}>
      <div className="close-week-head">
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
        <div>
          <h2 id={titleId}>{t("unconfirmed.closeWeek")}</h2>
          <p>
            {listed.length === 1
              ? t("unconfirmed.closeWeekBodyOne")
              : t("unconfirmed.closeWeekBody", { count: listed.length })}
          </p>
        </div>
      </div>
      <ul className="close-week-days">
        {byDay(listed).map(({ date, meals: dayMeals }) => (
          <li key={date}>
            <strong>{formatDayHeading(date)}</strong>
            <ul>
              {dayMeals.map((meal) => (
                <li key={meal.id}>
                  {meal.name
                    ? t("unconfirmed.closeWeekMeal", { mealType: meal.mealTypeLabel, name: meal.name })
                    : meal.mealTypeLabel}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {stillRefused.map(({ meal, refusal }) => (
        <FormBanner key={meal.id}>
          {t("unconfirmed.confirmAllRefused", {
            name: meal.name ?? meal.mealTypeLabel,
            reason: confirmOrSkipErrorMessage(refusal),
          })}
        </FormBanner>
      ))}
      <div className="close-week-actions">
        <button type="button" className="button-primary" disabled={pending} onClick={confirmAll}>
          {t("unconfirmed.closeWeekConfirmAll")}
        </button>
        <Link href={NEEDS_CONFIRMATION_PATH} className="button">
          {t("unconfirmed.closeWeekReview")}
        </Link>
      </div>
    </aside>
  );
}

// Meals already in day order, in one group per day, so each day is a column
// and a long week stays short.
function byDay(meals: PlannerMeal[]): { date: string; meals: PlannerMeal[] }[] {
  const days: { date: string; meals: PlannerMeal[] }[] = [];
  for (const meal of meals) {
    const last = days.at(-1);
    if (last?.date === meal.date) last.meals.push(meal);
    else days.push({ date: meal.date, meals: [meal] });
  }
  return days;
}
