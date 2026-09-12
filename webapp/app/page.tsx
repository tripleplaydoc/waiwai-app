import { prisma } from "@/lib/prisma";

// This page checks live database state on every request — it must never be
// statically prerendered at build time (which would either fail the build
// if DATABASE_URL isn't set yet, or bake in a stale snapshot).
export const dynamic = "force-dynamic";

async function getStatus() {
  try {
    const [workspaces, categories, accounts, transactions] = await Promise.all([
      prisma.workspace.count(),
      prisma.category.count(),
      prisma.account.count(),
      prisma.transaction.count(),
    ]);
    return { connected: true as const, workspaces, categories, accounts, transactions };
  } catch (err) {
    return {
      connected: false as const,
      error: err instanceof Error ? err.message : "Unknown error connecting to the database.",
    };
  }
}

export default async function StatusPage() {
  const status = await getStatus();

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div style={{ maxWidth: 560, width: "100%" }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>
          Financial Tracker
        </h1>
        <p style={{ color: "var(--text-muted)", marginTop: 0, marginBottom: 24 }}>
          Deployment status page. There's no budget UI here yet — this confirms
          Netlify, Next.js, and the live Supabase database are wired together
          correctly.
        </p>

        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: 20,
          }}
        >
          {status.connected ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: "var(--success)",
                    display: "inline-block",
                  }}
                />
                <strong style={{ color: "var(--success)" }}>Database connected</strong>
              </div>
              <dl
                className="nums"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  rowGap: 8,
                  fontSize: 14,
                }}
              >
                <dt style={{ color: "var(--text-muted)" }}>Workspaces</dt>
                <dd style={{ margin: 0, textAlign: "right" }}>{status.workspaces}</dd>
                <dt style={{ color: "var(--text-muted)" }}>Categories</dt>
                <dd style={{ margin: 0, textAlign: "right" }}>{status.categories}</dd>
                <dt style={{ color: "var(--text-muted)" }}>Accounts</dt>
                <dd style={{ margin: 0, textAlign: "right" }}>{status.accounts}</dd>
                <dt style={{ color: "var(--text-muted)" }}>Transactions</dt>
                <dd style={{ margin: 0, textAlign: "right" }}>{status.transactions}</dd>
              </dl>
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 16, marginBottom: 0 }}>
                All zeros is expected — the schema is live but no data has been
                entered yet.
              </p>
            </>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: "var(--warning)",
                    display: "inline-block",
                  }}
                />
                <strong style={{ color: "var(--warning)" }}>Database not reachable</strong>
              </div>
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 8 }}>
                Check that the <code>DATABASE_URL</code> environment variable is
                set correctly in your Netlify site settings.
              </p>
              <pre
                style={{
                  fontSize: 12,
                  background: "var(--canvas)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: 10,
                  overflowX: "auto",
                  margin: 0,
                }}
              >
                {status.error}
              </pre>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
