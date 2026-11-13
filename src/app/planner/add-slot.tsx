"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  newMealSlotPickable,
  parseNewMealSlot,
  slotCategoryChoices,
  slotFoodValue,
  type NewMealSlotInput,
} from "@/core/meals";
import { formatMealDate, t } from "@/strings";
import { FoodCategoryPill } from "../food-category-pill";
import { FormBanner } from "../form-error";
import { Sheet } from "../sheet";
import { addMealSlotAction, type NewMealSlotFormState } from "./actions";
import type { PlannerMeal, SlotCategoryOption, SlotPickers } from "./meal-card";
import { useAskWhichMeals } from "./series-scope-sheet";
import { AmountForm, FoodList, PickedFood, toFoodOptions, type FoodOption } from "./slot-picker";

// What Add a slot shows: the food to pick from, the Slot Category of the
// picked food (`food` as slotFoodValue gives it), or how much of it goes in
// the slot. How much goes Back to where it came `from`. The categories show
// `slotCategoryId` picked when coming back to them, else the first.
export type AddSlotScreen =
  | { kind: "food" }
  | { kind: "category"; food: string; slotCategoryId?: string }
  | { kind: "amount"; food: string; slotCategoryId: string; from: "food" | "category" };

// The picked Recipe or Product, and the Slot Categories it can give a new
// slot: its Roles, else its Kinds.
function pickedFood(food: string, { slotFoods, slotCategories }: SlotPickers) {
  const picked =
    slotFoods.recipes.find((option) => slotFoodValue("recipe", option.id) === food) ??
    slotFoods.products.find((option) => slotFoodValue("product", option.id) === food);
  return { picked, choices: picked ? slotCategoryChoices(picked.categoryIds, slotCategories) : [] };
}

// Where picking `food` goes: on to how much when it has one Slot Category,
// which the slot takes, else to its categories, to pick one or to say it has
// none.
export function afterFood(food: string, pickers: SlotPickers): AddSlotScreen {
  const { choices } = pickedFood(food, pickers);
  return choices.length === 1
    ? { kind: "amount", food, slotCategoryId: choices[0]!.id, from: "food" }
    : { kind: "category", food };
}

// Where Back goes: from how much to where it came from, with its category
// still picked, and from the categories to the food.
export function backFrom(screen: AddSlotScreen): AddSlotScreen {
  if (screen.kind === "amount" && screen.from === "category") {
    return { kind: "category", food: screen.food, slotCategoryId: screen.slotCategoryId };
  }
  return { kind: "food" };
}

// Saves the new slot from the food, amount and slotCategoryId sent, or says
// why it was refused.
export type AddSlot = (formData: FormData) => Promise<NewMealSlotFormState>;

// Adds a slot to the Meal form, before the Meal exists: it is checked here as
// the server will check it, then handed to `deliver` with its Slot Category
// and amount as they were read.
export function addToMealForm(pickers: SlotPickers, deliver: (slot: NewMealSlotInput) => void): AddSlot {
  return async (formData) => {
    const input = newSlotInput(formData);
    const parsed = checkNewSlot(input, pickers);
    if (!parsed.ok) return { error: parsed.error };
    const { slotCategoryId, fill } = parsed.slot;
    deliver({ food: input.food, amount: String(fill.content === "recipe" ? fill.portions : fill.quantity), slotCategoryId });
    return { error: null };
  };
}

// The new slot as Add a slot sends it.
function newSlotInput(formData: FormData): NewMealSlotInput {
  return {
    food: String(formData.get("food") ?? ""),
    amount: String(formData.get("amount") ?? ""),
    slotCategoryId: String(formData.get("slotCategoryId") ?? ""),
  };
}

// The new slot checked here as the server will check it.
function checkNewSlot(input: NewMealSlotInput, { slotFoods, slotCategories }: SlotPickers) {
  return parseNewMealSlot(input, newMealSlotPickable(slotFoods.recipes, slotFoods.products, slotCategories));
}

// "Add a slot", or "How many Portions?" and "How much?" when asking how much.
export function addSlotTitle(screen: AddSlotScreen): string {
  if (screen.kind !== "amount") return t("planner.addSlot.title");
  return t(screen.food.startsWith("recipe:") ? "planner.picker.portionsTitle" : "planner.picker.quantityTitle");
}

