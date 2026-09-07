CREATE TABLE "schemes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" jsonb NOT NULL,
	"summary" jsonb NOT NULL,
	"ministry" text,
	"state" text,
	"eligibility" jsonb NOT NULL,
	"source_prose" text NOT NULL,
	"source_url" text NOT NULL,
	"benefits" jsonb,
	"documents" jsonb,
	"scraped_at" timestamp with time zone DEFAULT now() NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL,
	CONSTRAINT "schemes_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE INDEX "schemes_eligibility_gin" ON "schemes" USING gin ("eligibility" jsonb_path_ops);--> statement-breakpoint
CREATE INDEX "schemes_state_idx" ON "schemes" USING btree ("state");