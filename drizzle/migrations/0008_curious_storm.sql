CREATE TABLE `loading_sheet_pallets` (
	`id` text PRIMARY KEY NOT NULL,
	`loading_sheet_id` text NOT NULL,
	`pallet_id` text NOT NULL,
	`material_id` text NOT NULL,
	`batch_id` text NOT NULL,
	`carton_qty` integer NOT NULL,
	`weight_kg` real NOT NULL,
	`loading_sequence` integer NOT NULL,
	`fifo_override_reason` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`loading_sheet_id`) REFERENCES `loading_sheets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pallet_id`) REFERENCES `pallets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "loading_sheet_pallets_sequence_positive_check" CHECK("loading_sheet_pallets"."loading_sequence" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `loading_sheet_pallets_sheet_pallet_unique` ON `loading_sheet_pallets` (`loading_sheet_id`,`pallet_id`);--> statement-breakpoint
CREATE TABLE `loading_sheets` (
	`id` text PRIMARY KEY NOT NULL,
	`loading_sheet_number` text NOT NULL,
	`date` text NOT NULL,
	`vehicle_number` text NOT NULL,
	`driver_name` text NOT NULL,
	`transporter` text,
	`party_name` text NOT NULL,
	`destination` text NOT NULL,
	`export_domestic` text NOT NULL,
	`temperature_c` real NOT NULL,
	`qc_approval_by_id` text,
	`qc_approval_at` text,
	`container_number` text,
	`seal_number` text,
	`bolt_number` text,
	`gate_pass_number` text,
	`gate_pass_time` text,
	`loaded_by_id` text,
	`verified_by_id` text,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`qc_approval_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`loaded_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`verified_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "loading_sheets_export_domestic_check" CHECK("loading_sheets"."export_domestic" IN ('EXPORT','DOMESTIC')),
	CONSTRAINT "loading_sheets_status_check" CHECK("loading_sheets"."status" IN ('DRAFT','STAGING','LOADED','VERIFIED','GATE_PASSED','DISPATCHED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `loading_sheets_loading_sheet_number_unique` ON `loading_sheets` (`loading_sheet_number`);