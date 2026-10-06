import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ProfileForm, PasswordForm } from "./settings-forms";
import { AddMemberForm, MemberRow } from "./household";
import { AvatarForm } from "./avatar-form";
import { PushToggle } from "./push-toggle";
import { avatarUrl } from "@/components/avatar";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const members = await prisma.user.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, email: true, avatarMime: true, updatedAt: true } });
  const ownerId = members[0]?.id;
  const isOwner = ownerId === user.id;
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Manage how you sign in.</p>
      </div>
      <section className="card p-6" aria-labelledby="profile-h">
        <h2 id="profile-h" className="mb-4 text-base font-semibold">Profile</h2>
        <div className="mb-5"><AvatarForm name={user.name || user.email} src={avatarUrl(user)} /></div>
        <ProfileForm name={user.name ?? ""} email={user.email} />
      </section>
      <section className="card p-6" aria-labelledby="push-h">
        <h2 id="push-h" className="mb-1 text-base font-semibold">Reminders</h2>
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          A push notification each morning when a card needs paying down before its statement closes, a card payment, bill or loan payment is coming up, a repeating item is waiting for you, or cash is forecast to run short. Each reminder is sent once. Turn it on for each phone or computer you use.
        </p>
        <PushToggle publicKey={process.env.VAPID_PUBLIC_KEY ?? null} />
      </section>
      <section className="card p-6" aria-labelledby="pw-h">
        <h2 id="pw-h" className="mb-1 text-base font-semibold">Password</h2>
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          Changing it signs out your other devices. Forgot it? Use the setup code on the sign-in page to reset.
        </p>
        <PasswordForm />
      </section>
      <section className="card p-6" aria-labelledby="hh-h">
        <h2 id="hh-h" className="mb-1 text-base font-semibold">Household access</h2>
        <p className="mb-2 text-sm text-slate-500 dark:text-slate-400">
          Everyone below signs in with their own email and password and sees the same Personal and Business budgets, accounts and receipts.
        </p>
        <ul className="divide-y divide-[#E2E8F0] dark:divide-slate-800">
          {members.map((m) => (
            <MemberRow key={m.id} avatar={avatarUrl(m)} id={m.id} name={m.name ?? ""} email={m.email} isOwner={m.id === ownerId} isYou={m.id === user.id} canManage={isOwner} />
          ))}
        </ul>
        {isOwner ? (
          <div className="mt-5 border-t border-[#E2E8F0] pt-5 dark:border-slate-800">
            <h3 className="mb-3 text-sm font-semibold">Add someone</h3>
            <AddMemberForm />
          </div>
        ) : (
          <p className="mt-4 text-xs text-slate-500">Only the account owner can add or remove logins.</p>
        )}
      </section>
    </div>
  );
}
