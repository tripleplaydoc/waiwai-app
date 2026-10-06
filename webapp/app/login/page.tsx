import { redirect } from "next/navigation";
import { accountReady, isAuthed } from "@/lib/auth";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await isAuthed()) redirect("/home");
  if (!(await accountReady())) redirect("/setup");
  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your budget.">
      <LoginForm />
    </AuthShell>
  );
}
