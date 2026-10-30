"use client";

import { Fragment, useActionState, useState } from "react";
import {
  canChangeMeal,
  canReopen,
  canConfirmOrSkip,
  confirmOrSkipAsksFirst,
  isUnconfirmed,
  pickableForSlot,
  slotCategoryChoices,
  slotFoodValue,
  type MealFieldError,
  type MealStatus,
} from "@/core/meals";
import type { CategoryKind } from "@/core/food-categories";
import { localDate, localHour } from "@/core/planner";
import { shortfallUrgency } from "@/core/projected-stock";
import type { DefaultUnit } from "@/core/units";
import { editingLabel, formatMealDate, formatQuantity, t } from "@/strings";
import { MEAL_ERROR_FIELDS, MEAL_SLOT_ERROR_FIELDS } from "../field-errors";
import { FormError, useFieldErrors, type InvalidProps } from "../form-error";
import { RemoveButton } from "../remove-button";
import { viewerToday } from "../viewer-clock";
import {
  addMealSlotAction,
  confirmMealAction,
  editMealAction,
  emptyMealSlotAction,
  fillMealSlotAction,
  removeMealAction,
  removeMealSlotAction,
  reopenMealAction,
  setMealSlotCategoryAction,
  setMealUntrackedAction,
  skipMealAction,
  type ConfirmMealError,
  type MealChangesFormState,
  type MealSlotCategoryFormState,
  type MealSlotFillFormState,
  type NewMealSlotFormState,
  type SkipMealError,
} from "./actions";

// A Meal with what its card shows. Its Meal Type may be Archived: the Meal
// keeps it.
export interface PlannerMeal {
  id: string;
  date: string;
  hour: string;
  createdAt: Date;
  name: string | null;
  mealTypeLabel: string;
  mealTypeArchived: boolean;
  // Whether the Meal Type allows Leftovers in its slots.
  allowsLeftovers: boolean;
  status: MealStatus;
  untracked: boolean;
  slots: PlannerMealSlot[];
}

// A Meal Slot with what its card shows. Its Slot Category may be Archived:
// the slot keeps it until it is changed.
export interface PlannerMealSlot {
  id: string;
  slotCategoryId: string;
  slotCategoryLabel: string;
  slotCategoryArchived: boolean;
  food: PlannerSlotFood;
  // Null when the slot has nothing to warn about, or its Meal is Untracked,
  // Confirmed or Skipped.
  warnings: SlotWarnings | null;
}

// What a slot's warnings show: each Product it is short of by its name, with
// the amount short in its Default Unit, and the names of Products whose
// Ingredient cannot be converted, so their Stock cannot be projected.
export interface SlotWarnings {
  shortfalls: { name: string; amount: number; defaultUnit: DefaultUnit }[];
  unprojectable: string[];
}

// What a Meal Slot holds, as its card shows it. Its Recipe or Product may be
// Archived: the slot keeps it.
export type PlannerSlotFood =
  | { content: "empty" | "leftovers" }
  | { content: "recipe"; id: string; label: string; portions: number; archived: boolean }
  | { content: "product"; id: string; label: string; quantity: number; defaultUnit: DefaultUnit; archived: boolean };

// The non-Archived Recipes and Products a slot's fill picker can offer, each
// with its Food Categories (a Recipe's final ones), by the label the user sees.
export interface SlotFoods {
  recipes: (PickerOption & { portions: number; categoryIds: string[] })[];
  products: (PickerOption & { defaultUnit: DefaultUnit; categoryIds: string[] })[];
}

// A Meal Type, Meal Template or Food Category a picker offers, by the label
// the user sees.
export interface PickerOption {
  id: string;
  label: string;
}

// A Food Category a Slot Category picker offers. Its Role or Kind decides
// whether a slot added by hand can take it.
export interface SlotCategoryOption extends PickerOption {
  kind: CategoryKind;
}

// What the planner's pickers offer: Meal Types, Food Categories, Recipes and
// Products that are not Archived, and every Meal Template.
export interface Pickers {
  mealTypes: PickerOption[];
  templates: PickerOption[];
  slotCategories: SlotCategoryOption[];
  slotFoods: SlotFoods;
}

