import { redirect } from "next/navigation";
import { isAuthed, passwordConfigured } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await isAuthed()) redirect("/budget");
  const configured = passwordConfigured();
  return (
    <div className="mx-auto mt-20 max-w-sm">
      <div className="card p-6">
        <h1 className="mb-1 text-xl font-semibold">Financial Tracker</h1>
        <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">Enter your password to continue.</p>
        {configured ? (
          <LoginForm />
        ) : (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            <strong>Setup needed.</strong> Add an environment variable named <code>APP_PASSWORD</code> (at least 8
            characters) in Netlify under Site configuration → Environment variables, then redeploy. The app stays locked
            until it exists, so your financial data is never public.
          </div>
        )}
      </div>
    </div>
  );
}
