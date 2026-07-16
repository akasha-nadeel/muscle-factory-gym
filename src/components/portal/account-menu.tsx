"use client";

import { useClerk } from "@clerk/nextjs";
import { LogOut, UserCog } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { avatarColorClass } from "@/lib/profiles/avatar-color";
import { initialsOf } from "@/lib/initials";

/**
 * Account avatar + menu for the portal header.
 *
 * Replaces Clerk's <UserButton> so the header avatar is rendered by the
 * SAME logic as the portal hero avatar: a real uploaded/OAuth photo when
 * one exists (`imageUrl`), otherwise our deterministic colored-initials
 * fallback. This keeps the two avatars identical instead of diverging —
 * Clerk's <UserButton> falls back to its own generic placeholder when the
 * account has no name/photo (common for email-only signups), which looked
 * nothing like our hero's colored initials.
 *
 * Purely presentational: `name`/`imageUrl` are resolved server-side and
 * passed in. The menu still provides Clerk's full account management
 * (`openUserProfile`) and sign-out, so no functionality is lost.
 */
export function PortalAccountMenu({
  name,
  email,
  imageUrl,
}: {
  name: string;
  email: string;
  imageUrl: string | null;
}) {
  const { signOut, openUserProfile } = useClerk();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <Avatar className="size-6 sm:size-7">
          {imageUrl ? (
            <AvatarImage src={imageUrl} alt={name} className="object-cover" />
          ) : null}
          <AvatarFallback
            className={`text-sm font-semibold text-white ${avatarColorClass(name)}`}
          >
            {initialsOf(name)}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-56">
        <div className="px-2 py-1.5">
          <p className="text-sm font-medium text-foreground truncate">{name}</p>
          <p className="text-xs text-muted-foreground truncate">{email}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => openUserProfile()}>
          <UserCog />
          Manage account
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onClick={() => signOut({ redirectUrl: "/" })}
        >
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
