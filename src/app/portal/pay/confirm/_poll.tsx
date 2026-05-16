"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Status = "pending" | "succeeded" | "failed" | "refunded";

export function Poll({
  reference,
  initialStatus,
}: {
  reference: string;
  initialStatus: Status;
}) {
  const [status, setStatus] = useState<Status>(initialStatus);
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (status === "succeeded" || status === "failed" || status === "refunded") {
      return;
    }
    const started = Date.now();
    const id = setInterval(async () => {
      setElapsedMs(Date.now() - started);
      try {
        const res = await fetch(
          `/api/payments/payhere/status/${encodeURIComponent(reference)}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const json = (await res.json()) as { status: Status };
        setStatus(json.status);
        if (
          json.status === "succeeded" ||
          json.status === "failed" ||
          json.status === "refunded"
        ) {
          clearInterval(id);
        }
      } catch {
        // ignore; next tick will retry
      }
    }, 2000);
    return () => clearInterval(id);
  }, [reference, status]);

  if (status === "succeeded") {
    return (
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle className="text-green-600">Payment confirmed</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          Your membership has been extended. You can close this tab.
        </CardContent>
      </Card>
    );
  }
  if (status === "failed") {
    return (
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle className="text-destructive">Payment failed</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          We didn&apos;t receive a successful payment. No charge has been
          recorded. Try again or visit the front desk.
        </CardContent>
      </Card>
    );
  }
  const stuck = elapsedMs > 30_000;
  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Confirming your payment…</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground space-y-2">
        <p>
          Waiting for PayHere to notify us. This usually takes a few seconds.
        </p>
        {stuck && (
          <p>
            Still pending after 30s. Refresh this page in a minute; if the
            status doesn&apos;t change, the front desk can look it up.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
