import { renderEmail } from "./render";
import { WelcomeEmail } from "./templates/welcome";
import { makeResendMailer } from "./resend-mailer";
import { format } from "date-fns";

export type WelcomeContext = {
  toEmail: string;
  memberName: string;
  gymId: number | null;
  planName: string;
  /** ISO date strings (YYYY-MM-DD) — converted to human format inside. */
  startDate: string;
  endDate: string;
};

/**
 * Best-effort welcome email. NEVER throws — a Resend / SMTP / template
 * failure must not abort the approval transaction that just succeeded.
 * Failures are logged to stderr and observable in Vercel logs.
 */
export async function sendWelcomeEmail(ctx: WelcomeContext): Promise<void> {
  try {
    const mailer = makeResendMailer();
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    const html = await renderEmail(
      <WelcomeEmail
        memberName={ctx.memberName}
        gymId={ctx.gymId}
        planName={ctx.planName}
        startDate={format(new Date(ctx.startDate), "PP")}
        endDate={format(new Date(ctx.endDate), "PP")}
        appUrl={appUrl}
      />,
    );
    const result = await mailer.send({
      to: ctx.toEmail,
      subject: `Welcome to Muscle Factory Gym, ${ctx.memberName.split(" ")[0]}!`,
      html,
    });
    if (!result.ok) {
      console.warn(
        `[welcome-email] send failed for ${ctx.toEmail}: ${result.error}`,
      );
    }
  } catch (err) {
    console.warn(
      `[welcome-email] threw for ${ctx.toEmail}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}
