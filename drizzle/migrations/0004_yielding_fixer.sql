CREATE TABLE `pallet_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`pallet_id` text NOT NULL,
	`batch_id` text NOT NULL,
	`carton_qty` integer NOT NULL,
	`weight_kg` real NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`pallet_id`) REFERENCES `pallets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `receiving_sheet_pallets` (
	`id` text PRIMARY KEY NOT NULL,
	`receiving_sheet_id` text NOT NULL,
	`sr_no` integer NOT NULL,
	`pallet_number` text NOT NULL,
	`qty` integer NOT NULL,
	`receiving_time` text NOT NULL,
	`carton_condition` text DEFAULT 'OK' NOT NULL,
	`temperature_c` real,
	`remarks` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`receiving_sheet_id`) REFERENCES `receiving_sheets`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "receiving_sheet_pallets_carton_condition_check" CHECK("receiving_sheet_pallets"."carton_condition" IN ('OK','BULGING','DAMAGED','WET','SHORT_QUANTITY','OTHER')),
	CONSTRAINT "receiving_sheet_pallets_sr_no_positive_check" CHECK("receiving_sheet_pallets"."sr_no" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `receiving_sheet_pallets_sheet_sr_no_unique` ON `receiving_sheet_pallets` (`receiving_sheet_id`,`sr_no`);--> statement-breakpoint
CREATE TABLE `receiving_sheets` (
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
	CONSTRAINT "receiving_sheets_shift_check" CHECK("receiving_sheets"."shift" IN ('A','B','C')),
	CONSTRAINT "receiving_sheets_line_check" CHECK("receiving_sheets"."line" IN ('FF','SPECIALITY')),
	CONSTRAINT "receiving_sheets_batch_number_shape_check" CHECK(("receiving_sheets"."batch_number" LIKE 'L%' AND length("receiving_sheets"."batch_number") >= 9)),
	CONSTRAINT "receiving_sheets_status_check" CHECK("receiving_sheets"."status" IN ('DRAFT','PENDING_PACKING','PENDING_WAREHOUSE','LOCKED')),
	CONSTRAINT "receiving_sheets_default_pallet_status_check" CHECK("receiving_sheets"."default_pallet_status" IN ('QC_HOLD','BULK'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `receiving_sheets_sheet_number_unique` ON `receiving_sheets` (`sheet_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `receiving_sheets_material_batch_shift_unique` ON `receiving_sheets` (`material_id`,`batch_number`,`shift`);