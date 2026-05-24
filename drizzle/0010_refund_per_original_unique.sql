CREATE UNIQUE INDEX IF NOT EXISTS payments_refund_per_original_unique
  ON payments (reference)
  WHERE status = 'refunded';
