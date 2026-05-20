"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { FileUp, FileText } from "lucide-react";
import {
  uploadWorkoutPlanAction,
  type WorkoutPlanResult,
} from "@/app/admin/workout-plans/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const MAX_BYTES = 5 * 1024 * 1024;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function SendWorkoutPlanButton({
  memberId,
  memberName,
  currentPlan,
}: {
  memberId: string;
  memberName: string;
  currentPlan: {
    fileName: string;
    createdAt: Date;
  } | null;
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const action = uploadWorkoutPlanAction.bind(null, memberId);
  const [state, dispatch, pending] = useActionState<
    WorkoutPlanResult | undefined,
    FormData
  >(action, undefined);

  useEffect(() => {
    if (state?.ok) {
      toast.success(`Workout plan sent to ${memberName}`);
      setOpen(false);
      setFile(null);
      setClientError(null);
    } else if (state && !state.ok) {
      toast.error(state.error);
    }
  }, [state, memberName]);

  // Reset when the dialog closes (so reopening doesn't show stale file).
  useEffect(() => {
    if (!open) {
      setFile(null);
      setClientError(null);
    }
  }, [open]);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setClientError(null);
    if (!f) {
      setFile(null);
      return;
    }
    if (f.type !== "application/pdf") {
      setClientError("PDF files only");
      setFile(null);
      e.target.value = "";
      return;
    }
    if (f.size > MAX_BYTES) {
      setClientError(`File is ${formatBytes(f.size)} — max 5 MB`);
      setFile(null);
      e.target.value = "";
      return;
    }
    setFile(f);
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        className="bg-foreground/[0.80] hover:bg-foreground/[0.90] text-background hover:text-background dark:bg-foreground/[0.06] dark:hover:bg-foreground/[0.12] dark:text-foreground dark:hover:text-foreground"
      >
        <FileUp className="size-4" />
        Send workout plan
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send workout plan</DialogTitle>
            <DialogDescription>
              {currentPlan
                ? `This will replace the current plan (${currentPlan.fileName}, uploaded ${format(currentPlan.createdAt, "PP")}).`
                : `Upload a PDF workout plan for ${memberName}. They'll get an email and can download it from their portal.`}
            </DialogDescription>
          </DialogHeader>

          <form action={dispatch} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="file">Workout plan PDF</Label>
              <input
                ref={inputRef}
                id="file"
                name="file"
                type="file"
                accept="application/pdf"
                onChange={onFileChange}
                required
                className="block w-full text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted/80"
              />
              {clientError && (
                <p className="text-destructive text-sm">{clientError}</p>
              )}
              {file && !clientError && (
                <div className="text-xs text-muted-foreground flex items-center gap-1.5 pt-1">
                  <FileText className="size-3.5" />
                  <span className="font-medium text-foreground">
                    {file.name}
                  </span>
                  <span>· {formatBytes(file.size)}</span>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                PDF only · max 5 MB
              </p>
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
                type="submit"
                size="sm"
                disabled={pending || !file || !!clientError}
              >
                {pending ? "Uploading…" : "Upload + notify"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