// Which planner week a Meal is shown in; null off the planner.
export type Week = "this" | "next" | null;

// React resets a form after every submit, putting each field back to the value
// it mounted with. Counting submits gives the fields a new key each time, so
// they remount with what was sent and the reset keeps it.
export type Submitted<State> = State & { submits: number };

// A Meal named with its date, as lists across days show it: "Mon 26 Oct · Lunch".
export function mealOnLabel(meal: Pick<PlannerMeal, "date" | "name" | "mealTypeLabel">): string {
  return t("unconfirmed.mealOn", { day: formatMealDate(meal.date), name: meal.name ?? meal.mealTypeLabel });
}

// A Meal on its day, edited in place. Its Meal Type is shown but never changes.
// A Confirmed or Skipped Meal is read-only: it can only be Reopened.
export function MealCard({
  meal,
  week,
  today,
  pickers,
}: {
  meal: PlannerMeal;
  week: Week;
  today: string;
  pickers: Pick<Pickers, "slotCategories" | "slotFoods">;
}) {
  const [editing, setEditing] = useState(false);
  const [addingSlot, setAddingSlot] = useState(false);
  const label = meal.name ?? meal.mealTypeLabel;
  const changeable = canChangeMeal(meal);

  if (editing) return <EditMealForm meal={meal} week={week} onDone={() => setEditing(false)} />;

  return (
    <div className="item-row planner-meal">
      <span className="planner-meal-hour">{meal.hour}</span>
      <span className="planner-meal-label">
        {label}
        {meal.mealTypeArchived && <span className="planner-tag">{t("planner.mealTypeArchived")}</span>}
        {isUnconfirmed(meal, today) && <span className="planner-tag">{t("planner.unconfirmed")}</span>}
        {meal.status === "confirmed" && <span className="planner-tag">{t("planner.confirmed")}</span>}
        {meal.status === "skipped" && <span className="planner-tag">{t("planner.skipped")}</span>}
        {meal.untracked && <span className="planner-tag">{t("planner.untracked")}</span>}
      </span>
      <span className="planner-meal-actions">
        {changeable ? (
          <>
            <button type="button" onClick={() => setEditing(true)}>
              {t("planner.edit")}
            </button>
            <form action={setMealUntrackedAction.bind(null, meal.id, !meal.untracked)}>
              <button type="submit">{t(meal.untracked ? "planner.unmarkUntracked" : "planner.markUntracked")}</button>
            </form>
            <RemoveButton
              action={removeMealAction.bind(null, meal.id)}
              label={t("planner.remove")}
              confirmMessage={t("planner.removeConfirm", { name: label })}
            />
          </>
        ) : (
          canReopen(meal) && (
            <form action={reopenMealAction.bind(null, meal.id)}>
              <button type="submit">{t("planner.reopen")}</button>
            </form>
          )
        )}
      </span>
      {meal.slots.length > 0 && (
        <ol className="slot-list" aria-label={t("planner.slots")}>
          {meal.slots.map((slot) => (
            // A new key once a Slot Category change is saved, so the picker
            // mounts with it.
            <li key={`${slot.id}:${slot.slotCategoryId}`} className="slot-row">
              {changeable ? (
                <>
                  <SlotCategoryPicker slot={slot} slotCategories={pickers.slotCategories} />
                  <SlotFood slot={slot} allowsLeftovers={meal.allowsLeftovers} foods={pickers.slotFoods} />
                  <RemoveButton
                    action={() => removeMealSlotAction(slot.id)}
                    label={t("planner.removeSlot")}
                    confirmMessage={t("planner.removeSlotConfirm", { category: slot.slotCategoryLabel })}
                  />
                </>
              ) : (
                <>
                  <span>{slot.slotCategoryLabel}</span>
                  <SlotFoodLabel food={slot.food} />
                </>
              )}
              {slot.warnings && <SlotWarningList warnings={slot.warnings} mealDate={meal.date} today={today} />}
            </li>
          ))}
        </ol>
      )}
      {changeable &&
        (addingSlot ? (
          <AddSlotForm
            mealId={meal.id}
            foods={pickers.slotFoods}
            slotCategories={pickers.slotCategories}
            onDone={() => setAddingSlot(false)}
          />
        ) : (
          <span className="planner-add">
            <button type="button" className="button-list-add" onClick={() => setAddingSlot(true)}>
              {t("planner.addSlot")}
            </button>
          </span>
        ))}
      {canConfirmOrSkip(meal, today) && <ConfirmOrSkipMeal meal={meal} />}
    </div>
  );
}

