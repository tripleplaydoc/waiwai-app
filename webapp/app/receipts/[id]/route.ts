import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  const { id } = await params;
  const r = await prisma.receipt.findUnique({ where: { id }, select: { fileData: true, mimeType: true, fileName: true, workspaceId: true } });
  if (!r?.fileData || !(await canAccessWorkspace(r.workspaceId))) return new Response("Not found", { status: 404 });
  const name = (r.fileName ?? "receipt").replace(/[^\w.\- ]+/g, "_");
  return new Response(new Uint8Array(r.fileData), {
    headers: {
      "Content-Type": r.mimeType,
      "Content-Disposition": `inline; filename="${name}"`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
