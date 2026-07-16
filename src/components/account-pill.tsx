import { PortalAccountMenu } from "@/components/portal/account-menu";

/**
 * Header identity pill: right-aligned name + subtitle with the account
 * avatar (and its menu) on the right. Shared by the member portal header
 * and the admin top bar so both read identically. The avatar is the only
 * interactive part — it opens Manage account / Sign out.
 */
export function AccountPill({
  name,
  subtitle,
  email,
  imageUrl,
}: {
  name: string;
  /** Muted line under the name — Gym ID in the portal, email handle in admin. */
  subtitle: string;
  email: string;
  imageUrl: string | null;
}) {
  return (
    <div className="flex items-center gap-1.5 sm:gap-2 rounded-full border border-border/60 bg-card py-0.5 pl-2.5 pr-0.5 sm:pl-3 sm:pr-1 shadow-sm">
      <div className="flex min-w-0 flex-col items-end leading-tight text-right">
        <span className="truncate text-[0.72rem] sm:text-[0.8rem] font-medium text-foreground max-w-[92px] sm:max-w-[160px]">
          {name}
        </span>
        <span className="truncate text-[0.62rem] sm:text-[0.7rem] text-muted-foreground max-w-[92px] sm:max-w-[160px]">
          {subtitle}
        </span>
      </div>
      <PortalAccountMenu name={name} email={email} imageUrl={imageUrl} />
    </div>
  );
}
