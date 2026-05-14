"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function MemberFilters({
  status,
  q,
}: {
  status: "pending" | "active" | "inactive" | undefined;
  q: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [text, setText] = useState(q);
  const [pending, startTransition] = useTransition();

  function update(next: { status?: string | null; q?: string | null }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.status !== undefined) {
      if (next.status === null || next.status === "all") params.delete("status");
      else params.set("status", next.status);
    }
    if (next.q !== undefined) {
      if (!next.q) params.delete("q");
      else params.set("q", next.q);
    }
    params.delete("page"); // reset to page 1
    startTransition(() => {
      const qs = params.toString();
      router.push(qs ? `/admin/members?${qs}` : "/admin/members");
    });
  }

  return (
    <div className="flex gap-3 items-center">
      <Select
        value={status ?? "all"}
        onValueChange={(v) => update({ status: v })}
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder="All" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="pending">Pending</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="inactive">Inactive</SelectItem>
        </SelectContent>
      </Select>
      <form
        className="flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          update({ q: text });
        }}
      >
        <Input
          type="search"
          placeholder="Search name or email…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={pending}
        />
      </form>
    </div>
  );
}
