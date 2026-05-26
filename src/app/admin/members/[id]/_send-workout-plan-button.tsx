"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type DragEvent,
} from "react";
import {
  FileText,
  FileUp,
  Info,
  Loader2,
  UploadCloud,
  X,
} from "lucide-react";
import {
  uploadWorkoutPlanAction,
  type WorkoutPlanResult,
} from "@/app/admin/workout-plans/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MemberAvatar } from "@/components/admin/member-avatar";
import { displayName, firstNameOf } from "@/lib/profiles/display-name";
import { formatSLDate } from "@/lib/tz";
import { cn } from "@/lib/utils";
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
  memberPhotoUrl,
  memberGymId,
  memberPlanName,
  currentPlan,
}: {
  memberId: string;
  memberName: string;
  memberPhotoUrl?: string | null;
  memberGymId?: number | null;
  memberPlanName?: string | null;
  currentPlan: {
    fileName: string;
    createdAt: Date;
  } | null;
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const action = uploadWorkoutPlanAction.bind(null, memberId);
  const [state, dispatch, pending] = useActionState<
    WorkoutPlanResult | undefined,
    FormData
  >(action, undefined);

  useEffect(() => {
    if (state?.ok) {
      toast.success(`Workout plan sent to ${displayName(memberName)}`);
      setOpen(false);
      setFile(null);
      setClientError(null);
    } else if (state && !state.ok) {
      toast.error(state.error);
    }
  }, [state, memberName]);

  // Reset when the dialog closes so reopening starts clean.
  useEffect(() => {
    if (!open) {
      setFile(null);
      setClientError(null);
      setDragging(false);
    }
  }, [open]);

  function validateAndSet(f: File | null) {
    setClientError(null);
    if (!f) {
      setFile(null);
      return;
    }
    if (f.type !== "application/pdf") {
      setClientError("PDF files only");
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    if (f.size > MAX_BYTES) {
      setClientError(`File is ${formatBytes(f.size)} — max 5 MB`);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setFile(f);
    // Sync the hidden input so the form action receives the file. Drag-and
    // -drop bypasses the native picker, so we copy the dropped file in via
    // DataTransfer.
    if (inputRef.current) {
      const dt = new DataTransfer();
      dt.items.add(f);
      inputRef.current.files = dt.files;
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0] ?? null;
    validateAndSet(f);
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!dragging) setDragging(true);
  }

  function onDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
  }

  const firstName = firstNameOf(memberName);

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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Send workout plan</DialogTitle>
          </DialogHeader>

          {/* Recipient identity — replaces the awkward email paragraph. */}
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

          <form action={dispatch} className="space-y-4">
            {/* Hidden native input — receives the file either from the
                browse button (click) or from drag-and-drop (synced via
                DataTransfer in validateAndSet). */}
            <input
              ref={inputRef}
              id="file"
              name="file"
              type="file"
              accept="application/pdf"
              onChange={(e) => validateAndSet(e.target.files?.[0] ?? null)}
              required
              className="sr-only"
            />

            {file ? (
              <FilePreview
                file={file}
                pending={pending}
                onRemove={() => {
                  setFile(null);
                  if (inputRef.current) inputRef.current.value = "";
                }}
              />
            ) : (
              <DropZone
                dragging={dragging}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={() => inputRef.current?.click()}
                clientError={clientError}
              />
            )}

            {/* Inline notices — replace the long paragraph at the top. */}
            <div className="space-y-1.5">
              {currentPlan && (
                <Notice tone="info">
                  Will replace current plan ({currentPlan.fileName}, uploaded{" "}
                  {formatSLDate(currentPlan.createdAt)})
                </Notice>
              )}
              <Notice tone="muted">
                Member can download for 5 days, then auto-deletes to keep
                storage tidy.
              </Notice>
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
                {pending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Sending…
                  </>
                ) : (
                  <>Send to {firstName}</>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DropZone({
  dragging,
  onDragOver,
  onDragLeave,
  onDrop,
  onClick,
  clientError,
}: {
  dragging: boolean;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (e: DragEvent<HTMLDivElement>) => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onClick: () => void;
  clientError: string | null;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors cursor-pointer",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        dragging
          ? "border-primary bg-primary/5"
          : clientError
            ? "border-destructive/50 bg-destructive/5"
            : "border-border bg-muted/20 hover:bg-muted/40 hover:border-foreground/30",
      )}
    >
      <UploadCloud
        className={cn(
          "size-7",
          dragging
            ? "text-primary"
            : clientError
              ? "text-destructive"
              : "text-muted-foreground",
        )}
      />
      <div className="space-y-0.5">
        <div className="text-sm font-medium">
          {dragging ? "Drop to upload" : "Drop PDF here or click to browse"}
        </div>
        <div className="text-xs text-muted-foreground">
          PDF · up to 5 MB
        </div>
      </div>
      {clientError && (
        <div className="text-xs font-medium text-destructive mt-1">
          {clientError}
        </div>
      )}
    </div>
  );
}

function FilePreview({
  file,
  pending,
  onRemove,
}: {
  file: File;
  pending: boolean;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
          <FileText className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{file.name}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {formatBytes(file.size)}
            {pending ? " · Sending…" : " · Ready to send"}
          </div>
        </div>
        {!pending && (
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove file"
            className="shrink-0 inline-flex items-center justify-center size-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      {pending && (
        <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full w-1/3 bg-primary rounded-full animate-[indeterminate_1.4s_ease-in-out_infinite]" />
        </div>
      )}
    </div>
  );
}

function Notice({
  tone,
  children,
}: {
  tone: "info" | "muted";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 text-xs",
        tone === "info" ? "text-foreground/80" : "text-muted-foreground",
      )}
    >
      <Info className="size-3.5 shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}
