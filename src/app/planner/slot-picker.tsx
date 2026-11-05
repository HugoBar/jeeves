"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { pickableForSlot, slotFoodValue } from "@/core/meals";
import type { DefaultUnit } from "@/core/units";
import { formatMealDate, t } from "@/strings";
import { FORM_LEVEL, MEAL_SLOT_ERROR_FIELDS } from "../field-errors";
import { FoodCategoryPill } from "../food-category-pill";
import { useFieldErrors } from "../form-error";
import { RemoveButton } from "../remove-button";
import { Sheet } from "../sheet";
import {
  emptyMealSlotAction,
  fillMealSlotAction,
  removeMealSlotAction,
  setMealSlotCategoryAction,
} from "./actions";
import type { PlannerMeal, PlannerMealSlot, SlotCategoryOption, SlotPickers } from "./meal-card";

// What the slot picker shows: the food to pick from, how much of the picked
// Recipe or Product, or Change Slot Category. Change Slot Category opened
// from the food goes back to it on Cancel; opened on its own, Cancel closes
// the picker. Saving it goes on to the food for the new Slot Category.
export type SlotPickerScreen =
  | { kind: "pick" }
  | { kind: "amount"; content: "recipe" | "product"; id: string }
  | { kind: "category"; fromPick: boolean };

// Where the picker opens for a slot: on its food, or on Change Slot Category
// when its Slot Category is Archived, as no food can be picked for it.
export function startScreen(slot: PlannerMealSlot): SlotPickerScreen {
  return slot.slotCategoryArchived ? { kind: "category", fromPick: false } : { kind: "pick" };
}

// The picker's line above its title and its title, for its screen.
export function slotPickerHeading(meal: PlannerMeal, slot: PlannerMealSlot, screen: SlotPickerScreen) {
  const eyebrow = t("planner.picker.eyebrow", {
    meal: meal.name ?? meal.mealTypeLabel,
    day: formatMealDate(meal.date),
    hour: meal.hour,
  });
  return { eyebrow, title: slotPickerTitle(slot, screen) };
}

// "Pick for Main Dish", "How many Portions?", "How much?" or "Change Slot
// Category".
function slotPickerTitle(slot: PlannerMealSlot, screen: SlotPickerScreen): string {
  if (screen.kind === "category") return t("planner.picker.categoryTitle");
  if (screen.kind === "amount") {
    return t(screen.content === "recipe" ? "planner.picker.portionsTitle" : "planner.picker.quantityTitle");
  }
  return t("planner.picker.title", { category: slot.slotCategoryLabel });
}

// The slot picker on a Meal card: a sheet on phone and a dialog on desktop.
export function SlotPickerSheet({
  meal,
  slot,
  pickers,
  onClose,
}: {
  meal: PlannerMeal;
  slot: PlannerMealSlot;
  pickers: SlotPickers;
  onClose: () => void;
}) {
  const [screen, setScreen] = useState(() => startScreen(slot));
  return (
    <SlotPickerSheetView meal={meal} slot={slot} pickers={pickers} screen={screen} onScreen={setScreen} onClose={onClose} />
  );
}

export function SlotPickerSheetView({
  meal,
  slot,
  pickers,
  screen,
  onScreen,
  onClose,
}: {
  meal: PlannerMeal;
  slot: PlannerMealSlot;
  pickers: SlotPickers;
  screen: SlotPickerScreen;
  onScreen: (screen: SlotPickerScreen) => void;
  onClose: () => void;
}) {
  return (
    <Sheet {...slotPickerHeading(meal, slot, screen)} className="slot-picker-sheet" onClose={onClose}>
      <SlotPickerBody meal={meal} slot={slot} pickers={pickers} screen={screen} onScreen={onScreen} onDone={onClose} />
    </Sheet>
  );
}

