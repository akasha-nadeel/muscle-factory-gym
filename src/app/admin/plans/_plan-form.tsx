"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { createPlan, updatePlan, type PlanActionResult } from "./actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

type Props =
  | { mode: "create"; onDone: () => void; initial?: undefined; planId?: undefined }
  | {
      mode: "edit";
      planId: string;
      initial: { name: string; durationDays: string; priceLkr: string };
      onDone: () => void;
    };

export function PlanForm(props: Props) {
  const action =
    props.mode === "create"
      ? createPlan
      : updatePlan.bind(null, props.planId);

  const [state, dispatch, pending] = useActionState<
    PlanActionResult | undefined,
    FormData
  >(action, undefined);

  useEffect(() => {
    if (state?.ok) props.onDone();
  }, [state, props]);

  const formErr =
    state && !state.ok && "errors" in state && "_form" in state.errors
      ? (state.errors as { _form: string })._form
      : undefined;

  useEffect(() => {
    if (formErr) toast.error(formErr);
  }, [formErr]);

  const fieldErr = (k: "name" | "durationDays" | "priceLkr") =>
    state && !state.ok && "errors" in state && k in state.errors
      ? (state.errors as Record<string, string>)[k]
      : undefined;

  return (
    <form action={dispatch} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={props.initial?.name ?? ""} required />
        {fieldErr("name") && <p className="text-destructive text-sm">{fieldErr("name")}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="durationDays">Duration (days)</Label>
        <Input
          id="durationDays"
          name="durationDays"
          type="number"
          min="1"
          step="1"
          defaultValue={props.initial?.durationDays ?? ""}
          required
        />
        {fieldErr("durationDays") && (
          <p className="text-destructive text-sm">{fieldErr("durationDays")}</p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="priceLkr">Price (LKR)</Label>
        <Input
          id="priceLkr"
          name="priceLkr"
          type="number"
          min="0"
          step="0.01"
          defaultValue={props.initial?.priceLkr ?? ""}
          required
        />
        {fieldErr("priceLkr") && (
          <p className="text-destructive text-sm">{fieldErr("priceLkr")}</p>
        )}
      </div>
      {formErr && (
        <p className="text-destructive text-sm" role="alert">
          {formErr}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : props.mode === "create" ? "Create" : "Save"}
        </Button>
      </div>
    </form>
  );
}
