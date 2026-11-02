CREATE TABLE `agent_machines` (
	`agent_id` text PRIMARY KEY NOT NULL,
	`cpus` real NOT NULL,
	`memory_gb` real NOT NULL,
	`screen_width` integer NOT NULL,
	`screen_height` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