// What the slot picker shows under its heading, in a sheet or in the Meal
// panel. `onDone` closes it.
export function SlotPickerBody({
  meal,
  slot,
  pickers,
  screen,
  onScreen,
  onDone,
}: {
  meal: PlannerMeal;
  slot: PlannerMealSlot;
  pickers: SlotPickers;
  screen: SlotPickerScreen;
  onScreen: (screen: SlotPickerScreen) => void;
  onDone: () => void;
}) {
  const toPick = () => onScreen({ kind: "pick" });
  if (screen.kind === "category") {
    return (
      <ChangeSlotCategory
        slot={slot}
        slotCategories={pickers.slotCategories}
        onCancel={screen.fromPick ? toPick : onDone}
        onSaved={toPick}
      />
    );
  }
  if (screen.kind === "amount") {
    const value = slotFoodValue(screen.content, screen.id);
    const food = foodOptions(pickers, slot.slotCategoryId).find((option) => option.value === value);
    // Gone from what the slot can take since it was picked.
    if (food) return <PickAmount slot={slot} food={food} onBack={toPick} onDone={onDone} />;
  }
  return <PickFood meal={meal} slot={slot} pickers={pickers} onScreen={onScreen} onDone={onDone} />;
}

// A Recipe or Product the picker offers, with its line under its name. A
// Recipe starts at its own Portions; a Product has its Default Unit. `value`
// is what the fill form sends for it, as slotFoodValue gives it.
type FoodOption = { id: string; value: string; label: string; line: string } & (
  | { content: "recipe"; portions: number }
  | { content: "product"; defaultUnit: DefaultUnit }
);

// The non-Archived Recipes and Products carrying the slot's Slot Category, by
// name: "Recipe · makes 4" or "Product · g".
function foodOptions({ slotFoods }: SlotPickers, slotCategoryId: string): FoodOption[] {
  const recipes = pickableForSlot(slotFoods.recipes, slotCategoryId).map(({ id, label, portions }) => ({
    content: "recipe" as const,
    id,
    value: slotFoodValue("recipe", id),
    label,
    portions,
    line: t("planner.picker.recipeLine", { portions }),
  }));
  const products = pickableForSlot(slotFoods.products, slotCategoryId).map(({ id, label, defaultUnit }) => ({
    content: "product" as const,
    id,
    value: slotFoodValue("product", id),
    label,
    defaultUnit,
    line: t("planner.picker.productLine", { unit: t(`unit.${defaultUnit}`) }),
  }));
  return [...recipes, ...products].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}

// A slot action's form state, calling `onSaved` once it goes through. A
// refusal stays in the state, so the form shows why.
function useSlotAction<E extends SlotError>(
  slotAction: (slotId: string, previous: { error: E | null }, formData: FormData) => Promise<{ error: E | null }>,
  slotId: string,
  onSaved: () => void,
) {
  return useActionState(
    async (previous: { error: E | null }, formData: FormData) => {
      const next = await slotAction(slotId, previous, formData);
      if (!next.error) onSaved();
      return next;
    },
    { error: null },
  );
}

