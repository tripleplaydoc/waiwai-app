import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ProfileForm, PasswordForm } from "./settings-forms";
import { AddMemberForm, MemberRow } from "./household";
import { AvatarForm } from "./avatar-form";
import { QuietMode } from "./quiet-mode";
import { PushToggle } from "./push-toggle";
import { avatarUrl } from "@/components/avatar";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const members = await prisma.user.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, email: true, avatarMime: true, updatedAt: true, budgetMode: true } });
  const ownerId = members[0]?.id;
  const isPrivate = user.budgetMode === "PRIVATE";
  const isOwner = ownerId === user.id;
  const pausedUntil = (await prisma.pushPref.findUnique({ where: { userId: user.id } }).catch(() => null))?.pausedUntil?.toISOString() ?? null;
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
          One calm note each morning, starting with something good. It mentions card payments, recurring flows and loan payments coming up, repeating items ready to post, or a gap worth planning for. Each reminder is sent once. Turn it on for each phone or computer you use.
        </p>
        <PushToggle publicKey={process.env.VAPID_PUBLIC_KEY ?? null} />
        <QuietMode until={pausedUntil} />
      </section>
      <section className="card p-6" aria-labelledby="pw-h">
        <h2 id="pw-h" className="mb-1 text-base font-semibold">Password</h2>
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          Changing it signs out your other devices. Forgot it? Use the setup code on the sign-in page to reset.
        </p>
        <PasswordForm />
      </section>
      {isPrivate ? (
        <section className="card p-6" aria-labelledby="hh-h">
          <h2 id="hh-h" className="mb-1 text-base font-semibold">Your budget</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">This is your own budget, with its own accounts, pockets and history. Other kids can&apos;t see it. The parents who set up WaiWai can open it to help you.</p>
        </section>
      ) : (
      <section className="card p-6" aria-labelledby="hh-h">
        <h2 id="hh-h" className="mb-1 text-base font-semibold">Household access</h2>
        <p className="mb-2 text-sm text-slate-500 dark:text-slate-400">
          Everyone signs in with their own email and password. People who share the household see the same Personal and Business budgets, accounts and receipts. People with a private budget get their own separate Personal budget that you can open from the switcher at the top.
        </p>
        <ul className="divide-y divide-[#E2E8F0] dark:divide-slate-800">
          {members.map((m) => (
            <MemberRow key={m.id} avatar={avatarUrl(m)} id={m.id} name={m.name ?? ""} email={m.email} isOwner={m.id === ownerId} isYou={m.id === user.id} canManage={isOwner} isPrivate={m.budgetMode === "PRIVATE"} />
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
      )}
    </div>
  );
}