// Add a slot on a Meal card, adding it after the Meal's other slots.
export function AddSlotSheet({
  meal,
  pickers,
  onClose,
}: {
  meal: PlannerMeal;
  pickers: SlotPickers;
  onClose: () => void;
}) {
  const [screen, setScreen] = useState<AddSlotScreen>({ kind: "food" });
  return (
    <AddSlotSheetView
      meal={meal}
      pickers={pickers}
      screen={screen}
      onScreen={setScreen}
      add={(formData) => addMealSlotAction(meal.id, { error: null }, formData)}
      onClose={onClose}
    />
  );
}

// Add a slot on a Meal card: a sheet on phone and a dialog on desktop,
// headed with the Meal, its day and hour.
export function AddSlotSheetView({
  meal,
  pickers,
  screen,
  onScreen,
  add,
  onClose,
}: {
  meal: PlannerMeal;
  pickers: SlotPickers;
  screen: AddSlotScreen;
  onScreen: (screen: AddSlotScreen) => void;
  add: AddSlot;
  onClose: () => void;
}) {
  const eyebrow = t("planner.picker.eyebrow", {
    meal: meal.name ?? meal.mealTypeLabel,
    day: formatMealDate(meal.date),
    hour: meal.hour,
  });
  return (
    <Sheet
      eyebrow={eyebrow}
      title={addSlotTitle(screen)}
      screen={screen.kind}
      className="slot-picker-sheet"
      onClose={onClose}
    >
      <AddSlotBody meal={meal} pickers={pickers} screen={screen} onScreen={onScreen} add={add} onDone={onClose} />
    </Sheet>
  );
}

// What Add a slot shows under its heading, in a sheet or in the Meal panel.
// `add` saves the slot, and `onDone` closes it, once added or on Cancel.
// `meal` is the Meal it is added to, once it exists: on a Meal of a Meal
// Series, adding asks which Meals get the slot first.
export function AddSlotBody({
  meal,
  pickers,
  screen,
  onScreen,
  add,
  onDone,
}: {
  meal?: PlannerMeal;
  pickers: SlotPickers;
  screen: AddSlotScreen;
  onScreen: (screen: AddSlotScreen) => void;
  add: AddSlot;
  onDone: () => void;
}) {
  const toFood = () => onScreen({ kind: "food" });
  // Gone from what can be added since it was picked, it goes back to the food.
  const picked = screen.kind === "food" ? undefined : foodOption(screen.food, pickers);
  if (screen.kind === "amount" && picked) {
    const category = pickers.slotCategories.find((option) => option.id === screen.slotCategoryId);
    return (
      <AddSlotAmount
        meal={meal}
        accepted={(formData) => checkNewSlot(newSlotInput(formData), pickers).ok}
        food={picked}
        categoryLabel={category?.label ?? ""}
        slotCategoryId={screen.slotCategoryId}
        add={add}
        onChangeFood={toFood}
        onBack={() => onScreen(backFrom(screen))}
        onAdded={onDone}
      />
    );
  }
  if (screen.kind === "category" && picked) {
    const { choices } = pickedFood(screen.food, pickers);
    return choices.length === 0 ? (
      <NoFoodCategory food={picked} onChangeFood={toFood} />
    ) : (
      <PickSlotCategory
        food={picked}
        choices={choices}
        startPicked={screen.slotCategoryId}
        onChangeFood={toFood}
        onNext={(slotCategoryId) => onScreen({ kind: "amount", food: screen.food, slotCategoryId, from: "category" })}
      />
    );
  }
  const foods = toFoodOptions(pickers.slotFoods.recipes, pickers.slotFoods.products);
  return (
    <div className="slot-picker-food">
      <p className="field-hint">{t("planner.addSlot.foodFirst")}</p>
      <FoodList
        heading={t("planner.addSlot.all")}
        foods={foods}
        disabled={false}
        onPick={(food) => onScreen(afterFood(food.value, pickers))}
      />
      <div className="sheet-actions">
        <button type="button" onClick={onDone}>
          {t("planner.cancel")}
        </button>
      </div>
    </div>
  );
}

// The picked Recipe or Product as the picker lists it.
function foodOption(food: string, pickers: SlotPickers): FoodOption | undefined {
  const { picked } = pickedFood(food, pickers);
  if (!picked) return undefined;
  const recipe = "portions" in picked;
  return toFoodOptions(recipe ? [picked] : [], recipe ? [] : [picked])[0];
}

