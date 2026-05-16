import { randomUUID } from "node:crypto";

/**
 * Generates a fresh, opaque `payments.reference` for a PayHere checkout.
 * Format: `gym_<uuid>` — URL-safe, namespaced from any other merchant's
 * order IDs, and opaque to the user.
 */
export function generateOrderReference(): string {
  return `gym_${randomUUID()}`;
}
