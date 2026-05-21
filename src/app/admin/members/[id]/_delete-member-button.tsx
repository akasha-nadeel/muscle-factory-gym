"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteMemberAction } from "./actions";

export function DeleteMemberButton({
  memberId,
  memberName,
}: {
  memberId: string;
  memberName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [pending, startTransition] = useTransition();

  const nameMatches = typedName.trim() === memberName;

  function handleConfirm() {
    if (!nameMatches) return;
    startTransition(async () => {
      const r = await deleteMemberAction(memberId, typedName);
      if (r.ok) {
        toast.success(`${memberName} has been removed`);
        setOpen(false);
        router.push("/admin/members");
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
        <Trash2 className="size-4" />
        Remove member
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!pending) setOpen(o);
          if (!o) setTypedName("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <TriangleAlert className="size-5" />
              Remove {memberName}?
            </DialogTitle>
            <DialogDescription>
              This is permanent. It will delete:
            </DialogDescription>
          </DialogHeader>

          <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
            <li>Their Clerk account (they won&apos;t be able to sign in)</li>
            <li>Their profile, memberships, payments, and attendance history</li>
            <li>Their workout plan file</li>
          </ul>
          <p className="text-sm text-muted-foreground">
            Type{" "}
            <span className="font-semibold text-foreground">{memberName}</span>{" "}
            below to confirm.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="confirm-name">Member&apos;s full name</Label>
            <Input
              id="confirm-name"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              placeholder={memberName}
              autoComplete="off"
              disabled={pending}
            />
          </div>

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
              disabled={!nameMatches || pending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {pending ? "Removing…" : "Remove permanently"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
