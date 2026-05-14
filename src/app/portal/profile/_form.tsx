"use client";

import { useActionState, useEffect } from "react";
import { updateMyProfile, type ProfileActionResult } from "./actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function ProfileForm({
  initial,
  email,
}: {
  initial: { fullName: string; phone: string };
  email: string;
}) {
  const [state, dispatch, pending] = useActionState<ProfileActionResult | undefined, FormData>(
    updateMyProfile,
    undefined,
  );

  useEffect(() => {
    if (state?.ok) toast.success("Profile saved");
  }, [state]);

  const err = (k: "fullName" | "phone") =>
    state && !state.ok ? state.errors[k] : undefined;

  return (
    <form action={dispatch} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" value={email} disabled />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="fullName">Full name</Label>
        <Input id="fullName" name="fullName" defaultValue={initial.fullName} required />
        {err("fullName") && <p className="text-destructive text-sm">{err("fullName")}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" name="phone" defaultValue={initial.phone} placeholder="07XXXXXXXX" />
        {err("phone") && <p className="text-destructive text-sm">{err("phone")}</p>}
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
