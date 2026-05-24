CREATE UNIQUE INDEX IF NOT EXISTS payments_admission_per_member_unique
  ON payments (member_id)
  WHERE kind = 'admission' AND status = 'succeeded';