type ConfirmOrSkipError = ConfirmMealError | SkipMealError;

// What each of the form's buttons sends as "outcome".
const OUTCOME = { confirm: "confirm", confirmUntracked: "confirmUntracked", skip: "skip" } as const;

// Confirm, Confirm as Untracked and Skip, for a Meal dated today or earlier.
// A Meal later today may not have happened yet, so each asks first;
// cancelling sends nothing. An Untracked Meal deducts nothing either way. A
// refusal shows here, with nothing written.
function ConfirmOrSkipMeal({ meal }: { meal: PlannerMeal }) {
  const [error, action, pending] = useActionState(
    (_previous: ConfirmOrSkipError | null, formData: FormData): Promise<ConfirmOrSkipError | null> => {
      const outcome = formData.get("outcome");
      if (outcome === OUTCOME.skip) return skipMealAction(meal.id, viewerToday());
      return confirmMealAction(meal.id, outcome === OUTCOME.confirmUntracked, viewerToday());
    },
    null,
  );
  return (
    <form
      action={action}
      className="planner-confirm"
      onSubmit={(event) => {
        const now = new Date();
        if (!confirmOrSkipAsksFirst(meal, { date: localDate(now), hour: localHour(now) })) return;
        const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const question = submitter?.value === OUTCOME.skip ? "planner.skipToday" : "planner.confirmToday";
        if (!confirm(t(question))) event.preventDefault();
      }}
    >
      <button type="submit" name="outcome" value={OUTCOME.confirm} className="button-primary" disabled={pending}>
        {t("planner.confirm")}
      </button>
      <button type="submit" name="outcome" value={OUTCOME.confirmUntracked} disabled={pending}>
        {t("planner.confirmUntracked")}
      </button>
      <button type="submit" name="outcome" value={OUTCOME.skip} disabled={pending}>
        {t("planner.skip")}
      </button>
      {error && <FormError>{confirmOrSkipErrorMessage(error)}</FormError>}
    </form>
  );
}

// "Can't confirm: Flour has no Density, so 1 cup can't be converted to g. ..."
export function confirmOrSkipErrorMessage(error: ConfirmOrSkipError): string {
  if (error.error === "notConfirmable") return t("planner.error.notConfirmable");
  if (error.error === "notSkippable") return t("planner.error.notSkippable");
  return t(`planner.error.${error.code}`, {
    product: error.product.name,
    quantity: formatQuantity(error.amount, error.unit),
    defaultUnit: t(`unit.${error.product.defaultUnit}`),
  });
}

// "Short: Rice 300 g, Eggs 2 pc" and "Can't project Milk", red when the Meal
// is 1 day away or less, amber otherwise. They never block saving.
function SlotWarningList({ warnings, mealDate, today }: { warnings: SlotWarnings; mealDate: string; today: string }) {
  const className = `slot-warnings slot-warnings-${shortfallUrgency(mealDate, today)}`;
  return (
    <span className={className} role="status">
      {warnings.shortfalls.length > 0 && (
        <span>
          {t("planner.shortfall", {
            items: warnings.shortfalls
              .map(({ name, amount, defaultUnit }) =>
                t("planner.shortfallItem", { name, quantity: formatQuantity(amount, defaultUnit) }),
              )
              .join(", "),
          })}
        </span>
      )}
      {warnings.unprojectable.map((name) => (
        <span key={name}>{t("planner.cannotProject", { name })}</span>
      ))}
    </span>
  );
}

