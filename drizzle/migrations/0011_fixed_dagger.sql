CREATE TABLE `maintenance_tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_number` text NOT NULL,
	`category` text NOT NULL,
	`location` text NOT NULL,
	`description` text NOT NULL,
	`severity` text NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`raised_by_id` text NOT NULL,
	`acknowledged_by_id` text,
	`resolved_by_id` text,
	`resolution_notes` text,
	`parts_used` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`acknowledged_at` text,
	`resolved_at` text,
	`closed_at` text,
	FOREIGN KEY (`raised_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`acknowledged_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resolved_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "maintenance_tickets_category_check" CHECK("maintenance_tickets"."category" IN ('DOOR','FORKLIFT','RACKING','ELECTRICAL','REFRIGERATION','PPE','OTHER')),
	CONSTRAINT "maintenance_tickets_severity_check" CHECK("maintenance_tickets"."severity" IN ('LOW','MEDIUM','HIGH','CRITICAL')),
	CONSTRAINT "maintenance_tickets_status_check" CHECK("maintenance_tickets"."status" IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS','RESOLVED','CLOSED','REOPENED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `maintenance_tickets_ticket_number_unique` ON `maintenance_tickets` (`ticket_number`);