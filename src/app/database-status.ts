"use server";

import { sql } from "drizzle-orm";
import { getDb } from "@/db";

// Asked by the error page, which cannot tell from the error itself: in
// production a server error reaches the browser with its message removed.
export async function isDatabaseReachable(): Promise<boolean> {
  try {
    await getDb().execute(sql`select 1`);
    return true;
  } catch (error) {
    console.error("Database check failed:", error);
    return false;
  }
}
