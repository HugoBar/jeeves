"use client";

import { Fragment, useId, useState } from "react";
import {
  categoryChips,
  parseCategoryOverrides,
  withCategoryOverride,
  type CategoryOverrideMode,
} from "@/core/recipes";
import { t } from "@/strings";
import type { CategoryOption } from "../categories/category-options";
import { FormCard } from "../form-card";
import type { RecipeFormState } from "./actions";

// The Recipe's Food Categories as chips: those its non-Minor Ingredients give,
// as they are edited, plus the Food Category Overrides set here. Every
// override is sent with the form, including one with nothing to change yet,
// so it applies again once the Ingredients change.
export function CategoryChips({
  state,
  derivedIds,
  categories,
}: {
  state: RecipeFormState;
  derivedIds: readonly string[];
  categories: CategoryOption[];
}) {
  const [overrides, setOverrides] = useState(() => parseCategoryOverrides(state.values.categoryOverrides));
  const [shownState, setShownState] = useState(state);
  if (shownState !== state) {
    setShownState(state);
    setOverrides(parseCategoryOverrides(state.values.categoryOverrides));
  }
  const [picking, setPicking] = useState(false);
  const pickerTitleId = useId();

  const setOverride = (categoryId: string, mode: CategoryOverrideMode | null) =>
    setOverrides((current) => withCategoryOverride(current, categoryId, mode));
  // The derived ones in the order categories are listed: Roles, then Kinds.
  const listed = new Map(categories.map((category, index) => [category.id, { category, index }]));
  const chips = categoryChips(
    [...derivedIds].sort((a, b) => (listed.get(a)?.index ?? 0) - (listed.get(b)?.index ?? 0)),
    overrides,
  ).flatMap((chip) => {
    const category = listed.get(chip.categoryId)?.category;
    return category ? [{ ...chip, category }] : [];
  });
  const pickable = categories.filter((category) => !chips.some((chip) => chip.categoryId === category.id));

  return (
    <FormCard title={t("recipes.foodCategories")} hint={t("recipes.foodCategoriesHint")}>
      {overrides.map(({ categoryId, mode }) => (
        <Fragment key={categoryId}>
          <input type="hidden" name="overrideCategoryId" value={categoryId} />
          <input type="hidden" name="overrideMode" value={mode} />
        </Fragment>
      ))}
      <ul className="category-chips">
        {chips.map(({ categoryId, status, category }) => (
          <li key={categoryId} className={`category-chip category-chip-${status}`}>
            {status === "removed" ? (
              <>
                <s>{category.label}</s>
                <button
                  type="button"
                  aria-label={t("recipes.restoreCategory", { name: category.label })}
                  onClick={() => setOverride(categoryId, null)}
                >
                  <UndoIcon />
                </button>
              </>
            ) : (
              <>
                {status === "added" ? t("recipes.addedCategory", { name: category.label }) : category.label}
                <button
                  type="button"
                  aria-label={t("recipes.removeCategory", { name: category.label })}
                  // One from the Ingredients needs a "remove" override; one
                  // added here only loses its "add".
                  onClick={() => setOverride(categoryId, status === "derived" ? "remove" : null)}
                >
                  <CrossIcon />
                </button>
              </>
            )}
          </li>
        ))}
        <li>
          <button
            type="button"
            className="category-chip-add button-add"
            aria-expanded={picking}
            onClick={() => setPicking((open) => !open)}
          >
            {t("recipes.addCategory")}
          </button>
        </li>
      </ul>
      {picking && (
        <section className="category-chip-picker" aria-labelledby={pickerTitleId}>
          <h3 id={pickerTitleId}>{t("recipes.addCategoryTitle")}</h3>
          {pickable.length > 0 ? (
            <div className="category-chip-options">
              {pickable.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  // Read as "Side Dish Role", which the layout's gap leaves out.
                  aria-label={`${category.label} ${t(`categories.${category.kind}`)}`}
                  onClick={() => setOverride(category.id, "add")}
                >
                  {category.label}
                  <span>{t(`categories.${category.kind}`)}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="field-hint">{t("recipes.addCategoryNone")}</p>
          )}
        </section>
      )}
    </FormCard>
  );
}

function CrossIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12a8 8 0 1 0 2.3-5.6" />
      <path d="M4 4v4h4" />
    </svg>
  );
}
