"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { avatarColorClass } from "@/lib/profiles/avatar-color";
import { initialsOf } from "@/lib/initials";

// Clerk's documented limit for profile images.
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Hero avatar with a camera badge that uploads a new photo directly.
 *
 * Two things this owns that a plain server-rendered avatar can't:
 *  1. A spinner overlay ON the image while the upload is in flight.
 *  2. An optimistic local preview — the picked image is shown instantly and
 *     kept through router.refresh(), so the avatar never flashes back to the
 *     colored-initials fallback while the new photo round-trips to Clerk.
 *
 * `imageUrl` is the server-resolved, already-normalized photo (or null).
 */
export function HeroAvatar({
  name,
  imageUrl,
}: {
  name: string;
  imageUrl: string | null;
}) {
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const [uploading, setUploading] = React.useState(false);
  const [localPreview, setLocalPreview] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    return () => {
      if (localPreview) URL.revokeObjectURL(localPreview);
    };
  }, [localPreview]);

  function setPreview(url: string | null) {
    setLocalPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return url;
    });
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!f || !user) return;
    if (!f.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    if (f.size > MAX_BYTES) {
      toast.error("Image must be under 10MB.");
      return;
    }
    // Show the picked image immediately — no flash to initials.
    setPreview(URL.createObjectURL(f));
    setUploading(true);
    try {
      await user.setProfileImage({ file: f });
      // Keep the preview; refresh persists the change server-side.
      router.refresh();
    } catch (err) {
      console.error("[portal] photo upload failed", err);
      toast.error("Couldn't update your photo. Please try again.");
      setPreview(null); // revert to the previous image
    } finally {
      setUploading(false);
    }
  }

  const shown = localPreview ?? imageUrl;

  return (
    <div className="relative shrink-0">
      <Avatar className="size-28 sm:size-32 rounded-full ring-4 ring-emerald-500/15 ring-offset-2 ring-offset-background">
        {shown ? (
          <AvatarImage
            src={shown}
            alt={name}
            className="rounded-full object-cover"
          />
        ) : null}
        <AvatarFallback
          className={`rounded-full text-2xl sm:text-3xl font-semibold text-white ${avatarColorClass(name)}`}
        >
          {initialsOf(name)}
        </AvatarFallback>
      </Avatar>

      {/* Spinner overlay ON the avatar image while uploading. */}
      {uploading && (
        <div className="absolute inset-0 z-10 grid place-items-center rounded-full bg-black/55 backdrop-blur-[1px]">
          <Loader2 className="size-8 animate-spin text-white" />
        </div>
      )}

      {/* Camera badge — direct upload. Hidden while the overlay is showing. */}
      {isLoaded && user && !uploading && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          aria-label="Change photo"
          className="absolute bottom-0.5 right-0.5 z-20 grid size-8 place-items-center rounded-full bg-neutral-800 text-white shadow-md ring-2 ring-background transition-transform hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          <Camera className="size-4" />
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={onPick}
      />
    </div>
  );
}
