CREATE TABLE `sap_codes` (
	`sap_code` text PRIMARY KEY NOT NULL,
	`sap_name` text NOT NULL,
	`plant` text NOT NULL,
	`type` text NOT NULL,
	`module_status_mapping` text NOT NULL,
	`fg_relevant` integer NOT NULL,
	CONSTRAINT "sap_codes_type_check" CHECK("sap_codes"."type" IN ('STATUS','3PL','CROSS_PLANT','OTHER','SALES'))
);
--> statement-breakpoint
CREATE TABLE `statuses` (
	`code` text PRIMARY KEY NOT NULL,
	`description` text NOT NULL,
	`dispatchable` integer NOT NULL,
	`transferable` integer NOT NULL,
	`sap_limbasi` text NOT NULL,
	`sap_sabarkantha` text,
	CONSTRAINT "statuses_code_check" CHECK("statuses"."code" IN ('QC_HOLD','OK','HOLD','BULK','DISPATCHED','IN_TRANSIT','CUSTOMER_SAMPLE','SAMPLE','REJECTED','SCRAP'))
);
