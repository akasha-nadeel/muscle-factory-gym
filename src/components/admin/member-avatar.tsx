import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initialsOf } from "@/lib/initials";
import { avatarColorClass } from "@/lib/profiles/avatar-color";
import { normalizeAvatarUrl } from "@/lib/profiles/photo";
import { cn } from "@/lib/utils";

/**
 * Avatar with a Clerk image URL fallback to colored initials. The base-ui
 * Avatar swaps to the fallback automatically when the image fails to load,
 * so we pass both branches in.
 *
 * `normalizeAvatarUrl` strips Clerk's procedural defaults + OAuth-proxied
 * generic avatars so the no-photo state is consistent across all members.
 * `avatarColorClass` then gives each member a deterministic colored
 * background, so the initials look intentional instead of empty.
 */
export function MemberAvatar({
  fullName,
  photoUrl,
  size = "md",
  className,
  fallbackClassName,
}: {
  fullName: string;
  photoUrl: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
  /** Override the initials styling (e.g. a larger text size on big avatars).
   * Merged last so it wins over the size preset's default text size. */
  fallbackClassName?: string;
}) {
  const sizeClasses = {
    sm: "size-7 text-[10px]",
    md: "size-9 text-xs",
    lg: "size-12 text-sm",
  }[size];
  const effective = normalizeAvatarUrl(photoUrl);

  return (
    <Avatar className={cn(sizeClasses, className)}>
      {effective ? <AvatarImage src={effective} alt={fullName} /> : null}
      <AvatarFallback
        className={cn(
          // Deterministic colored bg + white text for the initials state.
          // Overrides the default `bg-muted text-muted-foreground` from
          // ui/avatar.tsx so initials are always legible.
          avatarColorClass(fullName),
          "text-white font-medium",
          fallbackClassName,
        )}
      >
        {initialsOf(fullName)}
      </AvatarFallback>
    </Avatar>
  );
}
