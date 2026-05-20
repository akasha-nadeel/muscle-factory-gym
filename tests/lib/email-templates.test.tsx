import { describe, it, expect } from "vitest";
import { renderEmail } from "@/lib/email/render";
import { Reminder3dEmail } from "@/lib/email/templates/reminder-3d";
import { Reminder1dEmail } from "@/lib/email/templates/reminder-1d";
import { ReminderOverdueEmail } from "@/lib/email/templates/reminder-overdue";
import { WelcomeEmail } from "@/lib/email/templates/welcome";
import { WorkoutPlanEmail } from "@/lib/email/templates/workout-plan";

describe("email templates render", () => {
  it("Reminder3dEmail produces HTML with member name, plan, and CTA", async () => {
    const html = await renderEmail(
      <Reminder3dEmail
        memberName="John Silva"
        planName="Monthly"
        endDate="2026-06-01"
        appUrl="https://gym.example"
      />,
    );
    expect(html).toContain("John Silva");
    expect(html).toContain("Monthly");
    expect(html).toContain("2026-06-01");
    expect(html).toContain("https://gym.example/portal");
  });

  it("Reminder1dEmail produces HTML with member name, plan, and CTA", async () => {
    const html = await renderEmail(
      <Reminder1dEmail
        memberName="Jane Perera"
        planName="Annual"
        endDate="2026-12-31"
        appUrl="https://gym.example"
      />,
    );
    expect(html).toContain("Jane Perera");
    expect(html).toContain("Annual");
    expect(html).toContain("2026-12-31");
    expect(html).toContain("https://gym.example/portal");
  });

  it("ReminderOverdueEmail produces HTML with member name and renew CTA", async () => {
    const html = await renderEmail(
      <ReminderOverdueEmail
        memberName="Akila Bandara"
        planName="Monthly"
        endDate="2026-04-15"
        appUrl="https://gym.example"
      />,
    );
    expect(html).toContain("Akila Bandara");
    expect(html).toContain("Monthly");
    expect(html).toContain("expired");
    expect(html).toContain("https://gym.example/portal");
  });

  it("WelcomeEmail produces HTML with name, gym ID, plan, and dates", async () => {
    const html = await renderEmail(
      <WelcomeEmail
        memberName="Saman Perera"
        gymId={1234}
        planName="Monthly"
        startDate="May 20, 2026"
        endDate="Jun 19, 2026"
        appUrl="https://gym.example"
      />,
    );
    // React Email inserts <!-- --> comments between text nodes, so e.g.
    // "#1234" renders as "#<!-- -->1234". Strip comments before asserting.
    const text = html.replace(/<!--[^>]*-->/g, "");
    expect(text).toContain("Saman Perera");
    expect(text).toContain("#1234");
    expect(text).toContain("Monthly");
    expect(text).toContain("May 20, 2026");
    expect(text).toContain("Jun 19, 2026");
    expect(text).toContain("https://gym.example/portal");
  });

  it("WelcomeEmail omits Gym ID block when gymId is null", async () => {
    const html = await renderEmail(
      <WelcomeEmail
        memberName="No ID Yet"
        gymId={null}
        planName="Monthly"
        startDate="May 20, 2026"
        endDate="Jun 19, 2026"
        appUrl="https://gym.example"
      />,
    );
    expect(html).toContain("No ID Yet");
    expect(html).not.toContain("Your Gym ID");
  });

  it("WorkoutPlanEmail produces HTML with name, filename, and portal CTA", async () => {
    const html = await renderEmail(
      <WorkoutPlanEmail
        memberName="Saman Perera"
        fileName="upper-body-routine.pdf"
        appUrl="https://gym.example"
      />,
    );
    const text = html.replace(/<!--[^>]*-->/g, "");
    expect(text).toContain("Saman Perera");
    expect(text).toContain("upper-body-routine.pdf");
    expect(text).toContain("https://gym.example/portal");
    expect(text).toContain("Open my portal");
  });
});
