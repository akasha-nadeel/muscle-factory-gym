import { requireMemberProfile } from "@/lib/auth";
import { db } from "@/db";
import { payments } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Poll } from "./_poll";

export default async function PayConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const me = await requireMemberProfile();
  const { ref } = await searchParams;

  if (!ref) {
    return (
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>No payment to confirm</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Missing reference. Return to the portal home.
        </CardContent>
      </Card>
    );
  }

  const [row] = await db
    .select({
      memberId: payments.memberId,
      status: payments.status,
    })
    .from(payments)
    .where(
      and(eq(payments.reference, ref), eq(payments.method, "payhere")),
    )
    .limit(1);

  if (!row) {
    return (
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Payment not found</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          We can&apos;t find a payment with that reference. If you completed
          checkout, refresh in a minute.
        </CardContent>
      </Card>
    );
  }
  if (row.memberId !== me.id) {
    return (
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Not your payment</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          This payment belongs to a different member.
        </CardContent>
      </Card>
    );
  }

  return <Poll reference={ref} initialStatus={row.status} />;
}
