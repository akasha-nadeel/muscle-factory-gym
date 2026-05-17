import { describe, it, expect } from "vitest";
import { renderEmail } from "@/lib/email/render";
import { Reminder3dEmail } from "@/lib/email/templates/reminder-3d";
import { Reminder1dEmail } from "@/lib/email/templates/reminder-1d";
import { ReminderOverdueEmail } from "@/lib/email/templates/reminder-overdue";

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
});
