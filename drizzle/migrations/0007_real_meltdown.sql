PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_receiving_sheets` (
	`id` text PRIMARY KEY NOT NULL,
	`sheet_number` text NOT NULL,
	`date` text NOT NULL,
	`shift` text NOT NULL,
	`line` text NOT NULL,
	`material_id` text NOT NULL,
	`batch_number` text NOT NULL,
	`total_qty` integer DEFAULT 0 NOT NULL,
	`total_boxes` integer DEFAULT 0 NOT NULL,
	`packing_supervisor_id` text,
	`packing_operator_id` text,
	`warehouse_executive_id` text,
	`warehouse_operator_id` text,
	`packing_confirmed_at` text,
	`warehouse_confirmed_at` text,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`default_pallet_status` text DEFAULT 'QC_HOLD' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`packing_supervisor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`packing_operator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`warehouse_executive_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`warehouse_operator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "receiving_sheets_shift_check" CHECK("__new_receiving_sheets"."shift" IN ('A','B','C')),
	CONSTRAINT "receiving_sheets_line_check" CHECK("__new_receiving_sheets"."line" IN ('FF','SPECIALITY')),
	CONSTRAINT "receiving_sheets_batch_number_shape_check" CHECK(("__new_receiving_sheets"."batch_number" LIKE 'L%' AND length("__new_receiving_sheets"."batch_number") >= 9)),
	CONSTRAINT "receiving_sheets_status_check" CHECK("__new_receiving_sheets"."status" IN ('DRAFT','PENDING_PACKING','PENDING_WAREHOUSE','LOCKED','CANCELLED')),
	CONSTRAINT "receiving_sheets_default_pallet_status_check" CHECK("__new_receiving_sheets"."default_pallet_status" IN ('QC_HOLD','BULK'))
);
--> statement-breakpoint
INSERT INTO `__new_receiving_sheets`("id", "sheet_number", "date", "shift", "line", "material_id", "batch_number", "total_qty", "total_boxes", "packing_supervisor_id", "packing_operator_id", "warehouse_executive_id", "warehouse_operator_id", "packing_confirmed_at", "warehouse_confirmed_at", "status", "default_pallet_status", "created_at") SELECT "id", "sheet_number", "date", "shift", "line", "material_id", "batch_number", "total_qty", "total_boxes", "packing_supervisor_id", "packing_operator_id", "warehouse_executive_id", "warehouse_operator_id", "packing_confirmed_at", "warehouse_confirmed_at", "status", "default_pallet_status", "created_at" FROM `receiving_sheets`;--> statement-breakpoint
DROP TABLE `receiving_sheets`;--> statement-breakpoint
ALTER TABLE `__new_receiving_sheets` RENAME TO `receiving_sheets`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `receiving_sheets_sheet_number_unique` ON `receiving_sheets` (`sheet_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `receiving_sheets_material_batch_shift_unique` ON `receiving_sheets` (`material_id`,`batch_number`,`shift`);--> statement-breakpoint
-- drizzle-kit's own table-recreate strategy for a SQLite CHECK-constraint
-- change (DROP TABLE + rename a new one into place) silently destroys any
-- trigger attached to the old table - SQLite triggers are not table
-- schema, drizzle-kit does not know about the hand-written INV-008
-- trigger from migration 0005, and does not recreate it. Recreated here,
-- byte-for-byte identical to its original definition, so INV-008
-- enforcement is not silently lost by this migration.
CREATE TRIGGER receiving_sheets_locked_immutable
  BEFORE UPDATE ON receiving_sheets
  FOR EACH ROW
  WHEN OLD.status = 'LOCKED'
  BEGIN
    SELECT RAISE(ABORT, 'Locked sheets are immutable.');
  END;