// A slot's Slot Category, saved as soon as one is picked; a Confirmed or
// Skipped Meal's slots only show theirs as it was. The picker offers only
// non-Archived Food Categories, plus the slot's own if it is Archived, which
// it warns about until it is changed.
function SlotCategoryPicker({ slot, slotCategories }: { slot: PlannerMealSlot; slotCategories: SlotCategoryOption[] }) {
  const [state, action, pending] = useActionState(
    (previous: MealSlotCategoryFormState, formData: FormData) =>
      setMealSlotCategoryAction(slot.id, previous, formData),
    { error: null },
  );
  const { invalid, allMessages } = useSlotErrors(state.error);
  return (
    <form action={action}>
      <select
        name="slotCategoryId"
        aria-label={t("planner.slotCategory")}
        defaultValue={slot.slotCategoryId}
        disabled={pending}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        {...invalid("slotCategory")}
      >
        {slot.slotCategoryArchived && <option value={slot.slotCategoryId}>{slot.slotCategoryLabel}</option>}
        {slotCategories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.label}
          </option>
        ))}
      </select>
      {slot.slotCategoryArchived && <p className="form-error">{t("planner.slotArchived")}</p>}
      {allMessages()}
    </form>
  );
}

// A slot's food, before its Meal is Confirmed or Skipped: what it holds, with
// buttons to fill, change or empty it.
function SlotFood({ slot, allowsLeftovers, foods }: { slot: PlannerMealSlot; allowsLeftovers: boolean; foods: SlotFoods }) {
  const [filling, setFilling] = useState(false);
  if (filling) {
    return <SlotFillForm slot={slot} allowsLeftovers={allowsLeftovers} foods={foods} onDone={() => setFilling(false)} />;
  }
  if (slot.food.content === "empty") {
    return (
      <button type="button" onClick={() => setFilling(true)}>
        {t("planner.fillSlot")}
      </button>
    );
  }
  return (
    <>
      <SlotFoodLabel food={slot.food} />
      <button type="button" onClick={() => setFilling(true)}>
        {t("planner.changeSlot")}
      </button>
      <form action={() => emptyMealSlotAction(slot.id)}>
        <button type="submit">{t("planner.emptySlot")}</button>
      </form>
    </>
  );
}

// What a slot holds: "Risotto · 3 Portions", "Bread · 120 g" or "Leftovers".
// A Recipe or Product removed since stays, tagged Archived.
function SlotFoodLabel({ food }: { food: PlannerSlotFood }) {
  switch (food.content) {
    case "empty":
      return <span className="planner-empty">{t("planner.slotIsEmpty")}</span>;
    case "leftovers":
      return <span>{t("planner.leftovers")}</span>;
    case "recipe":
    case "product":
      return (
        <span>
          {food.content === "recipe"
            ? t("planner.slotRecipe", { name: food.label, portions: food.portions })
            : t("planner.slotProduct", { name: food.label, quantity: formatQuantity(food.quantity, food.defaultUnit) })}
          {food.archived && <span className="planner-tag">{t("planner.foodArchived")}</span>}
        </span>
      );
  }
}

// The picker's value for what the slot holds, if the picker still offers it:
// "recipe:<id>", "product:<id>" or "leftovers"; "" otherwise.
function pickedFood(food: PlannerSlotFood, offered: ReadonlySet<string>): { food: string; amount: string } {
  const value =
    food.content === "recipe" || food.content === "product" ? slotFoodValue(food.content, food.id) : food.content;
  if (!offered.has(value)) return { food: "", amount: "" };
  if (food.content === "recipe") return { food: value, amount: String(food.portions) };
  if (food.content === "product") return { food: value, amount: String(food.quantity) };
  return { food: value, amount: "" };
}

// A picked Recipe or Product and its Portions or quantity, as the food
// picker's fields hold them.
type FoodValues = { food: string; amount: string };

