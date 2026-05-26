"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Dumbbell,
  FileText,
  Loader2,
  ShieldOff,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MemberAvatar } from "@/components/admin/member-avatar";
import { displayName, firstNameOf } from "@/lib/profiles/display-name";
import { cn } from "@/lib/utils";
import { deleteMemberAction } from "./actions";

export function DeleteMemberButton({
  memberId,
  memberName,
  memberPhotoUrl,
  memberGymId,
}: {
  memberId: string;
  memberName: string;
  memberPhotoUrl?: string | null;
  memberGymId?: number | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [pending, startTransition] = useTransition();

  // The admin types the DISPLAYED name (no @domain.com), not the raw DB
  // value — same comparison the server uses, so client and server agree.
  const shownName = displayName(memberName);
  const nameMatches = typedName.trim() === shownName;
  const hasInput = typedName.trim().length > 0;

  function handleConfirm() {
    if (!nameMatches) return;
    startTransition(async () => {
      const r = await deleteMemberAction(memberId, typedName);
      if (r.ok) {
        toast.success(`${shownName} has been removed`);
        setOpen(false);
        router.push("/admin/members");
      } else {
        toast.error(r.error);
      }
    });
  }

  const firstName = firstNameOf(memberName);

  return (
    <>
      <Button
        size="sm"
        onClick={() => setOpen(true)}
        className="bg-destructive hover:bg-destructive/90 text-white hover:text-white border-transparent"
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <TriangleAlert className="size-5 shrink-0" />
              Remove member?
            </DialogTitle>
          </DialogHeader>

          {/* Identity strip — destructive variant. Red-tinted instead of the
              neutral muted strip used in non-destructive dialogs so the
              admin's eye lands on the person they're about to delete. */}
          <div className="flex items-center gap-3 rounded-md border border-destructive/30 bg-destructive/[0.04] dark:bg-destructive/[0.08] px-3 py-2.5">
            <MemberAvatar
              fullName={memberName}
              photoUrl={memberPhotoUrl ?? null}
              size="md"
            />
            <div className="min-w-0 flex-1">
              <div className="font-medium truncate">{shownName}</div>
              {memberGymId !== null && memberGymId !== undefined && (
                <div className="text-xs text-muted-foreground mt-0.5 font-mono">
                  #{memberGymId}
                </div>
              )}
            </div>
          </div>

          {/* Consequences — each row earns its own icon + line so the admin
              processes them one at a time, rather than scanning a generic
              bullet list. */}
          <div>
            <div className="text-sm font-medium mb-2">
              This is permanent. Removing will:
            </div>
            <ul className="space-y-1.5">
              <ConsequenceRow icon={ShieldOff}>
                Delete their Clerk account — they won&apos;t be able to sign
                in again
              </ConsequenceRow>
              <ConsequenceRow icon={FileText}>
                Delete profile, memberships, payments, and attendance history
              </ConsequenceRow>
              <ConsequenceRow icon={Dumbbell}>
                Delete their workout plan PDF
              </ConsequenceRow>
            </ul>
          </div>

          {/* Type-to-confirm — the friction layer. The match indicator gives
              live feedback so the admin knows they're on track. */}
          <div className="space-y-1.5">
            <Label htmlFor="confirm-name" className="text-sm">
              To confirm, type{" "}
              <span className="font-semibold text-foreground">
                &quot;{shownName}&quot;
              </span>{" "}
              below
            </Label>
            <div className="relative">
              <Input
                id="confirm-name"
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                placeholder={shownName}
                autoComplete="off"
                disabled={pending}
                className={cn(
                  nameMatches
                    ? "border-emerald-500/50 focus-visible:border-emerald-500/70 pr-9"
                    : hasInput
                      ? "border-destructive/40 focus-visible:border-destructive/60"
                      : "",
                )}
              />
              {nameMatches && (
                <Check className="absolute right-2.5 top-1/2 -translate-y-1/2 size-4 text-emerald-600 dark:text-emerald-400" />
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
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
              // Override Button's global `disabled:opacity-50` so the white
              // text stays fully readable. Use a lighter destructive bg as
              // the disabled cue instead of dimming the text.
              className="bg-destructive text-white hover:bg-destructive/90 hover:text-white disabled:bg-destructive/50 disabled:text-white disabled:opacity-100"
            >
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Removing…
                </>
              ) : (
                <>Remove {firstName}</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ConsequenceRow({
  icon: Icon,
  children,
}: {
  icon: typeof ShieldOff;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-2.5 text-sm text-muted-foreground">
      <Icon className="size-4 shrink-0 mt-0.5 text-destructive/70" />
      <span>{children}</span>
    </li>
  );
}
