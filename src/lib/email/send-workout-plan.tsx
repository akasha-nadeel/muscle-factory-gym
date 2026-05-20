import { renderEmail } from "./render";
import { WorkoutPlanEmail } from "./templates/workout-plan";
import { makeResendMailer } from "./resend-mailer";

export type WorkoutPlanEmailContext = {
  toEmail: string;
  memberName: string;
  fileName: string;
};

/**
 * Best-effort workout-plan notification email. NEVER throws — a Resend or
 * template-rendering failure must not abort the upload that already
 * committed the file + DB row.
 */
export async function sendWorkoutPlanEmail(
  ctx: WorkoutPlanEmailContext,
): Promise<void> {
  try {
    const mailer = makeResendMailer();
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    const html = await renderEmail(
      <WorkoutPlanEmail
        memberName={ctx.memberName}
        fileName={ctx.fileName}
        appUrl={appUrl}
      />,
    );
    const result = await mailer.send({
      to: ctx.toEmail,
      subject: "Your new workout plan is ready",
      html,
    });
    if (!result.ok) {
      console.warn(
        `[workout-plan-email] send failed for ${ctx.toEmail}: ${result.error}`,
      );
    }
  } catch (err) {
    console.warn(
      `[workout-plan-email] threw for ${ctx.toEmail}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}
