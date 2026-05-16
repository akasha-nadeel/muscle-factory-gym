import { describe, it, expect } from "vitest";
import { renderEmail as render } from "@/lib/email/render";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";

describe("Breadcrumbs", () => {
  it("renders all items in order with separators", async () => {
    const html = await render(
      <Breadcrumbs
        items={[
          { label: "Members", href: "/admin/members" },
          { label: "Akasha Nadeel" },
        ]}
      />,
    );
    expect(html).toContain("Members");
    expect(html).toContain("Akasha Nadeel");
    expect(html.indexOf("Members")).toBeLessThan(
      html.indexOf("Akasha Nadeel"),
    );
  });

  it("renders leaf item as plain text (no href anchor)", async () => {
    const html = await render(
      <Breadcrumbs items={[{ label: "Dashboard" }]} />,
    );
    expect(html).not.toMatch(/<a[^>]+href[^>]*>Dashboard<\/a>/);
    expect(html).toContain("Dashboard");
  });
});