// The food picker and its amount, shared by filling a slot and adding one.
// Picking a Recipe sets the Portions to the Recipe's own, which can then be
// changed. `emptyLabel` is the picker's blank first option.
function FoodFields({
  recipes,
  products,
  allowsLeftovers,
  emptyLabel,
  values,
  onChange,
  invalid,
}: {
  recipes: SlotFoods["recipes"];
  products: SlotFoods["products"];
  allowsLeftovers: boolean;
  emptyLabel: string;
  values: FoodValues;
  onChange: (values: FoodValues) => void;
  invalid: (field: "food" | "amount") => InvalidProps;
}) {
  const recipeFor = (food: string) => recipes.find((option) => slotFoodValue("recipe", option.id) === food);
  const recipe = recipeFor(values.food);
  const product = products.find((option) => slotFoodValue("product", option.id) === values.food);
  function pick(food: string) {
    const picked = recipeFor(food);
    onChange({ food, amount: picked ? String(picked.portions) : "" });
  }

  return (
    <>
      <select
        name="food"
        aria-label={t("planner.food")}
        value={values.food}
        onChange={(event) => pick(event.target.value)}
        autoFocus
        {...invalid("food")}
      >
        <option value="">{emptyLabel}</option>
        {recipes.length > 0 && (
          <optgroup label={t("planner.recipes")}>
            {recipes.map((option) => (
              <option key={option.id} value={slotFoodValue("recipe", option.id)}>
                {option.label}
              </option>
            ))}
          </optgroup>
        )}
        {products.length > 0 && (
          <optgroup label={t("planner.products")}>
            {products.map((option) => (
              <option key={option.id} value={slotFoodValue("product", option.id)}>
                {option.label}
              </option>
            ))}
          </optgroup>
        )}
        {allowsLeftovers && <option value="leftovers">{t("planner.leftovers")}</option>}
      </select>
      {(recipe || product) && (
        <label className="planner-amount">
          <input
            name="amount"
            inputMode={recipe ? "numeric" : "decimal"}
            value={values.amount}
            onChange={(event) => onChange({ ...values, amount: event.target.value })}
            required
            {...invalid("amount")}
          />
          {recipe ? t("planner.portions") : t(`unit.${product!.defaultUnit}`)}
        </label>
      )}
    </>
  );
}

// Fills a slot, or changes what it holds. The picker offers only non-Archived
// Recipes and Products carrying the slot's Slot Category, and Leftovers if
// the Meal Type allows them. Unmounted when closed, so its errors go with it.
function SlotFillForm({
  slot,
  allowsLeftovers,
  foods,
  onDone,
}: {
  slot: PlannerMealSlot;
  allowsLeftovers: boolean;
  foods: SlotFoods;
  onDone: () => void;
}) {
  const recipes = pickableForSlot(foods.recipes, slot.slotCategoryId);
  const products = pickableForSlot(foods.products, slot.slotCategoryId);
  const offered = new Set([
    ...recipes.map((recipe) => slotFoodValue("recipe", recipe.id)),
    ...products.map((product) => slotFoodValue("product", product.id)),
    ...(allowsLeftovers ? ["leftovers"] : []),
  ]);
  // Controlled, so a rejected submit keeps what was picked and typed.
  const [values, setValues] = useState(() => pickedFood(slot.food, offered));
  const [state, action, pending] = useActionState(async (previous: MealSlotFillFormState, formData: FormData) => {
    const next = await fillMealSlotAction(slot.id, previous, formData);
    if (!next.error) onDone();
    return next;
  }, { error: null });
  const { invalid, allMessages } = useSlotErrors(state.error);

  return (
    <form action={action} className="item-form planner-form open-row">
      <FoodFields
        recipes={recipes}
        products={products}
        allowsLeftovers={allowsLeftovers}
        emptyLabel={offered.size === 0 ? t("planner.nothingPickable") : t("planner.pickFood")}
        values={values}
        onChange={setValues}
        invalid={invalid}
      />
      <button type="submit" className="button-primary" disabled={pending}>
        {t("planner.save")}
      </button>
      <button type="button" onClick={onDone}>
        {t("planner.cancel")}
      </button>
      {allMessages()}
    </form>
  );
}

