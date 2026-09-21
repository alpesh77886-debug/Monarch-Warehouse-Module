CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient_user_id` text NOT NULL,
	`event_type` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`reference_type` text,
	`reference_id` text,
	`created_by_user_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`read_at` text,
	FOREIGN KEY (`recipient_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "notifications_event_type_check" CHECK("notifications"."event_type" IN ('HOLD_PLACED','HOLD_RELEASED','HOLD_REJECTED','HOLD_PARTIALLY_RELEASED','HOLD_FOLLOWUP'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_recipient_created_idx` ON `notifications` (`recipient_user_id`,`id`);