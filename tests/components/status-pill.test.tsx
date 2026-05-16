import { describe, it, expect } from "vitest";
import { renderEmail as render } from "@/lib/email/render";
import { StatusPill } from "@/components/admin/status-pill";

describe("StatusPill", () => {
  it("paid variant has success color class", async () => {
    const html = await render(<StatusPill variant="paid">Paid</StatusPill>);
    expect(html).toContain("Paid");
    expect(html).toMatch(/status-success/);
  });

  it("unpaid variant has danger color class", async () => {
    const html = await render(<StatusPill variant="unpaid">Unpaid</StatusPill>);
    expect(html).toMatch(/status-danger/);
  });

  it("pending variant has warning color class", async () => {
    const html = await render(<StatusPill variant="pending">Pending</StatusPill>);
    expect(html).toMatch(/status-warning/);
  });

  it("refunded variant has muted color class", async () => {
    const html = await render(<StatusPill variant="refunded">Refunded</StatusPill>);
    expect(html).toMatch(/status-muted/);
  });
});
