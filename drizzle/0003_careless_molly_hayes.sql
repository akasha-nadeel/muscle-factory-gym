ALTER TYPE "public"."checkin_source" ADD VALUE 'kiosk_id';--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "gym_id" integer;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_gym_id_unique" UNIQUE("gym_id");