// Adds a slot filled with a non-Archived Recipe or Product, after the Meal's
// others. The slot takes its Role, else its Kind; with several, a chooser
// shows with the first pre-selected. A Recipe or Product with no Food
// Category cannot be added. Leftovers are not offered: they have no Food
// Category to give the slot. Unmounted when closed, so its errors go with it.
function AddSlotForm({
  mealId,
  foods,
  slotCategories,
  onDone,
}: {
  mealId: string;
  foods: SlotFoods;
  slotCategories: SlotCategoryOption[];
  onDone: () => void;
}) {
  // Controlled, so a rejected submit keeps what was picked and typed.
  const [values, setValues] = useState<FoodValues>({ food: "", amount: "" });
  const [slotCategoryId, setSlotCategoryId] = useState("");
  const [state, action, pending] = useActionState(async (previous: NewMealSlotFormState, formData: FormData) => {
    const next = await addMealSlotAction(mealId, previous, formData);
    if (!next.error) onDone();
    return next;
  }, { error: null });

  const picked =
    foods.recipes.find((option) => slotFoodValue("recipe", option.id) === values.food) ??
    foods.products.find((option) => slotFoodValue("product", option.id) === values.food);
  const choices = picked ? slotCategoryChoices(picked.categoryIds, slotCategories) : [];
  const uncategorised = picked !== undefined && choices.length === 0;
  function pick(next: FoodValues) {
    // Other food pre-selects its own first Slot Category.
    if (next.food !== values.food) setSlotCategoryId("");
    setValues(next);
  }
  const { invalid, allMessages } = useSlotErrors(uncategorised ? "uncategorisedFood" : state.error);

  return (
    <form action={action} className="item-form planner-form open-row">
      <FoodFields
        recipes={foods.recipes}
        products={foods.products}
        allowsLeftovers={false}
        emptyLabel={t("planner.pickFood")}
        values={values}
        onChange={pick}
        invalid={invalid}
      />
      {choices.length === 1 && <input type="hidden" name="slotCategoryId" value={choices[0]!.id} />}
      {choices.length > 1 && (
        <select
          name="slotCategoryId"
          aria-label={t("planner.slotCategory")}
          value={slotCategoryId || choices[0]!.id}
          onChange={(event) => setSlotCategoryId(event.target.value)}
          {...invalid("slotCategory")}
        >
          {choices.map((category) => (
            <option key={category.id} value={category.id}>
              {category.label}
            </option>
          ))}
        </select>
      )}
      <button type="submit" className="button-primary" disabled={pending || uncategorised}>
        {t("planner.add")}
      </button>
      <button type="button" onClick={onDone}>
        {t("planner.cancel")}
      </button>
      {allMessages()}
    </form>
  );
}

// Unmounted when closed, so its errors go with it.
function EditMealForm({ meal, week, onDone }: { meal: PlannerMeal; week: Week; onDone: () => void }) {
  const [state, action, pending] = useActionState(
    async ({ submits, ...previous }: Submitted<MealChangesFormState>, formData: FormData) => {
      const next = await editMealAction(meal.id, previous, formData);
      if (next.errors.length === 0) onDone();
      return { ...next, submits: submits + 1 };
    },
    { errors: [], values: { hour: meal.hour, name: meal.name ?? "" }, submits: 0 },
  );
  const { values } = state;
  const { invalid, allMessages } = useMealErrors(state.errors);
  return (
    <form action={action} className="item-form planner-form open-row">
      <p className="planner-editing">{editingLabel(meal.date, week)}</p>
      <span>{meal.mealTypeLabel}</span>
      <Fragment key={state.submits}>
        <input type="time" name="hour" aria-label={t("planner.hour")} defaultValue={values.hour} autoFocus {...invalid("hour")} />
        <input name="name" aria-label={t("planner.name")} placeholder={t("planner.name")} defaultValue={values.name} />
      </Fragment>
      <button type="submit" className="button-primary" disabled={pending}>
        {t("planner.save")}
      </button>
      <button type="button" onClick={onDone}>
        {t("planner.cancel")}
      </button>
      {allMessages()}
    </form>
  );
}

export function useMealErrors(errors: MealFieldError[]) {
  return useFieldErrors(
    errors,
    (error) => MEAL_ERROR_FIELDS[error],
    (error) => t(`planner.error.${error}`),
  );
}

type SlotError = keyof typeof MEAL_SLOT_ERROR_FIELDS;

function useSlotErrors(error: SlotError | null) {
  return useFieldErrors(
    error ? [error] : [],
    (slotError) => MEAL_SLOT_ERROR_FIELDS[slotError],
    (slotError) => t(`planner.error.${slotError}`),
  );
}
