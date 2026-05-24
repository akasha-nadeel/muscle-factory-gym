CREATE SEQUENCE IF NOT EXISTS gym_id_seq
  AS INTEGER
  MINVALUE 1000
  MAXVALUE 9999
  NO CYCLE
  OWNED BY profiles.gym_id;
--> statement-breakpoint
SELECT setval(
  'gym_id_seq',
  GREATEST(999, COALESCE((SELECT MAX(gym_id) FROM profiles), 999)),
  true
);
