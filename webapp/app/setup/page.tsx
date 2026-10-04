import { redirect } from "next/navigation";
import { accountReady, isAuthed, setupCodeConfigured } from "@/lib/auth";
import { AuthShell } from "@/components/auth-shell";
import { SetupForm } from "./setup-form";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await isAuthed()) redirect("/settings");
  const ready = await accountReady();
  return (
    <AuthShell
      title={ready ? "Reset your password" : "Create your account"}
      subtitle={ready ? "Enter your setup code to choose a new email and password." : "Choose the email and password you'll use to sign in."}
    >
      {setupCodeConfigured() ? (
        <SetupForm firstTime={!ready} />
      ) : (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          <strong>One more step.</strong> Add an environment variable named <code>APP_PASSWORD</code> (at least 8
          characters) in Netlify under Site configuration → Environment variables, then redeploy. It acts as the setup
          code, so nobody else can claim the account.
        </div>
      )}
    </AuthShell>
  );
}
