import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) return new Response("Not signed in", { status: 401 });
  const { id } = await params;
  const u = await prisma.user.findUnique({ where: { id }, select: { avatarData: true, avatarMime: true } });
  if (!u?.avatarData || !u.avatarMime) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(u.avatarData), {
    headers: { "Content-Type": u.avatarMime, "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
}
