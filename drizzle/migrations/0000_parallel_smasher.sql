CREATE TABLE `batches` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_number` text NOT NULL,
	`material_id` text NOT NULL,
	`production_date` text NOT NULL,
	`production_line` text NOT NULL,
	`shift` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "batches_production_line_check" CHECK("batches"."production_line" IN ('FF','SPECIALITY')),
	CONSTRAINT "batches_shift_check" CHECK("batches"."shift" IN ('A','B','C')),
	CONSTRAINT "batches_batch_number_shape_check" CHECK(("batches"."batch_number" LIKE 'L%' AND length("batches"."batch_number") >= 9))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `batches_batch_number_unique` ON `batches` (`batch_number`);--> statement-breakpoint
CREATE TABLE `locations` (
	`id` text PRIMARY KEY NOT NULL,
	`warehouse_id` text NOT NULL,
	`cold_room` text NOT NULL,
	`block` text,
	`position` text,
	`floor` integer,
	`full_code` text NOT NULL,
	`capacity_pallets` integer DEFAULT 1 NOT NULL,
	`current_pallet_id` text,
	`status` text DEFAULT 'EMPTY' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "locations_cold_room_check" CHECK("locations"."cold_room" IN ('CR1','CR2','FLOOR','NA')),
	CONSTRAINT "locations_status_check" CHECK("locations"."status" IN ('EMPTY','OCCUPIED','PARTIAL','BLOCKED'))
);
--> statement-breakpoint
CREATE TABLE `materials` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`description` text NOT NULL,
	`uom_kg_per_carton` real NOT NULL,
	`category` text NOT NULL,
	`pallet_weight_limit_kg` real NOT NULL,
	`pallet_type` text NOT NULL,
	`shelf_life_days` integer,
	`plant_origin` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "materials_code_prefix_check" CHECK(("materials"."code" LIKE 'LFG%' OR "materials"."code" LIKE 'SFG%')),
	CONSTRAINT "materials_pallet_type_check" CHECK("materials"."pallet_type" IN ('CARTON','ROLL','POUCH')),
	CONSTRAINT "materials_plant_origin_check" CHECK("materials"."plant_origin" IN ('LIMBASI','SABARKANTHA'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `materials_code_unique` ON `materials` (`code`);--> statement-breakpoint
CREATE TABLE `pallets` (
	`id` text PRIMARY KEY NOT NULL,
	`pallet_number` text NOT NULL,
	`pallet_type` text NOT NULL,
	`material_id` text NOT NULL,
	`current_location_id` text,
	`status_code` text DEFAULT 'QC_HOLD' NOT NULL,
	`total_weight_kg` real NOT NULL,
	`total_cartons` integer NOT NULL,
	`current_warehouse_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`current_location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`current_warehouse_id`) REFERENCES `warehouses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "pallets_pallet_type_check" CHECK("pallets"."pallet_type" IN ('PLASTIC','WOODEN')),
	CONSTRAINT "pallets_status_code_check" CHECK("pallets"."status_code" IN ('QC_HOLD','OK','HOLD','BULK','DISPATCHED','IN_TRANSIT','CUSTOMER_SAMPLE','SAMPLE','REJECTED','SCRAP'))
);
--> statement-breakpoint
CREATE TABLE `stock_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`shift` text NOT NULL,
	`transaction_type` text NOT NULL,
	`material_id` text NOT NULL,
	`batch_id` text NOT NULL,
	`pallet_id` text NOT NULL,
	`location_id` text,
	`warehouse_id` text NOT NULL,
	`qty_change` integer NOT NULL,
	`qty_after` integer NOT NULL,
	`weight_change_kg` real NOT NULL,
	`weight_after_kg` real NOT NULL,
	`status_before` text,
	`status_after` text,
	`reference_type` text NOT NULL,
	`reference_id` text NOT NULL,
	`user_id` text NOT NULL,
	`remarks` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pallet_id`) REFERENCES `pallets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "stock_ledger_shift_check" CHECK("stock_ledger"."shift" IN ('A','B','C','NA')),
	CONSTRAINT "stock_ledger_transaction_type_check" CHECK("stock_ledger"."transaction_type" IN ('INWARD','MOVE','HOLD','RELEASE','DISPATCH','TRANSFER_IN','TRANSFER_OUT','ADJUSTMENT','BULK_SEND','BULK_RECEIVE')),
	CONSTRAINT "stock_ledger_reference_type_check" CHECK("stock_ledger"."reference_type" IN ('RECEIVING_SHEET','TRANSFER_ORDER','LOADING_SHEET','HOLD_RECORD','MANUAL_MOVE','CYCLE_COUNT'))
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`clerk_user_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`role_id` text NOT NULL,
	`department` text NOT NULL,
	`plant` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_clerk_user_id_unique` ON `users` (`clerk_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `warehouses` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`plant` text NOT NULL,
	`sap_code` text NOT NULL,
	`address` text,
	`location_structure` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "warehouses_type_check" CHECK("warehouses"."type" IN ('OWN','3PL','CROSS_PLANT')),
	CONSTRAINT "warehouses_plant_check" CHECK("warehouses"."plant" IN ('LIMBASI','SABARKANTHA','PATAN')),
	CONSTRAINT "warehouses_location_structure_check" CHECK("warehouses"."location_structure" IN ('RACK','FLAT'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `warehouses_code_unique` ON `warehouses` (`code`);