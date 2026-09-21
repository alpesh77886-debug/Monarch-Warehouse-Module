-- Loop 50 / PEN-037: hold_records gains PARTIALLY_RELEASED, hold_pallets
-- gains its own per-pallet status/released_by_id/released_at/
-- release_remarks columns (Alpesh: "Hold release Partial bhi kar lo").
--
-- Hand-reordered from drizzle-kit's own generated statement order - see
-- this project's own PEN-039/040/PEN-033 precedent for hand-fixing a
-- generated table-recreate migration. drizzle-kit generates
-- `PRAGMA foreign_keys=OFF` then drops the PARENT table (hold_records)
-- while the CHILD table (hold_pallets, its own FK hold_id -> hold_records.id
-- still live) has not been recreated yet - this fails with a real
-- "FOREIGN KEY constraint failed" against this project's own local D1,
-- because SQLite's `PRAGMA foreign_keys` is documented to be a no-op
-- inside an already-open multi-statement transaction, and this whole
-- migration file runs as exactly that (D1's own batch() primitive,
-- PEN-044). Reordered here so the CHILD table is always dropped (always
-- FK-safe, regardless of the pragma) before its PARENT is ever touched,
-- and rebuilt fresh only after the parent's own recreate is complete -
-- no step in this version ever drops a table something else still has a
-- live foreign key pointing at.
CREATE TABLE `__hold_pallets_backup` AS SELECT * FROM `hold_pallets`;
--> statement-breakpoint
DROP TABLE `hold_pallets`;
--> statement-breakpoint
CREATE TABLE `__new_hold_records` (
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
	CONSTRAINT "hold_records_status_check" CHECK("__new_hold_records"."status" IN ('ACTIVE','RELEASED','REJECTED','PARTIALLY_RELEASED')),
	CONSTRAINT "hold_records_hold_reason_check" CHECK("__new_hold_records"."hold_reason" IN (
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
INSERT INTO `__new_hold_records`("id", "hold_number", "material_id", "batch_id", "hold_reason", "custom_reason", "placed_by_id", "placed_by_department", "placed_at", "released_by_id", "released_at", "release_remarks", "status", "qc_followup_count", "last_followup_at", "created_at") SELECT "id", "hold_number", "material_id", "batch_id", "hold_reason", "custom_reason", "placed_by_id", "placed_by_department", "placed_at", "released_by_id", "released_at", "release_remarks", "status", "qc_followup_count", "last_followup_at", "created_at" FROM `hold_records`;
--> statement-breakpoint
DROP TABLE `hold_records`;
--> statement-breakpoint
ALTER TABLE `__new_hold_records` RENAME TO `hold_records`;
--> statement-breakpoint
CREATE UNIQUE INDEX `hold_records_hold_number_unique` ON `hold_records` (`hold_number`);
--> statement-breakpoint
CREATE TABLE `hold_pallets` (
	`id` text PRIMARY KEY NOT NULL,
	`hold_id` text NOT NULL,
	`pallet_id` text NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`released_by_id` text,
	`released_at` text,
	`release_remarks` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`hold_id`) REFERENCES `hold_records`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pallet_id`) REFERENCES `pallets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`released_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "hold_pallets_status_check" CHECK("hold_pallets"."status" IN ('ACTIVE','RELEASED','REJECTED'))
);
--> statement-breakpoint
-- Backfills each pre-existing hold_pallets row's new per-pallet status
-- from its own hold_record's already-known (pre-this-migration) rollup
-- status - a hold that was already fully RELEASED/REJECTED gets its
-- pallets backfilled to that same terminal status (and the same
-- released_by/at/remarks, the closest real signal available, since no
-- per-pallet detail existed before this migration); anything still
-- ACTIVE (or otherwise) backfills to ACTIVE, matching that pallet's own
-- real pre-migration state exactly (no partial release was possible
-- before this migration, so ACTIVE is never a guess here).
INSERT INTO `hold_pallets` ("id", "hold_id", "pallet_id", "status", "released_by_id", "released_at", "release_remarks", "created_at")
SELECT b."id", b."hold_id", b."pallet_id",
  CASE WHEN hr."status" IN ('RELEASED','REJECTED') THEN hr."status" ELSE 'ACTIVE' END,
  CASE WHEN hr."status" IN ('RELEASED','REJECTED') THEN hr."released_by_id" ELSE NULL END,
  CASE WHEN hr."status" IN ('RELEASED','REJECTED') THEN hr."released_at" ELSE NULL END,
  CASE WHEN hr."status" IN ('RELEASED','REJECTED') THEN hr."release_remarks" ELSE NULL END,
  b."created_at"
FROM `__hold_pallets_backup` b JOIN `hold_records` hr ON hr."id" = b."hold_id";
--> statement-breakpoint
DROP TABLE `__hold_pallets_backup`;
--> statement-breakpoint
CREATE UNIQUE INDEX `hold_pallets_hold_pallet_unique` ON `hold_pallets` (`hold_id`,`pallet_id`);
