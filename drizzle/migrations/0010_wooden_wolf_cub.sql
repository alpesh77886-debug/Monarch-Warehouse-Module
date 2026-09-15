CREATE TABLE `transfer_order_pallets` (
	`id` text PRIMARY KEY NOT NULL,
	`transfer_order_id` text NOT NULL,
	`pallet_id` text NOT NULL,
	`material_id` text NOT NULL,
	`batch_id` text NOT NULL,
	`carton_qty` integer NOT NULL,
	`weight_kg` real NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`transfer_order_id`) REFERENCES `transfer_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pallet_id`) REFERENCES `pallets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transfer_order_pallets_order_pallet_unique` ON `transfer_order_pallets` (`transfer_order_id`,`pallet_id`);--> statement-breakpoint
CREATE TABLE `transfer_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`transfer_number` text NOT NULL,
	`source_warehouse_id` text NOT NULL,
	`destination_warehouse_id` text NOT NULL,
	`transfer_type` text NOT NULL,
	`vehicle_number` text,
	`driver_name` text,
	`transporter` text,
	`temperature_c` real,
	`lr_number` text,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`initiated_by_id` text,
	`received_by_id` text,
	`dispatched_at` text,
	`received_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`source_warehouse_id`) REFERENCES `warehouses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`destination_warehouse_id`) REFERENCES `warehouses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`initiated_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`received_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "transfer_orders_transfer_type_check" CHECK("transfer_orders"."transfer_type" IN ('NORMAL','HOLD_TAG','BULK_TAG')),
	CONSTRAINT "transfer_orders_status_check" CHECK("transfer_orders"."status" IN ('DRAFT','PICKED','LOADED','IN_TRANSIT','RECEIVED','COMPLETED','CANCELLED')),
	CONSTRAINT "transfer_orders_source_dest_different_check" CHECK("transfer_orders"."source_warehouse_id" != "transfer_orders"."destination_warehouse_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transfer_orders_transfer_number_unique` ON `transfer_orders` (`transfer_number`);