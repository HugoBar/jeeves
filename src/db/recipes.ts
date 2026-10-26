import "server-only";
import { eq, isNull } from "drizzle-orm";
import type { RecipeFields } from "@/core/recipes";
import type { Db } from "./index";
import { recipes } from "./schema";

export interface Recipe extends RecipeFields {
  id: string;
}

type RecipeRow = typeof recipes.$inferSelect;

function toRecipe({ id, name, portions, steps, prepTimeMinutes, sourceUrl }: RecipeRow): Recipe {
  return { id, name, portions, steps, prepTimeMinutes, sourceUrl };
}

// The Recipes list: every Recipe that is not Archived.
export async function listActiveRecipes(db: Db): Promise<Recipe[]> {
  const rows = await db.select().from(recipes).where(isNull(recipes.archivedAt));
  return rows.map(toRecipe);
}

export async function createRecipe(db: Db, fields: RecipeFields): Promise<Recipe> {
  const [row] = await db.insert(recipes).values(fields).returning();
  return toRecipe(row!);
}

export async function getRecipe(db: Db, id: string): Promise<Recipe | undefined> {
  const [row] = await db.select().from(recipes).where(eq(recipes.id, id));
  return row && toRecipe(row);
}

export async function updateRecipe(db: Db, id: string, changes: RecipeFields): Promise<void> {
  await db.update(recipes).set(changes).where(eq(recipes.id, id));
}
