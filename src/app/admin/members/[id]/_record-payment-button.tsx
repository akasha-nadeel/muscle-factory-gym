"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RecordPaymentForm } from "@/components/admin/record-payment-form";

export function RecordPaymentButton({
  memberId,
  currentMembershipId,
}: {
  memberId: string;
  currentMembershipId: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        className="bg-foreground/[0.80] hover:bg-foreground/[0.90] text-background hover:text-background dark:bg-foreground/[0.06] dark:hover:bg-foreground/[0.12] dark:text-foreground dark:hover:text-foreground"
      >
        Record payment
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
          </DialogHeader>
          <RecordPaymentForm
            memberId={memberId}
            currentMembershipId={currentMembershipId}
            onSuccess={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
