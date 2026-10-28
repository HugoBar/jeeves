"use client";

import { Fragment, useActionState, useState, useSyncExternalStore } from "react";
import {
  isPlanned,
  pickableForSlot,
  slotCategoryChoices,
  slotFoodValue,
  sortMeals,
  type MealFieldError,
  type MealFromTemplateError,
  type MealStatus,
} from "@/core/meals";
import type { CategoryKind } from "@/core/food-categories";
import { localDate, plannerWeeks } from "@/core/planner";
import type { DefaultUnit } from "@/core/units";
import { editingLabel, formatDayHeading, formatQuantity, formatWeekRange, t } from "@/strings";
import { RemoveButton } from "../remove-button";
import {
  addMealSlotAction,
  createMealAction,
  createMealFromTemplateAction,
  editMealAction,
  emptyMealSlotAction,
  fillMealSlotAction,
  removeMealAction,
  removeMealSlotAction,
  setMealSlotCategoryAction,
  setMealUntrackedAction,
  type MealChangesFormState,
  type MealFromTemplateFormState,
  type MealSlotCategoryFormState,
  type MealSlotFillFormState,
  type NewMealFormState,
  type NewMealSlotFormState,
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
interface Pickers {
  mealTypes: PickerOption[];
  templates: PickerOption[];
  slotCategories: SlotCategoryOption[];
  slotFoods: SlotFoods;
}

type Week = "this" | "next";

// React resets a form after every submit, putting each field back to the value
// it mounted with. Counting submits gives the fields a new key each time, so
// they remount with what was sent and the reset keeps it.
type Submitted<State> = State & { submits: number };

const subscribe = () => () => {};

// The viewer's date as they submit, which slot actions check the Meal's day
// against: a planner left open past midnight still shows yesterday as today.
const viewerToday = () => localDate(new Date());

// "Today" is the date in the viewer's time zone (spec "Platform"). The server
// cannot know that zone, so it renders nothing and the browser fills the
// planner in after hydration.
export function Planner({ meals, ...pickers }: { meals: PlannerMeal[] } & Pickers) {
  const today = useSyncExternalStore(subscribe, () => localDate(new Date()), () => null);
  if (!today) return null;

  const { thisWeek, nextWeek } = plannerWeeks(today);
  const props = { today, meals, pickers };
  return (
    <>
      <PlannerWeek week="this" days={thisWeek} {...props} />
      <PlannerWeek week="next" days={nextWeek} {...props} />
    </>
  );
}

function PlannerWeek({
  week,
  days,
  today,
  meals,
  pickers,
}: {
  week: Week;
  days: string[];
  today: string;
  meals: PlannerMeal[];
  pickers: Pickers;
}) {
  const dates = formatWeekRange(days[0]!, days[6]!);
  return (
    <section className={week === "next" ? "planner-week planner-week-next" : "planner-week"}>
      <h2 className="planner-week-header">
        {t(week === "next" ? "planner.nextWeek" : "planner.thisWeek", { dates })}
      </h2>
      {days.map((date) => (
        <PlannerDay
          key={date}
          date={date}
          week={week}
          today={today}
          meals={sortMeals(meals.filter((meal) => meal.date === date))}
          pickers={pickers}
        />
      ))}
    </section>
  );
}

function PlannerDay({
  date,
  week,
  today,
  meals,
  pickers,
}: {
  date: string;
  week: Week;
  today: string;
  meals: PlannerMeal[];
  pickers: Pickers;
}) {
  const [adding, setAdding] = useState<"scratch" | "template" | null>(null);
  const isToday = date === today;
  return (
    <section className={isToday ? "planner-day planner-day-today" : "planner-day"} aria-current={isToday ? "date" : undefined}>
      <h3>
        {formatDayHeading(date)}
        {isToday && <span className="planner-tag">{t("planner.today")}</span>}
      </h3>
      {meals.length === 0 ? (
        <p className="planner-empty">{t("planner.empty")}</p>
      ) : (
        <ul className="planner-meals">
          {meals.map((meal) => (
            <li key={meal.id}>
              <MealCard meal={meal} week={week} today={today} pickers={pickers} />
            </li>
          ))}
        </ul>
      )}
      {adding === "scratch" && (
        <AddMealForm date={date} week={week} mealTypes={pickers.mealTypes} onDone={() => setAdding(null)} />
      )}
      {adding === "template" && (
        <AddMealFromTemplateForm
          date={date}
          week={week}
          templates={pickers.templates}
          onDone={() => setAdding(null)}
        />
      )}
      {adding === null && (
        <span className="planner-add">
          <button type="button" onClick={() => setAdding("scratch")}>
            {t("planner.addMeal")}
          </button>
          {pickers.templates.length > 0 && (
            <button type="button" onClick={() => setAdding("template")}>
              {t("planner.addFromTemplate")}
            </button>
          )}
        </span>
      )}
    </section>
  );
}

function AddMealForm({
  date,
  week,
  mealTypes,
  onDone,
}: {
  date: string;
  week: Week;
  mealTypes: PickerOption[];
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(
    async ({ submits, ...previous }: Submitted<NewMealFormState>, formData: FormData) => {
      const next = await createMealAction(date, previous, formData);
      if (next.errors.length === 0) onDone();
      return { ...next, submits: submits + 1 };
    },
    { errors: [], values: { mealTypeId: "", hour: "", name: "" }, submits: 0 },
  );
  const { values } = state;
  return (
    <form action={action} className="item-form planner-form">
      <p className="planner-editing">{editingLabel(date, week)}</p>
      <Fragment key={state.submits}>
        <select name="mealTypeId" aria-label={t("planner.mealType")} defaultValue={values.mealTypeId} autoFocus>
          <option value="">{t("planner.pickMealType")}</option>
          {mealTypes.map((mealType) => (
            <option key={mealType.id} value={mealType.id}>
              {mealType.label}
            </option>
          ))}
        </select>
        <input type="time" name="hour" aria-label={t("planner.hour")} defaultValue={values.hour} />
        <input name="name" aria-label={t("planner.name")} placeholder={t("planner.name")} defaultValue={values.name} />
      </Fragment>
      <button type="submit" disabled={pending}>
        {t("planner.add")}
      </button>
      <button type="button" onClick={onDone}>
        {t("planner.cancel")}
      </button>
      <FormErrors state={state} />
    </form>
  );
}

// Copies the picked template's name, Meal Type, hour and empty slots; the
// Meal can be edited afterwards like any other.
function AddMealFromTemplateForm({
  date,
  week,
  templates,
  onDone,
}: {
  date: string;
  week: Week;
  templates: PickerOption[];
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(
    async ({ submits, ...previous }: Submitted<MealFromTemplateFormState>, formData: FormData) => {
      const next = await createMealFromTemplateAction(date, previous, formData);
      if (next.errors.length === 0) onDone();
      return { ...next, submits: submits + 1 };
    },
    { errors: [], templateId: "", submits: 0 },
  );
  return (
    <form action={action} className="item-form planner-form">
      <p className="planner-editing">{editingLabel(date, week)}</p>
      <select
        key={state.submits}
        name="templateId"
        aria-label={t("planner.template")}
        defaultValue={state.templateId}
        autoFocus
      >
        <option value="">{t("planner.pickTemplate")}</option>
        {templates.map((template) => (
          <option key={template.id} value={template.id}>
            {template.label}
          </option>
        ))}
      </select>
      <button type="submit" disabled={pending}>
        {t("planner.add")}
      </button>
      <button type="button" onClick={onDone}>
        {t("planner.cancel")}
      </button>
      <FormErrors state={state} />
    </form>
  );
}

// A Meal on its day, edited in place. Its Meal Type is shown but never changes.
function MealCard({
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
  const planned = isPlanned(meal, today);

  if (editing) return <EditMealForm meal={meal} week={week} onDone={() => setEditing(false)} />;

  return (
    <div className="item-row planner-meal">
      <span className="planner-meal-hour">{meal.hour}</span>
      <span className="planner-meal-label">
        {label}
        {meal.mealTypeArchived && <span className="planner-tag">{t("planner.mealTypeArchived")}</span>}
        {meal.untracked && <span className="planner-tag">{t("planner.untracked")}</span>}
      </span>
      <span className="planner-meal-actions">
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
      </span>
      {meal.slots.length > 0 && (
        <ol className="slot-list" aria-label={t("planner.slots")}>
          {meal.slots.map((slot) => (
            // A new key once a Slot Category change is saved, so the picker
            // mounts with it.
            <li key={`${slot.id}:${slot.slotCategoryId}`} className="slot-row">
              {planned ? (
                <>
                  <SlotCategoryPicker slot={slot} slotCategories={pickers.slotCategories} />
                  <SlotFood slot={slot} allowsLeftovers={meal.allowsLeftovers} foods={pickers.slotFoods} />
                  <RemoveButton
                    action={() => removeMealSlotAction(slot.id, viewerToday())}
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
            </li>
          ))}
        </ol>
      )}
      {planned &&
        (addingSlot ? (
          <AddSlotForm
            mealId={meal.id}
            foods={pickers.slotFoods}
            slotCategories={pickers.slotCategories}
            onDone={() => setAddingSlot(false)}
          />
        ) : (
          <span className="planner-add">
            <button type="button" onClick={() => setAddingSlot(true)}>
              {t("planner.addSlot")}
            </button>
          </span>
        ))}
    </div>
  );
}

// A Planned slot's Slot Category, saved as soon as one is picked; a past
// Meal's slots only show theirs as it was. The picker offers only
// non-Archived Food Categories, plus the slot's own if it is Archived, which
// it warns about until it is changed.
function SlotCategoryPicker({ slot, slotCategories }: { slot: PlannerMealSlot; slotCategories: SlotCategoryOption[] }) {
  const [state, action, pending] = useActionState(
    (previous: MealSlotCategoryFormState, formData: FormData) =>
      setMealSlotCategoryAction(slot.id, viewerToday(), previous, formData),
    { error: null },
  );
  return (
    <form action={action}>
      <select
        name="slotCategoryId"
        aria-label={t("planner.slotCategory")}
        defaultValue={slot.slotCategoryId}
        disabled={pending}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        {slot.slotCategoryArchived && <option value={slot.slotCategoryId}>{slot.slotCategoryLabel}</option>}
        {slotCategories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.label}
          </option>
        ))}
      </select>
      {slot.slotCategoryArchived && <span className="form-error"> {t("planner.slotArchived")}</span>}
      {state.error && <p className="form-error">{t(`planner.error.${state.error}`)}</p>}
    </form>
  );
}

// A Planned slot's food: what it holds, with buttons to fill, change or empty
// it.
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
      <form action={() => emptyMealSlotAction(slot.id, viewerToday())}>
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
}: {
  recipes: SlotFoods["recipes"];
  products: SlotFoods["products"];
  allowsLeftovers: boolean;
  emptyLabel: string;
  values: FoodValues;
  onChange: (values: FoodValues) => void;
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
      <select name="food" aria-label={t("planner.food")} value={values.food} onChange={(event) => pick(event.target.value)} autoFocus>
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
    const next = await fillMealSlotAction(slot.id, viewerToday(), previous, formData);
    if (!next.error) onDone();
    return next;
  }, { error: null });

  return (
    <form action={action} className="item-form planner-form">
      <FoodFields
        recipes={recipes}
        products={products}
        allowsLeftovers={allowsLeftovers}
        emptyLabel={offered.size === 0 ? t("planner.nothingPickable") : t("planner.pickFood")}
        values={values}
        onChange={setValues}
      />
      <button type="submit" disabled={pending}>
        {t("planner.save")}
      </button>
      <button type="button" onClick={onDone}>
        {t("planner.cancel")}
      </button>
      {state.error && <p className="form-error">{t(`planner.error.${state.error}`)}</p>}
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
    const next = await addMealSlotAction(mealId, viewerToday(), previous, formData);
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

  return (
    <form action={action} className="item-form planner-form">
      <FoodFields
        recipes={foods.recipes}
        products={foods.products}
        allowsLeftovers={false}
        emptyLabel={t("planner.pickFood")}
        values={values}
        onChange={pick}
      />
      {choices.length === 1 && <input type="hidden" name="slotCategoryId" value={choices[0]!.id} />}
      {choices.length > 1 && (
        <select
          name="slotCategoryId"
          aria-label={t("planner.slotCategory")}
          value={slotCategoryId || choices[0]!.id}
          onChange={(event) => setSlotCategoryId(event.target.value)}
        >
          {choices.map((category) => (
            <option key={category.id} value={category.id}>
              {category.label}
            </option>
          ))}
        </select>
      )}
      <button type="submit" disabled={pending || uncategorised}>
        {t("planner.add")}
      </button>
      <button type="button" onClick={onDone}>
        {t("planner.cancel")}
      </button>
      {uncategorised ? (
        <p className="form-error">{t("planner.error.uncategorisedFood")}</p>
      ) : (
        state.error && <p className="form-error">{t(`planner.error.${state.error}`)}</p>
      )}
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
  return (
    <form action={action} className="item-form planner-form">
      <p className="planner-editing">{editingLabel(meal.date, week)}</p>
      <span>{meal.mealTypeLabel}</span>
      <Fragment key={state.submits}>
        <input type="time" name="hour" aria-label={t("planner.hour")} defaultValue={values.hour} autoFocus />
        <input name="name" aria-label={t("planner.name")} placeholder={t("planner.name")} defaultValue={values.name} />
      </Fragment>
      <button type="submit" disabled={pending}>
        {t("planner.save")}
      </button>
      <button type="button" onClick={onDone}>
        {t("planner.cancel")}
      </button>
      <FormErrors state={state} />
    </form>
  );
}

function FormErrors({ state }: { state: { errors: (MealFieldError | MealFromTemplateError)[] } }) {
  return state.errors.map((error) => (
    <p key={error} className="form-error">
      {t(`planner.error.${error}`)}
    </p>
  ));
}
