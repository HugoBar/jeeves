"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { DEFAULT_UNITS, parseDefaultUnit, type DefaultUnit } from "@/core/units";
import type { IngredientUse } from "@/core/products";
import type { Product } from "@/db/products";
import { formatList, formatQuantity, t } from "@/strings";
import { groupCategoriesByKind } from "../categories/category-groups";
import type { CategoryOption } from "../categories/category-options";
import { PRODUCT_ERROR_FIELDS } from "../field-errors";
import { FormBanner, useFieldErrors } from "../form-error";
import type { ProductFormError, ProductFormState, ProductFormValues } from "./actions";

type ProductFormContent = {
  categories: CategoryOption[];
  submitLabel: string;
  editing?: Pick<Product, "name" | "defaultUnit">;
  cancelHref?: string;
};

// New Product and Edit Product. A Product's Default Unit is picked when
// creating it; when `editing` a Product, the form only shows it.
export function ProductForm({
  action,
  initialValues,
  ...content
}: ProductFormContent & {
  action: (state: ProductFormState, formData: FormData) => Promise<ProductFormState>;
  initialValues: ProductFormValues;
}) {
  const [state, formAction, pending] = useActionState(action, {
    errors: [],
    values: initialValues,
  });
  return (
    <form action={formAction} className="product-form-cards">
      <ProductFormFields state={state} pending={pending} {...content} />
    </form>
  );
}

