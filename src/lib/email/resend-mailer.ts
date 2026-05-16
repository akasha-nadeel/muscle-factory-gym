import { Resend } from "resend";
import type { Mailer } from "./mailer";

/**
 * Builds a Mailer backed by the Resend SDK. Reads RESEND_API_KEY and
 * EMAIL_FROM from the environment at call time.
 *
 * Throws if either env var is missing — callers should construct this
 * lazily (e.g. inside a request handler) so test-time imports don't
 * crash on cold module load.
 */
export function makeResendMailer(): Mailer {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    throw new Error("RESEND_API_KEY and EMAIL_FROM are required");
  }
  const client = new Resend(apiKey);
  return {
    async send(opts) {
      try {
        const r = await client.emails.send({
          from,
          to: opts.to,
          subject: opts.subject,
          html: opts.html,
        });
        if (r.error) {
          return { ok: false, error: r.error.message };
        }
        return { ok: true, id: r.data?.id };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}
