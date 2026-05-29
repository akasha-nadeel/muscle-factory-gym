"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MemberAvatar } from "@/components/admin/member-avatar";
import { RecordPaymentForm } from "@/components/admin/record-payment-form";
import { displayName } from "@/lib/profiles/display-name";

export function RecordPaymentButton({
  memberId,
  memberName,
  memberPhotoUrl,
  memberGymId,
  memberPlanName,
  currentMembershipId,
}: {
  memberId: string;
  memberName: string;
  memberPhotoUrl?: string | null;
  memberGymId?: number | null;
  memberPlanName?: string | null;
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
          </DialogHeader>

          {/* Recipient identity strip — matches the Send Workout Plan and
              Approve Member dialogs so all three feel like one product. */}
          <div className="flex items-center gap-3 rounded-md border bg-muted/30 px-3 py-2.5">
            <MemberAvatar
              fullName={memberName}
              photoUrl={memberPhotoUrl ?? null}
              size="md"
            />
            <div className="min-w-0 flex-1">
              <div className="font-medium truncate">{displayName(memberName)}</div>
              <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
                {memberGymId !== null && memberGymId !== undefined && (
                  <span className="font-mono">#{memberGymId}</span>
                )}
                {memberPlanName && <span>{memberPlanName}</span>}
              </div>
            </div>
          </div>

          <RecordPaymentForm
            memberId={memberId}
            currentMembershipId={currentMembershipId}
            successToastName={displayName(memberName)}
            onSuccess={() => setOpen(false)}
            onCancel={() => setOpen(false)}
            onSwitchToRenew={() => {
              // Close this dialog, then ask the Renew button on the same
              // page to open its dialog via a decoupled window event so we
              // don't need to share state between sibling components.
              setOpen(false);
              window.dispatchEvent(new CustomEvent("mfg:open-renew-dialog"));
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