export function ProductFormFields({
  state,
  pending,
  categories,
  submitLabel,
  editing,
  cancelHref = "/products",
}: ProductFormContent & { state: ProductFormState; pending: boolean }) {
  const { values, errors } = state;
  const [pickedUnit, setPickedUnit] = useState(parseDefaultUnit(values.defaultUnit) ?? DEFAULT_UNITS[0]);
  const unit = editing?.defaultUnit ?? pickedUnit;
  const { invalid, messages } = useFieldErrors(
    errors,
    (error) => PRODUCT_ERROR_FIELDS[error],
    (error) => errorMessage(error, values),
  );

  // The save button is below the fields, so a rejected save scrolls back up.
  const banner = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.errors.length > 0) banner.current?.scrollIntoView({ block: "center" });
  }, [state]);

  return (
    <>
      {errors.length > 0 && (
        <FormBanner ref={banner}>
          {editing && errors.includes("densityInUse") ? (
            densityInUseMessage(editing, state.densityUses ?? [])
          ) : (
            <FixMessage count={errors.length} editing={editing !== undefined} />
          )}
        </FormBanner>
      )}
      <div className="product-form-columns">
        <Card title={t("products.basics")}>
          <div className="product-field">
            <label>
              {t("products.name")}
              <input
                name="name"
                defaultValue={values.name}
                placeholder={t("products.namePlaceholder")}
                autoFocus={!editing}
                {...invalid("name")}
              />
            </label>
            {messages("name")}
          </div>
          {editing ? (
            <LockedUnit unit={editing.defaultUnit} />
          ) : (
            <>
              <UnitPicker picked={pickedUnit} onPick={setPickedUnit} />
              <p className="banner banner-note">
                <InfoIcon />
                {t("products.stockStartsAtZero")}
              </p>
            </>
          )}
        </Card>
        <Card title={t("products.foodCategories")} hint={t("products.categoriesHint")} className="product-form-categories">
          {/* Kinds first, unlike the helper's Roles first. */}
          {groupCategoriesByKind(categories)
            .reverse()
            .map((group) => (
              <fieldset key={group.kind} className="product-field">
                <legend>{group.heading}</legend>
                <div className="chips">
                  {group.categories.map((category) => (
                    <label key={category.id} className="chip">
                      <input
                        type="checkbox"
                        name="categoryIds"
                        value={category.id}
                        defaultChecked={values.categoryIds.includes(category.id)}
                      />
                      {category.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
        </Card>
        <Card title={t("products.optional")} hint={t("products.optionalHint")}>
          <fieldset className="product-field">
            <legend>{t("products.packSize")}</legend>
            <div className="product-pack-size">
              <input
                name="packSizeName"
                aria-label={t("products.packSizeName")}
                defaultValue={values.packSizeName}
                placeholder={t("products.packSizeNamePlaceholder")}
                {...invalid("packSizeName")}
              />
              <span className="field-joined">
                <input
                  name="packSizeAmount"
                  aria-label={t("products.packSizeAmount")}
                  inputMode="decimal"
                  defaultValue={values.packSizeAmount}
                  placeholder={t("products.packSizeAmountPlaceholder")}
                  {...invalid("packSizeAmount")}
                />
                <span className="field-unit">{t(`unit.${unit}`)}</span>
              </span>
            </div>
            {messages("packSizeName") ?? messages("packSizeAmount") ?? (
              <p className="field-hint">{t("products.packSizeHint")}</p>
            )}
          </fieldset>
          <div className="product-field">
            <label>
              {t("products.densityDetail")}
              <span className="field-joined product-density">
                <input
                  name="density"
                  inputMode="decimal"
                  defaultValue={values.density}
                  placeholder={t("products.densityPlaceholder")}
                  {...invalid("density")}
                />
                <span className="field-unit">{t("products.densityUnit")}</span>
              </span>
            </label>
            {messages("density") ?? <p className="field-hint">{t("products.densityFormHint")}</p>}
          </div>
        </Card>
      </div>
      <div className="product-form-actions">
        <Link href={cancelHref} className="button">
          {t("products.cancel")}
        </Link>
        <button type="submit" className="button-primary" disabled={pending}>
          {submitLabel}
        </button>
      </div>
    </>
  );
}

function Card({
  title,
  hint,
  className = "",
  children,
}: {
  title: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`card product-form-card ${className}`}>
      <div>
        <h2>{title}</h2>
        {hint && <p className="field-hint">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function UnitPicker({ picked, onPick }: { picked: DefaultUnit; onPick: (unit: DefaultUnit) => void }) {
  return (
    <fieldset className="product-field">
      <legend>{t("products.defaultUnit")}</legend>
      <div className="unit-choices">
        {DEFAULT_UNITS.map((unit) => (
          <label key={unit} className="unit-choice">
            <input
              type="radio"
              name="defaultUnit"
              value={unit}
              defaultChecked={unit === picked}
              onChange={() => onPick(unit)}
            />
            <strong>{t(`unit.${unit}`)}</strong>
            {t(`products.unitName.${unit}`)}
          </label>
        ))}
      </div>
      <p className="field-hint">{t("products.defaultUnitHint")}</p>
    </fieldset>
  );
}

function LockedUnit({ unit }: { unit: DefaultUnit }) {
  return (
    <div className="product-field">
      <span className="product-field-label">{t("products.defaultUnit")}</span>
      <span className="field-locked">
        <LockIcon />
        {t(`unit.${unit}`)}
      </span>
      <p className="field-hint">{t("products.defaultUnitLocked")}</p>
    </div>
  );
}

// "Fix 3 things to add this Product. They're marked in red below."
function FixMessage({ count, editing }: { count: number; editing: boolean }) {
  return count === 1 ? (
    <>
      <strong>{t(editing ? "products.fixToSaveOne" : "products.fixToAddOne")}</strong> {t("products.fixWhereOne")}
    </>
  ) : (
    <>
      <strong>{t(editing ? "products.fixToSave" : "products.fixToAdd", { count })}</strong> {t("products.fixWhere")}
    </>
  );
}

function errorMessage(error: ProductFormError, values: ProductFormValues): string {
  return error === "duplicateName"
    ? t("products.error.duplicateName", { name: values.name.trim() })
    : t(`products.error.${error}`);
}

// "Flour's Density is used by Pancakes (1 cup) and Bread (2 cup). ..." Only
// editing raises it. It names the Product as saved, not a rename being typed.
function densityInUseMessage(
  { name, defaultUnit }: NonNullable<ProductFormContent["editing"]>,
  uses: IngredientUse[],
): string {
  return t("products.error.densityInUse", {
    product: name,
    uses: formatList(
      uses.map(({ recipeName, amount, unit }) =>
        t("products.densityUse", { recipe: recipeName, quantity: formatQuantity(amount, unit) }),
      ),
    ),
    unit: t(`unit.${defaultUnit}`),
  });
}

function InfoIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 7.5v.01" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="6" y="11" width="12" height="9" rx="2" />
      <path d="M9 11V8a3 3 0 0 1 6 0v3" />
    </svg>
  );
}