// How much of the picked food goes in the new slot, starting at a Recipe's
// own Portions. Add to slot saves it with its Slot Category, asking first
// which Meals get it when `meal` is in a Meal Series, unless `accepted`
// says it would be refused, so its error shows straight away.
function AddSlotAmount({
  meal,
  accepted,
  food,
  categoryLabel,
  slotCategoryId,
  add,
  onChangeFood,
  onBack,
  onAdded,
}: {
  meal?: PlannerMeal;
  accepted: (formData: FormData) => boolean;
  food: FoodOption;
  categoryLabel: string;
  slotCategoryId: string;
  add: AddSlot;
  onChangeFood: () => void;
  onBack: () => void;
  onAdded: () => void;
}) {
  const [state, action, pending] = useActionState(
    async (_previous: NewMealSlotFormState, formData: FormData) => {
      const next = await add(formData);
      if (!next.error) onAdded();
      return next;
    },
    { error: null },
  );
  const question = useAskWhichMeals({
    kind: "addSlot",
    meal: meal ?? null,
    category: categoryLabel,
    asks: accepted,
  });
  return (
    <>
      <AmountForm
        categoryLabel={categoryLabel}
        food={food}
        startAmount={food.content === "recipe" ? String(food.portions) : ""}
        error={state.error}
        action={action}
        pending={pending}
        onChangeFood={onChangeFood}
        onBack={onBack}
        onSubmit={question.onSubmit}
      >
        <input type="hidden" name="slotCategoryId" value={slotCategoryId} />
        {question.field}
      </AmountForm>
      {question.sheet}
    </>
  );
}

// Food with no Food Category, or only Archived ones, can't give a slot one:
// it says so, with a link to the Recipe or Product to give it one.
function NoFoodCategory({ food, onChangeFood }: { food: FoodOption; onChangeFood: () => void }) {
  return (
    <div className="slot-category-form">
      <PickedFood
        food={food}
        line={t("planner.addSlot.noCategoryLine", { line: food.line })}
        disabled={false}
        onChangeFood={onChangeFood}
      />
      <FormBanner>
        {t("planner.error.uncategorisedFood")}
        <Link className="slot-picker-open-food" href={`/${food.content === "recipe" ? "recipes" : "products"}/${food.id}`}>
          {t("planner.addSlot.openFood", { food: food.label })}
        </Link>
      </FormBanner>
      <div className="sheet-actions">
        <button type="button" onClick={onChangeFood}>
          {t("planner.picker.back")}
        </button>
      </div>
    </div>
  );
}

// Which of the picked food's Slot Categories a new slot takes, with the
// first picked for you, or `startPicked` when it is still one of them. Next
// goes on to how much.
function PickSlotCategory({
  food,
  choices,
  startPicked,
  onChangeFood,
  onNext,
}: {
  food: FoodOption;
  choices: SlotCategoryOption[];
  startPicked?: string;
  onChangeFood: () => void;
  onNext: (slotCategoryId: string) => void;
}) {
  const [picked, setPicked] = useState(
    choices.some((category) => category.id === startPicked) ? startPicked! : choices[0]!.id,
  );
  const kind = choices[0]!.kind;
  const labels = choices.map((category) => category.label);
  const line = t(kind === "role" ? "planner.addSlot.rolesLine" : "planner.addSlot.kindsLine", {
    line: food.line,
    categories: labels.join(", "),
  });

  return (
    <div className="slot-category-form">
      <PickedFood food={food} line={line} disabled={false} onChangeFood={onChangeFood} />
      <fieldset className="slot-category-choices">
        <legend>{t("planner.addSlot.whichCategory", { food: food.label, categories: listWithArticles(labels) })}</legend>
        {choices.map((category, index) => {
          const kindLabel = t(`categories.${category.kind}`);
          return (
            <label key={category.id} className="slot-category-choice">
              <input
                type="radio"
                name="slotCategoryId"
                value={category.id}
                checked={category.id === picked}
                onChange={() => setPicked(category.id)}
              />
              <FoodCategoryPill label={category.label} />
              <span className="slot-category-kind">
                {index === 0 ? t("planner.addSlot.pickedForYou", { kind: kindLabel }) : kindLabel}
              </span>
            </label>
          );
        })}
      </fieldset>
      <p className="field-hint">{t("planner.addSlot.categoryHint")}</p>
      <div className="sheet-actions">
        <button type="button" onClick={onChangeFood}>
          {t("planner.picker.back")}
        </button>
        <button type="button" className="button-primary" onClick={() => onNext(picked)}>
          {t("planner.addSlot.next")}
        </button>
      </div>
    </div>
  );
}

// "a Main Dish and a Side Dish", or "a Fish, a Grain and an Omelette".
function listWithArticles(labels: string[]): string {
  const withArticles = labels.map((label) => `${/^[aeiou]/i.test(label) ? "an" : "a"} ${label}`);
  const last = withArticles.pop()!;
  return withArticles.length ? `${withArticles.join(", ")} and ${last}` : last;
}
