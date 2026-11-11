"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { lastWeek, mealCardStatus, mustResolve, needingConfirmation, sortMealsByDay } from "@/core/meals";
import { formatMealDate, formatDateRange, t } from "@/strings";
import { FoodCategoryPill } from "../food-category-pill";
import { FormBanner } from "../form-error";
import { BackLink } from "../list-row";
import { confirmMealsAsPlannedAction, skipMealAction, type RefusedMeal } from "../planner/actions";
import {
  ConfirmMealSheet,
  confirmOrSkipErrorMessage,
  type ConfirmOrSkipError,
  MealCardStatusLine,
  SlotFoodName,
  slotAmount,
  type Pickers,
  type PlannerMeal,
  type SlotPickers,
} from "../planner/meal-card";
import { useViewerNow, viewerToday } from "../viewer-clock";

// What the last "Confirm all" did: how many it Confirmed, and those it refused.
type ConfirmAllResult = { confirmed: number; refused: RefusedMeal[] };

// The "Needs confirmation" list (#1), opened from the "to confirm" badge:
// each Meal with Confirm as planned, Edit and Skip, and "Confirm all N as
// planned" on top. It can be left for later, except once a week has ended
// with Unconfirmed Meals: then it shows only those and stays until they are
// cleared, as every other page sends the viewer here, and then goes on to
// the Planner. "Now" is the viewer's (spec "Platform"), so the server renders
// nothing and the browser fills the list in after hydration.
export function NeedsConfirmation({ meals, ...pickers }: { meals: PlannerMeal[] } & Pickers) {
  const now = useViewerNow();
  // Kept after Confirm all refuses some, so the page says what it did.
  const [result, setResult] = useState<ConfirmAllResult | null>(null);
  // While Confirm all runs, each card's buttons wait, so no Meal is sent twice.
  const [confirmingAll, startConfirmAll] = useTransition();
  const overdue = now ? mustResolve(meals, now) : [];
  const resolving = overdue.length > 0;
  const router = useRouter();
  // Whether this page was closing last week, to leave once it is closed.
  const wasResolving = useRef(false);
  useEffect(() => {
    if (wasResolving.current && !resolving) router.replace("/planner");
    wasResolving.current = resolving;
  }, [resolving, router]);
  if (!now) return null;

  const listed = sortMealsByDay(resolving ? overdue : needingConfirmation(meals, now));
  // Refusals for Meals still listed: one settled since drops out, and once
  // none are left the page goes back to the plain list.
  const refused = (result?.refused ?? []).filter(({ mealId }) => listed.some((meal) => meal.id === mealId));
  const week = lastWeek(now);
  const shown = refused.length > 0 ? listed.filter((meal) => refused.some(({ mealId }) => mealId === meal.id)) : listed;

  return (
    <section className={resolving ? "needs-confirmation needs-confirmation-locked" : "needs-confirmation"}>
      {!resolving && <BackLink href="/planner">{t("unconfirmed.back")}</BackLink>}
      <header className="needs-confirmation-head">
        {resolving && (
          <p className="needs-confirmation-eyebrow">
            {t("unconfirmed.resolveEyebrow", { range: formatDateRange(week.first, week.last) })}
          </p>
        )}
        <h1>{t(resolving ? "unconfirmed.resolveTitle" : "unconfirmed.title")}</h1>
        {shown.length > 0 && <p>{introText(resolving, shown.length, refused.length > 0 ? result : null)}</p>}
      </header>
      {shown.length === 0 ? (
        <AllCaughtUp />
      ) : (
        <>
          {result && refused.length > 0 ? (
            <ConfirmAllRefused confirmed={result.confirmed} refused={refused} meals={shown} />
          ) : (
            <ConfirmAll
              meals={shown}
              resolving={resolving}
              pending={confirmingAll}
              onConfirm={(ids) =>
                startConfirmAll(async () => {
                  const answer = await confirmMealsAsPlannedAction(ids, viewerToday());
                  if (answer.length > 0) setResult({ confirmed: ids.length - answer.length, refused: answer });
                })
              }
            />
          )}
          <ul className="needs-confirmation-meals">
            {shown.map((meal) => (
              <li key={meal.id}>
                <UnconfirmedMealCard
                  meal={meal}
                  today={now.date}
                  pickers={pickers}
                  busy={confirmingAll}
                  resolving={resolving}
                />
              </li>
            ))}
          </ul>
        </>
      )}
      {resolving && (
        <p className="needs-confirmation-stays">
          <LockIcon />
          {t("unconfirmed.resolveStays")}
        </p>
      )}
    </section>
  );
}

// What the list is, or, once Confirm all has Confirmed some and refused the
// rest, that these were not Confirmed and the others were.
function introText(resolving: boolean, count: number, afterConfirmAll: ConfirmAllResult | null): string {
  if (afterConfirmAll && afterConfirmAll.confirmed > 0) {
    return t(afterConfirmAll.refused.length === 1 ? "unconfirmed.refusedBodyOne" : "unconfirmed.refusedBody");
  }
  if (!resolving) return t("unconfirmed.body");
  return count === 1 ? t("unconfirmed.resolveBodyOne") : t("unconfirmed.resolveBody", { count });
}

