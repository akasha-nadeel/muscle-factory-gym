import { Webhook } from "svix";
import { headers } from "next/headers";
import { clerkClient } from "@clerk/nextjs/server";
import { upsertProfileFromClerk } from "./upsert";
import { decideRoleAndStatus } from "@/lib/role-decision";

type ClerkUserEvent = {
  type: "user.created" | "user.updated";
  data: {
    id: string;
    email_addresses: { id: string; email_address: string }[];
    primary_email_address_id: string | null;
    first_name: string | null;
    last_name: string | null;
  };
};

export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    return new Response("missing CLERK_WEBHOOK_SECRET", { status: 500 });
  }

  const h = await headers();
  const svixId = h.get("svix-id");
  const svixTimestamp = h.get("svix-timestamp");
  const svixSignature = h.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response("missing svix headers", { status: 400 });
  }

  const body = await req.text();
  let evt: ClerkUserEvent;
  try {
    evt = new Webhook(secret).verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ClerkUserEvent;
  } catch {
    return new Response("invalid signature", { status: 401 });
  }

  if (evt.type !== "user.created" && evt.type !== "user.updated") {
    return new Response("ignored", { status: 200 });
  }

  const primary =
    evt.data.email_addresses.find(
      (e) => e.id === evt.data.primary_email_address_id,
    ) ?? evt.data.email_addresses[0];
  const email = primary?.email_address;
  if (!email) return new Response("no email", { status: 400 });

  const fullName =
    [evt.data.first_name, evt.data.last_name].filter(Boolean).join(" ").trim() ||
    email;

  await upsertProfileFromClerk({
    clerkUserId: evt.data.id,
    email,
    fullName,
    adminEmailsCsv: process.env.ADMIN_EMAILS,
  });

  if (evt.type === "user.created") {
    const { role, status } = decideRoleAndStatus(email, process.env.ADMIN_EMAILS);
    const client = await clerkClient();
    await client.users.updateUserMetadata(evt.data.id, {
      publicMetadata: { role, status },
    });
  }

  return new Response("ok", { status: 200 });
}
