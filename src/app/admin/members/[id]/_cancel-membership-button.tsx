"use client";

import { useState, useTransition } from "react";
import { Ban, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cancelMembership } from "./actions";

/**
 * Manual undo for an accidentally-approved (or just no-longer-wanted)
 * active membership. Lives on each active row in the membership history
 * table. Sets status='cancelled' on the row — does not delete it. The
 * history line stays for the gym's audit trail.
 */
export function CancelMembershipButton({
  memberId,
  membershipId,
}: {
  memberId: string;
  membershipId: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const r = await cancelMembership(memberId, membershipId);
      if (r.ok) {
        toast.success("Membership cancelled");
        setOpen(false);
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
      >
        <Ban className="size-3.5" />
        Cancel
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!pending) setOpen(o);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this membership?</DialogTitle>
            <DialogDescription>
              The member won&apos;t be able to check in until they renew, but
              the row stays in their history for your records. If a payment
              was recorded for this membership, refund it separately from the
              payment row.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Keep it
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirm}
              disabled={pending}
              className="bg-destructive text-white hover:bg-destructive/90 hover:text-white disabled:bg-destructive/50 disabled:text-white disabled:opacity-100"
            >
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Cancelling…
                </>
              ) : (
                "Cancel membership"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