// Nothing left to confirm.
function AllCaughtUp() {
  return (
    <div className="caught-up">
      <span className="caught-up-icon">
        <CheckIcon />
      </span>
      <strong>{t("unconfirmed.caughtUp")}</strong>
      <p>{t("unconfirmed.caughtUpBody")}</p>
      <Link href="/planner" className="button">
        {t("unconfirmed.backToPlanner")}
      </Link>
    </div>
  );
}

// Confirms every Meal listed as planned. Those that cannot be, such as one
// whose Ingredient no longer converts, come back to show why. Closing last
// week, its hint says Untracked Meals stay so.
function ConfirmAll({
  meals,
  resolving,
  pending,
  onConfirm,
}: {
  meals: PlannerMeal[];
  resolving: boolean;
  pending: boolean;
  onConfirm: (ids: string[]) => void;
}) {
  return (
    <div className="needs-confirmation-all">
      <button
        type="button"
        className="button-primary"
        disabled={pending}
        onClick={() => onConfirm(meals.map((meal) => meal.id))}
      >
        {meals.length === 1 ? t("unconfirmed.confirmAllOne") : t("unconfirmed.confirmAll", { count: meals.length })}
      </button>
      <p>{t(resolving ? "unconfirmed.resolveConfirmAllHint" : "unconfirmed.confirmAllHint")}</p>
    </div>
  );
}

// After Confirm all: how many it Confirmed, in green, and why each of the
// rest was not, in red.
function ConfirmAllRefused({
  confirmed,
  refused,
  meals,
}: {
  confirmed: number;
  refused: RefusedMeal[];
  meals: PlannerMeal[];
}) {
  const nameOf = (mealId: string) => {
    const meal = meals.find((candidate) => candidate.id === mealId);
    return meal ? (meal.name ?? meal.mealTypeLabel) : "";
  };
  return (
    <div className="needs-confirmation-result">
      {confirmed > 0 && (
        <p className="needs-confirmation-done" role="status">
          <CheckIcon />
          {confirmed === 1 ? t("unconfirmed.confirmedCountOne") : t("unconfirmed.confirmedCount", { count: confirmed })}
        </p>
      )}
      {refused.map(({ mealId, refusal }) => (
        <FormBanner key={mealId}>
          {t("unconfirmed.confirmAllRefused", { name: nameOf(mealId), reason: confirmOrSkipErrorMessage(refusal) })}
        </FormBanner>
      ))}
    </div>
  );
}

// An Unconfirmed Meal with its day: its slots as they stand, then Confirm as
// planned, Edit, which opens the Confirm sheet to change the slots first,
// and Skip. Its day has passed, so neither asks first. `busy` holds its
// buttons while Confirm all runs. Closing last week, an Untracked one says
// confirming it takes nothing from Stock.
function UnconfirmedMealCard({
  meal,
  today,
  pickers,
  busy,
  resolving,
}: {
  meal: PlannerMeal;
  today: string;
  pickers: SlotPickers;
  busy: boolean;
  resolving: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [refused, setRefused] = useState<ConfirmOrSkipError | null>(null);
  const [sending, startTransition] = useTransition();
  const pending = sending || busy;
  const status = mealCardStatus(meal, today);

  const confirm = () =>
    startTransition(async () => {
      const [refusal] = await confirmMealsAsPlannedAction([meal.id], viewerToday());
      setRefused(refusal?.refusal ?? null);
    });
  const skip = () =>
    startTransition(async () => {
      setRefused(await skipMealAction(meal.id, viewerToday()));
    });

  return (
    <article className="meal-card meal-card-unconfirmed">
      <div className="meal-card-head">
        <div className="meal-card-title">
          <p className="meal-card-eyebrow">
            {t("unconfirmed.mealOn", {
              day: formatMealDate(meal.date),
              name: t("planner.mealEyebrow", { mealType: meal.mealTypeLabel, hour: meal.hour }),
            })}
          </p>
          <h3 className="meal-card-name">{meal.name ?? meal.mealTypeLabel}</h3>
        </div>
        {status && <MealCardStatusLine status={status} />}
      </div>
      {meal.slots.length > 0 && (
        <ul className="slot-list" aria-label={t("planner.slots")}>
          {meal.slots.map((slot) => (
            <li key={slot.id} className={slot.food.content === "empty" ? "slot-row slot-row-dashed" : "slot-row"}>
              <div className="slot-row-main slot-row-line">
                <FoodCategoryPill label={slot.slotCategoryLabel} archived={slot.slotCategoryArchived} />
                <SlotFoodName food={slot.food} />
                <span className="slot-row-amount">{slotAmount(slot.food)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {resolving && meal.untracked && <p className="needs-confirmation-untracked">{t("unconfirmed.resolveUntracked")}</p>}
      {refused && <FormBanner>{confirmOrSkipErrorMessage(refused)}</FormBanner>}
      <div className="meal-card-foot needs-confirmation-actions">
        <button type="button" className="button-primary" disabled={pending} onClick={confirm}>
          {t("unconfirmed.confirmAsPlanned")}
        </button>
        <button type="button" disabled={pending} onClick={() => {
            // The sheet shows its own refusals.
            setRefused(null);
            setEditing(true);
          }}>
          {t("unconfirmed.edit")}
        </button>
        <button type="button" disabled={pending} onClick={skip}>
          {t("unconfirmed.skip")}
        </button>
      </div>
      {editing && (
        <ConfirmMealSheet meal={meal} today={today} notYet={false} pickers={pickers} onClose={() => setEditing(false)} />
      )}
    </article>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

// Beside the note that Close last week can't be left.
function LockIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
