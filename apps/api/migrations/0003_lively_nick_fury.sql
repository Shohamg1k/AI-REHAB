ALTER TABLE "program_exercises" ADD COLUMN "target_regions" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "program_exercises" ADD COLUMN "intensity" text DEFAULT 'low' NOT NULL;