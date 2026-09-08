CREATE TABLE "usage_counters" (
	"day" date NOT NULL,
	"kind" text NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "usage_counters_day_kind_pk" PRIMARY KEY("day","kind")
);