// The food to pick from: Leftovers first when the Meal Type allows them,
// then "All · Main Dish". With nothing carrying the category, it says so and
// offers New Recipe and New Product, with Leftovers after. Leftovers is saved
// on a tap; a Recipe or Product asks how much first.
function PickFood({
  meal,
  slot,
  pickers,
  onScreen,
  onDone,
}: {
  meal: PlannerMeal;
  slot: PlannerMealSlot;
  pickers: SlotPickers;
  onScreen: (screen: SlotPickerScreen) => void;
  onDone: () => void;
}) {
  const [state, action, pending] = useSlotAction(fillMealSlotAction, slot.id, onDone);
  const { allMessages } = useSlotErrors(state.error);
  const foods = foodOptions(pickers, slot.slotCategoryId);
  const category = slot.slotCategoryLabel;
  const kind = pickers.slotCategories.find((option) => option.id === slot.slotCategoryId)?.kind ?? "role";
  const leftovers = meal.allowsLeftovers && (
    <button
      type="submit"
      name="food"
      value="leftovers"
      className="slot-picker-option slot-picker-leftovers"
      disabled={pending}
    >
      <span className="slot-picker-option-text">
        <span className="slot-picker-option-name">{t("planner.leftovers")}</span>
        <span className="slot-picker-option-line">{t("planner.picker.leftoversHint")}</span>
      </span>
      <ChevronIcon />
    </button>
  );

  return (
    <>
      <div className="slot-picker-scope">
        <span className="slot-picker-scope-label">
          {t("planner.picker.slot")} <FoodCategoryPill label={category} /> {t("planner.picker.onlyCarrying")}
        </span>
        <button type="button" className="button-quiet" onClick={() => onScreen({ kind: "category", fromPick: true })}>
          {t("planner.picker.changeCategory")}
        </button>
      </div>
      <form action={action} className="slot-picker-food">
        {foods.length > 0 ? (
          <>
            {leftovers}
            <section className="slot-picker-section">
              <h3 className="eyebrow">{t("planner.picker.all", { category })}</h3>
              <ul className="slot-picker-list">
                {foods.map((food) => (
                  <li key={food.value}>
                    <button
                      type="button"
                      className="slot-picker-option"
                      disabled={pending}
                      onClick={() => onScreen({ kind: "amount", content: food.content, id: food.id })}
                    >
                      <span className="slot-picker-option-text">
                        <span className="slot-picker-option-name">{food.label}</span>
                        <span className="slot-picker-option-line">{food.line}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : (
          <>
            <div className="slot-picker-empty">
              <p className="slot-picker-empty-title">{t("planner.picker.nothingTitle", { category })}</p>
              <p className="slot-picker-empty-body">
                {t("planner.picker.nothingBody", { category, kind: t(`categories.${kind}`) })}
              </p>
              <p className="slot-picker-empty-links">
                <Link className="button" href="/recipes/new">
                  {t("planner.picker.newRecipe")}
                </Link>
                <Link className="button" href="/products/new">
                  {t("planner.picker.newProduct")}
                </Link>
              </p>
            </div>
            {leftovers}
          </>
        )}
        {allMessages()}
      </form>
      <SlotPickerFoot slot={slot} onDone={onDone} />
    </>
  );
}

// How much of the picked Recipe or Product: Portions, starting at the
// Recipe's own, or a quantity in the Product's Default Unit, starting empty.
// Either starts at what the slot holds when it holds the same food. A
// rejected amount shows under its field, keeping what was typed.
function PickAmount({
  slot,
  food,
  onBack,
  onDone,
}: {
  slot: PlannerMealSlot;
  food: FoodOption;
  onBack: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(() => startingAmount(slot, food));
  const [state, action, pending] = useSlotAction(fillMealSlotAction, slot.id, onDone);
  const { invalid, messages } = useSlotErrors(state.error);
  const field = (
    <input
      name="amount"
      inputMode={food.content === "recipe" ? "numeric" : "decimal"}
      autoComplete="off"
      value={amount}
      onChange={(event) => setAmount(event.target.value)}
      autoFocus
      {...invalid("amount")}
    />
  );

  return (
    <form action={action} className="slot-picker-amount">
      <p className="slot-picker-scope">
        <span className="slot-picker-scope-label">
          {t("planner.picker.slot")} <FoodCategoryPill label={slot.slotCategoryLabel} />
        </span>
      </p>
      <div className="slot-picker-picked">
        <span className="slot-picker-option-name">{food.label}</span>
        <span className="slot-picker-option-line">{food.line}</span>
      </div>
      <input type="hidden" name="food" value={food.value} />
      <div className="form-field">
        {food.content === "recipe" ? (
          <label className="form-field">
            {t("planner.portions")}
            {field}
          </label>
        ) : (
          <label className="form-field">
            {t("planner.picker.quantity")}
            <span className="field-joined">
              {field}
              <span className="field-unit">{t(`unit.${food.defaultUnit}`)}</span>
            </span>
          </label>
        )}
        {messages("amount")}
      </div>
      {messages("food")}
      {messages(FORM_LEVEL)}
      <div className="sheet-actions">
        <button type="button" onClick={onBack} disabled={pending}>
          {t("planner.picker.back")}
        </button>
        <button type="submit" className="button-primary" disabled={pending}>
          {t("planner.picker.addToSlot")}
        </button>
      </div>
    </form>
  );
}

// What the amount field starts at: what the slot holds when it holds this
// same food, else the Recipe's Portions, or nothing for a Product.
function startingAmount(slot: PlannerMealSlot, food: FoodOption): string {
  const held = slot.food;
  if (held.content === "recipe" && food.value === slotFoodValue("recipe", held.id)) return String(held.portions);
  if (held.content === "product" && food.value === slotFoodValue("product", held.id)) return String(held.quantity);
  return food.content === "recipe" ? String(food.portions) : "";
}

// Change Slot Category: the non-Archived Roles, then Kinds, with the slot's
// own picked and marked "now". An Archived one isn't listed, so nothing is
// picked. Saving keeps the food in the slot.
function ChangeSlotCategory({
  slot,
  slotCategories,
  onCancel,
  onSaved,
}: {
  slot: PlannerMealSlot;
  slotCategories: SlotCategoryOption[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [state, action, pending] = useSlotAction(setMealSlotCategoryAction, slot.id, onSaved);
  const { invalid, allMessages } = useSlotErrors(state.error);

  return (
    <form action={action} className="slot-category-form">
      <fieldset className="slot-category-choices">
        <legend>{t("planner.picker.categoryQuestion")}</legend>
        {slotCategories.map((category) => {
          const now = category.id === slot.slotCategoryId;
          const kind = t(`categories.${category.kind}`);
          return (
            <label key={category.id} className="slot-category-choice">
              <input
                type="radio"
                name="slotCategoryId"
                value={category.id}
                defaultChecked={now}
                {...invalid("slotCategory")}
              />
              <FoodCategoryPill label={category.label} />
              <span className="slot-category-kind">{now ? t("planner.picker.now", { kind }) : kind}</span>
            </label>
          );
        })}
      </fieldset>
      <p className="field-hint">{t("planner.picker.categoryHint")}</p>
      {allMessages()}
      <div className="sheet-actions">
        <button type="button" onClick={onCancel} disabled={pending}>
          {t("planner.cancel")}
        </button>
        <button type="submit" className="button-primary" disabled={pending}>
          {t("planner.save")}
        </button>
      </div>
    </form>
  );
}

// The foot of the picker: Empty, when the slot holds something, Remove Slot,
// which asks first, and Cancel.
function SlotPickerFoot({ slot, onDone }: { slot: PlannerMealSlot; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="sheet-actions slot-picker-foot">
      {slot.food.content !== "empty" && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await emptyMealSlotAction(slot.id);
              onDone();
            })
          }
        >
          {t("planner.emptySlot")}
        </button>
      )}
      <RemoveButton
        action={() => removeMealSlotAction(slot.id)}
        label={t("planner.removeSlot")}
        title={t("planner.removeSlotConfirm", { category: slot.slotCategoryLabel })}
      />
      <button type="button" onClick={onDone}>
        {t("planner.cancel")}
      </button>
    </div>
  );
}

// The › at the end of a row that opens something.
export function ChevronIcon() {
  return (
    <svg className="slot-row-chevron" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

// Why a slot's picking or adding was refused.
type SlotError = keyof typeof MEAL_SLOT_ERROR_FIELDS;

// The refused field's props and its message, for a slot form.
export function useSlotErrors(error: SlotError | null) {
  return useFieldErrors(
    error ? [error] : [],
    (slotError) => MEAL_SLOT_ERROR_FIELDS[slotError],
    (slotError) => t(`planner.error.${slotError}`),
  );
}
