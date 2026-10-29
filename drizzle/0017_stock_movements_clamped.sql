ALTER TABLE "stock_movements" ADD COLUMN "clamped" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Deductions written before this column cannot tell clamping at 0 from
-- leaving exactly 0, so any that left 0 counts as clamped. That only ever
-- keeps a flag on, never clears one wrongly.
UPDATE "stock_movements" SET "clamped" = true WHERE "type" IN ('discard', 'confirmation') AND "resulting_quantity" = 0;
