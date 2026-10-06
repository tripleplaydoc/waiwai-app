-- Pocket tags: your own coloured labels (Fixed, Variable, Loan, Payroll...) that show on pockets. New tables only.
CREATE TABLE "pocket_tags" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pocket_tags_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "pocket_tags_workspaceId_name_key" ON "pocket_tags"("workspaceId", "name");
ALTER TABLE "pocket_tags" ADD CONSTRAINT "pocket_tags_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "pocket_tag_links" (
    "categoryId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    CONSTRAINT "pocket_tag_links_pkey" PRIMARY KEY ("categoryId", "tagId")
);
CREATE INDEX "pocket_tag_links_tagId_idx" ON "pocket_tag_links"("tagId");
ALTER TABLE "pocket_tag_links" ADD CONSTRAINT "pocket_tag_links_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pocket_tag_links" ADD CONSTRAINT "pocket_tag_links_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "pocket_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pocket_tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pocket_tag_links" ENABLE ROW LEVEL SECURITY;
