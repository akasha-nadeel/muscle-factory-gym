"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { avatarColorClass } from "@/lib/profiles/avatar-color";
import { initialsOf } from "@/lib/initials";
import { displayName } from "@/lib/profiles/display-name";
import { normalizeAvatarUrl } from "@/lib/profiles/photo";
import { cn } from "@/lib/utils";
import { updateMyPhone } from "./profile/actions";

// Clerk's documented limit for profile images.
const MAX_BYTES = 10 * 1024 * 1024;

/** Outlined field with a small floating label — matches the reference
 * "Edit Profile" form. Read-only fields render muted with no focus ring. */
function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  inputMode,
  autoComplete,
  disabled,
  readOnly,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
  disabled?: boolean;
  readOnly?: boolean;
  error?: string;
}) {
  return (
    <div>
      <div
        className={cn(
          "rounded-xl border bg-transparent px-3 py-2 transition-colors",
          readOnly
            ? "border-input/50"
            : "border-input focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20",
          error &&
            "border-destructive focus-within:border-destructive focus-within:ring-destructive/20",
        )}
      >
        <label
          htmlFor={id}
          className="block text-[0.7rem] font-medium tracking-wide text-muted-foreground"
        >
          {label}
        </label>
        <input
          id={id}
          value={value}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          placeholder={placeholder}
          inputMode={inputMode}
          autoComplete={autoComplete}
          disabled={disabled}
          readOnly={readOnly}
          className={cn(
            "w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/60 disabled:opacity-60",
            readOnly ? "text-muted-foreground" : "text-foreground",
          )}
        />
      </div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

/**
 * Camera badge on the portal hero avatar → opens a compact editor for the
 * things a member usually changes (photo, name, phone), styled after the
 * reference "Edit Profile" screen, instead of routing them through Clerk's
 * full Account modal.
 *
 * Writes: name + photo go to the member's OWN Clerk account via the client
 * SDK (same ops as Clerk's modal); phone goes to the DB `phone` column via
 * a server action. On success we router.refresh() so the server-rendered
 * hero + header update immediately.
 */
export function EditProfileButton({ initialPhone }: { initialPhone: string }) {
  const router = useRouter();
  const { user, isLoaded } = useUser();

  const [open, setOpen] = React.useState(false);
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [phoneError, setPhoneError] = React.useState<string | null>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  if (!isLoaded || !user) return null;

  function resetPreview() {
    setPreviewUrl((url) => {
      if (url) URL.revokeObjectURL(url);
      return null;
    });
  }

  function onOpenChange(next: boolean) {
    if (next && user) {
      setFirstName(user.firstName ?? "");
      setLastName(user.lastName ?? "");
      setPhone(initialPhone ?? "");
      setPhoneError(null);
      setFile(null);
      setRemovePhoto(false);
      resetPreview();
    }
    setOpen(next);
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    if (f.size > MAX_BYTES) {
      toast.error("Image must be under 10MB.");
      return;
    }
    resetPreview();
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setRemovePhoto(false);
  }

  async function onSave() {
    if (!user) return;
    setSaving(true);
    setPhoneError(null);
    try {
      // Phone first: validated server-side. If it's rejected we bail before
      // any Clerk write, so we never half-save.
      if (phone.trim() !== (initialPhone ?? "").trim()) {
        const res = await updateMyPhone(phone);
        if (!res.ok) {
          setPhoneError(res.error);
          setSaving(false);
          return;
        }
      }
      if (removePhoto) {
        await user.setProfileImage({ file: null });
      } else if (file) {
        await user.setProfileImage({ file });
      }
      const fn = firstName.trim();
      const ln = lastName.trim();
      if (fn !== (user.firstName ?? "") || ln !== (user.lastName ?? "")) {
        await user.update({ firstName: fn, lastName: ln });
      }
      toast.success("Profile updated");
      setOpen(false);
      router.refresh();
    } catch (err) {
      console.error("[portal] profile update failed", err);
      toast.error("Couldn't update your profile. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const realPhoto = normalizeAvatarUrl(user.imageUrl);
  const previewImage = removePhoto ? null : (previewUrl ?? realPhoto);
  const nameForInitials = displayName(
    [firstName, lastName].filter(Boolean).join(" ").trim() ||
      user.primaryEmailAddress?.emailAddress ||
      "",
  );
  const showRemove = !removePhoto && (Boolean(realPhoto) || Boolean(file));

  return (
    <>
      {/* Green "Edit profile" CTA (reference #17). Opens the full editor. */}
      <Button
        type="button"
        onClick={() => onOpenChange(true)}
        className="mt-3 bg-emerald-500 text-white hover:bg-emerald-600 focus-visible:ring-emerald-500/40"
      >
        Edit profile
      </Button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center">Edit profile</DialogTitle>
          </DialogHeader>

          {/* Centered avatar with a camera badge — click either to upload. */}
          <div className="flex flex-col items-center gap-2">
            <div className="relative">
              <Avatar className="size-24 ring-4 ring-emerald-500/15 ring-offset-2 ring-offset-background">
                {previewImage ? (
                  <AvatarImage
                    src={previewImage}
                    alt=""
                    className="object-cover"
                  />
                ) : null}
                <AvatarFallback
                  className={`text-2xl font-semibold text-white ${avatarColorClass(nameForInitials)}`}
                >
                  {initialsOf(nameForInitials || "?")}
                </AvatarFallback>
              </Avatar>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Change photo"
                className="absolute bottom-0 right-0 grid size-8 place-items-center rounded-full bg-neutral-800 text-white shadow-md ring-2 ring-background transition-transform hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <Camera className="size-4" />
              </button>
            </div>
            {showRemove && (
              <button
                type="button"
                onClick={() => {
                  setRemovePhoto(true);
                  setFile(null);
                  resetPreview();
                }}
                className="text-xs font-medium text-destructive hover:underline"
              >
                Remove photo
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={onPickFile}
            />
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold">Your information</p>
            <Field
              id="edit-first-name"
              label="First name"
              value={firstName}
              onChange={setFirstName}
              autoComplete="given-name"
              disabled={saving}
            />
            <Field
              id="edit-last-name"
              label="Last name"
              value={lastName}
              onChange={setLastName}
              autoComplete="family-name"
              disabled={saving}
            />
            <Field
              id="edit-phone"
              label="Phone"
              value={phone}
              onChange={(v) => {
                setPhone(v);
                if (phoneError) setPhoneError(null);
              }}
              placeholder="07XXXXXXXX"
              inputMode="tel"
              autoComplete="tel"
              disabled={saving}
              error={phoneError ?? undefined}
            />
            <Field
              id="edit-email"
              label="Email (managed by your sign-in)"
              value={user.primaryEmailAddress?.emailAddress ?? ""}
              readOnly
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="bg-emerald-500 text-white hover:bg-emerald-600 focus-visible:ring-emerald-500/40"
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
