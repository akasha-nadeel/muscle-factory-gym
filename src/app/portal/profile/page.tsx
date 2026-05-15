import { requireMemberProfile } from "@/lib/auth";
import { ProfileForm } from "./_form";

export default async function ProfilePage() {
  const me = await requireMemberProfile();
  return (
    <div className="max-w-md space-y-6">
      <h2 className="text-2xl font-semibold">Your profile</h2>
      <p className="text-sm text-muted-foreground">
        Email is managed by your sign-in account. To change it, sign in to your account
        and update it there.
      </p>
      <ProfileForm
        key={`${me.fullName}::${me.phone ?? ""}`}
        initial={{ fullName: me.fullName, phone: me.phone ?? "" }}
        email={me.email}
      />
    </div>
  );
}
