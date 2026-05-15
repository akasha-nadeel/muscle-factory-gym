CREATE TYPE "public"."payment_kind" AS ENUM('membership', 'admission');--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "kind" "payment_kind" DEFAULT 'membership' NOT NULL;