import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ProfileForm, PasswordForm } from "./settings-forms";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Manage how you sign in.</p>
      </div>
      <section className="card p-6" aria-labelledby="profile-h">
        <h2 id="profile-h" className="mb-4 text-base font-semibold">Profile</h2>
        <ProfileForm name={user.name ?? ""} email={user.email} />
      </section>
      <section className="card p-6" aria-labelledby="pw-h">
        <h2 id="pw-h" className="mb-1 text-base font-semibold">Password</h2>
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          Changing it signs out your other devices. Forgot it? Use the setup code on the sign-in page to reset.
        </p>
        <PasswordForm />
      </section>
    </div>
  );
}
