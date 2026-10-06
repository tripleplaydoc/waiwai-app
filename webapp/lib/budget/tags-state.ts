import { prisma } from "@/lib/prisma";
import { pickKnownIds, type TagVM } from "@/lib/budget/tags";

export interface TagState { tags: TagVM[]; byPocket: Record<string, string[]> }

/** Tags for a workspace and which pockets carry them. Empty (not an error) until the tag tables exist. */
export async function loadTags(workspaceId: string): Promise<TagState> {
  try {
    const tags = await prisma.pocketTag.findMany({ where: { workspaceId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, color: true } });
    if (tags.length === 0) return { tags: [], byPocket: {} };
    const links = await prisma.pocketTagLink.findMany({ where: { tagId: { in: tags.map((t) => t.id) } }, select: { categoryId: true, tagId: true } });
    const byPocket: Record<string, string[]> = {};
    for (const l of links) (byPocket[l.categoryId] ??= []).push(l.tagId);
    return { tags, byPocket };
  } catch {
    return { tags: [], byPocket: {} };
  }
}

/** Replace the tags on one pocket. Only tags of the same workspace count. */
export async function replacePocketTags(workspaceId: string, categoryId: string, tagIds: string[]): Promise<void> {
  const cat = await prisma.category.findFirst({ where: { id: categoryId, workspaceId }, select: { id: true } });
  if (!cat) return;
  const known = new Set((await prisma.pocketTag.findMany({ where: { workspaceId }, select: { id: true } })).map((t) => t.id));
  const keep = pickKnownIds(tagIds, known);
  await prisma.$transaction([
    prisma.pocketTagLink.deleteMany({ where: { categoryId } }),
    ...(keep.length ? [prisma.pocketTagLink.createMany({ data: keep.map((tagId) => ({ categoryId, tagId })) })] : []),
  ]);
}
