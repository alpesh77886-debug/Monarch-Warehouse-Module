CREATE TABLE `hold_pallets` (
	`id` text PRIMARY KEY NOT NULL,
	`hold_id` text NOT NULL,
	`pallet_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`hold_id`) REFERENCES `hold_records`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pallet_id`) REFERENCES `pallets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hold_pallets_hold_pallet_unique` ON `hold_pallets` (`hold_id`,`pallet_id`);--> statement-breakpoint
CREATE TABLE `hold_records` (
	`id` text PRIMARY KEY NOT NULL,
	`hold_number` text NOT NULL,
	`material_id` text NOT NULL,
	`batch_id` text NOT NULL,
	`hold_reason` text NOT NULL,
	`custom_reason` text,
	`placed_by_id` text NOT NULL,
	`placed_by_department` text NOT NULL,
	`placed_at` text NOT NULL,
	`released_by_id` text,
	`released_at` text,
	`release_remarks` text,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`qc_followup_count` integer DEFAULT 0 NOT NULL,
	`last_followup_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`placed_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`released_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "hold_records_status_check" CHECK("hold_records"."status" IN ('ACTIVE','RELEASED','REJECTED')),
	CONSTRAINT "hold_records_hold_reason_check" CHECK("hold_records"."hold_reason" IN (
        'High Temperature',
        'Metal piece found (repass needed)',
        'Thread contamination',
        'Enzyme test positive',
        'Uneven coating / Belt mark',
        'High defects / Major defects',
        'Dull appearance and color difference',
        'Short length',
        'Black particles',
        'White patches on product surface',
        'Wrong batch code printed',
        'Batter bubbles',
        'Product carton not available',
        'Low retention time',
        'Bad smell in product',
        'Misshapes',
        'Over-production (bulk)',
        'Defective fries (bulk)',
        'Trial / Sample',
        'Other (requires supervisor approval)'
      ))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hold_records_hold_number_unique` ON `hold_records` (`hold_number`);