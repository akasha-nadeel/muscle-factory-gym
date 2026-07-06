CREATE SEQUENCE IF NOT EXISTS gym_id_seq
  AS INTEGER
  MINVALUE 1000
  MAXVALUE 9999
  NO CYCLE
  OWNED BY profiles.gym_id;
--> statement-breakpoint
-- Seed the sequence so the next gym_id is MAX(existing)+1, or 1000 on an empty
-- DB. NOTE: `setval` rejects a value below MINVALUE (1000), so the empty case
-- must set 1000 with is_called=false (next value = 1000 itself) rather than 999
-- with is_called=true. The populated case sets MAX(gym_id) with is_called=true
-- (next value = MAX+1). The original `GREATEST(999, …), true` form only worked
-- on DBs that already had gym_ids and errored on a fresh database.
SELECT setval(
  'gym_id_seq',
  GREATEST(1000, COALESCE((SELECT MAX(gym_id) FROM profiles), 1000)),
  (SELECT EXISTS (SELECT 1 FROM profiles WHERE gym_id IS NOT NULL))
);
