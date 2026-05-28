import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initialsOf } from "@/lib/initials";
import { normalizeAvatarUrl } from "@/lib/profiles/photo";
import { cn } from "@/lib/utils";

/**
 * Avatar with a Clerk image URL fallback to initials. The base-ui Avatar
 * already swaps to the fallback automatically when the image fails to load,
 * so we just pass both branches in.
 *
 * `normalizeAvatarUrl` strips Clerk's procedurally-generated default
 * avatars so members without a real photo all render the same initials
 * styling — keeps member-list / picker visuals coherent.
 */
export function MemberAvatar({
  fullName,
  photoUrl,
  size = "md",
  className,
}: {
  fullName: string;
  photoUrl: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
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
      <AvatarFallback>{initialsOf(fullName)}</AvatarFallback>
    </Avatar>
  );
}
