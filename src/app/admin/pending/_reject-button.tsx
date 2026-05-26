"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { displayName } from "@/lib/profiles/display-name";
import { rejectPendingMemberAction } from "./actions";

export function RejectButton({
  memberId,
  memberName,
}: {
  memberId: string;
  memberName: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const pathname = usePathname();
  const router = useRouter();

  function handleConfirm() {
    startTransition(async () => {
      const r = await rejectPendingMemberAction(memberId);
      if (r.ok) {
        toast.success(`${displayName(memberName)}'s sign-up was rejected`);
        setOpen(false);
        // If the admin rejected from the member detail page, the current
        // URL now points at a deleted profile. Send them to the members
        // list so they don't land on a 404. From the pending list, the
        // server-side revalidate already removed the row — stay put.
        if (pathname.startsWith("/admin/members/")) {
          router.push("/admin/members");
        }
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
        className="text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
      >
        <X className="size-4" />
        Reject
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!pending) setOpen(o);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject {displayName(memberName)}&apos;s sign-up?</DialogTitle>
            <DialogDescription>
              This deletes their account and removes them from your sign-up
              list. They can sign up again later if it was a mistake.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirm}
              disabled={pending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {pending ? "Rejecting…" : "Reject sign-up"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
