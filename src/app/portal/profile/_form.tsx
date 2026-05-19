"use client";

import { useActionState, useEffect, useState } from "react";
import { updateMyProfile, type ProfileActionResult } from "./actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StatusPill, type StatusVariant } from "@/components/admin/status-pill";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type ProfileContext = {
  email: string;
  gymId: number | null;
  status: "active" | "pending" | "inactive";
  photoUrl: string | null;
  createdAt: Date;
};

type MembershipContext = {
  planName: string;
  startDate: string;
  endDate: string;
  status: StatusVariant;
  daysLeft: number;
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function FieldLabel({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
  );
}

function ReadOnlyField({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <FieldLabel>{label}</FieldLabel>
      <div className="text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

function SectionHeading({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="space-y-1">
      <h3 className="text-base font-semibold tracking-tight">{title}</h3>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

export function ProfileForm({
  initial,
  profile,
  membership,
}: {
  initial: { fullName: string; phone: string };
  profile: ProfileContext;
  membership: MembershipContext | null;
}) {
  const [state, dispatch, pending] = useActionState<
    ProfileActionResult | undefined,
    FormData
  >(updateMyProfile, undefined);

  const [fullName, setFullName] = useState(initial.fullName);
  const [phone, setPhone] = useState(initial.phone);

  useEffect(() => {
    if (state?.ok) toast.success("Profile saved");
  }, [state]);

  const err = (k: "fullName" | "phone") =>
    state && !state.ok ? state.errors[k] : undefined;

  const dirty =
    fullName.trim() !== initial.fullName.trim() ||
    phone.trim() !== (initial.phone ?? "").trim();

  return (
    <form action={dispatch} className="space-y-8 max-w-4xl mx-auto">
      {/* Hero — avatar + identity */}
      <section
        className={cn(
          "flex flex-col items-center gap-4 text-center pb-6 border-b",
          "sm:flex-row sm:items-center sm:gap-5 sm:text-left sm:pb-6",
        )}
      >
        <Avatar className="size-20 sm:size-16 shrink-0">
          {profile.photoUrl ? (
            <AvatarImage src={profile.photoUrl} alt={initial.fullName} />
          ) : null}
          <AvatarFallback className="text-lg sm:text-base font-semibold">
            {initialsOf(initial.fullName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 space-y-1.5 sm:flex-1">
          <h2 className="text-xl sm:text-2xl font-semibold leading-tight break-words">
            {initial.fullName}
          </h2>
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <StatusPill variant={profile.status}>{profile.status}</StatusPill>
            {profile.gymId !== null && (
              <span className="font-mono">
                <span className="text-muted-foreground">ID:</span>{" "}
                <span className="text-foreground font-medium">
                  #{profile.gymId}
                </span>
              </span>
            )}
            <span className="hidden sm:inline">·</span>
            <span>Member since {format(profile.createdAt, "MMM yyyy")}</span>
          </div>
        </div>
      </section>

      {/* Account Information */}
      <section className="space-y-5">
        <SectionHeading
          title="Account Information"
          description="Update your name and phone number. Email is managed by your sign-in account."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="fullName">
              <FieldLabel>Full name</FieldLabel>
            </Label>
            <Input
              id="fullName"
              name="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              autoComplete="name"
            />
            {err("fullName") && (
              <p className="text-destructive text-sm">{err("fullName")}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">
              <FieldLabel>Phone</FieldLabel>
            </Label>
            <Input
              id="phone"
              name="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="07XXXXXXXX"
              inputMode="tel"
              autoComplete="tel"
            />
            {err("phone") && (
              <p className="text-destructive text-sm">{err("phone")}</p>
            )}
          </div>
          <ReadOnlyField
            label="Email"
            value={
              <span className="break-all text-muted-foreground">
                {profile.email}
              </span>
            }
          />
          {profile.gymId !== null && (
            <ReadOnlyField
              label="Gym ID"
              value={<span className="font-mono">#{profile.gymId}</span>}
            />
          )}
        </div>
      </section>

      {/* Membership Information (only when there's an active/expired record) */}
      {membership && (
        <section className="space-y-5 pt-6 border-t">
          <SectionHeading title="Membership" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-5">
            <ReadOnlyField label="Plan" value={membership.planName} />
            <ReadOnlyField
              label="Status"
              value={
                <StatusPill variant={membership.status}>
                  {membership.status}
                </StatusPill>
              }
            />
            <ReadOnlyField
              label="Start date"
              value={format(new Date(membership.startDate), "PP")}
            />
            <ReadOnlyField
              label="End date"
              value={
                <div className="flex flex-col">
                  <span>{format(new Date(membership.endDate), "PP")}</span>
                  <span className="text-xs text-muted-foreground font-normal">
                    {membership.daysLeft} day
                    {membership.daysLeft === 1 ? "" : "s"} remaining
                  </span>
                </div>
              }
            />
          </div>
        </section>
      )}

      {/* Action bar — sticky on mobile, right-aligned on desktop */}
      <div
        className={cn(
          "pt-2 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3",
        )}
      >
        {dirty && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setFullName(initial.fullName);
              setPhone(initial.phone);
            }}
            disabled={pending}
          >
            Discard changes
          </Button>
        )}
        <Button type="submit" disabled={pending || !dirty}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
