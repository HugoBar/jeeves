import type { IngredientError } from "@/core/ingredients";
import type { MealTemplateFieldError, TemplateSlotError } from "@/core/meal-templates";
import type { MealTypeFieldError } from "@/core/meal-types";
import type {
  MealFieldError,
  MealFromTemplateError,
  MealSlotCategoryError,
  MealSlotFillError,
  NewMealSlotError,
} from "@/core/meals";
import type { ProductFormError } from "./products/actions";
import type { RecipeFormState } from "./recipes/actions";

// Which field of its form each error belongs to, so that field can show it.
// "form" is an error no field can fix: the form shows it on its own.
export const FORM_LEVEL = "form";

export const MEAL_TYPE_ERROR_FIELDS = {
  blankName: "name",
  invalidPriority: "priority",
} as const satisfies Record<MealTypeFieldError, string>;

export const MEAL_TEMPLATE_ERROR_FIELDS = {
  blankName: "name",
  invalidHour: "hour",
  noMealType: "mealType",
  unavailableMealType: "mealType",
} as const satisfies Record<MealTemplateFieldError, string>;

export const MEAL_ERROR_FIELDS = {
  invalidDate: FORM_LEVEL,
  invalidHour: "hour",
  noMealType: "mealType",
  unavailableMealType: "mealType",
} as const satisfies Record<MealFieldError, string>;

export const MEAL_FROM_TEMPLATE_ERROR_FIELDS = {
  invalidDate: FORM_LEVEL,
  noMealTemplate: "template",
  unavailableMealTemplate: "template",
} as const satisfies Record<MealFromTemplateError, string>;

export const MEAL_SLOT_ERROR_FIELDS = {
  noSlotCategory: "slotCategory",
  unavailableSlotCategory: "slotCategory",
  noFood: "food",
  unavailableFood: "food",
  uncategorisedFood: "food",
  invalidPortions: "amount",
  invalidQuantity: "amount",
  notChangeable: FORM_LEVEL,
} as const satisfies Record<MealSlotCategoryError | MealSlotFillError | NewMealSlotError | "notChangeable", string>;

export const PRODUCT_ERROR_FIELDS = {
  blankName: "name",
  duplicateName: "name",
  invalidDensity: "density",
  densityInUse: "density",
  noPackSizeName: "packSizeName",
  noPackSizeAmount: "packSizeAmount",
  invalidPackSizeAmount: "packSizeAmount",
} as const satisfies Record<ProductFormError, string>;

export const RECIPE_ERROR_FIELDS = {
  blankName: "name",
  invalidPortions: "portions",
  invalidPrepTime: "prepTime",
  invalidSourceUrl: "sourceUrl",
} as const satisfies Record<RecipeFormState["errors"][number], string>;

const INGREDIENT_ERROR_FIELDS = {
  noProduct: "product",
  unavailableProduct: "product",
  invalidAmount: "amount",
  noDensity: "unit",
  countMismatch: "unit",
} as const satisfies Record<IngredientError["code"], string>;

export function ingredientErrorField(error: Pick<IngredientError, "row" | "code">): string {
  return ingredientField(error.row, INGREDIENT_ERROR_FIELDS[error.code]);
}

export function ingredientField(row: number | null, field: string): string {
  return `${row}-${field}`;
}

export function templateSlotErrorField(error: TemplateSlotError): string {
  return String(error.row);
}
